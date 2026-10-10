package dev.crafters.kanstrimi.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import dev.crafters.kanstrimi.client.CatalogException
import dev.crafters.kanstrimi.ui.theme.Theme
import java.text.NumberFormat
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** A screen not built yet. */
@Composable
fun ComingSoon(title: String) {
    StatePanel(title = title, message = "Cet écran arrive dans un prochain lot.")
}

/** Generic empty / error state with one action. */
@Composable
fun StatePanel(title: String, message: String, actionTitle: String? = null, action: (() -> Unit)? = null) {
    Column(
        modifier = Modifier.fillMaxSize().padding(40.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        Text(message, color = Theme.secondary, textAlign = TextAlign.Center, modifier = Modifier.widthIn(max = 560.dp))
        if (actionTitle != null && action != null) {
            Button(onClick = action, colors = ButtonDefaults.buttonColors(containerColor = Theme.surfaceButton, contentColor = Theme.text)) { Text(actionTitle) }
        }
    }
}

/** A spinner in the middle of the screen while the first answer is awaited. */
@Composable
fun LoadingPanel() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Theme.text) }
}

/**
 * A screen built from one answer: the spinner, then `content`, or the error with « Réessayer ». `load` runs once per
 * `key`, and again on a retry.
 */
@Composable
fun <T : Any> LoadedScreen(errorTitle: String, key: Any = Unit, load: suspend () -> T, content: @Composable (T) -> Unit) {
    var value by remember(key) { mutableStateOf<T?>(null) }
    var error by remember(key) { mutableStateOf<String?>(null) }
    var attempt by remember(key) { mutableIntStateOf(0) }
    LaunchedEffect(key, attempt) {
        try {
            value = load()
            error = null
        } catch (e: CatalogException) {
            error = e.message
        }
    }
    val v = value
    when {
        v != null -> content(v)
        error != null -> StatePanel(errorTitle, error ?: "", actionTitle = "Réessayer") { attempt++ }
        else -> LoadingPanel()
    }
}

/** Poster or backdrop art: the image when there is one, a deterministic gradient with the title otherwise. */
@Composable
fun ArtImage(id: String, url: String?, modifier: Modifier = Modifier, title: String? = null, titleSize: Int = 16) {
    val (a, b) = Theme.art(id)
    Box(modifier = modifier.background(Brush.linearGradient(listOf(a, b))), contentAlignment = Alignment.Center) {
        if (title != null) {
            Text(
                title, color = Color.White.copy(alpha = 0.85f), fontWeight = FontWeight.Black, fontSize = titleSize.sp, lineHeight = (titleSize * 1.15f).sp,
                textAlign = TextAlign.Center, maxLines = 5, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(10.dp),
            )
        }
        if (url != null) {
            AsyncImage(model = url, contentDescription = title, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        }
    }
}

/** The lower part of a backdrop melting into the page: transparent at the top, the background at the bottom. */
@Composable
fun BackdropFade(modifier: Modifier = Modifier) {
    Box(modifier = modifier.fillMaxSize().background(Brush.verticalGradient(0f to Color.Transparent, 0.6f to Theme.background.copy(alpha = 0.85f), 1f to Theme.background)))
}

/** Small bordered badge: « 4K », « DOLBY VISION », « FR ». */
@Composable
fun Badge(text: String, filled: Boolean = false, small: Boolean = false) {
    val size = if (small) 11.sp else 13.sp
    Text(
        text = text.uppercase(),
        fontSize = size,
        fontWeight = FontWeight.Bold,
        color = if (filled) Theme.background else Theme.text,
        letterSpacing = 0.5.sp,
        modifier = Modifier
            .background(if (filled) Theme.text else Color.Transparent, RoundedCornerShape(5.dp))
            .border(1.5.dp, Theme.text.copy(alpha = 0.6f), RoundedCornerShape(5.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

/** The amber tag on a capsule: a hint, a warning, « RECOMMANDÉ ». */
@Composable
fun AccentTag(text: String) {
    Text(
        text, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color.Black, letterSpacing = 0.5.sp,
        modifier = Modifier.background(Theme.accent, RoundedCornerShape(50)).padding(horizontal = 7.dp, vertical = 2.dp),
    )
}

/** « DIRECT » on red, over a channel's poster; « EN DIRECT » beside a channel's name. */
@Composable
fun LiveTag(text: String = "DIRECT", size: Int = 11) {
    Text(
        text, fontSize = size.sp, fontWeight = FontWeight.Bold, color = Color.White, letterSpacing = 1.sp,
        modifier = Modifier.background(Theme.live, RoundedCornerShape(5.dp)).padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

/** « EN COURS » over a programme or a channel. */
@Composable
fun OnAirLabel() {
    Text("EN COURS", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Theme.accent, letterSpacing = 1.sp)
}

/**
 * A channel's logo (iptv-org's, served by our server, else the provider's) on a light tile: most logos are drawn for
 * a light background. Initials on the channel's colour meanwhile, when it fails, or without one.
 */
@Composable
fun ChannelLogo(id: String, name: String, logo: String?, size: Dp) {
    var loaded by remember(logo) { mutableStateOf(false) }
    var failed by remember(logo) { mutableStateOf(logo == null) }
    val (a, b) = Theme.art(id)
    val shape = RoundedCornerShape(size * 0.22f)
    Box(
        modifier = Modifier.size(size).clip(shape).then(if (loaded) Modifier.background(Theme.logoTile, shape) else Modifier.background(Brush.linearGradient(listOf(a, b)), shape)),
        contentAlignment = Alignment.Center,
    ) {
        if (!loaded) Text(initials(name), fontSize = (size.value * 0.36f).sp, fontWeight = FontWeight.Black, color = Color.White)
        if (logo != null && !failed) {
            AsyncImage(
                model = logo, contentDescription = name, contentScale = ContentScale.Fit,
                onSuccess = { loaded = true }, onError = { failed = true },
                modifier = Modifier.fillMaxSize().padding(size * 0.12f),
            )
        }
    }
}

/** A white check on a dark disc, top corner of a card already seen. */
@Composable
fun WatchedCheck(modifier: Modifier = Modifier) {
    Box(modifier = modifier.size(24.dp).background(Color.Black.copy(alpha = 0.7f), CircleShape), contentAlignment = Alignment.Center) {
        Icon(Icons.Filled.Check, contentDescription = "Vu", tint = Color.White, modifier = Modifier.size(15.dp))
    }
}

/** Thin progress bar drawn on cards. */
@Composable
fun ProgressBar(fraction: Float, modifier: Modifier = Modifier, height: Int = 4) {
    Box(modifier = modifier.fillMaxWidth().height(height.dp).clip(RoundedCornerShape(50)).background(Theme.surfaceStrong)) {
        Box(modifier = Modifier.fillMaxWidth(fraction.coerceIn(0f, 1f)).height(height.dp).background(Theme.text))
    }
}

/** « Kanstrimi » in the accent colour, spaced capitals. */
@Composable
fun Wordmark(size: Int, tracking: Float = 3f) {
    Text("Kanstrimi", color = Theme.accent, fontSize = size.sp, fontWeight = FontWeight.Bold, letterSpacing = tracking.sp)
}

/** A title's logo when TMDB has one, held in the box; the title in large type while it loads, when it fails and without one. */
@Composable
fun LogoOrTitle(title: String, logo: String?, modifier: Modifier = Modifier, titleSize: Int = 40, maxLogoWidth: Int = 380, logoHeight: Int = 110) {
    var failed by remember(logo) { mutableStateOf(logo == null) }
    var loaded by remember(logo) { mutableStateOf(false) }
    Box(modifier = modifier) {
        if (logo != null && !failed) {
            AsyncImage(
                model = logo, contentDescription = title, contentScale = ContentScale.Fit, alignment = Alignment.CenterStart,
                onSuccess = { loaded = true }, onError = { failed = true },
                modifier = Modifier.widthIn(max = maxLogoWidth.dp).height(logoHeight.dp),
            )
        }
        if (!loaded) {
            Text(title, fontSize = titleSize.sp, lineHeight = (titleSize * 1.1f).sp, fontWeight = FontWeight.Black, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** A secondary action: a round icon, its label under it. The sheet's buttons and the home hero. */
@Composable
fun RoundAction(title: String, onClick: () -> Unit, enabled: Boolean = true, icon: @Composable () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.widthIn(max = 96.dp)) {
        FilledIconButton(
            onClick = onClick, enabled = enabled,
            colors = IconButtonDefaults.filledIconButtonColors(containerColor = Theme.surfaceRaised, contentColor = Theme.text, disabledContainerColor = Theme.surfaceDim, disabledContentColor = Theme.secondary),
            modifier = Modifier.size(52.dp),
        ) { icon() }
        Text(title, style = MaterialTheme.typography.labelSmall, color = Theme.secondary, textAlign = TextAlign.Center, maxLines = 2)
    }
}

/** The back button drawn top left of a pushed screen, under the status bar. */
@Composable
fun BackButton(onClick: () -> Unit, modifier: Modifier = Modifier) {
    FilledIconButton(
        onClick = onClick,
        colors = IconButtonDefaults.filledIconButtonColors(containerColor = Color.Black.copy(alpha = 0.45f), contentColor = Theme.text),
        modifier = modifier.statusBarsPadding().padding(start = 16.dp, top = 12.dp).size(44.dp),
    ) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Retour") }
}

/** A person's photo cropped to a circle; their initials on a plain disc without a photo or while it loads. */
@Composable
fun CastPhoto(name: String, url: String?, diameter: Dp) {
    Box(modifier = Modifier.size(diameter).clip(CircleShape).background(Theme.surfaceButton), contentAlignment = Alignment.Center) {
        Text(initials(name), fontSize = (diameter.value * 0.34f).sp, fontWeight = FontWeight.SemiBold, color = Theme.secondary)
        if (url != null) {
            // A TMDB portrait is 2:3: shown whole it would cut the forehead, so the top of it is favoured.
            AsyncImage(model = url, contentDescription = name, contentScale = ContentScale.Crop, alignment = Alignment.TopCenter, modifier = Modifier.fillMaxSize())
        }
    }
}

/** « Keanu Reeves » → « KR ». */
fun initials(name: String): String = name.split(' ', '-').filter { it.isNotEmpty() }.take(2).joinToString("") { it.first().uppercase() }

/** A count beside a title, grouped the French way: « 1 227 ». */
fun formatCount(n: Int): String = NumberFormat.getIntegerInstance(Locale.FRANCE).format(n)

private val hourFormat = DateTimeFormatter.ofPattern("HH:mm", Locale.FRENCH)

/** « 21:14 », in the device's zone. */
fun formatHour(instant: Instant, zone: ZoneId = ZoneId.systemDefault()): String = hourFormat.format(instant.atZone(zone))

/** « à l'instant », « il y a 12 min », « il y a 3 h », « il y a 2 j »: when a channel was watched. */
fun formatAgo(date: Instant, now: Instant = Instant.now()): String {
    val s = now.epochSecond - date.epochSecond
    return when {
        s < 60 -> "à l'instant"
        s < 3600 -> "il y a ${s / 60} min"
        s < 86400 -> "il y a ${s / 3600} h"
        else -> "il y a ${s / 86400} j"
    }
}
