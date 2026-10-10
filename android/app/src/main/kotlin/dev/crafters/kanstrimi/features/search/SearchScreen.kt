package dev.crafters.kanstrimi.features.search

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import dev.crafters.kanstrimi.app.LocalEnvironment
import dev.crafters.kanstrimi.client.CatalogException
import dev.crafters.kanstrimi.contract.ContentKind
import dev.crafters.kanstrimi.contract.SearchResults
import dev.crafters.kanstrimi.ui.LoadingPanel
import dev.crafters.kanstrimi.ui.LocalMetrics
import dev.crafters.kanstrimi.ui.MenuPoster
import dev.crafters.kanstrimi.ui.StatePanel
import dev.crafters.kanstrimi.ui.theme.Theme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * A field always at the top, then one grid of posters, films, series and channels mixed, the most relevant first:
 * the server ranks them. 300 ms without a keystroke, then the search; a new keystroke cancels the previous one.
 */
@Composable
fun SearchScreen() {
    val env = LocalEnvironment.current
    val metrics = LocalMetrics.current
    // `debug.search` (MainActivity): read once, the screen is built after the hooks ran.
    var text by rememberSaveable { mutableStateOf(env.debugSearch?.also { env.debugSearch = null } ?: "") }
    var results by remember { mutableStateOf<SearchResults?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var attempt by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    val query = text.trim()

    LaunchedEffect(query, attempt) {
        if (query.isEmpty()) {
            results = null
            error = null
            return@LaunchedEffect
        }
        delay(300)
        try {
            results = env.client.search(query)
            error = null
        } catch (e: CatalogException) {
            error = e.message
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        SearchField(text, onChange = { text = it }, modifier = Modifier.statusBarsPadding().padding(horizontal = metrics.inset).padding(top = 12.dp, bottom = 8.dp))
        val r = results
        when {
            query.isEmpty() -> StatePanel("Rechercher", "Un titre, un acteur ou un réalisateur. La recherche couvre films, séries et chaînes.")
            error != null -> StatePanel("Recherche impossible", error ?: "", actionTitle = "Réessayer") { attempt++ }
            r != null && r.query == query && r.items.isEmpty() ->
                StatePanel("Aucun résultat pour « $query »", "Essayez un autre titre, un nom d'acteur ou de réalisateur. La recherche couvre films, séries et chaînes.")
            r != null && r.query == query -> LazyVerticalGrid(
                columns = GridCells.Fixed(metrics.columns),
                contentPadding = PaddingValues(start = metrics.inset, end = metrics.inset, top = 16.dp, bottom = 60.dp),
                horizontalArrangement = Arrangement.spacedBy(metrics.spacing),
                verticalArrangement = Arrangement.spacedBy(metrics.spacing),
            ) {
                items(r.items, key = { it.id }) { item ->
                    // A channel plays at once; anything else opens its sheet.
                    MenuPoster(
                        item, width = metrics.posterWidth,
                        onOpen = { if (item.kind == ContentKind.LIVE) scope.launch { env.watchChannel(item.id) } else env.open(item.id) },
                        onPlay = { env.player.play(item.id) },
                    )
                }
            }
            else -> LoadingPanel()
        }
    }
}

/** The search field: a rounded translucent bar, the glass on the left, a cross that clears it on the right. */
@Composable
private fun SearchField(text: String, onChange: (String) -> Unit, modifier: Modifier = Modifier) {
    val focus = LocalFocusManager.current
    TextField(
        value = text,
        onValueChange = onChange,
        modifier = modifier.fillMaxWidth(),
        singleLine = true,
        placeholder = { Text("Titre, acteur, réalisateur", color = Theme.secondary) },
        leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null, tint = Theme.secondary) },
        trailingIcon = if (text.isNotEmpty()) ({
            IconButton(onClick = { onChange("") }) { Icon(Icons.Filled.Close, contentDescription = "Effacer", tint = Theme.secondary) }
        }) else null,
        shape = RoundedCornerShape(14.dp),
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
        keyboardActions = KeyboardActions(onSearch = { focus.clearFocus() }),
        colors = TextFieldDefaults.colors(
            focusedContainerColor = Theme.surface, unfocusedContainerColor = Theme.surface,
            focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent,
            cursorColor = Theme.accent, focusedTextColor = Theme.text, unfocusedTextColor = Theme.text,
        ),
    )
}
