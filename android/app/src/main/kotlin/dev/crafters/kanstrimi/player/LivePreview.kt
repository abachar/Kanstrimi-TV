package dev.crafters.kanstrimi.player

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.annotation.OptIn
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory

private const val TAG = "kanstrimi.player"

/**
 * The side preview of the Direct screen, like the Apple app's `LivePreview`: a second ExoPlayer of its own, built
 * at the first `show`, muted until its first picture then heard. The account allows one connection, so whoever
 * starts a playback calls `stop()` first; the Direct screen stops it as soon as it is covered or left. A channel
 * shown again within the 400 ms debounce costs nothing. Its state is Compose state for the screen.
 */
@OptIn(UnstableApi::class)
class LivePreview(context: Context) {
    private val context = context.applicationContext
    private val handler = Handler(Looper.getMainLooper())

    /** The player while a channel is shown, for the surface. */
    var player: ExoPlayer? by mutableStateOf(null)
        private set
    var channelId: String? by mutableStateOf(null)
        private set
    var hasImage: Boolean by mutableStateOf(false)
        private set
    /** The stream failed: the placeholder says so, nothing retried. */
    var failed: Boolean by mutableStateOf(false)
        private set

    private var pendingUrl: String? = null
    private val debounce = Runnable { pendingUrl?.let { start(it) } }

    private val listener = object : Player.Listener {
        override fun onRenderedFirstFrame() {
            // The sound comes with the picture, not while the stream is still connecting.
            hasImage = channelId != null
            player?.volume = 1f
        }
        override fun onPlayerError(error: PlaybackException) {
            Log.w(TAG, "aperçu en échec ${error.errorCodeName}: ${error.message}")
            failed = true
            hasImage = false
            release()
        }
    }

    /** Shows `id` from `url` after the debounce; the same channel again only takes a fresher link while it waits. */
    fun show(id: String, url: String) {
        if (id == channelId) {
            if (pendingUrl != null) pendingUrl = url
            return
        }
        stop()
        channelId = id
        pendingUrl = url
        handler.postDelayed(debounce, DEBOUNCE_MS)
    }

    /** Synchronous: nothing of the preview is still connecting or playing when it returns. */
    fun stop() {
        handler.removeCallbacks(debounce)
        pendingUrl = null
        release()
        channelId = null
        hasImage = false
        failed = false
    }

    private fun start(url: String) {
        pendingUrl = null
        hasImage = false
        failed = false
        val p = player ?: build().also { player = it }
        p.volume = 0f
        p.stop()
        p.clearMediaItems()
        p.setMediaItem(MediaItem.fromUri(url))
        p.prepare()
        p.playWhenReady = true
        Log.i(TAG, "aperçu de $channelId")
    }

    private fun release() {
        player?.let {
            it.removeListener(listener)
            it.release()
        }
        player = null
    }

    private fun build(): ExoPlayer {
        val audio = AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build()
        val p = ExoPlayer.Builder(context, ExoPlaybackEngine.FfmpegRenderersFactory(context))
            .setMediaSourceFactory(DefaultMediaSourceFactory(context).setDataSourceFactory(ExoPlaybackEngine.httpFactory()))
            // No audio focus: the preview is a window on the channel, not the playback.
            .setAudioAttributes(audio, false)
            .build()
        p.addListener(listener)
        return p
    }

    companion object {
        const val DEBOUNCE_MS = 400L
    }
}
