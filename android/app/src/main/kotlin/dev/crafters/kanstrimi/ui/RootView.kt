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
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.crafters.kanstrimi.app.LocalEnvironment
import dev.crafters.kanstrimi.features.pairing.PairingScreen
import dev.crafters.kanstrimi.features.profiles.ProfilesScreen
import dev.crafters.kanstrimi.player.PlayerScreen
import dev.crafters.kanstrimi.ui.theme.Theme

/**
 * Pairing gate, then « Qui regarde ? » while this device is on no profile the server knows, then the tabs (built
 * again for each profile); the notice floats above everything.
 */
@Composable
fun RootView() {
    val env = LocalEnvironment.current
    val token by env.device.token.collectAsState()
    val notice by env.notice.collectAsState()
    val profiles by env.profiles.collectAsState()
    val loaded by env.profilesLoaded.collectAsState()
    val profileId by env.device.profileId.collectAsState()
    val revision by env.profileRevision.collectAsState()

    LaunchedEffect(token) {
        env.loadProfiles()
        env.loadInfo()
    }
    val needsChoice = token != null && loaded && profiles.none { it.id == profileId }

    Surface(modifier = Modifier.fillMaxSize(), color = Theme.background) {
        Box(modifier = Modifier.fillMaxSize()) {
            when {
                token == null -> PairingScreen()
                needsChoice -> ProfilesScreen(gate = true)
                else -> key(revision) { MainTabs() }
            }
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
