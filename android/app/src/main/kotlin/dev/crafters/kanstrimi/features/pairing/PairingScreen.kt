package dev.crafters.kanstrimi.features.pairing

import android.content.Intent
import androidx.core.net.toUri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import dev.crafters.kanstrimi.R
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import dev.crafters.kanstrimi.app.AppEnvironment
import dev.crafters.kanstrimi.app.LocalEnvironment
import dev.crafters.kanstrimi.contract.PairingCode
import dev.crafters.kanstrimi.contract.PairingStatus
import dev.crafters.kanstrimi.ui.Wordmark
import dev.crafters.kanstrimi.ui.theme.Theme
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.net.URI
import java.time.Instant

/**
 * First launch: nothing is typed on the device. A code, the button that opens the admin on this tablet, and
 * polling until the admin approves; the code renews itself when it expires.
 */
@Composable
fun PairingScreen() {
    val env = LocalEnvironment.current
    val context = LocalContext.current
    val model: PairingModel = viewModel()
    val revocation by env.device.lastRevocationMessage.collectAsState()
    val host = runCatching { URI(env.preferences.serverUrl.value).host }.getOrNull() ?: "votre-serveur"

    LaunchedEffect(Unit) { model.run(env) }
    DisposableEffect(Unit) { onDispose { model.stop() } }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 48.dp, vertical = 40.dp),
        verticalArrangement = Arrangement.spacedBy(28.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Wordmark(size = 26, tracking = 4f)
            Text("Ajoutez cette tablette", fontSize = 36.sp, fontWeight = FontWeight.Bold)
            Text("La validation se fait dans l'admin, sur cette tablette : rien à saisir ici.", color = Theme.secondary)
        }
        revocation?.let { message ->
            Column(modifier = Modifier.widthIn(max = 640.dp).background(Theme.surface, RoundedCornerShape(18.dp)).padding(22.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Warning, contentDescription = null, tint = Theme.accent)
                    Text("Cet appareil a été dissocié", fontWeight = FontWeight.Bold, color = Theme.accent)
                }
                Text(message, color = Theme.secondary, style = MaterialTheme.typography.bodyMedium)
            }
        }
        Column(
            modifier = Modifier.widthIn(max = 640.dp).fillMaxWidth().background(Theme.surfacePanel, RoundedCornerShape(24.dp)).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Text("CODE DE L'APPAREIL", fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.5.sp, color = Theme.secondary)
            CodeCells(code = model.code?.code, expired = model.status == PairingModel.Status.EXPIRED)
            val url = model.code?.url
            if (url != null && model.status != PairingModel.Status.EXPIRED) {
                Button(
                    onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, url.toUri())) },
                    colors = ButtonDefaults.buttonColors(containerColor = Theme.text, contentColor = Color.Black),
                ) {
                    Icon(painterResource(R.drawable.ic_open_in_browser), contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Ouvrir l'admin pour valider", fontWeight = FontWeight.SemiBold)
                }
            }
            StatusLine(model.status)
            OutlinedButton(onClick = { model.stop(); model.viewModelScope.launch { model.newCode(env) } }, enabled = !model.isBusy) {
                Icon(Icons.Filled.Refresh, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Nouveau code")
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Step(1, "Ouvrez l'admin avec le bouton ci-dessus")
            Step(2, "Connectez-vous et nommez cet appareil")
            Step(3, "L'appareil est ajouté tout seul")
        }
        Text("Sans le bouton : ouvrez $host/admin/pair/… en remplaçant les points par le code.", color = Theme.secondary, style = MaterialTheme.typography.bodySmall)
        if (!env.client.isMock) Text("Serveur : $host", color = Theme.secondary, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun CodeCells(code: String?, expired: Boolean) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        (code ?: "······").forEach { ch ->
            Box(
                modifier = Modifier.size(width = 52.dp, height = 66.dp).background(if (expired) Theme.surfaceDim else Theme.surfaceButton, RoundedCornerShape(14.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Text(ch.toString(), fontSize = 36.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.SansSerif, color = if (expired) Theme.secondary else Theme.text)
            }
        }
    }
}

@Composable
private fun StatusLine(status: PairingModel.Status) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically, modifier = Modifier.height(40.dp)) {
        when (status) {
            PairingModel.Status.CREATING -> { Spinner(); Text("Demande d'un code au serveur…", color = Theme.secondary) }
            PairingModel.Status.WAITING -> { Spinner(); Text("En attente de la confirmation dans l'admin", color = Theme.secondary) }
            PairingModel.Status.EXPIRED -> { Icon(Icons.Filled.Refresh, contentDescription = null, tint = Theme.secondary); Text("Expiré · renouvellement…", color = Theme.secondary) }
            PairingModel.Status.APPROVED -> { Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = Theme.success); Text("Appareil ajouté", color = Theme.secondary) }
            PairingModel.Status.OFFLINE -> { Icon(Icons.Filled.Warning, contentDescription = null, tint = Theme.accent); Text("Serveur injoignable · nouvel essai dans quelques secondes", color = Theme.secondary) }
        }
    }
}

@Composable
private fun Spinner() {
    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = Theme.secondary)
}

@Composable
private fun Step(n: Int, text: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(modifier = Modifier.size(30.dp).background(Theme.surfaceButton, CircleShape), contentAlignment = Alignment.Center) {
            Text(n.toString(), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium)
        }
        Text(text)
    }
}

class PairingModel : ViewModel() {
    enum class Status { CREATING, WAITING, EXPIRED, APPROVED, OFFLINE }

    var status by mutableStateOf(Status.CREATING)
        private set
    var code by mutableStateOf<PairingCode?>(null)
        private set
    var isBusy by mutableStateOf(false)
        private set
    private var loop: Job? = null

    suspend fun run(env: AppEnvironment) { newCode(env) }

    fun stop() { loop?.cancel(); loop = null }

    /** The automatic retries call this from inside the loop: it never cancels it. The buttons `stop()` first. */
    suspend fun newCode(env: AppEnvironment) {
        isBusy = true
        status = Status.CREATING
        try {
            val created = env.client.createDevice()
            code = created
            status = Status.WAITING
            loop = viewModelScope.launch { poll(env, created) }
        } catch (e: Exception) {
            status = Status.OFFLINE
            loop = viewModelScope.launch {
                delay(5000)
                if (isActive) newCode(env)
            }
        } finally {
            isBusy = false
        }
    }

    private suspend fun poll(env: AppEnvironment, created: PairingCode) {
        while (currentCoroutineIsActive()) {
            delay(2000)
            if (Instant.now() >= created.expiresAt) { expireAndRenew(env); return }
            try {
                when (val s = env.client.pollDevice(created.code)) {
                    is PairingStatus.Pending -> if (status == Status.OFFLINE) status = Status.WAITING
                    is PairingStatus.Expired -> { expireAndRenew(env); return }
                    is PairingStatus.Approved -> {
                        status = Status.APPROVED
                        env.preferences.setDeviceName(s.deviceName)
                        delay(600)
                        env.device.store(token = created.token, code = created.code)
                        return
                    }
                }
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                status = Status.OFFLINE
            }
        }
    }

    private suspend fun currentCoroutineIsActive(): Boolean = kotlinx.coroutines.currentCoroutineContext().isActive

    /** Expired: a new code is generated alone, no intervention. */
    private suspend fun expireAndRenew(env: AppEnvironment) {
        status = Status.EXPIRED
        delay(3000)
        newCode(env)
    }
}
