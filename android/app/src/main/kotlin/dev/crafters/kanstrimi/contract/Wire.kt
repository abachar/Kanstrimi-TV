package dev.crafters.kanstrimi.contract

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json
import java.time.Instant
import java.time.OffsetDateTime

/**
 * Wire types of `/player`, copied from `server/src/player/types.ts`: snake_case keys, ISO dates, explicit null
 * where the app expects a value, absent where it does not. The server's `contract.db.test.ts` records real answers
 * in `apple/kanstrimiTests/Contract/`, which `ContractTest` decodes with these types: a shape changed on one side
 * fails there.
 */
object Wire {
    /** Unknown keys are skipped, an unknown enumeration value takes the property's default, a null reads as absent. */
    val json: Json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        explicitNulls = false
    }
}

/** ISO 8601 with or without fractional seconds, `Z` or an offset. */
object InstantSerializer : KSerializer<Instant> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("Instant", PrimitiveKind.STRING)
    override fun serialize(encoder: Encoder, value: Instant) = encoder.encodeString(value.toString())
    override fun deserialize(decoder: Decoder): Instant = parse(decoder.decodeString())
    fun parse(text: String): Instant = runCatching { Instant.parse(text) }.getOrElse { OffsetDateTime.parse(text).toInstant() }
}

typealias WireInstant = @Serializable(with = InstantSerializer::class) Instant

/** The app's content kinds; `OTHER` is what an unknown value reads as, never one the server writes. */
@Serializable
enum class ContentKind {
    @SerialName("movie") MOVIE,
    @SerialName("series") SERIES,
    @SerialName("episode") EPISODE,
    @SerialName("live") LIVE,
    @SerialName("saga") SAGA,
    @SerialName("other") OTHER,
}

@Serializable
enum class Quality {
    @SerialName("SD") SD,
    @SerialName("HD") HD,
    @SerialName("FHD") FHD,
    @SerialName("4K") UHD;

    val label: String get() = if (this == UHD) "4K" else name
}

@Serializable
enum class DynamicRange {
    @SerialName("HDR") HDR,
    @SerialName("DV") DOLBY_VISION;

    val label: String get() = if (this == HDR) "HDR" else "DV"
}

/** The language codes the server writes (`VF`, `VOSTFR`, `VO`) and the labels the screen shows (« FR », « VOSTF », « VO »). */
object Language {
    const val VF = "VF"
    const val VOSTFR = "VOSTFR"
    const val VO = "VO"

    fun short(code: String): String = when (code) {
        VF -> "FR"
        VOSTFR -> "VOSTF"
        else -> code
    }

    fun label(code: String): String = when (code) {
        VF -> "Français"
        VOSTFR -> "Version originale sous-titrée"
        VO -> "Version originale"
        else -> code
    }
}

@Serializable
data class Provider(val id: String, val name: String, val kind: String)

@Serializable
data class Source(
    val id: String,
    val container: String,
    @SerialName("stream_url") val streamUrl: String,
    val provider: Provider,
    val origin: String? = null,
)

/**
 * `edition`: a cut other than the theatrical one, absent for the usual cut. Live: `hasEpg`, `now`, `next` when this
 * quality's guide is not the channel's; `chip`: the version's chip, « FHD », or « FHD/EN » when the channel mixes languages.
 */
@Serializable
data class Version(
    val id: String,
    val language: String,
    val quality: Quality,
    val chip: String? = null,
    @SerialName("dynamic_range") val dynamicRange: DynamicRange? = null,
    val edition: String? = null,
    val sources: List<Source> = emptyList(),
    @SerialName("has_epg") val hasEpg: Boolean? = null,
    val now: Programme? = null,
    val next: Programme? = null,
) {
    /** « 4K DV · FR », « FHD · VOSTF · Version longue ». */
    val label: String
        get() = listOfNotNull(qualityLabel, Language.short(language), edition).joinToString(" · ")
    val qualityLabel: String
        get() = dynamicRange?.let { "${quality.label} ${it.label}" } ?: quality.label
}

/** `resumable`: between 5 % and « Vu », decided by the server: the app offers « Reprendre » on it and compares no threshold. */
@Serializable
data class Progress(val position: Double, val duration: Double, val finished: Boolean? = null, val resumable: Boolean) {
    val isWatched: Boolean get() = finished == true
}

@Serializable
data class EpisodeRef(val season: Int, val number: Int, val title: String? = null) {
    /** « S2 É5 ». */
    val shortCode: String get() = "S$season É$number"
}

/** `id` = `person:<TMDB id>`, null until the sheet has been copied again (no link to their titles). */
@Serializable
data class Person(val id: String? = null, val name: String, val role: String? = null, val photo: String? = null)

@Serializable
data class Episode(
    val id: String,
    val season: Int,
    val number: Int,
    val title: String,
    val overview: String? = null,
    val runtime: Int? = null,
    val still: String? = null,
    @SerialName("air_date") val airDate: String? = null,
    val versions: List<Version> = emptyList(),
    val progress: Progress? = null,
    /** What its card and its row draw: the still, the progress, « vu », `facts`, `badges`, `overview`, `hint`. */
    val item: ContentItem,
) {
    val languages: List<String> get() = versions.map { it.language }.distinct()
}

@Serializable
data class Season(val number: Int, val title: String? = null, val year: Int? = null, val episodes: List<Episode> = emptyList())

/** A film or a series sheet (`/movies/{id}`, `/series/{id}`); the lists send `ContentItem`. */
@Serializable
data class Card(
    val id: String,
    val kind: ContentKind = ContentKind.OTHER,
    val title: String,
    val poster: String? = null,
    @SerialName("max_quality") val maxQuality: Quality? = null,
    @SerialName("dynamic_range") val dynamicRange: DynamicRange? = null,
    val languages: List<String> = emptyList(),
    val backdrop: String? = null,
    /** The title's logo (transparent PNG), drawn in place of the title; null = the title as text. */
    val logo: String? = null,
    val progress: Progress? = null,
    val episode: EpisodeRef? = null,
    val year: Int? = null,
    val rating: Double? = null,
    val genres: List<String> = emptyList(),
    val hint: String? = null,
    @SerialName("added_at") val addedAt: String? = null,
    @SerialName("original_title") val originalTitle: String? = null,
    @SerialName("end_year") val endYear: Int? = null,
    val overview: String? = null,
    val runtime: Int? = null,
    val certification: String? = null,
    val cast: List<Person> = emptyList(),
    val director: String? = null,
    val trailer: String? = null,
    @SerialName("has_tmdb") val hasTmdb: Boolean? = null,
    @SerialName("provider_category") val providerCategory: String? = null,
    @SerialName("raw_title") val rawTitle: String? = null,
    val versions: List<Version> = emptyList(),
    @SerialName("is_favorite") val isFavorite: Boolean? = null,
    val seasons: List<Season>? = null,
    @SerialName("current_episode") val currentEpisode: EpisodeRef? = null,
    /** Sheet texts, final: « FILM », « 2019 – 2022 · Drame, Crime · 52 min », « ★ 8.5 », « Reprendre · 40 min restantes ». */
    val tagline: String = "",
    val facts: String? = null,
    @SerialName("rating_label") val ratingLabel: String? = null,
    @SerialName("play_label") val playLabel: String = "Lecture",
    /** Movie sheet: its saga, present only when two of its movies are visible. */
    val saga: SagaRef? = null,
    /** « Si vous avez aimé… », TMDB's recommendations in the catalogue, nothing already seen, ten at most. */
    val related: List<ContentItem> = emptyList(),
) {
    val isMatched: Boolean get() = hasTmdb != false
}

/**
 * What a content card draws, written by the server: the app lays it out and decides nothing. `kind` says where a
 * click goes (the sheet, the saga). Texts are final: `facts` « 2019 · ★ 8.5 », `badges` « 4K DV », « FR », in order;
 * `caption` « 1 h 08 restantes ». `progress` (0…1) only while resumable.
 */
@Serializable
data class ContentItem(
    val id: String,
    val kind: ContentKind = ContentKind.OTHER,
    val title: String,
    val logo: String? = null,
    val poster: String? = null,
    val picture: String? = null,
    val facts: String? = null,
    /** The quality badge alone (« 4K DV », « HD »), the one `badges` starts with; null when unknown. */
    val quality: String? = null,
    val badges: List<String> = emptyList(),
    val hint: String? = null,
    val progress: Double? = null,
    val watched: Boolean = false,
    val caption: String? = null,
    /** Where the card tells it: the carousel, « À suivre », an episode row; null in the lists. */
    val overview: String? = null,
)

/** A TMDB collection with at least two visible movies. `id` = `saga:<TMDB collection id>`; `label` « Trilogie - Saga · 3 films ». */
@Serializable
data class SagaRef(val id: String, val name: String, val count: Int, val label: String)

/** `/movies/sagas/{id}`: the saga, its header (« SAGA », « 3 films ») and its visible movies, latest release first. */
@Serializable
data class SagaSheet(
    val id: String,
    val name: String,
    val count: Int,
    val label: String,
    val poster: String? = null,
    val backdrop: String? = null,
    val heading: String,
    val facts: String,
    val movies: List<ContentItem> = emptyList(),
)

/** A page of a list: `/movies`, `/series`, `/movies/sagas`; `total` on the sagas only. */
@Serializable
data class Page<T>(val items: List<T>, @SerialName("next_cursor") val nextCursor: String? = null, val total: Int? = null)

/**
 * A studio hub chosen in the admin that holds visible titles of that kind. `id` = `company:<TMDB id>` or
 * `network:<TMDB id>`, the `studio` filter of the lists. `backdrop`: that of its latest visible title.
 */
@Serializable
data class Studio(val id: String, val name: String, val logo: String? = null, val count: Int, val backdrop: String? = null)

/** `/people/{id}`: an actor and their visible titles, latest release first. `facts`: « 12 titres ». */
@Serializable
data class PersonSheet(
    val id: String,
    val name: String,
    val photo: String? = null,
    val facts: String,
    val movies: List<ContentItem> = emptyList(),
    val series: List<ContentItem> = emptyList(),
)

@Serializable
data class Programme(val title: String, val start: WireInstant, val end: WireInstant, val overview: String? = null) {
    /** How far the programme is, 0…1, at `now`. */
    fun fraction(now: Instant = Instant.now()): Float {
        val length = (end.epochSecond - start.epochSecond).toFloat()
        if (length <= 0f) return 1f
        return ((now.epochSecond - start.epochSecond) / length).coerceIn(0f, 1f)
    }
}

@Serializable
data class Channel(
    val id: String,
    val name: String,
    val number: Int? = null,
    val logo: String? = null,
    @SerialName("max_quality") val maxQuality: Quality? = null,
    @SerialName("has_epg") val hasEpg: Boolean = false,
    @SerialName("is_favorite") val isFavorite: Boolean = false,
    val versions: List<Version> = emptyList(),
    val now: Programme? = null,
    val next: Programme? = null,
    /** 1 = the most watched over the last 30 days (« Les plus regardées », 10 channels at most); absent otherwise. */
    @SerialName("watched_rank") val watchedRank: Int? = null,
)

/** A country (« Maroc », the market name) and a theme (« Sport »); `name` = « Maroc · Sport ». */
@Serializable
data class ChannelGroup(val id: String, val name: String, val section: String, val theme: String, val channels: List<Channel> = emptyList())

/** The row kinds the app lays out; an unknown one reads as `OTHER` and shows as a simple row. */
@Serializable
enum class HomeRowKind {
    @SerialName("resume") RESUME,
    @SerialName("most_watched_channels") MOST_WATCHED_CHANNELS,
    @SerialName("recommended") RECOMMENDED,
    @SerialName("recent_movies") RECENT_MOVIES,
    @SerialName("recent_series") RECENT_SERIES,
    @SerialName("favorites") FAVORITES,
    @SerialName("collection") COLLECTION,
    @SerialName("other") OTHER,
}

@Serializable
data class HomeRow(val id: String, val kind: HomeRowKind = HomeRowKind.OTHER, val title: String, val cards: List<ContentItem> = emptyList())

/**
 * A slide of the home carousel. `item` is what it draws and what Fiche opens; `playId` is what Lecture plays,
 * `versions`, `runtime`, `resumeAt` and `duration` (seconds) being that title's own.
 */
@Serializable
data class HomeHero(
    val item: ContentItem,
    val tagline: String,
    val overview: String? = null,
    val runtime: Int? = null,
    val certification: String? = null,
    val versions: List<Version> = emptyList(),
    @SerialName("play_id") val playId: String,
    val episode: EpisodeRef? = null,
    @SerialName("is_favorite") val isFavorite: Boolean = false,
    @SerialName("play_label") val playLabel: String = "Lecture",
    @SerialName("resume_at") val resumeAt: Double? = null,
    val duration: Double? = null,
)

@Serializable
data class Home(val heroes: List<HomeHero> = emptyList(), val rows: List<HomeRow> = emptyList(), @SerialName("generated_at") val generatedAt: WireInstant)

/** A shelf of `/movies` or `/series` (Top 10, Nouveautés, a genre): the server names the list after the kind. */
@Serializable
data class CatalogRow(
    val id: String,
    val name: String,
    val total: Int,
    val movies: List<ContentItem>? = null,
    val series: List<ContentItem>? = null,
) {
    val cards: List<ContentItem> get() = movies ?: series ?: emptyList()
}

@Serializable
data class NextEpisode(
    val id: String,
    val title: String? = null,
    val season: Int,
    val number: Int,
    val runtime: Int? = null,
    val languages: List<String> = emptyList(),
    @SerialName("max_quality") val maxQuality: Quality? = null,
    @SerialName("dynamic_range") val dynamicRange: DynamicRange? = null,
    val still: String? = null,
    val item: ContentItem,
    val heading: String,
)

/** `/playback/{id}`: on a series id, the episode to play is resolved and named in `episode`. */
@Serializable
data class Playback(
    val versions: List<Version> = emptyList(),
    @SerialName("resume_at") val resumeAt: Double? = null,
    val duration: Double? = null,
    val next: NextEpisode? = null,
    val cast: List<Person> = emptyList(),
    val episode: PlaybackEpisode? = null,
)

@Serializable
data class PlaybackEpisode(val id: String, val season: Int, val number: Int, val title: String? = null)

@Serializable
enum class SuggestionReason {
    @SerialName("saga") SAGA,
    @SerialName("recommended") RECOMMENDED,
    @SerialName("other") OTHER,
}

/** `heading`: « À SUIVRE · SUITE DE LA SAGA », « À SUIVRE »; the app adds the countdown. */
@Serializable
data class Suggestion(val item: ContentItem, val reason: SuggestionReason = SuggestionReason.OTHER, val heading: String)

/** `/playback/{id}/suggestions`: the « Si vous avez aimé… » panel and what follows a movie or a series. */
@Serializable
data class Suggestions(val related: List<ContentItem> = emptyList(), val next: Suggestion? = null)

@Serializable
data class Chapter(val name: String, val start: Double, val end: Double)

/** What the app read in the file: the length and the chapters, in seconds. */
@Serializable
data class FileFacts(val duration: Double, val chapters: List<Chapter> = emptyList())

@Serializable
data class Skip(val start: Double, val end: Double, val label: String)

@Serializable
data class Credits(val at: Double, val countdown: Int)

/** `POST /playback/{id}/markers`: what can be skipped (recap, intro) and where the end credits are. */
@Serializable
data class PlaybackMarkers(val skips: List<Skip> = emptyList(), val credits: Credits? = null)

@Serializable
data class SearchResults(val query: String, val items: List<ContentItem> = emptyList())

@Serializable
data class CatalogCounts(val movies: Int, val series: Int, val channels: Int)

@Serializable
data class ServerInfo(
    @SerialName("server_version") val serverVersion: String,
    val counts: CatalogCounts,
    @SerialName("last_import") val lastImport: WireInstant? = null,
    @SerialName("tmdb_rate") val tmdbRate: Double? = null,
    @SerialName("catalog_languages") val catalogLanguages: List<String> = emptyList(),
)

@Serializable
data class ApiError(val error: ApiErrorBody)

@Serializable
data class ApiErrorBody(val code: String, val message: String)

/** `POST /devices`: the code to approve in the admin, the URL the phone opens, and the token that works once approved. */
@Serializable
data class PairingCode(val code: String, @SerialName("expires_at") val expiresAt: WireInstant, val url: String, val token: String)

/** `GET /devices/{code}`: pending, approved with the device's name, or expired. */
@Serializable
data class PairingStatusWire(val status: String, @SerialName("device_name") val deviceName: String? = null)

sealed interface PairingStatus {
    data object Pending : PairingStatus
    data class Approved(val deviceName: String) : PairingStatus
    data object Expired : PairingStatus

    companion object {
        fun of(wire: PairingStatusWire): PairingStatus = when (wire.status) {
            "approved" -> Approved(wire.deviceName ?: "")
            "expired" -> Expired
            else -> Pending
        }
    }
}

/** `PUT /playback/{id}/progress`: where a title stands, `position` and `duration` in seconds. */
data class ProgressReport(val contentId: String, val position: Double, val duration: Double, val sentAt: Instant = Instant.now())
