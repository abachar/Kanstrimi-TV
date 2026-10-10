package dev.crafters.kanstrimi.features.catalog

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.crafters.kanstrimi.app.AppEnvironment
import dev.crafters.kanstrimi.app.LocalEnvironment
import dev.crafters.kanstrimi.app.PersonRef
import dev.crafters.kanstrimi.contract.ContentItem
import dev.crafters.kanstrimi.ui.CastPhoto
import dev.crafters.kanstrimi.ui.LoadedScreen
import dev.crafters.kanstrimi.ui.LocalMetrics
import dev.crafters.kanstrimi.ui.MenuPoster
import dev.crafters.kanstrimi.ui.Metrics
import dev.crafters.kanstrimi.ui.RowTitle
import dev.crafters.kanstrimi.ui.theme.Theme

/** One actor: their photo and name, then their visible films and series in grids. */
@Composable
fun PersonScreen(ref: PersonRef) {
    val env = LocalEnvironment.current
    val metrics = LocalMetrics.current
    LoadedScreen(errorTitle = "Acteur indisponible", key = ref.id, load = { env.client.person(ref.id) }) { s ->
        LazyVerticalGrid(
            columns = GridCells.Fixed(metrics.columns),
            contentPadding = PaddingValues(start = metrics.inset, end = metrics.inset, top = metrics.pushedTop + 12.dp, bottom = 60.dp),
            horizontalArrangement = Arrangement.spacedBy(metrics.spacing),
            verticalArrangement = Arrangement.spacedBy(metrics.spacing),
        ) {
            item(key = "header", span = { GridItemSpan(maxLineSpan) }) {
                Row(horizontalArrangement = Arrangement.spacedBy(28.dp), verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 24.dp)) {
                    CastPhoto(name = s.name, url = s.photo ?: ref.photo, diameter = metrics.castPhoto * 1.6f)
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(s.name, fontSize = 44.sp, lineHeight = 48.sp, fontWeight = FontWeight.Black, maxLines = 2)
                        Text(s.facts, fontSize = 18.sp, color = Theme.secondary)
                    }
                }
            }
            section("Films", s.movies, env, metrics)
            section("Séries", s.series, env, metrics)
        }
    }
}

/** A titled grid; nothing at all when the actor has no title of that kind. */
private fun LazyGridScope.section(title: String, items: List<ContentItem>, env: AppEnvironment, metrics: Metrics) {
    if (items.isEmpty()) return
    item(key = "title:$title", span = { GridItemSpan(maxLineSpan) }) { RowTitle(title) }
    items(items, key = { "$title:${it.id}" }) { c ->
        MenuPoster(c, width = metrics.posterWidth, onOpen = { env.open(c.id) }, onPlay = { env.player.play(c.id) })
    }
    item(key = "gap:$title", span = { GridItemSpan(maxLineSpan) }) { Spacer(modifier = Modifier.height(12.dp)) }
}
