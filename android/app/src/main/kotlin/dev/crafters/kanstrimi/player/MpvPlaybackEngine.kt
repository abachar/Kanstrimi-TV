package dev.crafters.kanstrimi.player

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Surface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import dev.crafters.kanstrimi.contract.FileFacts
import dev.jdtech.mpv.MPVLib
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

private const val TAG = "kanstrimi.mpv"

/**
 * The second engine: libmpv (`dev.jdtech.mpv:libmpv`, the build Findroid uses), with its own FFmpeg, for the
 * pictures ExoPlayer cannot decode, MPEG-2 first of all (tablets have no MPEG-2 decoder, see `ExoPlaybackEngine`).
 * Hardware decoding through MediaCodec where the device has the codec, FFmpeg otherwise; the picture lands on the
 * `SurfaceView` of `MpvSurface`, subtitles drawn by mpv itself. One mpv instance for the app, created at the first
 * `load` and kept: `stop` closes the stream, so the provider sees one connection at a time. mpv calls back on its
 * own thread; everything is posted to the main one, and a `generation` drops what belongs to a stream already left.
 */
class MpvPlaybackEngine(context: Context) : PlaybackEngine {
    private val context = context.applicationContext
    private val handler = Handler(Looper.getMainLooper())
    override var listener: PlaybackEngine.Listener? = null

    private var mpv: MPVLib? = null
    private var generation = 0
    private var surface: Surface? = null
    /** A `loadfile` asked before the surface exists: mpv opened without a surface drops the video for good. */
    private var pendingLoad: (() -> Unit)? = null
    private var isLiveItem = false
    private var stopping = false
    private var position = 0.0
    private var length = 0.0
    private var cacheSeconds = 0.0
    private var paused = false
    private var pausedForCache = false
    private var fileLoaded = false

    override var phase: EnginePhase = EnginePhase.IDLE
        private set
    override var hasFirstFrame: Boolean = false
        private set
    override val isBuffering: Boolean get() = pausedForCache
    override var audioTracks: List<EngineTrack> = emptyList()
        private set
    override var textTracks: List<EngineTrack> = emptyList()
        private set
    override val fileFacts: FileFacts? get() = if (isLiveItem || length <= 0) null else FileFacts(length, emptyList())
    override var streamFacts: StreamFacts? = null
        private set
    /** The picture's size once known, for Picture-in-Picture. */
    var videoWidth: Int by mutableStateOf(0)
        private set
    var videoHeight: Int by mutableStateOf(0)
        private set

    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private var focus: AudioFocusRequest? = null

    private val ticker = object : Runnable {
        override fun run() {
            if (mpv == null || phase == EnginePhase.IDLE) return
            listener?.onTime(position, if (isLiveItem) 0.0 else length, bufferedPercent())
            handler.postDelayed(this, TICK_MS)
        }
    }

    // MARK: - PlaybackEngine

    override fun load(url: String, live: Boolean, startPosition: Double?, description: MediaDescription) {
        val m = mpv ?: build().also { mpv = it }
        generation += 1
        stopping = false
        isLiveItem = live
        hasFirstFrame = false
        fileLoaded = false
        position = startPosition ?: 0.0; length = 0.0; cacheSeconds = 0.0
        paused = false; pausedForCache = false
        audioTracks = emptyList(); textTracks = emptyList(); streamFacts = null
        videoWidth = 0; videoHeight = 0
        phase = EnginePhase.LOADING
        requestFocus()
        val options = if (!live && startPosition != null && startPosition > 0) "start=${startPosition}" else ""
        val open = {
            m.setPropertyBoolean("pause", false)
            m.command(arrayOf("loadfile", url, "replace", "-1", options))
        }
        if (surface != null) open() else { pendingLoad = open; Log.i(TAG, "surface attendue avant l'ouverture") }
        listener?.onPhase(EnginePhase.LOADING)
        handler.removeCallbacks(ticker)
        handler.postDelayed(ticker, TICK_MS)
        Log.i(TAG, "ouverture ${if (live) "direct" else "vod"} par mpv à ${startPosition ?: 0.0} s")
    }

    override fun stop() {
        handler.removeCallbacks(ticker)
        stopping = true
        generation += 1
        pendingLoad = null
        mpv?.command(arrayOf("stop"))
        abandonFocus()
        phase = EnginePhase.IDLE
        hasFirstFrame = false
        audioTracks = emptyList(); textTracks = emptyList(); streamFacts = null
    }

    override fun play() { mpv?.setPropertyBoolean("pause", false) }
    override fun pause() { mpv?.setPropertyBoolean("pause", true) }
    override fun seekTo(seconds: Double) { mpv?.command(arrayOf("seek", seconds.coerceAtLeast(0.0).toString(), "absolute")) }

    override fun selectAudioTrack(id: String) {
        val (property, value) = trackSelection(id) ?: return
        mpv?.setPropertyString(property, value)
    }

    override fun selectTextTrack(id: String?) {
        if (id == null) { mpv?.setPropertyString("sid", "no"); return }
        val (property, value) = trackSelection(id) ?: return
        mpv?.setPropertyString(property, value)
    }

    // MARK: - Surface

    /** The `SurfaceView` is up: mpv draws on it from now on. */
    fun attach(surface: Surface, width: Int, height: Int) {
        this.surface = surface
        val m = mpv ?: build().also { mpv = it }
        m.attachSurface(surface)
        m.setPropertyString("android-surface-size", "${width}x$height")
        m.setPropertyString("force-window", "yes")
        m.setPropertyString("vo", VIDEO_OUTPUT)
        pendingLoad?.let { pendingLoad = null; it() }
    }

    fun surfaceSize(width: Int, height: Int) {
        mpv?.setPropertyString("android-surface-size", "${width}x$height")
    }

    /** The `SurfaceView` goes: mpv must stop drawing before the surface dies, or it crashes with it. */
    fun detach() {
        if (surface == null) return
        surface = null
        val m = mpv ?: return
        m.setPropertyString("vo", "null")
        m.setPropertyString("force-window", "no")
        m.detachSurface()
    }

    // MARK: - Building

    private fun build(): MPVLib {
        val m = MPVLib.create(context) ?: throw IllegalStateException("libmpv ne démarre pas")
        // Rendering through libplacebo on the Android surface, decoding by MediaCodec when the codec is there (mpv
        // falls back to FFmpeg by itself, which is the whole point for MPEG-2).
        m.setOptionString("config", "no")
        m.setOptionString("vo", VIDEO_OUTPUT)
        m.setOptionString("gpu-context", "android")
        m.setOptionString("opengl-es", "yes")
        m.setOptionString("hwdec", "mediacodec")
        m.setOptionString("hwdec-codecs", "h264,hevc,vp8,vp9,av1")
        m.setOptionString("ao", "audiotrack")
        m.setOptionString("profile", "fast")
        m.setOptionString("idle", "yes")
        m.setOptionString("force-window", "no")
        m.setOptionString("keep-open", "no")
        m.setOptionString("ytdl", "no")
        m.setOptionString("save-position-on-quit", "no")
        m.setOptionString("tls-verify", "no")
        m.setOptionString("user-agent", "Kanstrimi/Android")
        m.setOptionString("network-timeout", "15")
        m.setOptionString("cache", "yes")
        m.setOptionString("cache-pause-initial", "yes")
        m.setOptionString("demuxer-max-bytes", "64MiB")
        m.setOptionString("demuxer-max-back-bytes", "32MiB")
        m.setOptionString("sub-scale-with-window", "yes")
        m.setOptionString("sub-use-margins", "no")
        m.init()
        m.observeProperty("time-pos", MPVLib.MpvFormat.MPV_FORMAT_DOUBLE)
        m.observeProperty("duration", MPVLib.MpvFormat.MPV_FORMAT_DOUBLE)
        m.observeProperty("demuxer-cache-duration", MPVLib.MpvFormat.MPV_FORMAT_DOUBLE)
        m.observeProperty("pause", MPVLib.MpvFormat.MPV_FORMAT_FLAG)
        m.observeProperty("paused-for-cache", MPVLib.MpvFormat.MPV_FORMAT_FLAG)
        m.observeProperty("eof-reached", MPVLib.MpvFormat.MPV_FORMAT_FLAG)
        m.observeProperty("track-list", MPVLib.MpvFormat.MPV_FORMAT_STRING)
        m.addObserver(observer)
        m.addLogObserver(logObserver)
        return m
    }

    /** mpv's thread → the main one, for the stream still current. */
    private fun onMain(block: () -> Unit) {
        val g = generation
        handler.post { if (g == generation) block() }
    }

    private val observer = object : MPVLib.EventObserver {
        override fun eventProperty(property: String) {}
        override fun eventProperty(property: String, value: Long) {}
        override fun eventProperty(property: String, value: Double) = onMain {
            when (property) {
                "time-pos" -> position = value
                "duration" -> length = value
                "demuxer-cache-duration" -> cacheSeconds = value
            }
        }
        override fun eventProperty(property: String, value: Boolean) = onMain {
            when (property) {
                "pause" -> { paused = value; publishPhase() }
                "paused-for-cache" -> { pausedForCache = value; publishPhase() }
                "eof-reached" -> if (value && !isLiveItem) { phase = EnginePhase.ENDED; listener?.onPhase(EnginePhase.ENDED) }
            }
        }
        override fun eventProperty(property: String, value: String) = onMain {
            if (property == "track-list") { readTracks(value); listener?.onTracks() }
        }
        override fun event(eventId: Int) = onMain {
            when (eventId) {
                MPVLib.MpvEvent.MPV_EVENT_FILE_LOADED -> { fileLoaded = true; readFacts() }
                MPVLib.MpvEvent.MPV_EVENT_PLAYBACK_RESTART -> {
                    readFacts()
                    if (!hasFirstFrame) {
                        val vid = mpv?.getPropertyString("vid")
                        if (videoWidth == 0 && mpv?.getPropertyString("video-format") == null && vid != null && vid != "no") {
                            // A picture mpv reads but cannot decode either: sound alone, the dialog rather than black.
                            val codec = mpv?.getPropertyString("video-codec")?.substringBefore(' ') ?: "inconnu"
                            Log.w(TAG, "image non décodable par mpv : $codec")
                            phase = EnginePhase.ERROR
                            listener?.onUnsupported(codec)
                            return@onMain
                        }
                        hasFirstFrame = true
                        listener?.onFirstFrame()
                    }
                    publishPhase()
                }
                MPVLib.MpvEvent.MPV_EVENT_END_FILE -> {
                    // `stop` and a replacement end the file too: only an end nobody asked for is a failure.
                    if (stopping || phase == EnginePhase.ENDED || phase == EnginePhase.IDLE) return@onMain
                    Log.w(TAG, "fin de flux inattendue")
                    phase = EnginePhase.ERROR
                    listener?.onError("mpv · flux interrompu")
                }
            }
        }
    }

    private val isDebuggable = context.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE != 0

    /** mpv's warnings in logcat; its whole chatter (decoders, video output) in debug builds. */
    private val logObserver = object : MPVLib.LogObserver {
        override fun logMessage(prefix: String, level: Int, text: String) {
            if (level <= MPVLib.MpvLogLevel.MPV_LOG_LEVEL_WARN) Log.w(TAG, "$prefix ${text.trimEnd()}")
            else if (isDebuggable && level <= MPVLib.MpvLogLevel.MPV_LOG_LEVEL_INFO) Log.i(TAG, "$prefix ${text.trimEnd()}")
        }
    }

    private fun publishPhase() {
        if (phase == EnginePhase.IDLE || phase == EnginePhase.ERROR || phase == EnginePhase.ENDED) return
        val next = when {
            !hasFirstFrame -> EnginePhase.LOADING
            pausedForCache -> EnginePhase.BUFFERING
            paused -> EnginePhase.PAUSED
            else -> EnginePhase.PLAYING
        }
        if (next == phase) return
        phase = next
        listener?.onPhase(next)
    }

    private fun bufferedPercent(): Int {
        if (isLiveItem) return (cacheSeconds / LIVE_CACHE_FULL_S * 100).toInt().coerceIn(0, 100)
        if (length <= 0) return 0
        return ((position + cacheSeconds) / length * 100).toInt().coerceIn(0, 100)
    }

    private fun readTracks(json: String) {
        val tracks = runCatching { Json.parseToJsonElement(json).jsonArray }.getOrElse { JsonArray(emptyList()) }
        val parsed = parseTracks(tracks)
        audioTracks = parsed.audio
        textTracks = parsed.text
    }

    /** What mpv knows of the picture and the sound once a file plays, for the Infos panel. */
    private fun readFacts() {
        val m = mpv ?: return
        val w = m.getPropertyInt("video-params/w") ?: 0
        val h = m.getPropertyInt("video-params/h") ?: 0
        if (w > 0 && h > 0) { videoWidth = w; videoHeight = h }
        val hwdec = m.getPropertyString("hwdec-current")
        val videoFormat = m.getPropertyString("video-format")
        val audioFormat = m.getPropertyString("audio-codec-name")
        Log.i(TAG, "image ${videoFormat ?: "aucune"} ${w}x$h décodée par ${hwdec ?: "?"} · son ${audioFormat ?: "aucun"}")
        streamFacts = StreamFacts(
            videoCodec = videoFormat?.let(::codecLabel),
            width = w, height = h,
            dynamicRange = when (m.getPropertyString("video-params/gamma")) { "pq" -> "HDR10"; "hlg" -> "HLG"; else -> null },
            frameRate = (m.getPropertyDouble("container-fps") ?: 0.0).toFloat(),
            videoDecoder = videoFormat?.let { if (hwdec != null && hwdec != "no") "mediacodec" else "ffmpeg-$it" },
            audioCodec = audioFormat?.let(::codecLabel),
            channels = m.getPropertyInt("audio-params/channel-count") ?: 0,
            audioDecoder = audioFormat?.let { "ffmpeg-$it" },
            engine = "mpv",
        )
    }

    private fun requestFocus() {
        if (focus != null) return
        val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MOVIE).build()
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(attributes)
            .setOnAudioFocusChangeListener { change ->
                // A call, another app: the film waits; a channel is left when the engine stops (the player's rule).
                if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) pause()
            }
            .build()
        focus = request
        audioManager.requestAudioFocus(request)
    }

    private fun abandonFocus() {
        focus?.let { audioManager.abandonAudioFocusRequest(it) }
        focus = null
    }

    companion object {
        private const val TICK_MS = 500L
        /** Ten seconds of cache ahead on a channel count as a full buffer. */
        private const val LIVE_CACHE_FULL_S = 10.0
        private const val VIDEO_OUTPUT = "gpu-next"

        data class ParsedTracks(val audio: List<EngineTrack>, val text: List<EngineTrack>)

        /**
         * mpv's `track-list`: `[{ "id": 1, "type": "audio", "lang": "fra", "title": …, "codec": "mp2", "selected": true,
         * "demux-channel-count": 2 }, …]`. Ids become `aid:1` / `sid:2`, the properties mpv selects a track with.
         */
        fun parseTracks(tracks: JsonArray): ParsedTracks {
            val audio = ArrayList<EngineTrack>()
            val text = ArrayList<EngineTrack>()
            for (element in tracks) {
                val t = element as? JsonObject ?: continue
                val id = t["id"]?.jsonPrimitive?.intOrNull ?: continue
                val lang = t["lang"]?.jsonPrimitive?.contentOrNull
                val selected = t["selected"]?.jsonPrimitive?.booleanOrNull ?: false
                val title = t["title"]?.jsonPrimitive?.contentOrNull
                val codec = t["codec"]?.jsonPrimitive?.contentOrNull?.let(::codecLabel)
                when (t["type"]?.jsonPrimitive?.contentOrNull) {
                    "audio" -> {
                        val channels = t["demux-channel-count"]?.jsonPrimitive?.intOrNull ?: 0
                        val base = title ?: ExoPlaybackEngine.languageName(lang) ?: "Piste ${audio.size + 1}"
                        val detail = listOfNotNull(codec, ExoPlaybackEngine.channelsLabel(channels)).joinToString(" ")
                        audio.add(EngineTrack("aid:$id", if (detail.isEmpty()) base else "$base ($detail)", lang, selected))
                    }
                    "sub" -> {
                        val base = title ?: ExoPlaybackEngine.languageName(lang) ?: "Sous-titres ${text.size + 1}"
                        text.add(EngineTrack("sid:$id", base, lang, selected))
                    }
                }
            }
            return ParsedTracks(audio, text)
        }

        /** `aid:3` → `aid` = `3`; null for a key that is not mpv's. */
        fun trackSelection(id: String): Pair<String, String>? {
            val (property, value) = id.split(':', limit = 2).takeIf { it.size == 2 } ?: return null
            if (property != "aid" && property != "sid") return null
            return property to value
        }

        /** mpv's codec names as the badges show them: `mpeg2video` → « MPEG-2 », `h264` → « H.264 », `mp2` → « MP2 ». */
        fun codecLabel(name: String): String = when (name.lowercase()) {
            "mpeg2video" -> "MPEG-2"
            "h264" -> "H.264"
            "hevc" -> "HEVC"
            "av1" -> "AV1"
            "vp9" -> "VP9"
            "mpeg4" -> "MPEG-4"
            "ac3" -> "AC3"
            "eac3" -> "EAC3"
            "dts" -> "DTS"
            "truehd" -> "TrueHD"
            "aac" -> "AAC"
            "mp2" -> "MP2"
            "mp3" -> "MP3"
            "opus" -> "Opus"
            "flac" -> "FLAC"
            else -> name.uppercase()
        }
    }
}
