package dev.crafters.kanstrimi.features.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.crafters.kanstrimi.R
import dev.crafters.kanstrimi.app.LocalEnvironment
import dev.crafters.kanstrimi.app.Route
import dev.crafters.kanstrimi.contract.Card
import dev.crafters.kanstrimi.contract.Language
import dev.crafters.kanstrimi.contract.SagaRef
import dev.crafters.kanstrimi.ui.ArtImage
import dev.crafters.kanstrimi.ui.BackdropFade
import dev.crafters.kanstrimi.ui.Badge
import dev.crafters.kanstrimi.ui.CardRow
import dev.crafters.kanstrimi.ui.LoadingPanel
import dev.crafters.kanstrimi.ui.LocalMetrics
import dev.crafters.kanstrimi.ui.LogoOrTitle
import dev.crafters.kanstrimi.ui.RoundAction
import dev.crafters.kanstrimi.ui.RowTitle
import dev.crafters.kanstrimi.ui.StatePanel
import dev.crafters.kanstrimi.ui.theme.Theme
import kotlinx.coroutines.launch

/** Film and series sheet: one screen, seasons and episodes inside it for a series. */
@Composable
fun DetailScreen(id: String) {
    val env = LocalEnvironment.current
    val scope = rememberCoroutineScope()
    val model = remember(id) { DetailModel(id, env) }
    var showVersions by remember { mutableStateOf(false) }
    LaunchedEffect(model) { if (model.card == null) model.load() }

    val card = model.card
    val error = model.error
    when {
        card != null -> DetailContent(model, card, onVersions = { showVersions = true })
        error != null -> StatePanel("Fiche indisponible", error, actionTitle = "Réessayer") { scope.launch { model.load() } }
        else -> LoadingPanel()
    }
    if (showVersions && card != null) {
        VersionSheet(card, onDismiss = { showVersions = false }) { v ->
            showVersions = false
            env.player.play(card.id, versionId = v.id)
        }
    }
}

/** The backdrop melting into the page, the header, the buttons, the seasons, the cast and the related titles. */
@Composable
private fun DetailContent(model: DetailModel, card: Card, onVersions: () -> Unit) {
    val env = LocalEnvironment.current
    val metrics = LocalMetrics.current
    val scope = rememberCoroutineScope()
    Box(modifier = Modifier.fillMaxSize()) {
        if (card.isMatched) {
            Box(modifier = Modifier.fillMaxWidth().height(640.dp)) {
                ArtImage(id = card.id, url = card.backdrop, modifier = Modifier.fillMaxSize())
                Box(modifier = Modifier.fillMaxSize().background(Brush.horizontalGradient(0f to Theme.background.copy(alpha = 0.95f), 0.45f to Theme.background.copy(alpha = 0.55f), 1f to Theme.background.copy(alpha = 0.1f))))
                BackdropFade()
            }
        }
        LazyColumn(contentPadding = PaddingValues(top = metrics.pushedTop + 24.dp, bottom = 80.dp)) {
            item(key = "header") { Header(card, onSaga = { env.navigate(Route.Saga(it.id)) }) }
            item(key = "buttons") { Buttons(model, card, onVersions) }
            if (model.isSeries) {
                item(key = "seasons") { SeasonChips(model, card) }
                val season = model.selectedSeason
                if (season != null) {
                    items(model.episodes(season), key = { it.id }) { e ->
                        Box(modifier = Modifier.padding(horizontal = metrics.inset - 10.dp).padding(bottom = 8.dp)) {
                            EpisodeRow(
                                e, stillWidth = metrics.stillWidth,
                                onClick = { env.player.play(e.id) },
                                onLongClick = { scope.launch { model.setWatched(e.id, e.progress?.isWatched != true) } },
                            )
                        }
                    }
                    item(key = "episodes-gap") { Spacer(modifier = Modifier.height(22.dp)) }
                }
            }
            if (card.isMatched && card.cast.isNotEmpty()) {
                item(key = "cast") {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(bottom = 30.dp)) {
                        RowTitle("Distribution", modifier = Modifier.padding(horizontal = metrics.inset))
                        CastStrip(card.cast, inset = metrics.inset) { env.navigate(Route.Person(it)) }
                    }
                }
            }
            if (card.related.isNotEmpty()) {
                item(key = "related") {
                    CardRow("Titres similaires", card.related, landscape = false, onPlay = { env.player.play(it.id) }, onSelect = { env.open(it.id) })
                }
            }
        }
    }
}

@Composable
private fun Header(card: Card, onSaga: (SagaRef) -> Unit) {
    val metrics = LocalMetrics.current
    val quality = card.maxQuality?.let { q -> card.dynamicRange?.let { "${q.label} ${it.label}" } ?: q.label }
    Column(verticalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.padding(horizontal = metrics.inset).padding(bottom = 30.dp)) {
        Text(card.tagline, color = Theme.accent, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
        LogoOrTitle(title = card.title, logo = card.logo, titleSize = 44, maxLogoWidth = 420, logoHeight = 140)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            card.facts?.takeIf { it.isNotEmpty() }?.let { Text(it, fontSize = 18.sp, color = Theme.secondary) }
            card.certification?.let { Badge(it) }
            card.ratingLabel?.let { Text(it, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = Theme.accent) }
        }
        if (quality != null || card.languages.isNotEmpty()) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                quality?.let { Badge(it) }
                card.languages.forEach { Badge(Language.short(it)) }
            }
        }
        card.saga?.let { s ->
            OutlinedButton(onClick = { onSaga(s) }, colors = ButtonDefaults.outlinedButtonColors(contentColor = Theme.text)) {
                Icon(painterResource(R.drawable.ic_layers), contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text(s.label)
            }
        }
        if (card.isMatched) {
            card.overview?.let {
                Text(it, style = MaterialTheme.typography.bodyLarge, color = Theme.text.copy(alpha = 0.9f), maxLines = 4, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = metrics.textWidth))
            }
            card.director?.let { Text("Réalisation $it", color = Theme.secondary, modifier = Modifier.widthIn(max = metrics.textWidth)) }
        } else {
            NoTmdb()
        }
    }
}

/** A title the server could not match on TMDB: the sheet says what is missing, and that the rest works. */
@Composable
private fun NoTmdb() {
    val metrics = LocalMetrics.current
    Row(
        modifier = Modifier.widthIn(max = metrics.textWidth).background(Theme.surface, RoundedCornerShape(16.dp)).padding(20.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top,
    ) {
        Icon(Icons.Filled.Info, contentDescription = null, tint = Theme.text, modifier = Modifier.padding(top = 2.dp))
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Pas encore de fiche détaillée pour ce titre : ni résumé, ni distribution.", fontWeight = FontWeight.SemiBold)
            Text("La lecture, la reprise et Ma liste fonctionnent normalement.", color = Theme.secondary)
        }
    }
}

/** Lecture, then the round actions: restart, the versions, seen, the trailer, Ma liste. */
@Composable
private fun Buttons(model: DetailModel, card: Card, onVersions: () -> Unit) {
    val env = LocalEnvironment.current
    val metrics = LocalMetrics.current
    val scope = rememberCoroutineScope()
    val uriHandler = LocalUriHandler.current
    Row(
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = metrics.inset).padding(bottom = 30.dp),
        horizontalArrangement = Arrangement.spacedBy(18.dp), verticalAlignment = Alignment.Top,
    ) {
        Button(
            onClick = { model.play() }, enabled = card.versions.isNotEmpty(),
            colors = ButtonDefaults.buttonColors(containerColor = Theme.text, contentColor = Color.Black, disabledContainerColor = Theme.surfaceRaised, disabledContentColor = Theme.secondary),
            contentPadding = PaddingValues(horizontal = 24.dp, vertical = 14.dp), modifier = Modifier.height(52.dp),
        ) {
            Icon(Icons.Filled.PlayArrow, contentDescription = null)
            Spacer(modifier = Modifier.width(6.dp))
            Text(card.playLabel, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
        }
        if (model.canRestart) {
            RoundAction("Depuis le début", onClick = { model.play(fromStart = true) }) { Icon(painterResource(R.drawable.ic_restart), contentDescription = null) }
        }
        if (versionLines(card.versions) > 1) {
            RoundAction("Versions (${card.versions.size})", onClick = onVersions) { Icon(painterResource(R.drawable.ic_versions), contentDescription = null) }
        }
        if (!model.isSeries) {
            val watched = card.progress?.isWatched == true
            RoundAction(if (watched) "Vu" else "Marquer comme vu", onClick = { scope.launch { model.setWatched(watched = !watched) } }) {
                Icon(Icons.Filled.Check, contentDescription = null, tint = if (watched) Theme.accent else Theme.text)
            }
        }
        card.trailer?.let { url ->
            RoundAction("Bande-annonce", onClick = { runCatching { uriHandler.openUri(url) }.onFailure { env.notify("Bande-annonce impossible à ouvrir") } }) {
                Icon(painterResource(R.drawable.ic_movie), contentDescription = null)
            }
        }
        val favorite = model.isFavorite
        RoundAction(if (favorite) "Dans ma liste" else "Ma liste", onClick = { scope.launch { model.toggleFavorite() } }) {
            Icon(if (favorite) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder, contentDescription = null, tint = if (favorite) Theme.accent else Theme.text)
        }
    }
}

/** One chip per season; the selected one is amber. */
@Composable
private fun SeasonChips(model: DetailModel, card: Card) {
    val metrics = LocalMetrics.current
    Row(
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = metrics.inset).padding(bottom = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        (card.seasons ?: emptyList()).forEach { s ->
            val on = model.selectedSeason == s.number
            FilterChip(
                selected = on,
                onClick = { model.selectedSeason = s.number },
                label = { Text(s.title ?: "Saison ${s.number}", style = MaterialTheme.typography.labelLarge) },
                colors = FilterChipDefaults.filterChipColors(containerColor = Theme.surface, labelColor = Theme.text, selectedContainerColor = Theme.accent, selectedLabelColor = Color.Black),
                border = FilterChipDefaults.filterChipBorder(enabled = true, selected = on, borderColor = Color.Transparent, selectedBorderColor = Color.Transparent),
            )
        }
    }
}
