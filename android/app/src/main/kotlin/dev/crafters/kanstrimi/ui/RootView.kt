package dev.crafters.kanstrimi.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.crafters.kanstrimi.app.LocalEnvironment
import dev.crafters.kanstrimi.features.pairing.PairingScreen
import dev.crafters.kanstrimi.player.PlayerScreen
import dev.crafters.kanstrimi.ui.theme.Theme

/** Pairing gate, then the tabs; the notice floats above everything. */
@Composable
fun RootView(initialTab: String? = null) {
    val env = LocalEnvironment.current
    val token by env.device.token.collectAsState()
    val notice by env.notice.collectAsState()

    LaunchedEffect(token) { env.loadInfo() }

    Surface(modifier = Modifier.fillMaxSize(), color = Theme.background) {
        Box(modifier = Modifier.fillMaxSize()) {
            if (token != null) MainTabs(initialTab = initialTab) else PairingScreen()
            // The player, full screen over the tabs while something plays; it draws the notice itself.
            if (env.player.isPresented) PlayerScreen()
            AnimatedVisibility(visible = notice != null && !env.player.isPresented, enter = fadeIn(), exit = fadeOut(), modifier = Modifier.align(Alignment.BottomCenter)) {
                Text(
                    text = notice ?: "",
                    style = MaterialTheme.typography.bodyLarge,
                    modifier = Modifier.padding(bottom = 96.dp).background(Theme.surfaceRaised, MaterialTheme.shapes.large).padding(horizontal = 24.dp, vertical = 14.dp),
                )
            }
        }
    }
}
