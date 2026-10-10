package dev.crafters.kanstrimi.features.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.crafters.kanstrimi.app.LocalEnvironment
import dev.crafters.kanstrimi.client.CatalogException
import dev.crafters.kanstrimi.contract.ContentItem
import dev.crafters.kanstrimi.contract.ContentKind
import dev.crafters.kanstrimi.contract.Home
import dev.crafters.kanstrimi.contract.HomeHero
import dev.crafters.kanstrimi.contract.HomeRowKind
import dev.crafters.kanstrimi.ui.ArtImage
import dev.crafters.kanstrimi.ui.Badge
import dev.crafters.kanstrimi.ui.CardRow
import dev.crafters.kanstrimi.ui.LoadingPanel
import dev.crafters.kanstrimi.ui.LocalMetrics
import dev.crafters.kanstrimi.ui.LogoOrTitle
import dev.crafters.kanstrimi.ui.RoundAction
import dev.crafters.kanstrimi.ui.StatePanel
import dev.crafters.kanstrimi.ui.theme.Theme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** The carousel, then the rows the server composed. A slide stays eight seconds, the next follows. */
@Composable
fun HomeScreen() {
    val env = LocalEnvironment.current
    val metrics = LocalMetrics.current
    var home by remember { mutableStateOf<Home?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var heroIndex by remember { mutableIntStateOf(0) }
    var favorites by remember { mutableStateOf<Map<String, Boolean>>(emptyMap()) }
    val scope = rememberCoroutineScope()

    suspend fun load() {
        try {
            home = env.client.home()
            error = null
        } catch (e: CatalogException) {
            if (home == null) error = e.message
        }
    }
    // Loaded once, then again each time the player leaves a title (its progress moved « Reprendre »).
    val progressRevision by env.progressRevision.collectAsState()
    LaunchedEffect(progressRevision) { load() }
    LaunchedEffect(heroIndex, home?.heroes?.size) {
        val count = home?.heroes?.size ?: 0
        if (count > 1) {
            delay(8000)
            heroIndex = (heroIndex + 1) % count
        }
    }

    val h = home
    when {
        h != null -> Box(modifier = Modifier.fillMaxSize()) {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(22.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 40.dp)) {
                h.heroes.getOrNull(heroIndex)?.let { hero ->
                    item(key = "hero") {
                        HeroBanner(
                            hero = hero,
                            count = h.heroes.size,
                            index = heroIndex,
                            isFavorite = favorites[hero.item.id] ?: hero.isFavorite,
                            inset = metrics.inset,
                            onPlay = { env.player.play(hero.playId) },
                            onFavorite = {
                                val next = !(favorites[hero.item.id] ?: hero.isFavorite)
                                favorites = favorites + (hero.item.id to next)
                                scope.launch { env.attempt("Ma liste") { env.client.setFavorite(hero.item.id, next) } }
                            },
                            onOpen = { env.open(hero.item.id) },
                        )
                    }
                }
                items(h.rows, key = { it.id }) { row ->
                    // A channel plays (the Direct lot); a title opens its sheet.
                    CardRow(title = row.title, cards = row.cards, landscape = row.kind == HomeRowKind.RESUME || row.kind == HomeRowKind.MOST_WATCHED_CHANNELS,
                        onPlay = { env.player.play(it.id) }) { card ->
                        // « Reprendre » launches the player directly, like the Apple app; the other rows open the sheet.
                        when {
                            card.kind == ContentKind.LIVE -> env.notify("Direct : prochain lot")
                            row.kind == HomeRowKind.RESUME -> env.player.play(card.id)
                            else -> env.open(card.id)
                        }
                    }
                }
            }
        }
        error != null -> StatePanel("Serveur injoignable", error ?: "", actionTitle = "Réessayer") { scope.launch { load() } }
        else -> LoadingPanel()
    }
}

/**
 * A slide, after Prime Video and the Apple TV app: the backdrop held in the top right corner over four fifths of the
 * width, fading into a black halo on its left and bottom; the tagline, the logo or the title, the facts, the overview
 * and the buttons stand on the halo, bottom left.
 */
@Composable
private fun HeroBanner(hero: HomeHero, count: Int, index: Int, isFavorite: Boolean, inset: androidx.compose.ui.unit.Dp,
                       onPlay: () -> Unit, onFavorite: () -> Unit, onOpen: () -> Unit) {
    val item: ContentItem = hero.item
    BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
        val pictureWidth = maxWidth * 0.8f
        Box(modifier = Modifier.fillMaxWidth().height(pictureWidth * 9f / 16f)) {
            Box(modifier = Modifier.align(Alignment.TopEnd).widthIn(max = pictureWidth).aspectRatio(16f / 9f)) {
                ArtImage(id = item.id, url = item.picture, modifier = Modifier.fillMaxSize())
                Box(modifier = Modifier.fillMaxSize().background(Brush.horizontalGradient(0f to Theme.background, 0.3f to Theme.background.copy(alpha = 0.85f), 0.55f to Theme.background.copy(alpha = 0.4f), 0.8f to Color.Transparent)))
                Box(modifier = Modifier.fillMaxSize().background(Brush.verticalGradient(0.45f to Color.Transparent, 0.75f to Theme.background.copy(alpha = 0.7f), 1f to Theme.background)))
            }
            Column(
                modifier = Modifier.align(Alignment.BottomStart).padding(horizontal = inset).padding(bottom = 24.dp).widthIn(max = 620.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(hero.tagline, color = Theme.accent, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
                LogoOrTitle(title = item.title, logo = item.logo)
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    item.facts?.let { Text(it, color = Theme.secondary) }
                    hero.certification?.let { Badge(it) }
                    item.badges.forEach { Badge(it) }
                }
                item.overview?.let { Text(it, color = Theme.secondary, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium) }
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Button(onClick = onPlay, colors = ButtonDefaults.buttonColors(containerColor = Theme.text, contentColor = Color.Black)) {
                        Icon(Icons.Filled.PlayArrow, contentDescription = null)
                        Spacer(modifier = Modifier.padding(3.dp))
                        Text(hero.playLabel, fontWeight = FontWeight.SemiBold)
                    }
                    RoundAction(if (isFavorite) "Dans ma liste" else "Ma liste", onFavorite) { Icon(if (isFavorite) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder, contentDescription = null) }
                    RoundAction("Fiche", onOpen) { Icon(Icons.Filled.Info, contentDescription = null) }
                }
            }
            if (count > 1) {
                Row(modifier = Modifier.align(Alignment.BottomEnd).padding(horizontal = inset, vertical = 28.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    repeat(count) { i ->
                        Box(modifier = Modifier.height(8.dp).widthIn(min = if (i == index) 20.dp else 8.dp)
                            .background(if (i == index) Theme.accent else Theme.secondary.copy(alpha = 0.45f), androidx.compose.foundation.shape.RoundedCornerShape(50)))
                    }
                }
            }
        }
    }
}
