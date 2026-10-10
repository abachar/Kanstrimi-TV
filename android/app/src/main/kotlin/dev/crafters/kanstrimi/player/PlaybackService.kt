package dev.crafters.kanstrimi.player

import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import dev.crafters.kanstrimi.app.KanstrimiApplication

/**
 * The system's media card: Media3's service draws the notification, the lock screen and the quick settings
 * controls from the engine's session, and keeps the process in the foreground while something plays. The player
 * itself stays in `ExoPlaybackEngine`: the service only lends it the session. Started with the first playback,
 * stopped with the engine.
 *
 * Started as a plain service: Media3 itself promotes it to the foreground when the session it was handed starts
 * playing, and demotes it when the session is released. Starting it in the foreground ourselves would be a
 * promise the system holds us to, with the process killed thirty seconds later if nothing played by then.
 */
class PlaybackService : MediaSessionService() {
    private val engine: ExoPlaybackEngine? get() = (application as? KanstrimiApplication)?.environment?.playerEngine as? ExoPlaybackEngine

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = engine?.session

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // The engine's session, handed to Media3 so that its notification manager watches the player.
        engine?.session?.let { if (it !in sessions) addSession(it) }
        super.onStartCommand(intent, flags, startId)
        return START_NOT_STICKY
    }

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
        private const val TAG = "kanstrimi.player"

        /** Starts the service, or logs when the system refuses (the app behind another, no playback in sight). */
        fun start(context: Context) {
            try {
                context.startService(Intent(context, PlaybackService::class.java))
            } catch (e: IllegalStateException) {
                Log.w(TAG, "service de session refusé: ${e.message}")
            }
        }
    }
}
