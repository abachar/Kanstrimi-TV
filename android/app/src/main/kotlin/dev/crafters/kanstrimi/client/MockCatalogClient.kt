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
import java.time.Instant

/**
 * The demo client: the real answers of the server recorded for the contract tests, read from the app's assets
 * (`apple/kanstrimiTests/Contract/`, added to the assets by `app/build.gradle.kts`). No network, no stream:
 * the screens can be built and captured without a server. Pairing approves itself after two polls.
 */
class MockCatalogClient(private val assets: AssetManager, private val latencyMillis: Long = 0) : CatalogClient {
    override val isMock = true
    private var polls = 0

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
    override suspend fun info(): ServerInfo = read("info")

    override suspend fun home(): Home = read("home")
    override suspend fun rows(kind: ContentKind): List<CatalogRow> = read(if (kind == ContentKind.SERIES) "series" else "movies")
    override suspend fun list(query: ListQuery): Page<ContentItem> = read("movies-list")
    override suspend fun detail(id: String): Card = read(if (kindOf(id) == ContentKind.SERIES) "series-detail" else "movie-detail")
    override suspend fun studios(kind: ContentKind): List<Studio> = read(if (kind == ContentKind.SERIES) "studios-series" else "studios-movies")
    override suspend fun sagas(cursor: String?): Page<ContentItem> = read("sagas")
    override suspend fun saga(id: String): SagaSheet = read("saga")
    override suspend fun person(id: String): PersonSheet = read("person")

    override suspend fun channels(): List<ChannelGroup> = read("channels")
    override suspend fun channel(id: String): Channel = read("channel")
    override suspend fun programmes(channelId: String, version: String?): List<Programme> = read("channel-programmes")

    override suspend fun playback(id: String): Playback = read(if (kindOf(id) == ContentKind.SERIES) "playback-series" else "playback-movie")
    override suspend fun suggestions(id: String): Suggestions = read("suggestions")
    override suspend fun markers(id: String, file: FileFacts): PlaybackMarkers = read("markers-episode")
    override suspend fun report(progress: ProgressReport) {}
    override suspend fun reportWatchTime(id: String, seconds: Int) {}

    override suspend fun search(query: String): SearchResults = read<SearchResults>("search").let { it.copy(query = query) }
    override suspend fun removeFromResume(id: String) {}
    override suspend fun setWatched(id: String, watched: Boolean, season: Int?) {}
    override suspend fun setFavorite(id: String, favorite: Boolean) {}
}
