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
import dev.crafters.kanstrimi.contract.NextEpisode
import dev.crafters.kanstrimi.contract.Page
import dev.crafters.kanstrimi.contract.PairingCode
import dev.crafters.kanstrimi.contract.PairingStatus
import dev.crafters.kanstrimi.contract.PersonSheet
import dev.crafters.kanstrimi.contract.Playback
import dev.crafters.kanstrimi.contract.PlaybackMarkers
import dev.crafters.kanstrimi.contract.Programme
import dev.crafters.kanstrimi.contract.ProgressReport
import dev.crafters.kanstrimi.contract.Provider
import dev.crafters.kanstrimi.contract.Quality
import dev.crafters.kanstrimi.contract.SagaSheet
import dev.crafters.kanstrimi.contract.SearchResults
import dev.crafters.kanstrimi.contract.ServerInfo
import dev.crafters.kanstrimi.contract.Source
import dev.crafters.kanstrimi.contract.Studio
import dev.crafters.kanstrimi.contract.Suggestions
import dev.crafters.kanstrimi.contract.Version

/** Versions and sources built by hand, like the Apple tests' `Fixtures`. */
object Fixtures {
    fun source(id: String, url: String = "http://provider.test/movie/u/p/$id.mkv"): Source =
        Source(id = id, container = "MKV", streamUrl = url, provider = Provider("xtream", "provider.test", "xtream"), origin = "Films 4K UHD")

    fun version(id: String, language: String, quality: Quality, dr: DynamicRange? = null, sources: Int = 1, edition: String? = null): Version =
        Version(id = id, language = language, quality = quality, dynamicRange = dr, edition = edition, sources = (0 until sources).map { source("$id-s$it") })

    /** The canvas sheet: six versions (VF ×3, VOSTFR ×2, VO ×1) and seven sources, one version having two. */
    val canvasVersions: List<Version> = listOf(
        version("vf-4k-dv", "VF", Quality.UHD, dr = DynamicRange.DOLBY_VISION),
        version("vf-4k-hdr", "VF", Quality.UHD, dr = DynamicRange.HDR, sources = 2),
        version("vf-fhd", "VF", Quality.FHD),
        version("vostfr-4k-hdr", "VOSTFR", Quality.UHD, dr = DynamicRange.HDR),
        version("vostfr-fhd", "VOSTFR", Quality.FHD),
        version("vo-fhd", "VO", Quality.FHD),
    )

    /** A film in HD, its sources in that order. */
    fun film(id: String = "tmdb:movie:603", sources: List<String>, duration: Double = 6000.0): PlaybackContext {
        val version = Version(id = "vf-hd", language = "VF", quality = Quality.HD, sources = sources.map { source(it) })
        return PlaybackContext(PlaybackContent(id, ContentKind.MOVIE, "Matrix"), listOf(version), duration = duration)
    }

    /** An episode 45 minutes long whose next one exists. */
    fun episode(id: String = "tmdb:tv:1396:s01e01", nextId: String = "tmdb:tv:1396:s01e02"): PlaybackContext {
        val version = Version(id = "vf-hd", language = "VF", quality = Quality.HD, sources = listOf(source("e1")))
        val next = NextEpisode(id = nextId, title = "Épisode 2", season = 1, number = 2, runtime = 45, languages = listOf("VF"),
            item = ContentItem(id = nextId, kind = ContentKind.EPISODE, title = "Épisode 2"), heading = "ÉPISODE SUIVANT")
        return PlaybackContext(PlaybackContent(id, ContentKind.EPISODE, "Épisode 1", "Vincenzo", EpisodeRef(1, 1, "Épisode 1")), listOf(version), duration = 2700.0, next = next)
    }

    fun report(id: String, position: Double): ProgressReport = ProgressReport(id, position, 6000.0)
}

/** Plain preferences for the tests. */
class FakePreferences(
    override var languageOrder: List<String> = PlaybackPreferences.defaultLanguageOrder,
    override var maxQuality: Quality = Quality.UHD,
    override var autoPlayNext: Boolean = true,
    override var rememberVersionPerTitle: Boolean = true,
    override var switchSourceOnFailure: Boolean = true,
) : PlaybackPreferences {
    private val remembered = HashMap<String, String>()
    private val series = HashMap<String, VersionChoiceKey>()
    override fun rememberedVersion(id: String): String? = remembered[id]
    override fun remember(versionId: String?, id: String) { if (versionId == null) remembered.remove(id) else remembered[id] = versionId }
    override fun seriesChoice(seriesId: String): VersionChoiceKey? = series[seriesId]
    override fun setSeriesChoice(key: VersionChoiceKey?, seriesId: String) { if (key == null) series.remove(seriesId) else series[seriesId] = key }
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

    fun reported(id: String): ProgressReport? = reports.lastOrNull { it.contentId == id }

    override suspend fun playback(id: String): Playback =
        Playback(versions = listOf(Version(id = "vf-hd", language = "VF", quality = Quality.HD, sources = listOf(Fixtures.source("next-$id")))), duration = 2700.0)
    override suspend fun suggestions(id: String): Suggestions = suggestionsAnswer
    override suspend fun markers(id: String, file: FileFacts): PlaybackMarkers { markersAsked.add(file); return markersAnswer }
    override suspend fun report(progress: ProgressReport) {
        reportFails?.invoke(progress)?.let { throw it }
        reports.add(progress)
    }
    override suspend fun reportWatchTime(id: String, seconds: Int) {}
    override suspend fun detail(id: String): Card { detailCalls += 1; return Card(id = id, kind = ContentKind.MOVIE, title = "Matrix") }

    override suspend fun createDevice(): PairingCode = error("unused")
    override suspend fun pollDevice(code: String): PairingStatus = error("unused")
    override suspend fun deleteDevice(code: String) = error("unused")
    override suspend fun info(): ServerInfo = error("unused")
    override suspend fun home(): Home = error("unused")
    override suspend fun rows(kind: ContentKind): List<CatalogRow> = error("unused")
    override suspend fun list(query: ListQuery): Page<ContentItem> = error("unused")
    override suspend fun studios(kind: ContentKind): List<Studio> = error("unused")
    override suspend fun sagas(cursor: String?): Page<ContentItem> = error("unused")
    override suspend fun saga(id: String): SagaSheet = error("unused")
    override suspend fun person(id: String): PersonSheet = error("unused")
    override suspend fun channels(): List<ChannelGroup> = error("unused")
    override suspend fun channel(id: String): Channel = error("unused")
    override suspend fun programmes(channelId: String, version: String?): List<Programme> = error("unused")
    override suspend fun search(query: String): SearchResults = error("unused")
    override suspend fun removeFromResume(id: String) = error("unused")
    override suspend fun setWatched(id: String, watched: Boolean, season: Int?) = error("unused")
    override suspend fun setFavorite(id: String, favorite: Boolean) = error("unused")
}
