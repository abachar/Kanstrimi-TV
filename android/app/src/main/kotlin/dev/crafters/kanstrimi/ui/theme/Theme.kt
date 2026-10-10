package dev.crafters.kanstrimi.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/** The same palette as the Apple app (`Shared/Theme.swift`): a near-black page, white text, an amber accent. */
object Theme {
    val background = Color(0xFF07080B)
    val text = Color(0xFFF5F5F7)
    val accent = Color(0xFFF5B544)
    val secondary = Color(0xFFEBEBF5).copy(alpha = 0.62f)
    val danger = Color(0xFFFF5E5E)
    val live = Color(0xFFFF3B30)
    val success = Color(0xFF34C759)
    // Translucent white fills for backgrounds, from the faintest to the strongest.
    val surfaceDim = Color.White.copy(alpha = 0.05f)
    val surfacePanel = Color.White.copy(alpha = 0.06f)
    val surface = Color.White.copy(alpha = 0.08f)
    val surfaceControl = Color.White.copy(alpha = 0.10f)
    val surfaceButton = Color.White.copy(alpha = 0.12f)
    val surfaceRaised = Color.White.copy(alpha = 0.16f)
    val track = Color.White.copy(alpha = 0.28f)
    val surfaceStrong = Color.White.copy(alpha = 0.30f)
    val logoTile = Color.White.copy(alpha = 0.92f)

    /** Deterministic gradient standing in for a poster or a backdrop that has none. */
    fun art(id: String): Pair<Color, Color> {
        var h = 5381
        for (c in id) h = (h shl 5) + h + c.code
        val hue = ((h and Int.MAX_VALUE) % 360).toFloat()
        val hue2 = (hue + 29f) % 360f
        return Color.hsv(hue, 0.55f, 0.55f) to Color.hsv(hue2, 0.65f, 0.18f)
    }
}

private val scheme = darkColorScheme(
    primary = Theme.text,
    onPrimary = Color.Black,
    secondary = Theme.accent,
    onSecondary = Color.Black,
    tertiary = Theme.accent,
    background = Theme.background,
    onBackground = Theme.text,
    surface = Theme.background,
    onSurface = Theme.text,
    surfaceVariant = Theme.surfaceControl,
    onSurfaceVariant = Theme.secondary,
    surfaceContainer = Color(0xFF15161B),
    surfaceContainerHigh = Color(0xFF1C1D23),
    surfaceContainerHighest = Color(0xFF24252C),
    error = Theme.danger,
    outline = Theme.surfaceStrong,
)

/** Always dark, like the Apple app: the system's light mode is ignored. */
@Composable
fun KanstrimiTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = scheme, content = content)
}
