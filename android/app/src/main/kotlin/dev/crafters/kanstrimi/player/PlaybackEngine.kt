package dev.crafters.kanstrimi.player

import dev.crafters.kanstrimi.contract.FileFacts

/** The engine's own phase, as `PlayerService` hears it. */
enum class EnginePhase { IDLE, LOADING, BUFFERING, PLAYING, PAUSED, ENDED, ERROR }

/** An audio or subtitle track of the stream; `id` is the engine's own key. */
data class EngineTrack(val id: String, val name: String, val language: String?, val isSelected: Boolean)

/** What the engine read in the stream, for the Infos panel: the picture, the sound, and who decodes them. */
data class StreamFacts(
    val videoCodec: String? = null,
    val width: Int = 0,
    val height: Int = 0,
    /** « HDR10 », « HLG », « Dolby Vision »; null for SDR. */
    val dynamicRange: String? = null,
    val frameRate: Float = 0f,
    val videoDecoder: String? = null,
    val audioCodec: String? = null,
    val channels: Int = 0,
    val audioDecoder: String? = null,
)

/** What the player shows about the title in the system's media controls. */
data class MediaDescription(val title: String, val subtitle: String? = null, val artwork: String? = null)

/**
 * All `PlayerService` asks of the engine and all it hears from it: `ExoPlaybackEngine` in the app, a fake in the
 * tests, which play the failures, the restarts and the ends that a real stream cannot be made to play on demand.
 * Every call and callback happens on the main thread.
 */
interface PlaybackEngine {
    interface Listener {
        fun onPhase(phase: EnginePhase)
        /** Every half second while something is loaded: the clock, the length once known, the buffer filled (0…100). */
        fun onTime(position: Double, duration: Double, bufferedPercent: Int)
        /** The first picture of the file opened is on screen. */
        fun onFirstFrame()
        fun onTracks()
        fun onError(message: String)
    }

    var listener: Listener?

    /** Opens `url` in place of what plays, from `startPosition` seconds (null: the start). */
    fun load(url: String, live: Boolean, startPosition: Double?, description: MediaDescription)
    /** Closes the stream and releases the decoders: the one connection to the provider is freed. */
    fun stop()
    fun play()
    fun pause()
    fun seekTo(seconds: Double)
    fun selectAudioTrack(id: String)
    /** null: subtitles off. */
    fun selectTextTrack(id: String?)

    val phase: EnginePhase
    val hasFirstFrame: Boolean
    val isBuffering: Boolean
    val audioTracks: List<EngineTrack>
    val textTracks: List<EngineTrack>
    /** What was read in the file opened: its length (Media3 reads no Matroska chapters: none sent); null until the length is known. */
    val fileFacts: FileFacts?
    val streamFacts: StreamFacts?
}
