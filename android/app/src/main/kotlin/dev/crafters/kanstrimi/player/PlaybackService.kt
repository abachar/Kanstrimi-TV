package dev.crafters.kanstrimi.player

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import dev.crafters.kanstrimi.app.KanstrimiApplication

/**
 * The system's media card: Media3's service draws the notification, the lock screen and the quick settings
 * controls from the engine's session, and keeps the process in the foreground while something plays. The player
 * itself stays in `ExoPlaybackEngine`: the service only lends it the session. Started with the first playback,
 * stopped with the engine.
 */
class PlaybackService : MediaSessionService() {
    private val engine: ExoPlaybackEngine? get() = (application as? KanstrimiApplication)?.environment?.playerEngine as? ExoPlaybackEngine

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = engine?.session

    override fun onTaskRemoved(rootIntent: Intent?) {
        // The app swiped away: nothing plays on, the service goes with it.
        engine?.stop()
        stopSelf()
    }

    override fun onDestroy() {
        engine?.service = null
        super.onDestroy()
    }

    override fun onCreate() {
        super.onCreate()
        engine?.service = this
    }

    companion object {
        fun start(context: Context) {
            ContextCompat.startForegroundService(context, Intent(context, PlaybackService::class.java))
        }
    }
}
