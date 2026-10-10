package dev.crafters.kanstrimi.player

import android.content.Context
import android.content.pm.ApplicationInfo
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.annotation.OptIn
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.common.text.Cue
import androidx.media3.common.text.CueGroup
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.decoder.ffmpeg.FfmpegAudioRenderer
import androidx.media3.decoder.ffmpeg.FfmpegLibrary
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.Renderer
import androidx.media3.exoplayer.analytics.AnalyticsListener
import androidx.media3.exoplayer.audio.AudioRendererEventListener
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.mediacodec.MediaCodecSelector
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import androidx.media3.exoplayer.util.EventLogger
import androidx.media3.session.MediaSession
import dev.crafters.kanstrimi.contract.FileFacts
import java.util.Locale

private const val TAG = "kanstrimi.player"

/**
 * The engine: one ExoPlayer, built on the first `load`, released on `stop` so the provider never sees two
 * connections from this app. The picture goes through MediaCodec (HDR10+ natively on the Tab S9, no Dolby
 * Vision: the HEVC base layer plays), the sound through MediaCodec when the device has the codec (AC3, EAC3 on
 * the Tab S9) and through Jellyfin's FFmpeg build otherwise (DTS, TrueHD). The `Player` and the subtitle cues
 * are Compose state for the screen; everything else reaches `PlayerService` through the `Listener`.
 */
@OptIn(UnstableApi::class)
class ExoPlaybackEngine(context: Context) : PlaybackEngine {
    private val context = context.applicationContext
    private val handler = Handler(Looper.getMainLooper())
    private val isDebuggable = context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
    override var listener: PlaybackEngine.Listener? = null

    /** The player while something is loaded, for `PlayerSurface` and the media session. */
    var player: ExoPlayer? by mutableStateOf(null)
        private set
    /** The subtitle cues on screen now, drawn by `SubtitleView`. */
    var cues: List<Cue> by mutableStateOf(emptyList())
        private set
    /** The engine's media session while something is loaded; `PlaybackService` lends it to the system. */
    var session: MediaSession? = null
        private set
    /** The media service while it runs, to stop it with the engine. */
    var service: PlaybackService? = null

    override var phase: EnginePhase = EnginePhase.IDLE
        private set
    override var hasFirstFrame: Boolean = false
        private set
    override val isBuffering: Boolean get() = player?.playbackState == Player.STATE_BUFFERING
    override var audioTracks: List<EngineTrack> = emptyList()
        private set
    override var textTracks: List<EngineTrack> = emptyList()
        private set
    override val fileFacts: FileFacts?
        get() {
            val p = player ?: return null
            val duration = p.duration
            if (duration == C.TIME_UNSET || duration <= 0 || p.isCurrentMediaItemLive) return null
            return FileFacts(duration / 1000.0, emptyList())
        }
    override var streamFacts: StreamFacts? = null
        private set
    private var videoDecoder: String? = null
    private var audioDecoder: String? = null
    /** The item loaded is a channel: once ready, a dynamic window (HLS, DASH) is joined at its live edge. */
    private var isLiveItem = false
    private var joinedLiveEdge = false

    private val ticker = object : Runnable {
        override fun run() {
            val p = player ?: return
            val duration = p.duration.let { if (it == C.TIME_UNSET || p.isCurrentMediaItemLive) 0.0 else it / 1000.0 }
            listener?.onTime(p.currentPosition.coerceAtLeast(0) / 1000.0, duration, p.bufferedPercentage)
            handler.postDelayed(this, TICK_MS)
        }
    }

    private val playerListener = object : Player.Listener {
        override fun onPlaybackStateChanged(playbackState: Int) {
            // A plain TS stream has no window to speak of; a manifest-driven live one is joined at its edge once.
            val p = player
            if (playbackState == Player.STATE_READY && isLiveItem && !joinedLiveEdge && p != null) {
                joinedLiveEdge = true
                if (p.isCurrentMediaItemLive) p.seekToDefaultPosition()
            }
            publishPhase()
        }
        override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) = publishPhase()
        override fun onPlayerError(error: PlaybackException) {
            Log.w(TAG, "erreur du moteur ${error.errorCodeName}: ${error.message}")
            phase = EnginePhase.ERROR
            listener?.onError("${error.errorCodeName} · ${error.message ?: ""}")
        }
        override fun onRenderedFirstFrame() {
            hasFirstFrame = true
            listener?.onFirstFrame()
            publishPhase()
        }
        override fun onTracksChanged(tracks: Tracks) {
            readTracks(tracks)
            listener?.onTracks()
            // No decoder for the picture (MPEG-2 on a tablet): the sound alone would play over a black screen.
            unsupportedVideo(tracks)?.let { codec ->
                Log.w(TAG, "image non décodable par ExoPlayer : $codec")
                phase = EnginePhase.ERROR
                handler.post { listener?.onUnsupported(codec) }
            }
        }
        override fun onCues(cueGroup: CueGroup) {
            cues = cueGroup.cues
        }
    }

    private val analytics = object : AnalyticsListener {
        override fun onVideoDecoderInitialized(eventTime: AnalyticsListener.EventTime, decoderName: String, initializedTimestampMs: Long, initializationDurationMs: Long) {
            videoDecoder = decoderName
            Log.i(TAG, "décodeur vidéo $decoderName")
            player?.let { readTracks(it.currentTracks); listener?.onTracks() }
        }
        override fun onAudioDecoderInitialized(eventTime: AnalyticsListener.EventTime, decoderName: String, initializedTimestampMs: Long, initializationDurationMs: Long) {
            audioDecoder = decoderName
            Log.i(TAG, "décodeur audio $decoderName")
            player?.let { readTracks(it.currentTracks); listener?.onTracks() }
        }
    }

    // MARK: - PlaybackEngine

    override fun load(url: String, live: Boolean, startPosition: Double?, description: MediaDescription) {
        val p = player ?: build().also { player = it }
        hasFirstFrame = false
        phase = EnginePhase.LOADING
        cues = emptyList()
        audioTracks = emptyList(); textTracks = emptyList(); streamFacts = null
        videoDecoder = null; audioDecoder = null
        isLiveItem = live; joinedLiveEdge = false
        val metadata = MediaMetadata.Builder().setTitle(description.title).setArtist(description.subtitle)
            .setArtworkUri(description.artwork?.let(Uri::parse)).build()
        val item = MediaItem.Builder().setUri(url).setMediaMetadata(metadata).build()
        // `stop` closes the connection of what played before the new one opens: both go through the playback thread, in order.
        p.stop()
        p.clearMediaItems()
        if (startPosition != null && startPosition > 0) p.setMediaItem(item, (startPosition * 1000).toLong()) else p.setMediaItem(item)
        p.prepare()
        p.playWhenReady = true
        listener?.onPhase(EnginePhase.LOADING)
        handler.removeCallbacks(ticker)
        handler.postDelayed(ticker, TICK_MS)
        Log.i(TAG, "ouverture ${if (live) "direct" else "vod"} à ${startPosition ?: 0.0} s, FFmpeg ${if (FfmpegLibrary.isAvailable()) "disponible" else "absent"}")
    }

    override fun stop() {
        handler.removeCallbacks(ticker)
        // The session first: Media3 takes the service out of the foreground and removes the card on its release.
        session?.release(); session = null
        service?.stopSelf(); service = null
        player?.let {
            it.removeListener(playerListener)
            it.removeAnalyticsListener(analytics)
            it.release()
        }
        player = null
        cues = emptyList()
        hasFirstFrame = false
        phase = EnginePhase.IDLE
        audioTracks = emptyList(); textTracks = emptyList(); streamFacts = null
    }

    override fun play() { player?.play() }
    override fun pause() { player?.pause() }
    override fun seekTo(seconds: Double) { player?.seekTo((seconds * 1000).toLong().coerceAtLeast(0)) }

    override fun selectAudioTrack(id: String) {
        val p = player ?: return
        val (group, index) = find(p.currentTracks, id, C.TRACK_TYPE_AUDIO) ?: return
        p.trackSelectionParameters = p.trackSelectionParameters.buildUpon()
            .setOverrideForType(TrackSelectionOverride(group.mediaTrackGroup, index)).build()
    }

    override fun selectTextTrack(id: String?) {
        val p = player ?: return
        val builder = p.trackSelectionParameters.buildUpon().clearOverridesOfType(C.TRACK_TYPE_TEXT)
        if (id == null) {
            builder.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
        } else {
            val (group, index) = find(p.currentTracks, id, C.TRACK_TYPE_TEXT) ?: return
            builder.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false).setOverrideForType(TrackSelectionOverride(group.mediaTrackGroup, index))
        }
        p.trackSelectionParameters = builder.build()
    }

    // MARK: - Building

    private fun build(): ExoPlayer {
        val renderers = FfmpegRenderersFactory(context)
        val http = httpFactory()
        val audio = AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build()
        val p = ExoPlayer.Builder(context, renderers)
            .setMediaSourceFactory(DefaultMediaSourceFactory(context).setDataSourceFactory(http))
            .setTrackSelector(DefaultTrackSelector(context))
            .setAudioAttributes(audio, true)
            .setHandleAudioBecomingNoisy(true)
            .setSeekBackIncrementMs(10_000).setSeekForwardIncrementMs(10_000)
            .build()
        p.addListener(playerListener)
        p.addAnalyticsListener(analytics)
        // Debug builds: Media3's own log of tracks, decoders and the reasons a track is left out (tag EventLogger).
        if (isDebuggable) p.addAnalyticsListener(EventLogger())
        session = MediaSession.Builder(context, p).setId("kanstrimi-${System.currentTimeMillis()}").build()
        // The system's media card and the foreground state come from the service, which takes this session.
        PlaybackService.start(context)
        return p
    }

    /**
     * MediaCodec first, Jellyfin's FFmpeg audio renderer after it: the codec the device has plays in hardware, the
     * one it lacks (DTS, TrueHD) is decoded in software. Decoder fallback on, so a codec that fails to start hands
     * over to the next one.
     */
    internal class FfmpegRenderersFactory(context: Context) : DefaultRenderersFactory(context) {
        init {
            setExtensionRendererMode(EXTENSION_RENDERER_MODE_OFF)
            setEnableDecoderFallback(true)
            // The emulator's « goldfish » video decoders fail at the first buffer under a software GPU: left out, the
            // Android software decoders play; no real device has them.
            setMediaCodecSelector { mimeType, requiresSecureDecoder, requiresTunnelingDecoder ->
                MediaCodecSelector.DEFAULT.getDecoderInfos(mimeType, requiresSecureDecoder, requiresTunnelingDecoder).filterNot { it.name.contains("goldfish") }
            }
        }

        override fun buildAudioRenderers(
            context: Context, extensionRendererMode: Int, mediaCodecSelector: MediaCodecSelector, enableDecoderFallback: Boolean,
            audioSink: AudioSink, eventHandler: Handler, eventListener: AudioRendererEventListener, out: ArrayList<Renderer>,
        ) {
            super.buildAudioRenderers(context, extensionRendererMode, mediaCodecSelector, enableDecoderFallback, audioSink, eventHandler, eventListener, out)
            if (FfmpegLibrary.isAvailable()) out.add(FfmpegAudioRenderer(eventHandler, eventListener, audioSink)) else Log.w(TAG, "bibliothèque FFmpeg absente")
        }
    }

    private fun publishPhase() {
        val p = player ?: return
        val next = when (p.playbackState) {
            Player.STATE_IDLE -> if (p.playerError != null) EnginePhase.ERROR else EnginePhase.IDLE
            Player.STATE_BUFFERING -> if (hasFirstFrame) EnginePhase.BUFFERING else EnginePhase.LOADING
            Player.STATE_READY -> if (p.playWhenReady) EnginePhase.PLAYING else EnginePhase.PAUSED
            Player.STATE_ENDED -> EnginePhase.ENDED
            else -> EnginePhase.IDLE
        }
        if (next == phase) return
        phase = next
        listener?.onPhase(next)
    }

    // MARK: - Tracks

    private fun find(tracks: Tracks, id: String, type: Int): Pair<Tracks.Group, Int>? {
        tracks.groups.forEachIndexed { g, group ->
            if (group.type != type) return@forEachIndexed
            for (i in 0 until group.length) if ("$g:$i" == id) return group to i
        }
        return null
    }

    private fun readTracks(tracks: Tracks) {
        val audio = ArrayList<EngineTrack>()
        val text = ArrayList<EngineTrack>()
        var video: Format? = null
        var sound: Format? = null
        tracks.groups.forEachIndexed { g, group ->
            for (i in 0 until group.length) {
                val format = group.getTrackFormat(i)
                val selected = group.isTrackSelected(i)
                when (group.type) {
                    C.TRACK_TYPE_AUDIO -> {
                        if (group.isTrackSupported(i)) audio.add(EngineTrack("$g:$i", audioName(format, audio.size + 1), format.language, selected))
                        if (selected) sound = format
                    }
                    C.TRACK_TYPE_TEXT -> if (group.isTrackSupported(i)) text.add(EngineTrack("$g:$i", textName(format, text.size + 1), format.language, selected))
                    C.TRACK_TYPE_VIDEO -> if (selected) video = format
                }
            }
        }
        audioTracks = audio
        textTracks = text
        streamFacts = StreamFacts(
            videoCodec = video?.let { codecName(it.sampleMimeType) }, width = video?.width ?: 0, height = video?.height ?: 0,
            dynamicRange = video?.let(::rangeName), frameRate = video?.frameRate ?: 0f, videoDecoder = videoDecoder,
            audioCodec = sound?.let { codecName(it.sampleMimeType) }, channels = sound?.channelCount ?: 0, audioDecoder = audioDecoder,
            engine = "ExoPlayer",
        )
    }

    companion object {
        private const val TICK_MS = 500L

        /** The HTTP source of the player and of the Direct's preview: the same agent and timeouts. */
        internal fun httpFactory(): DefaultHttpDataSource.Factory = DefaultHttpDataSource.Factory()
            .setUserAgent("Kanstrimi/Android")
            .setConnectTimeoutMs(15_000).setReadTimeoutMs(15_000)
            .setAllowCrossProtocolRedirects(true)

        /** The track's own name, else its language in full, with the codec and channels: « Français (EAC3 5.1) ». */
        fun audioName(format: Format, index: Int): String {
            val base = format.label ?: languageName(format.language) ?: "Piste $index"
            val detail = listOfNotNull(codecName(format.sampleMimeType), channelsLabel(format.channelCount)).joinToString(" ")
            return if (detail.isEmpty()) base else "$base ($detail)"
        }

        fun textName(format: Format, index: Int): String {
            val base = format.label ?: languageName(format.language) ?: "Sous-titres $index"
            val forced = format.selectionFlags and C.SELECTION_FLAG_FORCED != 0
            return if (forced) "$base (forcés)" else base
        }

        fun languageName(code: String?): String? {
            if (code.isNullOrEmpty() || code == "und") return null
            // Transport streams tag their tracks with ISO 639-2 codes the locale data may not know: the common ones are mapped.
            val tag = ISO_639_2[code.lowercase()] ?: code
            val name = Locale.forLanguageTag(tag).getDisplayLanguage(Locale.FRENCH)
            return if (name.isEmpty() || name == tag) code.uppercase() else name.replaceFirstChar { it.titlecase(Locale.FRENCH) }
        }

        private val ISO_639_2 = mapOf(
            "fra" to "fr", "fre" to "fr", "eng" to "en", "deu" to "de", "ger" to "de", "spa" to "es", "ita" to "it", "por" to "pt",
            "ara" to "ar", "nld" to "nl", "dut" to "nl", "tur" to "tr", "rus" to "ru", "pol" to "pl", "jpn" to "ja", "kor" to "ko",
            "zho" to "zh", "chi" to "zh", "hin" to "hi", "ber" to "ber", "mul" to "mul", "qaa" to "qaa",
        )

        fun channelsLabel(channels: Int): String? = when {
            channels <= 0 -> null
            channels == 1 -> "mono"
            channels == 2 -> "stéréo"
            channels == 6 -> "5.1"
            channels == 8 -> "7.1"
            else -> "$channels.0"
        }

        /**
         * The codec of a picture ExoPlayer cannot show (« MPEG-2 »), or null: the stream has video, and no track of it
         * is supported by any renderer. Android tablets and phones have no MPEG-2 decoder (the system's software one
         * is reserved to the TV profile) and the FFmpeg build decodes sound only: mpv takes over.
         */
        fun unsupportedVideo(tracks: Tracks): String? {
            val video = tracks.groups.filter { it.type == C.TRACK_TYPE_VIDEO }
            // Beyond the decoder's declared capabilities still plays (the selector allows it); only the codec itself counts.
            if (video.isEmpty() || video.any { g -> (0 until g.length).any { g.isTrackSupported(it, true) } }) return null
            return codecName(video.first().getTrackFormat(0).sampleMimeType) ?: "inconnu"
        }

        /** « HEVC », « EAC3 », « DTS », « TrueHD »: the codec as the badges name it. */
        fun codecName(mime: String?): String? = when (mime) {
            null -> null
            MimeTypes.VIDEO_H265 -> "HEVC"
            MimeTypes.VIDEO_H264 -> "H.264"
            MimeTypes.VIDEO_MPEG2 -> "MPEG-2"
            MimeTypes.VIDEO_AV1 -> "AV1"
            MimeTypes.VIDEO_VP9 -> "VP9"
            MimeTypes.VIDEO_DOLBY_VISION -> "Dolby Vision"
            MimeTypes.AUDIO_E_AC3, MimeTypes.AUDIO_E_AC3_JOC -> "EAC3"
            MimeTypes.AUDIO_AC3 -> "AC3"
            MimeTypes.AUDIO_AC4 -> "AC4"
            MimeTypes.AUDIO_DTS -> "DTS"
            MimeTypes.AUDIO_DTS_HD -> "DTS-HD"
            MimeTypes.AUDIO_DTS_X -> "DTS:X"
            MimeTypes.AUDIO_TRUEHD -> "TrueHD"
            MimeTypes.AUDIO_AAC -> "AAC"
            MimeTypes.AUDIO_OPUS -> "Opus"
            MimeTypes.AUDIO_FLAC -> "FLAC"
            MimeTypes.AUDIO_MPEG -> "MP3"
            else -> mime.substringAfter('/').uppercase()
        }

        /** The dynamic range of a video format from its colour transfer; null for SDR. */
        fun rangeName(format: Format): String? {
            if (format.sampleMimeType == MimeTypes.VIDEO_DOLBY_VISION) return "Dolby Vision"
            return when (format.colorInfo?.colorTransfer) {
                C.COLOR_TRANSFER_ST2084 -> "HDR10"
                C.COLOR_TRANSFER_HLG -> "HLG"
                else -> null
            }
        }
    }
}
