package dev.crafters.kanstrimi.client

import dev.crafters.kanstrimi.contract.Card
import dev.crafters.kanstrimi.contract.CatalogRow
import dev.crafters.kanstrimi.contract.Channel
import dev.crafters.kanstrimi.contract.ChannelGroup
import dev.crafters.kanstrimi.contract.ContentItem
import dev.crafters.kanstrimi.contract.ContentKind
import dev.crafters.kanstrimi.contract.DynamicRange
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
import dev.crafters.kanstrimi.contract.Quality
import dev.crafters.kanstrimi.contract.SagaSheet
import dev.crafters.kanstrimi.contract.SearchResults
import dev.crafters.kanstrimi.contract.ServerInfo
import dev.crafters.kanstrimi.contract.Studio
import dev.crafters.kanstrimi.contract.Suggestions

/** What a call to `/player` can fail with; the screens show `message`. */
sealed class CatalogException(message: String) : Exception(message) {
    /** The token was refused: the device is unpaired. */
    class Unauthorized : CatalogException("Appareil dissocié")
    class NotFound : CatalogException("Introuvable")
    /** No network, a timeout, a host not found. */
    class Offline(detail: String) : CatalogException("Serveur injoignable · $detail")
    /** The server answered an error of its own, or something unexpected. */
    class Server(message: String) : CatalogException(message)
    /** The answer does not match the contract. */
    class Decoding(detail: String) : CatalogException("Réponse illisible · $detail")
}

enum class CatalogSort(val wire: String, val label: String) {
    RELEASE("release", "Date de sortie"),
    RECENT("recent", "Nouveautés"),
    TITLE("title", "Titre"),
    YEAR("year", "Année"),
    RATING("rating", "Note"),
    LATEST_EPISODES("latest_episodes", "Derniers épisodes");

    companion object {
        fun options(kind: ContentKind): List<CatalogSort> =
            if (kind == ContentKind.SERIES) listOf(RELEASE, LATEST_EPISODES, TITLE, YEAR, RATING) else listOf(RELEASE, RECENT, TITLE, YEAR, RATING)
    }
}

/** A paginated list of `/movies` or `/series`: a genre or a studio, the sort, the version filters. */
data class ListQuery(
    val kind: ContentKind,
    val genre: String? = null,
    val sort: CatalogSort = defaultSort(kind, genre),
    val language: String? = null,
    val minQuality: Quality? = null,
    val dynamicRange: DynamicRange? = null,
    val vfAvailable: Boolean = false,
    /** `company:3`, `network:49`: the titles of one studio hub. */
    val studio: String? = null,
    val cursor: String? = null,
) {
    val hasFilters: Boolean get() = language != null || minQuality != null || dynamicRange != null || vfAvailable
    /** The same list without the version filters, back on its default order. */
    val cleared: ListQuery get() = ListQuery(kind = kind, genre = genre, studio = studio)

    companion object {
        /** The server's order: « Nouveautés » / « Derniers épisodes » by arrival, every other row by release date. */
        fun defaultSort(kind: ContentKind, genre: String?): CatalogSort = when {
            genre != "recent" -> CatalogSort.RELEASE
            kind == ContentKind.SERIES -> CatalogSort.LATEST_EPISODES
            else -> CatalogSort.RECENT
        }
    }
}

/** `/player`, one method per route: `HttpCatalogClient` (the server), `MockCatalogClient` (the recorded answers). */
interface CatalogClient {
    val isMock: Boolean

    suspend fun createDevice(): PairingCode
    suspend fun pollDevice(code: String): PairingStatus
    suspend fun deleteDevice(code: String)
    suspend fun info(): ServerInfo

    suspend fun home(): Home
    suspend fun rows(kind: ContentKind): List<CatalogRow>
    suspend fun list(query: ListQuery): Page<ContentItem>
    suspend fun detail(id: String): Card
    suspend fun studios(kind: ContentKind): List<Studio>
    suspend fun sagas(cursor: String?): Page<ContentItem>
    suspend fun saga(id: String): SagaSheet
    suspend fun person(id: String): PersonSheet

    suspend fun channels(): List<ChannelGroup>
    suspend fun channel(id: String): Channel
    suspend fun programmes(channelId: String, version: String?): List<Programme>

    suspend fun playback(id: String): Playback
    suspend fun suggestions(id: String): Suggestions
    suspend fun markers(id: String, file: FileFacts): PlaybackMarkers
    suspend fun report(progress: ProgressReport)
    suspend fun reportWatchTime(id: String, seconds: Int)

    suspend fun search(query: String): SearchResults
    suspend fun removeFromResume(id: String)
    suspend fun setWatched(id: String, watched: Boolean, season: Int? = null)
    suspend fun setFavorite(id: String, favorite: Boolean)
}

/** `tmdb:tv:…` and `fallback:series:…` are series, the rest are movies. */
fun kindOf(id: String): ContentKind =
    if (id.startsWith("tmdb:tv:") || id.startsWith("fallback:series:")) ContentKind.SERIES else ContentKind.MOVIE

fun collectionOf(kind: ContentKind): String =
    if (kind == ContentKind.SERIES || kind == ContentKind.EPISODE) "series" else "movies"
