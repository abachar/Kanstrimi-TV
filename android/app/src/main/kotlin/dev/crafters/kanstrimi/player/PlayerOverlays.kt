package dev.crafters.kanstrimi.player

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.crafters.kanstrimi.R
import dev.crafters.kanstrimi.ui.UpNextCard
import dev.crafters.kanstrimi.ui.theme.Theme

// The player's overlays: the loading badge, the toast, « Passer … », the failure dialog, « À suivre ».

/** A round translucent button of the chrome. */
@Composable
fun RoundIcon(painter: Painter, label: String, size: Int = 40, onClick: () -> Unit) {
    Box(
        modifier = Modifier.size(size.dp).background(Theme.surfaceRaised, CircleShape).clickable(onClick = onClick, role = Role.Button),
        contentAlignment = Alignment.Center,
    ) {
        Icon(painter, contentDescription = label, tint = Color.White, modifier = Modifier.size((size * 0.5f).dp))
    }
}

/** In the middle of the video, where the play button stands otherwise: opening, then buffering with its percentage. */
@Composable
fun LoadingBadge(player: PlayerService) {
    val loading = player.phase == PlayerService.Phase.OPENING || player.isBuffering
    if (!loading) return
    val caption = if (player.phase == PlayerService.Phase.OPENING) "Ouverture du flux…" else "Chargement · ${player.bufferingProgress} %"
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            CircularProgressIndicator(color = Color.White, modifier = Modifier.size(44.dp))
            Text(caption, color = Color.White, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

/** A message at the bottom: the automatic source switch, or the app's notice while the player is up. */
@Composable
fun ToastView(text: String, detail: String? = null, warning: Boolean = false) {
    Box(modifier = Modifier.fillMaxSize().padding(bottom = 140.dp), contentAlignment = Alignment.BottomCenter) {
        Row(
            modifier = Modifier.background(Color(0xE61C1D23), RoundedCornerShape(22.dp)).padding(horizontal = 26.dp, vertical = 18.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(if (warning) Icons.Filled.Warning else Icons.Filled.Refresh, contentDescription = null, tint = Theme.accent)
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(text, fontWeight = FontWeight.SemiBold, color = Theme.text)
                detail?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = Theme.secondary) }
            }
        }
    }
}

/** « Passer le récap », « Passer l'intro », at the bottom right while one plays; its name comes from the server. */
@Composable
fun SkipButton(label: String, barShown: Boolean, onClick: () -> Unit) {
    Box(modifier = Modifier.fillMaxSize().padding(horizontal = 32.dp).padding(bottom = if (barShown) 150.dp else 32.dp), contentAlignment = Alignment.BottomEnd) {
        Button(onClick = onClick, colors = ButtonDefaults.buttonColors(containerColor = Theme.text, contentColor = Color.Black)) {
            Icon(painterResource(R.drawable.ic_skip_next), contentDescription = null)
            Text(label, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 6.dp))
        }
    }
}

/**
 * After 10 s without an image and the automatic attempts: Réessayer, another version, Quitter. When the picture's
 * codec has no decoder here (`Failure.reason`), the reason replaces the count and Réessayer: only another version
 * can help.
 */
@Composable
fun StreamFailureDialog(player: PlayerService) {
    val reason = player.failure?.reason
    Box(modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.75f)), contentAlignment = Alignment.Center) {
        Column(
            modifier = Modifier.widthIn(max = 560.dp).background(Color(0xF21C1D23), RoundedCornerShape(28.dp)).padding(32.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Text(player.context?.content?.title ?: "", style = MaterialTheme.typography.titleMedium, color = Theme.secondary)
            Text(if (reason != null) "Image non prise en charge" else "Le flux ne démarre pas", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = Theme.text)
            player.failure?.let { f ->
                Text(reason ?: "La vidéo n'a pas démarré après ${f.attempts} tentative${if (f.attempts > 1) "s" else ""}.", color = Theme.secondary)
            }
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (reason == null) Button(onClick = { player.retryFromServer() }, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = Theme.text, contentColor = Color.Black)) {
                    Icon(Icons.Filled.Refresh, contentDescription = null)
                    Text("Réessayer", fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 6.dp))
                }
                val others = player.alternativeVersions
                if (others.isNotEmpty()) {
                    Text("ou essayer une autre version", style = MaterialTheme.typography.bodyMedium, color = Theme.secondary)
                    Row(modifier = Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        others.forEach { v ->
                            OutlinedButton(onClick = { player.playInstead(v) }, colors = ButtonDefaults.outlinedButtonColors(contentColor = Theme.text)) { Text(v.label) }
                        }
                    }
                }
                TextButton(onClick = { player.stop() }, modifier = Modifier.fillMaxWidth()) { Text("Quitter", color = Theme.text) }
            }
            if (reason == null) Text("Réessayer suffit souvent : la source change d'une tentative à l'autre.", style = MaterialTheme.typography.bodySmall, color = Theme.secondary)
        }
    }
}

/** « À suivre » at the top right, clear of the controls at the bottom, with its countdown and the language warning. */
@Composable
fun NextEpisodeCard(player: PlayerService) {
    val up = player.upNext ?: return
    val warning = (up as? PlayerService.UpNext.EpisodeNext)?.let { e ->
        val current = player.version?.language ?: return@let null
        val alternative = e.next.languages.firstOrNull() ?: return@let null
        if (e.next.languages.contains(current)) null else VersionChooser.languageWarning(e.next.number, alternative, current)
    }
    Box(modifier = Modifier.fillMaxSize().padding(horizontal = 24.dp).padding(top = 72.dp), contentAlignment = Alignment.TopEnd) {
        UpNextCard(
            heading = "${up.heading} · ${player.nextCountdown ?: 0} s", item = up.item, warning = warning,
            onPlay = { player.playUpNextNow() }, onCancel = { player.cancelNext() },
            modifier = Modifier.width(400.dp),
        )
    }
}

/**
 * A stand-in for a video picture in the staged states: bright and dark areas, hard edges and fine detail, so
 * every overlay shows what it lets through.
 */
@Composable
fun PreviewFrame(modifier: Modifier = Modifier) {
    Canvas(modifier = modifier.fillMaxSize()) {
        val w = size.width
        val h = size.height
        drawRect(Brush.verticalGradient(listOf(Color(0xFFFA9E40), Color(0xFFD9405A), Color(0xFF331F66))))
        drawCircle(Color(0xFFFFEE99), radius = h * 0.16f, center = androidx.compose.ui.geometry.Offset(w * 0.68f, h * 0.4f))
        drawOval(Color(0xFF1F1A38), topLeft = androidx.compose.ui.geometry.Offset(w * -0.2f, h * 0.7f), size = androidx.compose.ui.geometry.Size(w * 0.9f, h * 0.5f))
        drawOval(Color(0xFF0F2E33), topLeft = androidx.compose.ui.geometry.Offset(w * 0.25f, h * 0.8f), size = androidx.compose.ui.geometry.Size(w * 1.1f, h * 0.45f))
        for (i in 0 until 12) {
            drawRect(Color.White.copy(alpha = 0.85f), topLeft = androidx.compose.ui.geometry.Offset(w * (0.12f + i * 0.032f), h * 0.19f), size = androidx.compose.ui.geometry.Size(w * 0.012f, h * 0.22f))
        }
    }
}
