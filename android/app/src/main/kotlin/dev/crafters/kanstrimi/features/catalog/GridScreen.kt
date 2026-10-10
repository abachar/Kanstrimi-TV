package dev.crafters.kanstrimi.features.catalog

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.crafters.kanstrimi.R
import dev.crafters.kanstrimi.app.LocalEnvironment
import dev.crafters.kanstrimi.client.CatalogSort
import dev.crafters.kanstrimi.client.ListQuery
import dev.crafters.kanstrimi.contract.CatalogRow
import dev.crafters.kanstrimi.contract.ContentItem
import dev.crafters.kanstrimi.contract.ContentKind
import dev.crafters.kanstrimi.contract.DynamicRange
import dev.crafters.kanstrimi.contract.Language
import dev.crafters.kanstrimi.contract.Quality
import dev.crafters.kanstrimi.contract.Studio
import dev.crafters.kanstrimi.ui.ArtImage
import dev.crafters.kanstrimi.ui.BackdropFade
import dev.crafters.kanstrimi.ui.LocalMetrics
import dev.crafters.kanstrimi.ui.MenuPoster
import dev.crafters.kanstrimi.ui.Metrics
import dev.crafters.kanstrimi.ui.RetryCard
import dev.crafters.kanstrimi.ui.StatePanel
import dev.crafters.kanstrimi.ui.StudioTile
import dev.crafters.kanstrimi.ui.formatCount
import dev.crafters.kanstrimi.ui.theme.Theme
import kotlinx.coroutines.launch

/** « Voir tout » of a genre: the paginated grid with the version filters above. */
@Composable
fun GenreGridScreen(kind: ContentKind, row: CatalogRow) {
    ListGridScreen(kind, title = row.name, total = row.total, initial = ListQuery(kind = kind, genre = row.id), studio = null)
}

/** A studio's grid: its logo in place of the title, its latest title's backdrop behind. */
@Composable
fun StudioGridScreen(kind: ContentKind, studio: Studio) {
    ListGridScreen(kind, title = studio.name, total = studio.count, initial = ListQuery(kind = kind, studio = studio.id), studio = studio)
}

@Composable
private fun ListGridScreen(kind: ContentKind, title: String, total: Int, initial: ListQuery, studio: Studio?) {
    val env = LocalEnvironment.current
    val metrics = LocalMetrics.current
    val scope = rememberCoroutineScope()
    var query by remember { mutableStateOf(initial) }
    // New filters or sort: a new paginator, which forgets everything and starts again.
    val paginator = remember(query) { Paginator<ContentItem>({ it.id }) { cursor -> env.client.list(query.copy(cursor = cursor)) } }
    LaunchedEffect(paginator) { paginator.loadFirstPage() }

    Box(modifier = Modifier.fillMaxSize()) {
        if (studio?.backdrop != null) {
            Box(modifier = Modifier.fillMaxWidth().height(400.dp)) {
                ArtImage(id = studio.id, url = studio.backdrop, modifier = Modifier.fillMaxSize())
                BackdropFade()
            }
        }
        LazyVerticalGrid(
            columns = GridCells.Fixed(metrics.columns),
            contentPadding = PaddingValues(start = metrics.inset, end = metrics.inset, top = metrics.pushedTop + 12.dp, bottom = 60.dp),
            horizontalArrangement = Arrangement.spacedBy(metrics.spacing),
            verticalArrangement = Arrangement.spacedBy(metrics.spacing),
        ) {
            item(key = "header", span = { GridItemSpan(maxLineSpan) }) {
                Row(horizontalArrangement = Arrangement.spacedBy(20.dp), verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 8.dp)) {
                    if (studio != null) StudioTile(studio, width = metrics.studioWidth)
                    Text(title, fontSize = 32.sp, fontWeight = FontWeight.Bold)
                    Text(formatCount(total), fontSize = 20.sp, color = Theme.secondary)
                }
            }
            item(key = "filters", span = { GridItemSpan(maxLineSpan) }) { FilterBar(kind, query) { query = it } }
            val firstError = paginator.firstPageError
            when {
                firstError != null -> item(key = "error", span = { GridItemSpan(maxLineSpan) }) {
                    Box(modifier = Modifier.padding(vertical = 40.dp)) {
                        StatePanel("Impossible de charger la liste", firstError, actionTitle = "Réessayer") { scope.launch { paginator.retry() } }
                    }
                }
                paginator.isEmpty -> item(key = "empty", span = { GridItemSpan(maxLineSpan) }) {
                    Box(modifier = Modifier.padding(vertical = 40.dp)) {
                        StatePanel(
                            "Aucun titre", if (query.hasFilters) "Aucun titre ne correspond à ces filtres." else "Cette liste est vide.",
                            actionTitle = if (query.hasFilters) "Retirer les filtres" else null,
                        ) { query = query.cleared }
                    }
                }
                else -> pagedPosters(paginator, metrics) { item ->
                    MenuPoster(item, width = metrics.posterWidth, onOpen = { env.open(item.id) }, onPlay = { env.player.play(item.id) })
                }
            }
        }
    }
}

/**
 * The cells of a paged grid: `cell` for each item, the next page asked when a cell near the end shows, then a Retry
 * card or a spinner where the next page goes. Titles and sagas share it.
 */
fun <T : Any> LazyGridScope.pagedPosters(paginator: Paginator<T>, metrics: Metrics, key: (T) -> String = { it.toString() }, cell: @Composable (T) -> Unit) {
    itemsIndexed(paginator.items, key = { _, item -> key(item) }) { index, item ->
        // A cell composed near the end asks for the next page: the lazy grid composes a little ahead of the scroll.
        LaunchedEffect(index, paginator) { paginator.loadMoreIfNeeded(index) }
        cell(item)
    }
    val pageError = paginator.pageError
    if (pageError != null) {
        item(key = "retry") {
            val scope = rememberCoroutineScope()
            RetryCard(pageError, width = metrics.posterWidth) { scope.launch { paginator.retry() } }
        }
    } else if (paginator.isLoading) {
        item(key = "loading") {
            Box(modifier = Modifier.fillMaxWidth().height(metrics.posterWidth * 1.5f), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Theme.text) }
        }
    }
}

/** Sort and version filters of the grid: the sort in a menu, the filters as chips a tap toggles. */
@Composable
private fun FilterBar(kind: ContentKind, query: ListQuery, onChange: (ListQuery) -> Unit) {
    var sortMenu by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically,
    ) {
        Box {
            Chip("Trier : ${query.sort.label}", on = false, icon = { Icon(painterResource(R.drawable.ic_sort), contentDescription = null, modifier = Modifier.size(18.dp)) }) { sortMenu = true }
            DropdownMenu(expanded = sortMenu, onDismissRequest = { sortMenu = false }) {
                CatalogSort.options(kind).forEach { s ->
                    DropdownMenuItem(
                        text = { Text(s.label) },
                        onClick = { sortMenu = false; onChange(query.copy(sort = s)) },
                        trailingIcon = if (s == query.sort) ({ Icon(Icons.Filled.Check, contentDescription = null, tint = Theme.accent) }) else null,
                    )
                }
            }
        }
        VerticalDivider(modifier = Modifier.height(28.dp), color = Theme.surfaceStrong)
        listOf(Language.VF, Language.VOSTFR, Language.VO).forEach { l ->
            Chip(Language.short(l), on = query.language == l) { onChange(query.copy(language = if (query.language == l) null else l)) }
        }
        Chip("4K", on = query.minQuality == Quality.UHD) { onChange(query.copy(minQuality = if (query.minQuality == Quality.UHD) null else Quality.UHD)) }
        Chip("Dolby Vision", on = query.dynamicRange == DynamicRange.DOLBY_VISION) {
            onChange(query.copy(dynamicRange = if (query.dynamicRange == DynamicRange.DOLBY_VISION) null else DynamicRange.DOLBY_VISION))
        }
        Chip("FR disponible", on = query.vfAvailable) { onChange(query.copy(vfAvailable = !query.vfAvailable)) }
        if (query.hasFilters) {
            Chip("Tout retirer", on = false, icon = { Icon(Icons.Filled.Close, contentDescription = null, modifier = Modifier.size(18.dp)) }) { onChange(query.cleared) }
        }
    }
}

/** A filter: amber when on, a translucent capsule otherwise. */
@Composable
private fun Chip(text: String, on: Boolean, icon: (@Composable () -> Unit)? = null, onClick: () -> Unit) {
    FilterChip(
        selected = on,
        onClick = onClick,
        label = { Text(text, style = MaterialTheme.typography.labelLarge) },
        leadingIcon = icon ?: if (on) ({ Icon(Icons.Filled.Check, contentDescription = null, modifier = Modifier.size(18.dp)) }) else null,
        colors = FilterChipDefaults.filterChipColors(
            containerColor = Theme.surface, labelColor = Theme.text, iconColor = Theme.text,
            selectedContainerColor = Theme.accent, selectedLabelColor = Color.Black, selectedLeadingIconColor = Color.Black,
        ),
        border = FilterChipDefaults.filterChipBorder(enabled = true, selected = on, borderColor = Color.Transparent, selectedBorderColor = Color.Transparent),
    )
}
