package dev.crafters.kanstrimi.features.catalog

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
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
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.crafters.kanstrimi.app.LocalEnvironment
import dev.crafters.kanstrimi.app.Route
import dev.crafters.kanstrimi.client.CatalogException
import dev.crafters.kanstrimi.contract.CatalogRow
import dev.crafters.kanstrimi.contract.ContentItem
import dev.crafters.kanstrimi.contract.ContentKind
import dev.crafters.kanstrimi.contract.Page
import dev.crafters.kanstrimi.contract.Studio
import dev.crafters.kanstrimi.ui.LoadingPanel
import dev.crafters.kanstrimi.ui.LocalMetrics
import dev.crafters.kanstrimi.ui.MenuPoster
import dev.crafters.kanstrimi.ui.PosterCard
import dev.crafters.kanstrimi.ui.RowTitle
import dev.crafters.kanstrimi.ui.SeeAllCard
import dev.crafters.kanstrimi.ui.StatePanel
import dev.crafters.kanstrimi.ui.StudioTile
import dev.crafters.kanstrimi.ui.theme.Theme

/**
 * Films and Séries: the server's shelves (`GET /movies`, `GET /series`: Top 10, Nouveautés, genres), then after
 * « Nouveautés » the studio hubs and, for films, the sagas. « Voir tout » opens a paginated grid.
 */
@Composable
fun CatalogScreen(kind: ContentKind) {
    val env = LocalEnvironment.current
    val metrics = LocalMetrics.current
    val series = kind == ContentKind.SERIES
    var rows by remember { mutableStateOf<List<CatalogRow>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    /** null = not loaded yet (or the call failed): tried again with the next attempt. */
    var studios by remember { mutableStateOf<List<Studio>?>(null) }
    var sagas by remember { mutableStateOf<Page<ContentItem>?>(null) }
    var attempt by remember { mutableIntStateOf(0) }

    // The shelves first, then the studios and sagas, whose failure just leaves them out.
    LaunchedEffect(attempt) {
        if (rows == null) {
            try {
                rows = env.client.rows(kind)
                error = null
            } catch (e: CatalogException) {
                error = e.message
                return@LaunchedEffect
            }
        }
        if (studios == null) studios = quietly { env.client.studios(kind) }
        if (!series && sagas == null) sagas = quietly { env.client.sagas(null) }
    }

    val r = rows
    when {
        r != null && r.isEmpty() -> StatePanel(if (series) "Aucune série" else "Aucun film", "Le catalogue est vide.")
        r != null -> LazyColumn(verticalArrangement = Arrangement.spacedBy(22.dp), contentPadding = PaddingValues(top = 28.dp, bottom = 40.dp)) {
            item(key = "title") {
                Text(if (series) "Séries" else "Films", fontSize = 32.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = metrics.inset))
            }
            // Studios and sagas come after « Nouveautés », or after the first shelf when there is none.
            val anchor = r.firstOrNull { it.id == "recent" }?.id ?: r.firstOrNull()?.id
            r.forEach { row ->
                item(key = "row:${row.id}") {
                    ShelfRow(row, ranked = row.id == "top10", onSeeAll = if (row.total > row.cards.size) ({ env.navigate(Route.Genre(kind, row)) }) else null)
                }
                if (row.id == anchor) {
                    studios?.takeIf { it.isNotEmpty() }?.let { s ->
                        item(key = "hub:studios") { StudioShelf(s) { env.navigate(Route.Studio(kind, it)) } }
                    }
                    sagas?.takeIf { it.items.isNotEmpty() }?.let { s ->
                        item(key = "hub:sagas") {
                            SagaShelf(s.items, total = s.total ?: s.items.size, onSeeAll = if (s.nextCursor != null) ({ env.navigate(Route.Sagas) }) else null)
                        }
                    }
                }
            }
        }
        error != null -> StatePanel("Impossible de charger la liste", error ?: "", actionTitle = "Réessayer") { attempt++ }
        else -> LoadingPanel()
    }
}

/** A call whose failure is silent: the shelf is left out. */
private suspend fun <T> quietly(block: suspend () -> T): T? = try {
    block()
} catch (e: CatalogException) {
    null
}

/** One shelf: title, total, the cards, and « Voir tout » at the end when the server has more. `ranked`: the Top 10, a big rank number beside each poster. */
@Composable
fun ShelfRow(row: CatalogRow, ranked: Boolean = false, onSeeAll: (() -> Unit)? = null) {
    val env = LocalEnvironment.current
    val metrics = LocalMetrics.current
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        RowTitle(row.name, count = row.total, modifier = Modifier.padding(horizontal = metrics.inset))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(metrics.spacing), contentPadding = PaddingValues(horizontal = metrics.inset)) {
            itemsIndexed(row.cards, key = { i, c -> "$i:${c.id}" }) { index, c ->
                Row(verticalAlignment = Alignment.Bottom) {
                    if (ranked) RankNumber(index + 1, metrics.posterWidth)
                    MenuPoster(c, width = metrics.posterWidth, onOpen = { env.open(c.id) }, onPlay = { env.player.play(c.id) })
                }
            }
            if (onSeeAll != null) item(key = "all") { SeeAllCard(row.total, width = metrics.posterWidth, onClick = onSeeAll) }
        }
    }
}

/** The Top 10's rank, large and dim, tucked under the poster's left edge; its foot level with the poster's. */
@Composable
private fun RankNumber(rank: Int, posterWidth: Dp) {
    val size = posterWidth.value * 0.62f
    Text(
        "$rank", fontSize = size.sp, lineHeight = size.sp, fontWeight = FontWeight.Black, color = Theme.secondary.copy(alpha = 0.5f),
        style = TextStyle(platformStyle = PlatformTextStyle(includeFontPadding = false)),
        modifier = Modifier.offset(x = 10.dp).padding(bottom = 28.dp),
    )
}

/** The « Studios » shelf: one logo tile per hub chosen in the admin. */
@Composable
private fun StudioShelf(studios: List<Studio>, onSelect: (Studio) -> Unit) {
    val metrics = LocalMetrics.current
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        RowTitle("Studios", modifier = Modifier.padding(horizontal = metrics.inset))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(metrics.spacing), contentPadding = PaddingValues(horizontal = metrics.inset)) {
            items(studios, key = { it.id }) { StudioTile(it, width = metrics.studioWidth) { onSelect(it) } }
        }
    }
}

/** The « Sagas » shelf of the Films tab: one poster per TMDB collection with two visible movies or more, « 3 films » under it. */
@Composable
private fun SagaShelf(sagas: List<ContentItem>, total: Int, onSeeAll: (() -> Unit)?) {
    val env = LocalEnvironment.current
    val metrics = LocalMetrics.current
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        RowTitle("Sagas", count = total, modifier = Modifier.padding(horizontal = metrics.inset))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(metrics.spacing), contentPadding = PaddingValues(horizontal = metrics.inset)) {
            items(sagas, key = { it.id }) { PosterCard(it, width = metrics.posterWidth, onClick = { env.open(it.id) }) }
            if (onSeeAll != null) item(key = "all") { SeeAllCard(total, width = metrics.posterWidth, onClick = onSeeAll) }
        }
    }
}
