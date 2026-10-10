package dev.crafters.kanstrimi.features.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import dev.crafters.kanstrimi.R
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.crafters.kanstrimi.BuildConfig
import dev.crafters.kanstrimi.app.LocalEnvironment
import dev.crafters.kanstrimi.contract.Language
import dev.crafters.kanstrimi.ui.theme.Theme
import kotlinx.coroutines.launch
import java.net.URI
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** Réglages: the device and its server, the demo client, unpairing, then À propos. */
@Composable
fun SettingsScreen() {
    val env = LocalEnvironment.current
    val context = LocalContext.current
    val info by env.info.collectAsState()
    val deviceName by env.preferences.deviceName.collectAsState()
    val serverUrl by env.preferences.serverUrl.collectAsState()
    val useMock by env.preferences.useMock.collectAsState()
    val code by env.device.code.collectAsState()
    var confirmUnpair by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val host = runCatching { URI(serverUrl).host }.getOrNull() ?: ""
    val name = deviceName.ifEmpty { "Tablette" }
    val appVersion = runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull() ?: BuildConfig.VERSION_NAME

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 32.dp, vertical = 28.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp),
    ) {
        Text("Réglages", fontSize = 32.sp, fontWeight = FontWeight.Bold)
        Column(modifier = Modifier.widthIn(max = 760.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
            Section(null) {
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(16.dp)) {
                    Box(modifier = Modifier.size(52.dp).background(Theme.accent, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
                        Icon(painterResource(R.drawable.ic_tablet), contentDescription = null, tint = Color.Black)
                    }
                    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(name, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                        Text("$host · ${info?.serverVersion ?: "—"}", color = Theme.secondary, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
            Section("Appareil") {
                InfoRow("Nom de cet appareil", name)
                InfoRow("Serveur", serverUrl)
                ToggleRow("Client de démonstration (données embarquées)", useMock) { env.preferences.setUseMock(it); scope.launch { env.loadInfo() } }
                TextButton(onClick = { confirmUnpair = true }, modifier = Modifier.padding(horizontal = 4.dp)) {
                    Text("Dissocier cet appareil", color = Theme.danger)
                }
            }
            // The player's choices, read by `PlayerService` through `PlaybackPreferences`.
            val autoPlayNext by env.preferences.autoPlayNextFlow.collectAsState()
            val rememberVersion by env.preferences.rememberVersionPerTitleFlow.collectAsState()
            val switchSource by env.preferences.switchSourceOnFailureFlow.collectAsState()
            val maxQuality by env.preferences.maxQualityFlow.collectAsState()
            Section("Lecture") {
                ToggleRow("Lire la suite automatiquement", autoPlayNext) { env.preferences.setAutoPlayNext(it) }
                ToggleRow("Retenir la version choisie pour chaque titre", rememberVersion) { env.preferences.setRememberVersionPerTitle(it) }
                ToggleRow("Changer de source en cas de panne", switchSource) { env.preferences.setSwitchSourceOnFailure(it) }
                Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("Qualité maximale")
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        dev.crafters.kanstrimi.contract.Quality.entries.forEach { q ->
                            val selected = q == maxQuality
                            TextButton(onClick = { env.preferences.setMaxQuality(q) }, colors = androidx.compose.material3.ButtonDefaults.textButtonColors(containerColor = if (selected) Theme.text else Theme.surfaceButton, contentColor = if (selected) Color.Black else Theme.text)) { Text(q.label) }
                        }
                    }
                }
            }
            Section("À propos") {
                InfoRow("Application", appVersion)
                InfoRow("Serveur", info?.let { "$host · ${it.serverVersion}" } ?: "—")
                InfoRow("Catalogue", info?.let { "${it.counts.movies} films · ${it.counts.series} séries · ${it.counts.channels} chaînes" } ?: "—")
                InfoRow("Dernier import", info?.lastImport?.let { DateTimeFormatter.ofPattern("d MMM à HH:mm").withZone(ZoneId.systemDefault()).format(it) } ?: "—")
                InfoRow("Langues du catalogue", info?.catalogLanguages?.joinToString(" · ") { Language.short(it) } ?: "—")
                InfoRow("Code de l'appareil", code ?: "—")
            }
        }
    }

    if (confirmUnpair) {
        AlertDialog(
            onDismissRequest = { confirmUnpair = false },
            title = { Text("Dissocier cet appareil ?") },
            text = { Text("Le jeton est révoqué sur le serveur et effacé de la tablette. Vos favoris et vos reprises restent côté serveur.") },
            confirmButton = { TextButton(onClick = { confirmUnpair = false; scope.launch { env.unpair() } }) { Text("Dissocier", color = Theme.danger) } },
            dismissButton = { TextButton(onClick = { confirmUnpair = false }) { Text("Annuler") } },
        )
    }
}

@Composable
private fun Section(title: String?, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        title?.let { Text(it.uppercase(), style = MaterialTheme.typography.labelMedium, color = Theme.secondary, modifier = Modifier.padding(horizontal = 16.dp)) }
        Column(modifier = Modifier.fillMaxWidth().background(Theme.surface, RoundedCornerShape(16.dp))) { content() }
    }
}

@Composable
private fun InfoRow(title: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(title)
        Text(value, color = Theme.secondary, modifier = Modifier.padding(start = 24.dp), textAlign = androidx.compose.ui.text.style.TextAlign.End)
    }
}

@Composable
private fun ToggleRow(title: String, on: Boolean, onChange: (Boolean) -> Unit) {
    Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Text(title, modifier = Modifier.weight(1f))
        Switch(checked = on, onCheckedChange = onChange, colors = SwitchDefaults.colors(checkedTrackColor = Theme.accent, checkedThumbColor = Color.White))
    }
}
