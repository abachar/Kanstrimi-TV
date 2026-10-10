package dev.crafters.kanstrimi.player

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.crafters.kanstrimi.R
import dev.crafters.kanstrimi.app.AppEnvironment
import dev.crafters.kanstrimi.contract.Language
import dev.crafters.kanstrimi.ui.theme.Theme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * The touch controls, laid out like the Apple app's (`PlayerControls+iOS`). At the top: close, Picture-in-Picture.
 * In the middle (films, episodes): −10 s, play/pause, +10 s. At the bottom: the title, the progress, then on the
 * left the buttons that open a panel above them (Épisodes · Similaires · Distribution · Infos) and on the right
 * the Versions, Audio and Sous-titres menus. A panel open hides the title and the progress.
 */
@Composable
fun PlayerControls(
    player: PlayerService,
    env: AppEnvironment,
    scrubTime: Double?,
    panel: BarPanel?,
    onPanel: (BarPanel?) -> Unit,
    onExit: () -> Unit,
    onPictureInPicture: (() -> Unit)?,
    /** Any touch in the controls: they stay up a while longer. */
    onActivity: () -> Unit,
) {
    Box(modifier = Modifier.fillMaxSize()) {
        val stops = if (panel != null) arrayOf(0f to Color.Black.copy(alpha = 0.5f), 0.3f to Color.Black.copy(alpha = 0.35f), 0.55f to Color.Black.copy(alpha = 0.88f), 1f to Color.Black.copy(alpha = 0.88f))
        else arrayOf(0f to Color.Black.copy(alpha = 0.55f), 0.25f to Color.Transparent, 0.5f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.8f))
        Box(modifier = Modifier.fillMaxSize().background(Brush.verticalGradient(*stops)))
        if (!player.isLive && panel == null) Transport(player, onActivity, modifier = Modifier.align(Alignment.Center))
        Column(modifier = Modifier.fillMaxSize().padding(horizontal = 32.dp, vertical = 24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                RoundIcon(androidx.compose.ui.graphics.vector.rememberVectorPainter(Icons.Filled.Close), "Fermer") { onExit() }
                if (onPictureInPicture != null) RoundIcon(painterResource(R.drawable.ic_pip), "Image dans l'image") { onPictureInPicture(); onActivity() }
            }
            Spacer(modifier = Modifier.weight(1f))
            if (panel != null) {
                Buttons(player, panel, onPanel, onActivity)
                PanelContent(panel, player, env, onPick = { onPanel(null) })
            } else {
                PlayerHeader(player)
                Progress(player, scrubTime, onActivity)
                Buttons(player, null, onPanel, onActivity)
            }
        }
    }
}

/** The episode and the title, or the title alone. */
@Composable
private fun PlayerHeader(player: PlayerService) {
    val c = player.context?.content ?: return
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        val ep = c.episode
        val sub = c.subtitle
        if (ep != null && sub != null) Text("$sub · ${ep.shortCode}", style = MaterialTheme.typography.titleMedium, color = Theme.secondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(c.title, fontSize = 26.sp, fontWeight = FontWeight.Bold, color = Theme.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** ±10 s on a tap; held, fast forward or rewind until released; play/pause in the middle, where the loading badge stands otherwise. */
@Composable
private fun Transport(player: PlayerService, onActivity: () -> Unit, modifier: Modifier = Modifier) {
    Row(modifier = modifier, horizontalArrangement = Arrangement.spacedBy(64.dp), verticalAlignment = Alignment.CenterVertically) {
        SkipControl(player, forward = false, onActivity)
        Box(modifier = Modifier.size(76.dp), contentAlignment = Alignment.Center) {
            if (player.phase != PlayerService.Phase.OPENING && !player.isBuffering) {
                val playing = player.phase == PlayerService.Phase.PLAYING
                Box(
                    modifier = Modifier.size(76.dp).background(Theme.surfaceRaised, CircleShape)
                        .clickable(role = Role.Button) { player.togglePlayPause(); onActivity() },
                    contentAlignment = Alignment.Center,
                ) {
                    if (playing) Icon(painterResource(R.drawable.ic_pause), contentDescription = "Pause", tint = Color.White, modifier = Modifier.size(40.dp))
                    else Icon(Icons.Filled.PlayArrow, contentDescription = "Lecture", tint = Color.White, modifier = Modifier.size(44.dp))
                }
            }
        }
        SkipControl(player, forward = true, onActivity)
    }
}

@Composable
private fun SkipControl(player: PlayerService, forward: Boolean, onActivity: () -> Unit) {
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    Box(
        modifier = Modifier.size(54.dp).background(Theme.surfaceButton, CircleShape).pointerInput(forward) {
            detectTapGestures(
                onTap = { player.seekBy(if (forward) 10.0 else -10.0); onActivity() },
                onPress = {
                    // Held 400 ms: the sweep starts and goes on until the finger lifts.
                    val hold = scope.launch { delay(400); player.startScan(forward) }
                    tryAwaitRelease()
                    hold.cancel()
                    player.stopScan()
                },
            )
        },
        contentAlignment = Alignment.Center,
    ) {
        Icon(painterResource(if (forward) R.drawable.ic_forward_10 else R.drawable.ic_replay_10), contentDescription = if (forward) "Avancer de 10 secondes" else "Reculer de 10 secondes", tint = Color.White, modifier = Modifier.size(28.dp))
    }
}

/** The bar with its cursor: a tap or a drag seeks; then what has been played, what remains and when it ends. */
@Composable
private fun Progress(player: PlayerService, scrubTime: Double?, onActivity: () -> Unit) {
    var dragFraction by remember { mutableStateOf<Float?>(null) }
    val density = LocalDensity.current
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(
            modifier = Modifier.fillMaxWidth().height(22.dp)
                .pointerInput(player.duration) {
                    detectTapGestures { offset ->
                        if (player.duration > 0) { player.seekTo((offset.x / size.width).coerceIn(0f, 1f) * player.duration); onActivity() }
                    }
                }
                .pointerInput(player.duration) {
                    detectHorizontalDragGestures(
                        onDragStart = { offset -> dragFraction = (offset.x / size.width).coerceIn(0f, 1f); onActivity() },
                        onHorizontalDrag = { change, _ -> dragFraction = (change.position.x / size.width).coerceIn(0f, 1f); onActivity() },
                        onDragEnd = { dragFraction?.let { if (player.duration > 0) player.seekTo(it * player.duration) }; dragFraction = null },
                        onDragCancel = { dragFraction = null },
                    )
                },
            contentAlignment = Alignment.CenterStart,
        ) {
            val fraction = dragFraction ?: if (player.duration > 0) ((scrubTime ?: player.shownTime) / player.duration).toFloat().coerceIn(0f, 1f) else 0f
            Box(modifier = Modifier.fillMaxWidth().height(5.dp).background(Theme.track, RoundedCornerShape(50)))
            Box(modifier = Modifier.fillMaxWidth(fraction).height(5.dp).background(Color.White, RoundedCornerShape(50)))
            androidx.compose.foundation.layout.BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
                val x = with(density) { (maxWidth.toPx() * fraction - 7.dp.toPx()).coerceAtLeast(0f).toDp() }
                Box(modifier = Modifier.offset(x = x).size(14.dp).background(Color.White, CircleShape))
            }
        }
        val shown = dragFraction?.let { it * player.duration } ?: scrubTime ?: player.shownTime
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(player.scanLabel + PlayerFormat.clock(shown), style = MaterialTheme.typography.bodyMedium, color = Theme.text)
            Text(PlayerFormat.remainingLine((player.duration - shown).coerceAtLeast(0.0)), style = MaterialTheme.typography.bodyMedium, color = Theme.secondary)
        }
    }
}

/** Panels on the left, menus on the right. */
@Composable
private fun Buttons(player: PlayerService, panel: BarPanel?, onPanel: (BarPanel?) -> Unit, onActivity: () -> Unit) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(modifier = Modifier.weight(1f).horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            player.panels.forEach { p ->
                val selected = p == panel
                Text(
                    p.title, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold,
                    color = if (selected) Color.Black else Theme.text, maxLines = 1,
                    modifier = Modifier.background(if (selected) Color.White else Theme.surfaceRaised, RoundedCornerShape(50))
                        .clickable(role = Role.Button) { onPanel(if (selected) null else p); onActivity() }
                        .padding(horizontal = 16.dp, vertical = 9.dp),
                )
            }
        }
        if (player.offersVersions) VersionsMenu(player, onActivity)
        if (player.offersAudio) TracksMenu(player, audio = true, onActivity)
        if (player.offersSubtitles) TracksMenu(player, audio = false, onActivity)
    }
}

/** The Versions menu: by language, the one playing checked. */
@Composable
private fun VersionsMenu(player: PlayerService, onActivity: () -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        RoundIcon(painterResource(R.drawable.ic_layers), "Versions") { open = true; onActivity() }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            val versions = VersionChooser.ordered(player.context?.versions.orEmpty())
            versions.map { it.language }.distinct().forEach { language ->
                Text(Language.label(language), style = MaterialTheme.typography.labelMedium, color = Theme.secondary, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
                versions.filter { it.language == language }.forEach { v ->
                    val current = v.id == player.version?.id
                    DropdownMenuItem(
                        text = { Text(listOfNotNull(v.qualityLabel, v.edition).joinToString(" · ")) },
                        leadingIcon = { if (current) Icon(Icons.Filled.Check, contentDescription = null) else Spacer(modifier = Modifier.width(24.dp)) },
                        onClick = { open = false; player.switchVersion(v); onActivity() },
                    )
                }
            }
        }
    }
}

/** The Audio menu (the stream's tracks, the one playing checked) or the Sous-titres menu (off, then the tracks). */
@Composable
private fun TracksMenu(player: PlayerService, audio: Boolean, onActivity: () -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        RoundIcon(painterResource(if (audio) R.drawable.ic_audiotrack else R.drawable.ic_subtitles), if (audio) "Audio" else "Sous-titres") { open = true; onActivity() }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            val tracks = if (audio) player.audioTracks else player.textTracks
            if (!audio) {
                val none = tracks.none { it.isSelected }
                DropdownMenuItem(
                    text = { Text("Désactivés") },
                    leadingIcon = { if (none) Icon(Icons.Filled.Check, contentDescription = null) else Spacer(modifier = Modifier.width(24.dp)) },
                    onClick = { open = false; player.selectText(null); onActivity() },
                )
            }
            tracks.forEach { t ->
                DropdownMenuItem(
                    text = { Text(t.name) },
                    leadingIcon = { if (t.isSelected) Icon(Icons.Filled.Check, contentDescription = null) else Spacer(modifier = Modifier.width(24.dp)) },
                    onClick = { open = false; if (audio) player.selectAudio(t) else player.selectText(t); onActivity() },
                )
            }
        }
    }
}
