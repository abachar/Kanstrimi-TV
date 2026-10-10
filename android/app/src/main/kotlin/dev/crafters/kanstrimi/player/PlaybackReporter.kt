package dev.crafters.kanstrimi.player

import dev.crafters.kanstrimi.client.CatalogClient
import dev.crafters.kanstrimi.client.CatalogException
import dev.crafters.kanstrimi.contract.ProgressReport
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import java.time.Instant

/** A source that failed to start is skipped for a day; a successful start clears the mark. */
class FailedSourcesStore(private val now: () -> Instant = { Instant.now() }) {
    private val failures = HashMap<String, Instant>()

    fun markFailed(sourceId: String) { failures[sourceId] = now() }
    fun isFailed(sourceId: String): Boolean {
        val at = failures[sourceId] ?: return false
        if (now().epochSecond - at.epochSecond > TTL_SECONDS) { failures.remove(sourceId); return false }
        return true
    }
    fun clear(sourceId: String) { failures.remove(sourceId) }

    companion object {
        const val TTL_SECONDS = 24 * 3600L
    }
}

/**
 * The positions that could not reach the server, replayed in order after the next one that does: in memory, and
 * in `store` (the app's preferences) so a position survives a restart. One entry per title, the newest.
 */
class ProgressQueue(private val store: Store? = null) {
    /** Where the queue persists: a string in, a string out. */
    interface Store {
        fun read(): String?
        fun write(text: String?)
    }

    @Serializable
    private data class Entry(val id: String, val position: Double, val duration: Double, val sentAt: Long)

    private val entries = ArrayList<Entry>()
    private var isFlushing = false

    init {
        store?.read()?.let { text -> runCatching { json.decodeFromString(ListSerializer(Entry.serializer()), text) }.getOrNull()?.let(entries::addAll) }
    }

    val pending: List<ProgressReport> get() = entries.map { ProgressReport(it.id, it.position, it.duration, Instant.ofEpochMilli(it.sentAt)) }

    fun enqueue(report: ProgressReport) {
        entries.removeAll { it.id == report.contentId }
        entries.add(Entry(report.contentId, report.position, report.duration, report.sentAt.toEpochMilli()))
        persist()
    }

    /** Forgets a title's pending report: sent since, or removed by hand, a late replay must not bring it back. */
    fun drop(id: String) {
        entries.removeAll { it.id == id }
        persist()
    }

    /** Replays everything in order. A title the server no longer knows is dropped; any other failure stops the replay and keeps the rest. */
    suspend fun flush(send: suspend (ProgressReport) -> Unit) {
        if (isFlushing) return
        isFlushing = true
        try {
            while (entries.isNotEmpty()) {
                val first = entries.first()
                try {
                    send(ProgressReport(first.id, first.position, first.duration, Instant.ofEpochMilli(first.sentAt)))
                } catch (e: CatalogException.NotFound) {
                    // Removed from the catalogue: kept, it would block every report behind it.
                } catch (e: CatalogException) {
                    return
                }
                entries.remove(first)
                persist()
            }
        } finally {
            isFlushing = false
        }
    }

    private fun persist() {
        store?.write(if (entries.isEmpty()) null else json.encodeToString(ListSerializer(Entry.serializer()), entries))
    }

    private companion object {
        val json = Json { ignoreUnknownKeys = true }
    }
}

/**
 * Sends what is watched: the position of a film or an episode, the time spent on a channel. A position that
 * cannot reach the server waits in the queue, replayed after the next one that does.
 */
class PlaybackReporter(private val client: () -> CatalogClient, private val queue: ProgressQueue) {
    suspend fun report(report: ProgressReport) {
        try {
            client().report(report)
            // An older position of the same title, queued while offline, must not replay over this one.
            queue.drop(report.contentId)
            queue.flush { client().report(it) }
        } catch (e: CatalogException.NotFound) {
            // The title left the catalogue: nothing to keep.
        } catch (e: CatalogException.Unauthorized) {
            // The device was unpaired: its progress is gone with it.
        } catch (e: CatalogException) {
            queue.enqueue(report)
        }
    }

    /** « Chaînes les plus regardées »: lost when offline, a channel's minutes are not worth a queue. */
    suspend fun reportWatchTime(id: String, seconds: Int) {
        runCatching { client().reportWatchTime(id, seconds) }
    }
}
