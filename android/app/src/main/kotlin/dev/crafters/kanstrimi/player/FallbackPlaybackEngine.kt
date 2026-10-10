package dev.crafters.kanstrimi.player

import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import dev.crafters.kanstrimi.contract.FileFacts

private const val TAG = "kanstrimi.player"

/**
 * The engine the player talks to: ExoPlayer first, mpv when ExoPlayer cannot decode the picture (MPEG-2 on a
 * tablet). The switch is silent: the same stream is opened again on mpv, the player only sees a loading phase go
 * on. `usesMpv` tells the screen which surface to show. Without a second engine (the tests), the codec is reported
 * as unsupported straight away.
 */
class FallbackPlaybackEngine<E : PlaybackEngine, M : PlaybackEngine>(val exo: E, val mpv: M?) : PlaybackEngine {
    /** mpv plays the current stream. */
    var usesMpv: Boolean by mutableStateOf(false)
        private set
    private val active: PlaybackEngine get() = if (usesMpv) mpv ?: exo else exo

    override var listener: PlaybackEngine.Listener? = null

    private var current: Load? = null
    private data class Load(val url: String, val live: Boolean, val startPosition: Double?, val description: MediaDescription)

    init {
        exo.listener = Relay(isMpv = false)
        mpv?.listener = Relay(isMpv = true)
    }

    /** Forwards the active engine's events; ExoPlayer's « unsupported » becomes the switch to mpv. */
    private inner class Relay(private val isMpv: Boolean) : PlaybackEngine.Listener {
        private val mine: Boolean get() = isMpv == usesMpv
        override fun onPhase(phase: EnginePhase) { if (mine) listener?.onPhase(phase) }
        override fun onTime(position: Double, duration: Double, bufferedPercent: Int) { if (mine) listener?.onTime(position, duration, bufferedPercent) }
        override fun onFirstFrame() { if (mine) listener?.onFirstFrame() }
        override fun onTracks() { if (mine) listener?.onTracks() }
        override fun onError(message: String) { if (mine) listener?.onError(message) }
        override fun onUnsupported(codec: String) {
            if (!mine) return
            val load = current
            val second = mpv
            if (isMpv || second == null || load == null) { listener?.onUnsupported(codec); return }
            Log.i(TAG, "image en $codec hors de portée d'ExoPlayer : mpv prend le relais")
            exo.stop()
            usesMpv = true
            second.load(load.url, load.live, load.startPosition, load.description)
        }
    }

    override fun load(url: String, live: Boolean, startPosition: Double?, description: MediaDescription) {
        current = Load(url, live, startPosition, description)
        if (usesMpv) { mpv?.stop(); usesMpv = false }
        exo.load(url, live, startPosition, description)
    }

    override fun stop() {
        current = null
        exo.stop()
        mpv?.stop()
        usesMpv = false
    }

    override fun play() = active.play()
    override fun pause() = active.pause()
    override fun seekTo(seconds: Double) = active.seekTo(seconds)
    override fun selectAudioTrack(id: String) = active.selectAudioTrack(id)
    override fun selectTextTrack(id: String?) = active.selectTextTrack(id)

    override val phase: EnginePhase get() = active.phase
    override val hasFirstFrame: Boolean get() = active.hasFirstFrame
    override val isBuffering: Boolean get() = active.isBuffering
    override val audioTracks: List<EngineTrack> get() = active.audioTracks
    override val textTracks: List<EngineTrack> get() = active.textTracks
    override val fileFacts: FileFacts? get() = active.fileFacts
    override val streamFacts: StreamFacts? get() = active.streamFacts
}
