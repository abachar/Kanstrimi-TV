package dev.crafters.kanstrimi.app

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import dev.crafters.kanstrimi.client.CatalogClient
import dev.crafters.kanstrimi.contract.Channel
import dev.crafters.kanstrimi.contract.Programme
import dev.crafters.kanstrimi.contract.Version
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.async
import java.time.Instant

// What the Direct keeps on the device, like the Apple app's `ChannelCache` and `RecentChannelsStore`.

/**
 * The one rule for « what is on air » on a channel, wherever it is drawn (the Direct, the home, the player's lists),
 * like the Apple app's `env.nowPlaying(on:)`: the guide of the version the channel plays or would start in (each
 * quality may have its own, else the channel's); the detail `GET /channels/{id}` received is the latest word while
 * its programme lasts, the list's copy otherwise. Pure, so the JVM tests cover it.
 */
object LiveGuide {
    /** The guide shown for `channel` in `version` (null: the channel's own). */
    fun guide(channel: Channel, version: Version?): Channel.Guide = channel.guide(version)

    /**
     * @param channel the channel as its list gave it (or as a card knows it: id, name, logo only).
     * @param detail the last detail received for it, however old; null when none.
     * @param version the version it plays or would start in.
     */
    fun nowPlaying(channel: Channel, detail: Channel?, version: Version?, now: Instant = Instant.now()): Programme? {
        if (detail != null) {
            val fresh = guide(detail, version).now
            if (fresh != null && fresh.end.isAfter(now)) return fresh
        }
        return guide(channel, version).now
    }
}

/** `GET /channels/{id}` per channel, asked at selection, kept one minute (now / next); one request at a time per channel. */
class ChannelCache(private val client: () -> CatalogClient, private val scope: CoroutineScope, private val now: () -> Instant = Instant::now) {
    private class Entry(val value: Channel, val at: Instant)

    private val entries = mutableStateMapOf<String, Entry>()
    private val inflight = HashMap<String, Deferred<Channel?>>()

    /** The detail when it is less than a minute old. */
    fun cached(id: String): Channel? {
        val e = entries[id] ?: return null
        return if (now().epochSecond - e.at.epochSecond < TTL_S) e.value else null
    }

    /** The last detail received, however old: `nowPlaying` keeps its programme while it airs. */
    fun latest(id: String): Channel? = entries[id]?.value

    /** The detail, from the cache or the server; null when the server failed. */
    suspend fun channel(id: String): Channel? {
        cached(id)?.let { return it }
        inflight[id]?.let { return it.await() }
        val task = scope.async { runCatching { client().channel(id) }.getOrNull() }
        inflight[id] = task
        val value = task.await()
        inflight.remove(id)
        if (value != null) entries[id] = Entry(value, now())
        return value
    }

    companion object {
        const val TTL_S = 60L
    }
}

/**
 * The channels the profile watched last, most recent first, 20 at most: the « Récentes » category of the Direct and
 * the player's Récentes panel. The server keeps them (`recent_rank` on `/channels`, from the time watched the app
 * reports); this store seeds itself from each channel list and records the zaps made here since, so the strip moves at
 * once. Memory only. Name and logo travel with the id so a recent channel draws before its detail arrives.
 */
class RecentChannels(private val now: () -> Instant = Instant::now) {
    data class Entry(val id: String, val name: String, val logo: String? = null, val watchedAt: Instant?) {
        /** The channel as a card can draw it; its versions and programme come from the cache. */
        val channel: Channel get() = Channel(id = id, name = name, logo = logo)
    }

    var entries: List<Entry> by mutableStateOf(emptyList())
        private set

    fun record(channel: Channel) {
        val entry = Entry(channel.id, channel.name, channel.logo, now())
        entries = (listOf(entry) + entries.filter { it.id != channel.id }).take(CAPACITY)
    }

    /**
     * The server's list, from the channels' `recentRank`: after what was zapped here since launch, which the server may
     * not have been told yet; a channel listed by both keeps its place here.
     */
    fun seed(channels: List<Channel>) {
        val served = channels.filter { it.recentRank != null }.sortedBy { it.recentRank }
        val local = entries.filter { it.watchedAt != null }.distinctBy { it.id }
        val seen = local.map { it.id }.toMutableSet()
        val rest = served.filter { seen.add(it.id) }.map { Entry(it.id, it.name, it.logo, null) }
        entries = (local + rest).take(CAPACITY)
    }

    /** The channel watched just before the current one. */
    fun previous(current: String?): Entry? = entries.firstOrNull { it.id != current }

    companion object {
        const val CAPACITY = 20
    }
}
