package dev.crafters.kanstrimi.ui

import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * The sizes every screen lays out with, read from the width the tabs' content gets (the window minus the rail):
 * six posters across in landscape, five upright, 32 dp of margin. The Galaxy Tab S9 is 1 463 × 914 dp.
 */
@Immutable
data class Metrics(val width: Dp) {
    val inset: Dp = 32.dp
    val spacing: Dp = 16.dp
    val landscape: Boolean = width > 1000.dp
    val columns: Int = if (landscape) 6 else 5
    /** The poster width that fills the rows and the grids exactly. */
    val posterWidth: Dp = (width - inset * 2 - spacing * (columns - 1)) / columns
    /** A 16:9 card: two posters and the gap between them. */
    val wideWidth: Dp = posterWidth * 2 + spacing
    val studioWidth: Dp = posterWidth * 1.5f + spacing / 2
    /** A channel card in a row (the home's « Chaînes les plus regardées », the player's Récentes). */
    val channelCardWidth: Dp = posterWidth * 1.5f + spacing / 2
    val stillWidth: Dp = posterWidth * 1.4f
    val castPhoto: Dp = 100.dp
    val castCell: Dp = 136.dp
    /** Running text (an overview) stops there, the line stays readable. */
    val textWidth: Dp = 760.dp
    /** Room for the back button above a pushed screen's title. */
    val pushedTop: Dp = 84.dp
}

val LocalMetrics = compositionLocalOf { Metrics(1463.dp) }

/** Measures the window and hands the metrics to its content. */
@Composable
fun ProvideMetrics(content: @Composable () -> Unit) {
    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        CompositionLocalProvider(LocalMetrics provides Metrics(maxWidth), content = content)
    }
}
