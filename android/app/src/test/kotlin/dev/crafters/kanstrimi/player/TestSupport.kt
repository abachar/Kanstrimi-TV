package dev.crafters.kanstrimi.player

import dev.crafters.kanstrimi.client.CatalogClient
import dev.crafters.kanstrimi.client.CatalogException
import dev.crafters.kanstrimi.client.ListQuery
import dev.crafters.kanstrimi.contract.Card
import dev.crafters.kanstrimi.contract.CatalogRow
import dev.crafters.kanstrimi.contract.Channel
import dev.crafters.kanstrimi.contract.ChannelGroup
import dev.crafters.kanstrimi.contract.ContentItem
import dev.crafters.kanstrimi.contract.ContentKind
import dev.crafters.kanstrimi.contract.DynamicRange
import dev.crafters.kanstrimi.contract.EpisodeRef
import dev.crafters.kanstrimi.contract.FileFacts
import dev.crafters.kanstrimi.contract.Home
import dev.crafters.kanstrimi.contract.MeasureResult
import dev.crafters.kanstrimi.contract.Language
import dev.crafters.kanstrimi.contract.NextEpisode
import dev.crafters.kanstrimi.contract.Page
import dev.crafters.kanstrimi.contract.PairingCode
import dev.crafters.kanstrimi.contract.PairingStatus
import dev.crafters.kanstrimi.contract.PersonSheet
import dev.crafters.kanstrimi.contract.PictureSize
import dev.crafters.kanstrimi.contract.Playback
import dev.crafters.kanstrimi.contract.PlaybackMarkers
import dev.crafters.kanstrimi.contract.ProfileSettings
import dev.crafters.kanstrimi.contract.Programme
import dev.crafters.kanstrimi.contract.ProgressReport
import dev.crafters.kanstrimi.contract.Provider
import dev.crafters.kanstrimi.contract.Quality
import dev.crafters.kanstrimi.contract.SagaSheet
import dev.crafters.kanstrimi.contract.SearchResults
import dev.crafters.kanstrimi.contract.ServerInfo
import dev.crafters.kanstrimi.contract.Studio
import dev.crafters.kanstrimi.contract.Suggestions
import dev.crafters.kanstrimi.contract.Variant

/** Variants built by hand, like the Apple tests' `Fixtures`. */
object Fixtures {
    val first = Provider("xtream-1", "Fournisseur A", "xtream", 1)
    val second = Provider("xtream-2", "Fournisseur B", "xtream", 2)

    /** A variant as the server writes it: its badge « 4K DV », its label « FR · 4K DV · Version longue ». `url` null: a series' own. */
    fun variant(
        id: String, language: String, quality: Quality, dr: DynamicRange? = null, edition: String? = null,
        provider: Provider = first, url: String? = "http://provider.test/movie/u/p/$id.mkv", chip: String? = null,
    ): Variant {
        val badge = listOfNotNull(quality.label, dr?.label).joinToString(" ")
        return Variant(
            id = id, language = language, quality = quality, dynamicRange = dr, edition = edition, badge = badge,
            label = listOfNotNull("${Language.short(language)} · $badge", edition).joinToString(" · "),
            provider = provider, name = "|FR| $id", category = "Films 4K UHD", container = "MKV", streamUrl = url, chip = chip,
        )
    }

    /**
     * The canvas sheet in the server's order: VF ×4 (the 4K HDR at both providers), VOSTFR ×2, VO ×1; in each
     * language the best quality first.
     */
    val canvasVariants: List<Variant> = listOf(
        variant("vf-4k-dv", "VF", Quality.UHD, dr = DynamicRange.DOLBY_VISION),
        variant("vf-4k-hdr", "VF", Quality.UHD, dr = DynamicRange.HDR),
        variant("vf-4k-hdr-b", "VF", Quality.UHD, dr = DynamicRange.HDR, provider = second),
        variant("vf-fhd", "VF", Quality.FHD),
        variant("vostfr-4k-hdr", "VOSTFR", Quality.UHD, dr = DynamicRange.HDR),
        variant("vostfr-fhd", "VOSTFR", Quality.FHD),
        variant("vo-fhd", "VO", Quality.FHD),
    )

    /** A film in HD carried by as many providers as `variants` names, in the order of preference: equivalent variants. */
    fun film(id: String = "tmdb:movie:603", variants: List<String>, duration: Double = 6000.0): PlaybackContext {
        val list = variants.mapIndexed { i, name -> variant(name, "VF", Quality.HD, provider = Provider("xtream-${i + 1}", "Fournisseur ${'A' + i}", "xtream", i + 1)) }
        return PlaybackContext(PlaybackContent(id, ContentKind.MOVIE, "Matrix"), list, duration = duration)
    }

    /** An episode 45 minutes long whose next one exists. */
    fun episode(id: String = "tmdb:tv:1396:s01e01", nextId: String = "tmdb:tv:1396:s01e02"): PlaybackContext {
        val next = NextEpisode(id = nextId, title = "Épisode 2", season = 1, number = 2, runtime = 45, languages = listOf("VF"),
            item = ContentItem(id = nextId, kind = ContentKind.EPISODE, title = "Épisode 2"), heading = "ÉPISODE SUIVANT")
        return PlaybackContext(PlaybackContent(id, ContentKind.EPISODE, "Épisode 1", "Vincenzo", EpisodeRef(1, 1, "Épisode 1")), listOf(variant("e1", "VF", Quality.HD)), duration = 2700.0, next = next)
    }

    fun report(id: String, position: Double): ProgressReport = ProgressReport(id, position, 6000.0)

    /** A channel with one TS variant per quality (FHD then HD), its programme on air for an hour from `now`. */
    fun channel(id: String = "live:fr-tf1", name: String = "TF1", now: java.time.Instant? = null, hasEpg: Boolean = true): Channel {
        val variants = listOf(Quality.FHD, Quality.HD).map { q ->
            variant("$id-${q.label}", "VF", q, url = "http://provider.test/live/u/p/$id-${q.label}.ts", chip = q.label)
        }
        val programme = now?.let { Programme("Journal", it.minusSeconds(600), it.plusSeconds(3000), "Les titres du jour.") }
        val next = now?.let { Programme("Film du soir", it.plusSeconds(3000), it.plusSeconds(10200), null) }
        return Channel(id = id, name = name, maxQuality = Quality.FHD, hasEpg = hasEpg, variants = variants, chips = variants.mapNotNull { it.chip }, now = programme, next = next)
    }
}

/** Plain preferences for the tests: the profile's settings as the server would have said them. */
class FakePreferences(
    override var settings: ProfileSettings = ProfileSettings(maxQuality = Quality.UHD),
) : PlaybackPreferences {
    var autoPlayNext: Boolean
        get() = settings.autoPlayNext
        set(value) { settings = settings.copy(autoPlayNext = value) }
}

/** The engine as the tests play it: it records what it is asked to open and emits the phases a real stream would. */
class FakePlaybackEngine : PlaybackEngine {
    override var listener: PlaybackEngine.Listener? = null
    val loads = ArrayList<String>()
    val seeks = ArrayList<Double>()
    var stops = 0
    override var fileFacts: FileFacts? = null
    override var phase: EnginePhase = EnginePhase.IDLE
    override var hasFirstFrame: Boolean = false
    override var isBuffering: Boolean = false
    override val audioTracks: List<EngineTrack> = emptyList()
    override val textTracks: List<EngineTrack> = emptyList()
    override val streamFacts: StreamFacts? = null
    /** The picture the engine has read in the stream open; null: not yet. */
    override var pictureSize: PictureSize? = null

    override fun load(url: String, live: Boolean, startPosition: Double?, description: MediaDescription) {
        loads.add(url)
        hasFirstFrame = false
        phase = EnginePhase.LOADING
    }
    override fun stop() { stops += 1; phase = EnginePhase.IDLE }
    override fun play() { emit(EnginePhase.PLAYING) }
    override fun pause() { if (phase == EnginePhase.PLAYING) emit(EnginePhase.PAUSED) }
    override fun seekTo(seconds: Double) { seeks.add(seconds) }
    override fun selectAudioTrack(id: String) {}
    override fun selectTextTrack(id: String?) {}

    fun emit(phase: EnginePhase) {
        this.phase = phase
        if (phase == EnginePhase.PLAYING) hasFirstFrame = true
        listener?.onPhase(phase)
        if (phase == EnginePhase.PLAYING) listener?.onFirstFrame()
    }
    fun emitError() {
        phase = EnginePhase.ERROR
        listener?.onError("connexion fermée")
    }
    fun emitUnsupported(codec: String = "MPEG-2") {
        phase = EnginePhase.ERROR
        listener?.onUnsupported(codec)
    }
    /** The playback clock, as the engine publishes it. */
    fun emitTime(position: Double, duration: Double = fileFacts?.duration ?: 0.0) { listener?.onTime(position, duration, 100) }
}

/** The server as the tests need it: playbacks, markers, suggestions, the reports received; everything else is unused. */
class FakeCatalogClient : CatalogClient {
    override val isMock = true
    val reports = ArrayList<ProgressReport>()
    val markersAsked = ArrayList<FileFacts>()
    var markersAnswer = PlaybackMarkers()
    var suggestionsAnswer = Suggestions()
    var reportFails: ((ProgressReport) -> CatalogException?)? = null
    var detailCalls = 0
    /** Live: the watch times received, and the detail answered for any channel asked. */
    val watchTimes = ArrayList<Pair<String, Int>>()
    var channelAnswer: ((String) -> Channel)? = null

    fun reported(id: String): ProgressReport? = reports.lastOrNull { it.contentId == id }

    /** `/playback/{id}` when a test needs its own; else one HD variant named after the title. The ids asked, in order. */
    var playbackAnswer: ((String) -> Playback)? = null
    val playbackAsked = ArrayList<String>()
    override suspend fun playback(id: String): Playback {
        playbackAsked.add(id)
        return playbackAnswer?.invoke(id) ?: Playback(variants = listOf(Fixtures.variant("next-$id", "VF", Quality.HD)), duration = 2700.0)
    }
    override suspend fun suggestions(id: String): Suggestions = suggestionsAnswer
    override suspend fun markers(id: String, file: FileFacts): PlaybackMarkers { markersAsked.add(file); return markersAnswer }
    override suspend fun report(progress: ProgressReport) {
        reportFails?.invoke(progress)?.let { throw it }
        reports.add(progress)
    }
    override suspend fun reportWatchTime(id: String, seconds: Int) { watchTimes.add(id to seconds) }
    /**
     * The pictures reported: the content, the variant and the size, in order; `measureFails`: the server refuses
     * them; `measureAnswer`: what it answers otherwise.
     */
    val measures = ArrayList<Triple<String, String, PictureSize>>()
    var measureFails = false
    var measureAnswer = MeasureResult(Quality.HD, changed = false)
    override suspend fun reportMeasure(id: String, variantId: String, picture: PictureSize): MeasureResult {
        if (measureFails) throw CatalogException.Server("Variante inconnue pour ce titre")
        measures.add(Triple(id, variantId, picture))
        return measureAnswer
    }
    override suspend fun detail(id: String): Card { detailCalls += 1; return Card(id = id, kind = ContentKind.MOVIE, title = "Matrix") }
    val channelAsked = ArrayList<String>()
    override suspend fun channel(id: String): Channel {
        channelAsked.add(id)
        return channelAnswer?.invoke(id) ?: error("unused")
    }

    override suspend fun createDevice(): PairingCode = error("unused")
    override suspend fun pollDevice(code: String): PairingStatus = error("unused")
    override suspend fun deleteDevice(code: String) = error("unused")
    override suspend fun info(): ServerInfo = error("unused")
    override suspend fun profiles(): List<dev.crafters.kanstrimi.contract.Profile> = error("unused")
    override suspend fun updateSettings(patch: dev.crafters.kanstrimi.contract.ProfileSettingsPatch): dev.crafters.kanstrimi.contract.Profile = error("unused")
    /** What the player told the server to keep: the title and the variant id, in order. */
    val rememberedVariants = ArrayList<Pair<String, String>>()
    override suspend fun rememberVariant(id: String, variantId: String) { rememberedVariants += id to variantId }
    override suspend fun forgetVariant(id: String) { rememberedVariants += id to "" }
    override suspend fun home(): Home = error("unused")
    override suspend fun rows(kind: ContentKind): List<CatalogRow> = error("unused")
    override suspend fun list(query: ListQuery): Page<ContentItem> = error("unused")
    override suspend fun studios(kind: ContentKind): List<Studio> = error("unused")
    override suspend fun sagas(cursor: String?): Page<ContentItem> = error("unused")
    override suspend fun saga(id: String): SagaSheet = error("unused")
    override suspend fun person(id: String): PersonSheet = error("unused")
    override suspend fun channels(): List<ChannelGroup> = error("unused")
    override suspend fun programmes(channelId: String, variantId: String?): List<Programme> = error("unused")
    override suspend fun search(query: String): SearchResults = error("unused")
    override suspend fun removeFromResume(id: String) = error("unused")
    override suspend fun setWatched(id: String, watched: Boolean, season: Int?) = error("unused")
    override suspend fun setFavorite(id: String, favorite: Boolean) = error("unused")
}
