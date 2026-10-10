package dev.crafters.kanstrimi.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.CompositionLocalProvider
import dev.crafters.kanstrimi.BuildConfig
import dev.crafters.kanstrimi.player.PlayerDebug
import dev.crafters.kanstrimi.ui.RootView
import dev.crafters.kanstrimi.ui.theme.KanstrimiTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val env = (application as KanstrimiApplication).environment
        debugHooks(env)
        setContent {
            CompositionLocalProvider(LocalEnvironment provides env) {
                KanstrimiTheme { RootView() }
            }
        }
    }

    /**
     * Debug only, from the launch intent, so the app can be driven without a finger (`scripts/shot.sh`):
     *   debug.mock        — the demo client on (true) or off
     *   debug.autopair    — with the demo client, pairs at once
     *   debug.unpair      — forgets the token, back to the pairing screen
     *   debug.tab         — home | live | movies | series | search | settings
     *   debug.open        — a title's id (`tmdb:movie:603`) or a saga's: its sheet is pushed above the tab
     *   debug.search      — the query the search screen starts with (with `debug.tab search`)
     *   debug.play        — a content id the player opens (a movie, a series, an episode of the demo)
     *   debug.playerState — vodPaused | opening | failure | nextEpisode | nextTitle | panel | skipIntro: with
     *                       debug.play, stages the player in that state instead of streaming (no stream in the demo)
     *   debug.playUrl     — a public test file (an MP4 or MKV of Big Buck Bunny…) played by the engine on the
     *                       emulator; never a provider URL
     */
    private fun debugHooks(env: AppEnvironment) {
        if (!BuildConfig.DEBUG) return
        if (intent.hasExtra("debug.mock")) env.preferences.setUseMock(intent.getBooleanExtra("debug.mock", false))
        if (intent.getBooleanExtra("debug.unpair", false)) env.device.forget(null)
        if (intent.getBooleanExtra("debug.autopair", false) && env.client.isMock && !env.device.isPaired) {
            env.device.store(token = "mock-debug", code = "DEBUG0")
            env.preferences.setDeviceName("Tablette")
        }
        intent.getStringExtra("debug.tab")?.let { env.navigator.select(it) }
        intent.getStringExtra("debug.open")?.let { env.open(it) }
        intent.getStringExtra("debug.search")?.let { env.debugSearch = it }
        intent.getStringExtra("debug.play")?.let { id ->
            val state = intent.getStringExtra("debug.playerState")
            env.scope.launch { delay(800); PlayerDebug.play(env.player, env.client, id, state) }
        }
        intent.getStringExtra("debug.playUrl")?.let { url -> env.scope.launch { delay(800); PlayerDebug.playUrl(env.player, url) } }
    }
}
