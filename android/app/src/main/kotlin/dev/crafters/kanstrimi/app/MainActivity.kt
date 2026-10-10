package dev.crafters.kanstrimi.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.CompositionLocalProvider
import dev.crafters.kanstrimi.BuildConfig
import dev.crafters.kanstrimi.ui.RootView
import dev.crafters.kanstrimi.ui.theme.KanstrimiTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val env = (application as KanstrimiApplication).environment
        debugHooks(env)
        setContent {
            CompositionLocalProvider(LocalEnvironment provides env) {
                KanstrimiTheme { RootView(initialTab = intent.getStringExtra("debug.tab")) }
            }
        }
    }

    /**
     * Debug only, from the launch intent, so the app can be driven without a finger (`scripts/shot.sh`):
     *   debug.mock      — the demo client on (true) or off
     *   debug.autopair  — with the demo client, pairs at once
     *   debug.unpair    — forgets the token, back to the pairing screen
     *   debug.tab       — home | live | movies | series | search | settings
     */
    private fun debugHooks(env: AppEnvironment) {
        if (!BuildConfig.DEBUG) return
        if (intent.hasExtra("debug.mock")) env.preferences.setUseMock(intent.getBooleanExtra("debug.mock", false))
        if (intent.getBooleanExtra("debug.unpair", false)) env.device.forget(null)
        if (intent.getBooleanExtra("debug.autopair", false) && env.client.isMock && !env.device.isPaired) {
            env.device.store(token = "mock-debug", code = "DEBUG0")
            env.preferences.setDeviceName("Tablette")
        }
    }
}
