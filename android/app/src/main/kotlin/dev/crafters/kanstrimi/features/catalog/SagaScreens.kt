package dev.crafters.kanstrimi.features.catalog

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.crafters.kanstrimi.app.LocalEnvironment
import dev.crafters.kanstrimi.contract.ContentItem
import dev.crafters.kanstrimi.ui.ArtImage
import dev.crafters.kanstrimi.ui.BackdropFade
import dev.crafters.kanstrimi.ui.LoadedScreen
import dev.crafters.kanstrimi.ui.LocalMetrics
import dev.crafters.kanstrimi.ui.MenuPoster
import dev.crafters.kanstrimi.ui.PosterCard
import dev.crafters.kanstrimi.ui.StatePanel
import dev.crafters.kanstrimi.ui.formatCount
import dev.crafters.kanstrimi.ui.theme.Theme
import kotlinx.coroutines.launch

/** One saga: its backdrop, its heading, its name and its movies, latest release first. */
@Composable
fun SagaScreen(id: String) {
    val env = LocalEnvironment.current
    val metrics = LocalMetrics.current
    LoadedScreen(errorTitle = "Saga indisponible", key = id, load = { env.client.saga(id) }) { s ->
        Box(modifier = Modifier.fillMaxSize()) {
            Box(modifier = Modifier.fillMaxWidth().height(460.dp)) {
                ArtImage(id = s.id, url = s.backdrop, modifier = Modifier.fillMaxSize())
                Box(modifier = Modifier.fillMaxSize().background(Brush.horizontalGradient(0f to Theme.background.copy(alpha = 0.8f), 0.6f to Theme.background.copy(alpha = 0.2f), 1f to Theme.background.copy(alpha = 0f))))
                BackdropFade()
            }
            LazyVerticalGrid(
                columns = GridCells.Fixed(metrics.columns),
                contentPadding = PaddingValues(start = metrics.inset, end = metrics.inset, top = metrics.pushedTop + 60.dp, bottom = 60.dp),
                horizontalArrangement = Arrangement.spacedBy(metrics.spacing),
                verticalArrangement = Arrangement.spacedBy(metrics.spacing),
            ) {
                item(key = "header", span = { GridItemSpan(maxLineSpan) }) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(bottom = 24.dp)) {
                        Text(s.heading, color = Theme.accent, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
                        Text(s.name, fontSize = 44.sp, lineHeight = 48.sp, fontWeight = FontWeight.Black, maxLines = 2)
                        Text(s.facts, fontSize = 18.sp, color = Theme.secondary)
                    }
                }
                items(s.movies, key = { it.id }) { m ->
                    MenuPoster(m, width = metrics.posterWidth, onOpen = { env.open(m.id) }, onPlay = { env.player.play(m.id) })
                }
            }
        }
    }
}

/** « Voir tout » of the sagas: every saga, freshest first, page by page. */
@Composable
fun SagasGridScreen() {
    val env = LocalEnvironment.current
    val metrics = LocalMetrics.current
    val scope = rememberCoroutineScope()
    val paginator = remember { Paginator<ContentItem>({ it.id }) { cursor -> env.client.sagas(cursor) } }
    LaunchedEffect(paginator) { paginator.loadFirstPage() }
    LazyVerticalGrid(
        columns = GridCells.Fixed(metrics.columns),
        contentPadding = PaddingValues(start = metrics.inset, end = metrics.inset, top = metrics.pushedTop, bottom = 60.dp),
        horizontalArrangement = Arrangement.spacedBy(metrics.spacing),
        verticalArrangement = Arrangement.spacedBy(metrics.spacing),
    ) {
        item(key = "header", span = { GridItemSpan(maxLineSpan) }) {
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 16.dp)) {
                Text("Sagas", fontSize = 32.sp, fontWeight = FontWeight.Bold)
                paginator.total?.let { Text(formatCount(it), fontSize = 20.sp, color = Theme.secondary) }
            }
        }
        val firstError = paginator.firstPageError
        if (firstError != null) {
            item(key = "error", span = { GridItemSpan(maxLineSpan) }) {
                Box(modifier = Modifier.padding(vertical = 40.dp)) {
                    StatePanel("Impossible de charger les sagas", firstError, actionTitle = "Réessayer") { scope.launch { paginator.retry() } }
                }
            }
        } else {
            pagedPosters(paginator, metrics, key = { it.id }) { saga -> PosterCard(saga, width = metrics.posterWidth, onClick = { env.open(saga.id) }) }
        }
    }
}
