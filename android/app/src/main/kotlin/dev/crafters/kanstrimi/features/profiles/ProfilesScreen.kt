package dev.crafters.kanstrimi.features.profiles

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.SubcomposeAsyncImage
import dev.crafters.kanstrimi.app.LocalEnvironment
import dev.crafters.kanstrimi.contract.Profile
import dev.crafters.kanstrimi.ui.theme.Theme

/** The server's own rule for a profile without a picture: hues spread around the wheel by id. */
fun avatarColor(id: Int): Color = Color.hsv(((id * 137) % 360).toFloat(), 0.45f, 0.5f)

/** A profile's picture in a circle: the server's image, its initial on its colour meanwhile or without one. */
@Composable
fun Avatar(profile: Profile, size: Dp, modifier: Modifier = Modifier) {
    Box(modifier = modifier.size(size).clip(CircleShape).background(avatarColor(profile.id)), contentAlignment = Alignment.Center) {
        SubcomposeAsyncImage(
            model = profile.avatar, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(size),
            loading = { Initial(profile, size) }, error = { Initial(profile, size) },
        )
    }
}

@Composable
private fun Initial(profile: Profile, size: Dp) {
    Box(modifier = Modifier.size(size), contentAlignment = Alignment.Center) {
        Text(profile.initial, color = Color.White.copy(alpha = 0.9f), fontSize = (size.value * 0.42f).sp)
    }
}

/**
 * « Qui regarde ? », like YouTube's: the gate once paired while this device is on no profile the server knows, and the
 * Profil tab, the same picture with the current one ringed in amber. Large circles without a platter, the name under
 * each; a press shrinks the circle. Choosing one switches at once.
 */
@Composable
fun ProfilesScreen(gate: Boolean = false) {
    val env = LocalEnvironment.current
    val profiles by env.profiles.collectAsState()
    val current by env.device.profileId.collectAsState()
    val resume by env.resumeRevision.collectAsState()
    // Asked again at each opening and after a long absence: a profile created in the admin meanwhile appears.
    LaunchedEffect(resume) { env.loadProfiles() }
    Column(
        modifier = Modifier.fillMaxSize().background(Theme.background).padding(horizontal = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
    ) {
        Text("Qui regarde ?", style = MaterialTheme.typography.headlineLarge, color = Theme.text)
        Spacer(Modifier.height(48.dp))
        Row(modifier = Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(40.dp)) {
            profiles.forEach { p -> ProfileCell(p, isCurrent = !gate && p.id == current) { env.select(p) } }
        }
    }
}

@Composable
private fun ProfileCell(profile: Profile, isCurrent: Boolean, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.94f else 1f, label = "press")
    val size = 150.dp
    Column(
        modifier = Modifier.width(size + 24.dp).clickable(interactionSource = interaction, indication = null, onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier.scale(scale).size(size + 12.dp)
                .border(4.dp, if (isCurrent) Theme.accent else Color.Transparent, CircleShape).padding(6.dp),
            contentAlignment = Alignment.Center,
        ) { Avatar(profile, size) }
        Spacer(Modifier.height(14.dp))
        Text(profile.name, style = MaterialTheme.typography.bodyMedium, color = if (isCurrent) Theme.text else Theme.secondary,
            maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}
