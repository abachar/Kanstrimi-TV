package dev.crafters.kanstrimi.player

import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import dev.crafters.kanstrimi.client.CatalogClient
import dev.crafters.kanstrimi.client.CatalogException
import dev.crafters.kanstrimi.contract.Card
import dev.crafters.kanstrimi.contract.Channel
import dev.crafters.kanstrimi.contract.ContentItem
import dev.crafters.kanstrimi.contract.ContentKind
import dev.crafters.kanstrimi.contract.NextEpisode
import dev.crafters.kanstrimi.contract.PlaybackMarkers
import dev.crafters.kanstrimi.contract.Programme
import dev.crafters.kanstrimi.contract.ProgressReport
import dev.crafters.kanstrimi.contract.Skip
import dev.crafters.kanstrimi.contract.Source
import dev.crafters.kanstrimi.contract.Suggestion
import dev.crafters.kanstrimi.contract.Suggestions
import dev.crafters.kanstrimi.contract.Version
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.time.Instant
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

private const val TAG = "kanstrimi.player"

/**
 * The one player of the app, like the Apple app's `PlayerService`: it owns the engine, the playback context, the
 * version and source in use, the automatic source switch, the failure dialog and the « À suivre » countdown.
 * Its state is Compose state, read by `PlayerScreen`; every call happens on the main thread (`scope`).
 */
class PlayerService(
    private val client: () -> CatalogClient,
    private val preferences: PlaybackPreferences,
    private val engine: PlaybackEngine,
    private val scope: CoroutineScope,
    progressQueue: ProgressQueue,
    private val failedSources: FailedSourcesStore = FailedSourcesStore(),
    private val capabilities: VersionChooser.Capabilities = VersionChooser.Capabilities.tablet,
    /** An action that failed outside the player screen (a title that cannot be loaded): said in the app's notice. */
    private val notify: (String) -> Unit = {},
    /** The final report of a playback reached the server (or the queue): the home reloads on it. */
    private val onProgressReported: () -> Unit = {},
    /** The clock, injected by the tests: the time watched on a channel is counted on it. */
    private val now: () -> Instant = Instant::now,
) : PlaybackEngine.Listener {
    enum class Phase { IDLE, OPENING, BUFFERING, PLAYING, PAUSED, ENDED, FAILED }

    data class Toast(val text: String, val detail: String?)
    data class Failure(val attempts: Int)

    /** What the « À suivre » card offers: the next episode, else the title the server suggests. */
    sealed interface UpNext {
        val item: ContentItem
        val heading: String
        data class EpisodeNext(val next: NextEpisode) : UpNext {
            override val item get() = next.item
            override val heading get() = next.heading
        }
        data class TitleNext(val suggestion: Suggestion) : UpNext {
            override val item get() = suggestion.item
            override val heading get() = suggestion.heading
        }
    }

    // MARK: - Public state

    var context: PlaybackContext? by mutableStateOf(null); private set
    var version: Version? by mutableStateOf(null); private set
    var source: Source? by mutableStateOf(null); private set
    var phase: Phase by mutableStateOf(Phase.IDLE); private set
    var time: Double by mutableDoubleStateOf(0.0); private set
    var duration: Double by mutableDoubleStateOf(0.0); private set
    /** The buffer filled, 0…100, shown while opening or rebuffering. */
    var bufferingProgress: Int by mutableIntStateOf(0); private set
    /** Rebuffering after the start: the badge shows, the phase stays. */
    var isBuffering: Boolean by mutableStateOf(false); private set
    var audioTracks: List<EngineTrack> by mutableStateOf(emptyList()); private set
    var textTracks: List<EngineTrack> by mutableStateOf(emptyList()); private set
    var toast: Toast? by mutableStateOf(null); private set
    var failure: Failure? by mutableStateOf(null); private set
    /** Set while the « À suivre » card shows; counts down to 0. */
    var nextCountdown: Int? by mutableStateOf(null); private set
    /** « Si vous avez aimé… » of the title playing, asked once it has started; null before, and for a channel. */
    var suggestions: Suggestions? by mutableStateOf(null); private set
    /** The recap, the intro and the end credits of the file playing, as the server answered; null until then. */
    var markers: PlaybackMarkers? by mutableStateOf(null); private set
    /** The second of black between a title and what follows it. */
    var isChangingTitle: Boolean by mutableStateOf(false); private set
    /** The sheet of the title playing (its series for an episode), shared by the Infos and Épisodes panels. */
    var titleCard: Card? by mutableStateOf(null); private set
    var titleCardFailed: Boolean by mutableStateOf(false); private set
    private var titleCardId: String? = null
    var nextContext: PlaybackContext? by mutableStateOf(null); private set
    /** Live: the ordered channel list to zap through, and the current one. */
    var channels: List<Channel> by mutableStateOf(emptyList()); private set
    var channel: Channel? by mutableStateOf(null); private set
    /** The playing channel as `GET /channels/{id}` gives it: its guide, and each quality's own. */
    private var channelDetail: Channel? = null
    /** Live: the guide of the version playing (now, next), empty until the channel's detail arrived. */
    var epg: Channel.Guide by mutableStateOf(Channel.Guide.empty); private set
    /** Fast forward / rewind while a direction is held: where the seek lands on release, and the signed rate. */
    var scanTarget: Double? by mutableStateOf(null); private set
    var scanRate: Double by mutableDoubleStateOf(0.0); private set
    /** Playback goes on with the player screen reduced (Picture-in-Picture). */
    var isMinimized: Boolean by mutableStateOf(false)
    /** Debug states: a drawn picture stands in for the video. */
    var debugFrame: Boolean by mutableStateOf(false); private set
    /** The facts the engine read in the stream, for the Infos panel. */
    var streamFacts: StreamFacts? by mutableStateOf(null); private set

    val isPresented: Boolean get() = context != null
    val isLive: Boolean get() = context?.isLive == true

    val upNext: UpNext?
        get() {
            context?.next?.let { return UpNext.EpisodeNext(it) }
            return suggestions?.next?.let { UpNext.TitleNext(it) }
        }

    // MARK: - Internals

    private val reporter = PlaybackReporter(client, progressQueue)
    private var startAttempts = 0
    private var startDeadline: Job? = null
    /** True once the stream shows images: the start deadline hands over to the freeze watchdog. */
    private var isStarted = false
    private var liveWatchedFrom: Instant? = null
    private var hasPlayed = false
    private var lastSeek: Long? = null
    /** Bumped at each start: a late answer of the previous file must not count against this one. */
    private var opening = 0
    private var restartJob: Job? = null
    private var watchdog: Job? = null
    private var scanJob: Job? = null
    private var progressTicker: Job? = null
    private var toastJob: Job? = null
    private var countdownJob: Job? = null
    private var suggestionsJob: Job? = null
    private var markersJob: Job? = null
    private var prefetchJob: Job? = null
    private var changeJob: Job? = null
    private var markersAsked = false
    private var nextTriggered = false

    init {
        engine.listener = this
    }

    val chooser: VersionChooser
        get() = VersionChooser(preferences.languageOrder, preferences.maxQuality, capabilities) { failedSources.isFailed(it) }

    /**
     * The version a title or a channel starts in (`VersionChooser.start`): « TF1 » switched to FHD reopens, previews
     * and shows its guide in FHD.
     */
    fun startChoice(id: String, versions: List<Version>, seriesId: String? = null): VersionChooser.Choice? =
        chooser.start(id, versions, seriesId, preferences)

    // MARK: - Entry points

    /**
     * Plays a movie, an episode, or a series (the server resolves the episode to play), from its resume point
     * (`fromStart`: from the beginning), in the version asked for, else the chooser's.
     */
    fun play(id: String, fromStart: Boolean = false, versionId: String? = null) {
        scope.launch {
            val loaded = try {
                loadContext(id)
            } catch (e: CatalogException) {
                notify("Lecture impossible · ${e.message}"); return@launch
            }
            if (loaded == null) { notify("Lecture impossible · titre introuvable"); return@launch }
            val ctx = if (fromStart) loaded.resuming(null) else loaded
            val wanted = versionId?.let { v -> ctx.versions.firstOrNull { it.id == v } }
            if (wanted != null) play(ctx, wanted) else play(ctx)
        }
    }

    /** The context of an id: a movie, a series (the episode it resumes on), an episode. */
    suspend fun loadContext(id: String): PlaybackContext? {
        val c = client()
        val seriesId = seriesIdOf(id)
        if (seriesId != null) {
            val series = c.detail(seriesId)
            val episode = series.seasons.orEmpty().flatMap { it.episodes }.firstOrNull { it.id == id } ?: return null
            return PlaybackContext.of(episode, series, c.playback(id))
        }
        return PlaybackContext.of(c.detail(id), c.playback(id))
    }

    /** Chooses the version with the chooser and starts. Called by every « Lecture ». */
    fun play(ctx: PlaybackContext) {
        val choice = startChoice(ctx.content.id, ctx.versions, ctx.seriesId)
        if (choice == null) { notify("Lecture impossible · aucune source"); return }
        start(ctx, choice.version, choice.source, ctx.resumeAt)
    }

    /** Plays an explicit version (picker, panel). Keeps the position when already playing the same content. */
    fun play(ctx: PlaybackContext, version: Version, source: Source? = null) {
        val src = source ?: chooser.bestSource(version) ?: return
        val samePlayback = context?.content?.id == ctx.content.id && phase != Phase.IDLE
        start(ctx, version, src, if (samePlayback) time else ctx.resumeAt)
    }

    /**
     * Plays what a panel asked for once it is loaded; false when it was not played: nothing came back, or the
     * player was left or changed title meanwhile (a late answer must not reopen it).
     */
    suspend fun playPicked(load: suspend () -> PlaybackContext?): Boolean {
        val before = context?.content?.id ?: return false
        val picked = load() ?: return false
        if (context?.content?.id != before) return false
        play(picked)
        return true
    }

    /**
     * Live: plays a channel out of an ordered list (the category it was chosen in), in the version it starts in. The
     * same engine takes the new source: a zap is this again. The channel's detail is asked for its guide.
     */
    fun playChannel(channel: Channel, order: List<Channel>) {
        channels = order
        this.channel = channel
        channelDetail = null
        epg = Channel.Guide.empty
        val ctx = PlaybackContext(PlaybackContent(channel.id, ContentKind.LIVE, channel.name), channel.versions)
        play(ctx)
        scope.launch {
            val full = runCatching { client().channel(channel.id) }.getOrNull()
            if (this@PlayerService.channel?.id == channel.id) {
                channelDetail = full
                showGuide()
            }
        }
    }

    /** The channel `offset` places further in the list, around its ends. */
    fun zap(offset: Int) {
        if (!isLive) return
        val current = channel ?: return
        val idx = channels.indexOfFirst { it.id == current.id }
        if (idx < 0 || channels.isEmpty()) return
        playChannel(channels[((idx + offset) % channels.size + channels.size) % channels.size], channels)
    }

    /** The guide of the version playing, as the detail knows it: each quality may have its own (« M6 4K »), else the channel's. */
    private fun showGuide() {
        val detail = channelDetail ?: return
        if (detail.id != channel?.id) return
        val v = version?.let { playing -> detail.versions.firstOrNull { it.id == playing.id } ?: playing }
        epg = detail.guide(v)
    }

    /** Asks for the sheet of the title playing, unless it is already there or on its way; a failure may be retried. */
    suspend fun loadTitleCard() {
        val c = context ?: return
        if (isLive) return
        val id = c.seriesId ?: c.content.id
        if (titleCardId == id) return
        titleCardId = id
        titleCard = null; titleCardFailed = false
        val card = runCatching { client().detail(id) }.getOrNull()
        if (titleCardId != id) return
        if (card != null) titleCard = card else { titleCardFailed = true; titleCardId = null }
    }

    fun stop() {
        sendProgress(final = true)
        cancelTimers()
        restartJob?.cancel(); restartJob = null
        changeJob?.cancel(); changeJob = null
        engine.stop()
        context = null; version = null; source = null; channel = null; channels = emptyList()
        channelDetail = null; epg = Channel.Guide.empty
        phase = Phase.IDLE; time = 0.0; duration = 0.0; isMinimized = false; isBuffering = false
        failure = null; toast = null; nextCountdown = null; nextContext = null; nextTriggered = false
        suggestions = null; suggestionsJob?.cancel(); prefetchJob?.cancel(); isChangingTitle = false
        forgetMarkers()
        titleCard = null; titleCardFailed = false; titleCardId = null
        audioTracks = emptyList(); textTracks = emptyList(); streamFacts = null
        debugFrame = false
    }

    // MARK: - Controls

    /** Live never pauses, like a TV; `ENDED` is terminal for the engine: playing again is a new load from the start. */
    fun togglePlayPause() {
        when (phase) {
            Phase.PLAYING, Phase.BUFFERING -> if (!isLive) engine.pause()
            Phase.PAUSED -> engine.play()
            Phase.ENDED -> {
                val ctx = context ?: return
                val v = version ?: return
                val s = source ?: return
                start(ctx, v, s, 0.0)
            }
            else -> {}
        }
    }

    fun pause() { if (phase == Phase.PLAYING && !isLive) engine.pause() }

    fun seekBy(delta: Double) {
        if (isLive || duration <= 0) return
        seekTo(time + delta)
    }

    fun seekTo(seconds: Double) {
        if (isLive || duration <= 0) return
        val target = min(max(0.0, seconds), duration - 1)
        time = target
        lastSeek = System.currentTimeMillis()
        engine.seekTo(target)
        Log.i(TAG, "seek à ${target.toInt()}")
    }

    /** Starts sweeping the film while a direction is held; the image keeps playing, one seek on release. */
    fun startScan(forward: Boolean) {
        if (isLive || duration <= 0 || scanJob != null) return
        val sign = if (forward) 1.0 else -1.0
        scanTarget = time
        scanJob = scope.launch {
            val began = System.currentTimeMillis()
            while (isActive) {
                val level = min(((System.currentTimeMillis() - began) / 2000).toInt(), SCAN_RATES.size - 1)
                scanRate = sign * SCAN_RATES[level]
                scanTarget = min(max(0.0, (scanTarget ?: time) + scanRate / 4), duration - 1)
                delay(250)
            }
        }
    }

    /** Release: jump to where the sweep got to. */
    fun stopScan() {
        val target = scanTarget ?: return
        cancelScan()
        seekTo(target)
    }

    private fun cancelScan() {
        scanJob?.cancel(); scanJob = null
        scanTarget = null; scanRate = 0.0
    }

    /** The time the chrome shows: the sweep's target while scanning. */
    val shownTime: Double get() = scanTarget ?: time
    val remaining: Double get() = max(0.0, duration - shownTime)
    val fraction: Float get() = if (duration > 0) (shownTime / duration).toFloat() else 0f
    /** « ▶▶ ×30  » while a direction is held, before the time it reaches. */
    val scanLabel: String get() = if (scanRate == 0.0) "" else "${if (scanRate > 0) "▶▶" else "◀◀"} ×${abs(scanRate).toInt()}  "

    /** « Passer le récap », « Passer l'intro »: what the server lets skip, offered while it plays. */
    val skipOffer: Skip?
        get() {
            val skips = markers?.skips ?: return null
            if (isLive || (phase != Phase.PLAYING && phase != Phase.PAUSED && phase != Phase.BUFFERING) || scanTarget != null) return null
            return skips.firstOrNull { time >= it.start && time < it.end - 1 }
        }

    fun skip() {
        val offer = skipOffer ?: return
        seekTo(offer.end)
    }

    fun selectAudio(track: EngineTrack) = engine.selectAudioTrack(track.id)
    fun selectText(track: EngineTrack?) = engine.selectTextTrack(track?.id)

    // Each menu only when it offers a choice; the tracks are known once the engine has read the stream.
    val offersVersions: Boolean get() = (context?.versions?.size ?: 0) > 1
    val offersAudio: Boolean get() = audioTracks.size > 1
    val offersSubtitles: Boolean get() = textTracks.isNotEmpty()

    // MARK: - Versions while playing

    /** Switches version, same position, and remembers it for the title when the preference says so. */
    fun switchVersion(v: Version) {
        val ctx = context ?: return
        if (preferences.rememberVersionPerTitle) {
            val sid = ctx.seriesId
            if (ctx.content.kind == ContentKind.EPISODE && sid != null) preferences.setSeriesChoice(VersionChoiceKey(v), sid)
            else preferences.remember(v.id, ctx.content.id)
        }
        play(ctx, v)
    }

    /** « Réessayer » from the failure dialog: links asked for again, same version, same position. */
    fun retryFromServer() {
        val v = version ?: return
        failure = null
        startAttempts = 0
        restartWithFreshLinks(v)
    }

    /** Every other version, the chooser's best first: the failure dialog offers one. */
    val alternativeVersions: List<Version>
        get() {
            val ctx = context ?: return emptyList()
            val v = version ?: return emptyList()
            return chooser.alternatives(v, ctx.versions)
        }

    /** From the failure dialog: another version, without remembering it as the title's choice. */
    fun playInstead(v: Version) {
        val ctx = context ?: return
        failure = null
        startAttempts = 0
        play(ctx, v)
    }

    // MARK: - Next episode

    fun playNextNow() {
        val next = nextContext ?: return
        countdownJob?.cancel()
        nextCountdown = null
        nextContext = null
        nextTriggered = true
        sendProgress(final = true)
        play(next)
    }

    /** « Lire maintenant » on a suggested title whose playback is not fetched yet: asked now. */
    fun playUpNextNow() {
        if (nextContext != null) return playNextNow()
        val up = upNext ?: return
        val ctx = context ?: return
        scope.launch {
            playPicked {
                val prepared = contextFor(up, ctx)
                if (prepared != null) { countdownJob?.cancel(); nextCountdown = null; nextTriggered = true }
                prepared
            }
        }
    }

    fun cancelNext() {
        countdownJob?.cancel()
        nextCountdown = null
        nextTriggered = true
    }

    /**
     * The end of a title (its file's, or the countdown started at its credits) with something to follow and the
     * automatic play on: a second of black, then the next title. Otherwise back to the sheet, the title reported
     * as seen to its end.
     */
    private fun followUp() {
        if (isChangingTitle) return
        val up = upNext
        val ctx = context
        if (!preferences.autoPlayNext || nextTriggered || up == null || ctx == null) {
            time = duration
            stop()
            return
        }
        val prepared = nextContext
        countdownJob?.cancel()
        nextCountdown = null
        nextContext = null
        nextTriggered = true
        // From the credits the file still plays: silenced under the black, the next load replaces it.
        if (phase != Phase.ENDED) engine.pause()
        time = duration
        sendProgress(final = true)
        isChangingTitle = true
        changeJob = scope.launch {
            delay(NEXT_BLACK_MS)
            if (!isChangingTitle) return@launch
            // Not ready (its prefetch failed): asked now rather than dropping back to the sheet.
            val next = prepared ?: contextFor(up, ctx)
            if (!isChangingTitle) return@launch
            isChangingTitle = false
            if (next != null) play(next) else stop()
        }
    }

    // MARK: - Start pipeline

    private fun start(ctx: PlaybackContext, v: Version, s: Source, position: Double?) {
        if (context?.content?.id != ctx.content.id) {
            sendProgress(final = true)
            startAttempts = 0
            nextTriggered = false
            nextContext = null
            nextCountdown = null
            countdownJob?.cancel()
            if (titleCardId != (ctx.seriesId ?: ctx.content.id)) { titleCard = null; titleCardFailed = false; titleCardId = null }
            prefetchNext(ctx)
            fetchSuggestions(ctx)
        }
        cancelTimers(keepCountdown = true)
        restartJob?.cancel(); restartJob = null
        // Another version, another source, the same one again: each start opens a file, its markers asked anew.
        forgetMarkers()
        context = ctx
        val changedVersion = version?.id != v.id
        version = v
        if (changedVersion && ctx.isLive) showGuide()
        source = s
        failure = null
        debugFrame = false
        phase = Phase.OPENING
        isBuffering = false
        bufferingProgress = 0
        time = position ?: 0.0
        duration = ctx.duration ?: 0.0
        isStarted = false
        hasPlayed = false
        lastSeek = null
        opening += 1
        audioTracks = emptyList(); textTracks = emptyList(); streamFacts = null

        val resume = if (!ctx.isLive && (position ?: 0.0) > 1) position else null
        val description = MediaDescription(ctx.content.title, ctx.content.subtitle?.let { sub -> ctx.content.episode?.let { "$sub · ${it.shortCode}" } ?: sub }, ctx.content.backdrop)
        engine.load(s.streamUrl, ctx.isLive, resume, description)
        armStartDeadline()
        armWatchdog()
        startProgressTicker()
    }

    private fun markStarted() {
        if (isStarted) return
        isStarted = true
        if (isLive && liveWatchedFrom == null) liveWatchedFrom = now()
        startAttempts = 0
        startDeadline?.cancel()
        source?.let { failedSources.clear(it.id) }
        fetchMarkers()
    }

    /**
     * Once started, a source that keeps rebuffering while playing is a failed source (next source, retry at the
     * same position, then the dialog): the bandwidth at home is not the bottleneck, the source is.
     */
    private fun armWatchdog() {
        watchdog?.cancel()
        val timeout = if (isLive) FREEZE_TIMEOUT_S else VOD_FREEZE_TIMEOUT_S
        watchdog = scope.launch {
            var still = 0
            while (isActive) {
                delay(1000)
                if (!isStarted || (phase != Phase.PLAYING && phase != Phase.BUFFERING)) { still = 0; continue }
                // Just after a seek the engine may take a few seconds to fetch the new position.
                val seek = lastSeek
                if (seek != null && System.currentTimeMillis() - seek < VOD_FREEZE_TIMEOUT_S * 1000) { still = 0; continue }
                still = if (engine.isBuffering) still + 1 else 0
                if (still >= timeout) {
                    Log.i(TAG, "gel à ${time.toInt()}")
                    handleStreamFailure()
                    return@launch
                }
            }
        }
    }

    private fun armStartDeadline() {
        startDeadline?.cancel()
        startDeadline = scope.launch {
            delay(START_TIMEOUT_MS)
            if (!engine.hasFirstFrame || engine.phase != EnginePhase.PLAYING) handleStreamFailure()
        }
    }

    /** What follows a failed start or a freeze: the next source, the same one again, or the dialog. */
    sealed interface FailureStep {
        data class OtherSource(val source: Source) : FailureStep
        data object SameSource : FailureStep
        data object GiveUp : FailureStep
    }

    /** Error or no image after 10 s: switch source, retry twice, then ask. The links held are the provider's own. */
    private fun handleStreamFailure() {
        if (restartJob != null || context == null) return
        val v = version ?: return
        val s = source ?: return
        startAttempts += 1
        failedSources.markFailed(s.id)
        when (val step = failureStep(startAttempts, preferences.switchSourceOnFailure, chooser.nextSource(s, v))) {
            is FailureStep.OtherSource -> {
                showToast("Source changée automatiquement", "${sourceLabel(s, v)} → ${sourceLabel(step.source, v)} · même version ${v.label}")
                restart(v, step.source)
            }
            FailureStep.SameSource -> restart(v, s)
            FailureStep.GiveUp -> presentFailure()
        }
    }

    /** Restarts on the given source at the same position, on the next turn: a failure is noticed inside the engine's own callbacks. */
    private fun restart(v: Version, s: Source) {
        val ctx = context ?: return
        val at = time
        restartJob?.cancel()
        restartJob = scope.launch {
            if (context?.content?.id != ctx.content.id) return@launch
            restartJob = null
            start(ctx, v, s, at)
        }
    }

    /**
     * « Réessayer »: asks `/playback` (`/channels/{id}` in live) again, in case the catalogue changed since, then
     * restarts on the same version at the same position.
     */
    private fun restartWithFreshLinks(v: Version) {
        val ctx = context ?: return
        val at = time
        restartJob?.cancel()
        restartJob = scope.launch {
            val fresh = runCatching {
                if (ctx.isLive) PlaybackContext(ctx.content, client().channel(ctx.content.id).versions)
                else PlaybackContext(ctx.content, client().playback(ctx.content.id))
            }.getOrNull() ?: ctx
            if (context?.content?.id != ctx.content.id) return@launch
            restartJob = null
            val version = fresh.versions.firstOrNull { it.id == v.id } ?: v
            val source = chooser.bestSource(version) ?: return@launch
            start(fresh, version, source, at)
        }
    }

    /** Stops and shows the failure dialog. */
    private fun presentFailure() {
        if (version == null || source == null) return
        sendWatchTime(final = true)
        cancelTimers(keepCountdown = true)
        engine.stop()
        phase = Phase.FAILED
        failure = Failure(startAttempts)
    }

    fun sourceLabel(s: Source, v: Version): String {
        val idx = v.sources.indexOfFirst { it.id == s.id }
        return if (idx < 0) "Source" else VersionChooser.sourceName(idx)
    }

    private fun showToast(text: String, detail: String?) {
        toast = Toast(text, detail)
        toastJob?.cancel()
        toastJob = scope.launch {
            delay(4000)
            toast = null
        }
    }

    private fun prefetchNext(ctx: PlaybackContext) {
        prefetchJob?.cancel()
        val next = ctx.next ?: return
        prefetchJob = scope.launch {
            val prepared = contextFor(UpNext.EpisodeNext(next), ctx) ?: return@launch
            if (context?.content?.id == ctx.content.id) nextContext = prepared
        }
    }

    /** What follows `ctx`, ready to play: its versions asked from `/playback`. */
    private suspend fun contextFor(up: UpNext, after: PlaybackContext): PlaybackContext? = when (up) {
        is UpNext.EpisodeNext -> runCatching { PlaybackContext.of(up.next, after, client().playback(up.next.id)) }.getOrNull()
        is UpNext.TitleNext -> runCatching { PlaybackContext.of(up.suggestion.item, client().playback(up.suggestion.item.id)) }.getOrNull()
    }

    /** A moment after the start, so the first seconds of playback keep the connection to themselves. */
    private fun fetchSuggestions(ctx: PlaybackContext) {
        suggestions = null
        suggestionsJob?.cancel()
        if (ctx.isLive) return
        suggestionsJob = scope.launch {
            delay(SUGGESTIONS_DELAY_MS)
            val s = runCatching { client().suggestions(ctx.content.id) }.getOrNull() ?: return@launch
            if (context?.content?.id != ctx.content.id) return@launch
            suggestions = s
            // After a movie or the last episode: what follows is the suggestion, ready before the end.
            if (ctx.next != null) return@launch
            val next = s.next ?: return@launch
            val prepared = contextFor(UpNext.TitleNext(next), ctx) ?: return@launch
            if (context?.content?.id == ctx.content.id) nextContext = prepared
        }
    }

    /**
     * Once the file is open and playing: what the engine read in it (its length; Media3 reads no Matroska
     * chapters) goes to the server, which answers what can be skipped in it and where its end credits are.
     */
    private fun fetchMarkers() {
        if (!isStarted || isLive || markersAsked) return
        val ctx = context ?: return
        val facts = engine.fileFacts ?: return
        markersAsked = true
        val generation = opening
        markersJob = scope.launch {
            val answer = runCatching { client().markers(ctx.content.id, facts) }.getOrNull() ?: return@launch
            if (opening != generation || context?.content?.id != ctx.content.id) return@launch
            markers = answer
        }
    }

    private fun forgetMarkers() {
        markersJob?.cancel(); markersJob = null
        markersAsked = false
        markers = null
    }

    /** From where « À suivre » shows and how long it counts: the start of the end credits, else the last fifteen seconds. */
    private val nextCardMoment: Pair<Double, Double>?
        get() {
            if (duration <= 0) return null
            markers?.credits?.let { if (it.at < duration) return it.at to it.countdown.toDouble() }
            return (duration - NEXT_COUNTDOWN_S) to NEXT_COUNTDOWN_S.toDouble()
        }

    /** The card counts down on the position, so it holds while paused; from the credits it starts what follows itself. */
    private fun maybeStartCountdown() {
        if (!preferences.autoPlayNext || nextTriggered || nextCountdown != null || upNext == null) return
        val (from, seconds) = nextCardMoment ?: return
        if (shownTime < from || phase != Phase.PLAYING) return
        // Arrived deep in the credits (a seek, a resume): the full count from here, not what is left of it.
        val zero = min(shownTime + seconds, duration)
        fun left() = max(0, ceil(zero - time).toInt())
        nextCountdown = left()
        countdownJob?.cancel()
        countdownJob = scope.launch {
            while (isActive) {
                val n = nextCountdown ?: return@launch
                if (n <= 0) break
                delay(250)
                // Rewound before its moment: the card goes, and comes back with it.
                if (shownTime < from - 1) { nextCountdown = null; return@launch }
                if (phase == Phase.PLAYING) nextCountdown = min(n, left())
            }
            if (zero < duration) {
                if (nextCountdown == 0) followUp()
                return@launch
            }
            // A file whose announced length runs past its picture: no end from the engine, follow up anyway.
            delay(END_WAIT_MS)
            if (nextCountdown == 0 && phase != Phase.ENDED) followUp()
        }
    }

    // MARK: - Progress

    private fun startProgressTicker() {
        progressTicker?.cancel()
        progressTicker = scope.launch {
            while (isActive) {
                delay(PROGRESS_INTERVAL_MS)
                if (phase == Phase.PLAYING || phase == Phase.BUFFERING) sendProgress(final = false)
            }
        }
    }

    /** Films and episodes: the position. Live: the time watched since the last report. */
    private fun sendProgress(final: Boolean) {
        if (isLive) return sendWatchTime(final)
        val ctx = context ?: return
        if (duration <= 0 || time <= 0) return
        // Past the start of its end credits a title is seen, wherever it is left: reported at its end.
        val seen = markers?.credits?.let { time >= it.at } ?: false
        val report = ProgressReport(ctx.content.id, if (seen) duration else time, duration)
        scope.launch {
            reporter.report(report)
            if (final) onProgressReported()
        }
    }

    /**
     * Live: the time watched since the last report (every ten seconds, and when leaving the channel), summed by the
     * server for « Chaînes les plus regardées ». Out of the live player the home and the Direct reload; not on a zap,
     * which would reload them at every channel.
     */
    private fun sendWatchTime(final: Boolean) {
        val ctx = context ?: return
        val from = liveWatchedFrom ?: return
        val seconds = (now().epochSecond - from.epochSecond).toInt()
        liveWatchedFrom = if (final) null else now()
        if (seconds <= 0) return
        scope.launch {
            reporter.reportWatchTime(ctx.content.id, seconds)
            if (final && !isLive) onProgressReported()
        }
    }

    private fun cancelTimers(keepCountdown: Boolean = false) {
        startDeadline?.cancel(); startDeadline = null
        watchdog?.cancel(); watchdog = null
        cancelScan()
        progressTicker?.cancel(); progressTicker = null
        if (!keepCountdown) { countdownJob?.cancel(); countdownJob = null }
    }

    // MARK: - Engine

    override fun onPhase(phase: EnginePhase) {
        Log.i(TAG, "phase $phase temps ${time.toInt()} durée ${duration.toInt()}")
        // After `stop()` or a failure the engine's last events are the old session's.
        if (this.phase == Phase.IDLE || this.phase == Phase.FAILED) return
        when (phase) {
            EnginePhase.IDLE -> return
            EnginePhase.LOADING -> { this.phase = Phase.OPENING; isBuffering = false }
            EnginePhase.PLAYING -> {
                this.phase = Phase.PLAYING
                isBuffering = false
                hasPlayed = true
                markStartedIfReady()
            }
            EnginePhase.PAUSED -> {
                this.phase = Phase.PAUSED
                isBuffering = false
                sendProgress(final = false)
            }
            EnginePhase.BUFFERING -> if (!hasPlayed) this.phase = Phase.OPENING else isBuffering = true
            EnginePhase.ENDED -> {
                // A live has no end, and a film ending far from its end was cut.
                if (isLive || !hasPlayed || (duration > 0 && duration - time > END_MARGIN_S)) {
                    Log.i(TAG, "coupure à ${time.toInt()}")
                    handleStreamFailure()
                    return
                }
                this.phase = Phase.ENDED
                isBuffering = false
                followUp()
            }
            EnginePhase.ERROR -> handleStreamFailure()
        }
    }

    override fun onError(message: String) {
        Log.i(TAG, "erreur $message")
        if (phase == Phase.IDLE || phase == Phase.FAILED) return
        handleStreamFailure()
    }

    override fun onTime(position: Double, duration: Double, bufferedPercent: Int) {
        if (phase == Phase.IDLE || phase == Phase.FAILED) return
        bufferingProgress = bufferedPercent
        if (duration > 0 && this.duration != duration) { this.duration = duration; fetchMarkers() }
        if (phase == Phase.OPENING) return
        time = position
        markStartedIfReady()
        maybeStartCountdown()
    }

    override fun onFirstFrame() {
        markStartedIfReady()
    }

    override fun onTracks() {
        audioTracks = engine.audioTracks
        textTracks = engine.textTracks
        streamFacts = engine.streamFacts
    }

    /** Started: the first picture is on screen and the session is playing. */
    private fun markStartedIfReady() {
        if (phase == Phase.PLAYING && engine.hasFirstFrame && engine.phase == EnginePhase.PLAYING) markStarted()
    }

    // MARK: - Debug

    enum class PreviewState { vodPaused, opening, failure, nextEpisode, nextTitle, panel, skipIntro, livePlaying }

    /** Previews and captures: puts the player in a given state without a stream, a drawn picture for the video. */
    fun debugPut(ctx: PlaybackContext, state: PreviewState, suggestions: Suggestions? = null, channels: List<Channel> = emptyList()) {
        engine.stop()
        cancelTimers()
        debugFrame = true
        context = ctx
        this.suggestions = suggestions
        version = ctx.versions.firstOrNull()
        source = ctx.versions.firstOrNull()?.sources?.firstOrNull()
        duration = ctx.duration ?: 7620.0
        time = ctx.resumeAt ?: 4368.0
        audioTracks = listOf(EngineTrack("0:0", "Français (AC3 5.1)", "fr", true), EngineTrack("0:1", "English (AAC stéréo)", "en", false))
        textTracks = listOf(EngineTrack("1:0", "Français", "fr", false))
        streamFacts = StreamFacts("HEVC", 1920, 1080, "HDR10", 23.976f, "c2.exynos.hevc.decoder", "EAC3", 6, "OMX.google.eac3.decoder")
        failure = null; nextCountdown = null; markers = null; isBuffering = false
        this.channels = channels; channel = channels.firstOrNull { it.id == ctx.content.id } ?: channels.firstOrNull()
        channelDetail = null; epg = Channel.Guide.empty
        when (state) {
            PreviewState.livePlaying -> {
                phase = Phase.PLAYING
                duration = 0.0; time = 0.0
                val start = now().minusSeconds(3200)
                epg = Channel.Guide(
                    now = Programme("Ligue · Lyon – Nantes", start, start.plusSeconds(7200), "Le choc de la journée, en direct du Groupama Stadium."),
                    next = Programme("Le Mag du foot", start.plusSeconds(7200), start.plusSeconds(9000), null),
                    hasEpg = true,
                )
                streamFacts = StreamFacts("H.264", 1920, 1080, null, 50f, "c2.exynos.avc.decoder", "AAC", 2, "c2.android.aac.decoder")
            }
            PreviewState.vodPaused -> phase = Phase.PAUSED
            PreviewState.failure -> { phase = Phase.FAILED; failure = Failure(2) }
            PreviewState.nextEpisode, PreviewState.nextTitle -> { phase = Phase.PLAYING; time = duration - 8; nextCountdown = 7 }
            PreviewState.panel -> phase = Phase.PLAYING
            PreviewState.skipIntro -> {
                phase = Phase.PLAYING
                time = 0.0
                markers = PlaybackMarkers(skips = listOf(Skip(0.0, 90.0, "Passer l'intro")), credits = null)
            }
            PreviewState.opening -> { phase = Phase.OPENING; bufferingProgress = 42 }
        }
    }

    companion object {
        const val START_TIMEOUT_MS = 10_000L
        const val PROGRESS_INTERVAL_MS = 10_000L
        /** Without the start of the end credits, the card counts down the last seconds of the file; a second of black then marks the change. */
        const val NEXT_COUNTDOWN_S = 15
        const val NEXT_BLACK_MS = 1000L
        /** The countdown at 0 without the engine's end: past this, what follows starts anyway. */
        const val END_WAIT_MS = 2000L
        const val SUGGESTIONS_DELAY_MS = 3000L
        /** Live: no new picture for this long means the source froze; films and episodes: longer, a seek in a remote MKV can hold the image. */
        const val FREEZE_TIMEOUT_S = 4
        const val VOD_FREEZE_TIMEOUT_S = 15
        /** Films and episodes: a stop further than this from the end is a cut, not the end of the file. */
        const val END_MARGIN_S = 60.0
        /** Fast forward / rewind speeds, one more level every 2 s of hold. */
        val SCAN_RATES = listOf(10.0, 30.0, 60.0, 120.0, 300.0)

        fun failureStep(attempts: Int, switchesSources: Boolean, nextSource: Source?): FailureStep {
            if (switchesSources && nextSource != null) return FailureStep.OtherSource(nextSource)
            return if (attempts <= 2) FailureStep.SameSource else FailureStep.GiveUp
        }
    }
}
