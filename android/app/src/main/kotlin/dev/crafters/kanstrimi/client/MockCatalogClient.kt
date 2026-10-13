package dev.crafters.kanstrimi.client

import android.content.res.AssetManager
import dev.crafters.kanstrimi.contract.Card
import dev.crafters.kanstrimi.contract.CatalogRow
import dev.crafters.kanstrimi.contract.Channel
import dev.crafters.kanstrimi.contract.ChannelGroup
import dev.crafters.kanstrimi.contract.ContentItem
import dev.crafters.kanstrimi.contract.ContentKind
import dev.crafters.kanstrimi.contract.FileFacts
import dev.crafters.kanstrimi.contract.Home
import dev.crafters.kanstrimi.contract.Page
import dev.crafters.kanstrimi.contract.PairingCode
import dev.crafters.kanstrimi.contract.PairingStatus
import dev.crafters.kanstrimi.contract.PersonSheet
import dev.crafters.kanstrimi.contract.Playback
import dev.crafters.kanstrimi.contract.PlaybackMarkers
import dev.crafters.kanstrimi.contract.Profile
import dev.crafters.kanstrimi.contract.Profiles
import dev.crafters.kanstrimi.contract.Programme
import dev.crafters.kanstrimi.contract.ProgressReport
import dev.crafters.kanstrimi.contract.SagaSheet
import dev.crafters.kanstrimi.contract.SearchResults
import dev.crafters.kanstrimi.contract.ServerInfo
import dev.crafters.kanstrimi.contract.Studio
import dev.crafters.kanstrimi.contract.Suggestions
import dev.crafters.kanstrimi.contract.Wire
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.serialization.serializer
import java.time.Duration
import java.time.Instant

/**
 * The demo client: the real answers of the server recorded for the contract tests, read from the app's assets
 * (`apple/kanstrimiTests/Contract/`, added to the assets by `app/build.gradle.kts`). No network, no stream:
 * the screens can be built and captured without a server. Pairing approves itself after two polls. The guide of the
 * recorded channels is moved to the present: its programme on air started twenty minutes ago.
 */
class MockCatalogClient(private val assets: AssetManager, private val latencyMillis: Long = 0) : CatalogClient {
    override val isMock = true
    private var polls = 0
    /** From the recorded guide's « now » to twenty minutes ago, fixed for the session so every answer agrees. */
    private val guideShift: Duration = Duration.between(RECORDED_NOW_START, Instant.now().minusSeconds(20 * 60))

    private fun Programme.shifted() = copy(start = start.plus(guideShift), end = end.plus(guideShift))
    private fun Channel.shifted() = copy(
        now = now?.shifted(), next = next?.shifted(),
        versions = versions.map { it.copy(now = it.now?.shifted(), next = it.next?.shifted()) },
    )

    private suspend inline fun <reified T> read(name: String): T = withContext(Dispatchers.IO) {
        if (latencyMillis > 0) delay(latencyMillis)
        val text = assets.open("$name.json").bufferedReader().use { it.readText() }
        Wire.json.decodeFromString(serializer<T>(), text)
    }

    override suspend fun createDevice(): PairingCode {
        polls = 0
        return PairingCode(code = "DEMO42", expiresAt = Instant.now().plusSeconds(600), url = "https://kanstrimi.example/admin/pair/DEMO42", token = "mock-token")
    }
    override suspend fun pollDevice(code: String): PairingStatus = if (++polls >= 2) PairingStatus.Approved("Tablette") else PairingStatus.Pending
    override suspend fun deleteDevice(code: String) {}
    /** The profile the demo answers for: the app's choice (`DeviceStore`). */
    var profileId: Int? = null

    /** The recorded household (Hakim alone), and three more so the picker has something to choose among. */
    override suspend fun profiles(): List<Profile> = read<Profiles>("profiles").profiles + DEMO_PROFILES
    override suspend fun info(): ServerInfo = read<ServerInfo>("info").let { info ->
        info.copy(profile = profiles().firstOrNull { it.id == profileId } ?: info.profile)
    }

    override suspend fun home(): Home = read("home")
    override suspend fun rows(kind: ContentKind): List<CatalogRow> = read(if (kind == ContentKind.SERIES) "series" else "movies")
    override suspend fun list(query: ListQuery): Page<ContentItem> = read("movies-list")
    override suspend fun detail(id: String): Card = read(if (kindOf(id) == ContentKind.SERIES) "series-detail" else "movie-detail")
    override suspend fun studios(kind: ContentKind): List<Studio> = read(if (kind == ContentKind.SERIES) "studios-series" else "studios-movies")
    override suspend fun sagas(cursor: String?): Page<ContentItem> = read("sagas")
    override suspend fun saga(id: String): SagaSheet = read("saga")
    override suspend fun person(id: String): PersonSheet = read("person")

    override suspend fun channels(): List<ChannelGroup> = read<List<ChannelGroup>>("channels").map { g -> g.copy(channels = g.channels.map { it.shifted() }) }
    override suspend fun channel(id: String): Channel = read<Channel>("channel").shifted().let { if (it.id == id) it else it.copy(id = id) }
    override suspend fun programmes(channelId: String, version: String?): List<Programme> = read<List<Programme>>("channel-programmes").map { it.shifted() }

    override suspend fun playback(id: String): Playback = read(if (kindOf(id) == ContentKind.SERIES) "playback-series" else "playback-movie")
    override suspend fun suggestions(id: String): Suggestions = read("suggestions")
    override suspend fun markers(id: String, file: FileFacts): PlaybackMarkers = read("markers-episode")
    override suspend fun report(progress: ProgressReport) {}
    override suspend fun reportWatchTime(id: String, seconds: Int) {}

    override suspend fun search(query: String): SearchResults = read<SearchResults>("search").let { it.copy(query = query) }
    override suspend fun removeFromResume(id: String) {}
    override suspend fun setWatched(id: String, watched: Boolean, season: Int?) {}
    override suspend fun setFavorite(id: String, favorite: Boolean) {}

    companion object {
        /** The start of the programme on air in `channel.json` and `channels.json`. */
        private val RECORDED_NOW_START: Instant = Instant.parse("2026-10-01T18:00:00Z")
        private val DEMO_PROFILES = listOf(2 to "Sara", 3 to "Ado", 4 to "Lina").map { (id, name) -> Profile(id, name, avatar = "demo://avatar/$id") }
    }
}
