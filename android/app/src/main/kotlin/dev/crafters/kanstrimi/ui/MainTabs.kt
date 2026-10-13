package dev.crafters.kanstrimi.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteDefaults
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.layout
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import dev.crafters.kanstrimi.features.profiles.Avatar
import dev.crafters.kanstrimi.features.profiles.ProfilesScreen
import dev.crafters.kanstrimi.R
import dev.crafters.kanstrimi.app.LocalEnvironment
import dev.crafters.kanstrimi.app.Route
import dev.crafters.kanstrimi.features.catalog.CatalogScreen
import dev.crafters.kanstrimi.features.catalog.GenreGridScreen
import dev.crafters.kanstrimi.features.catalog.PersonScreen
import dev.crafters.kanstrimi.features.catalog.SagaScreen
import dev.crafters.kanstrimi.features.catalog.SagasGridScreen
import dev.crafters.kanstrimi.features.catalog.StudioGridScreen
import dev.crafters.kanstrimi.features.detail.DetailScreen
import dev.crafters.kanstrimi.features.home.HomeScreen
import dev.crafters.kanstrimi.features.live.LiveScreen
import dev.crafters.kanstrimi.features.search.SearchScreen
import dev.crafters.kanstrimi.features.settings.SettingsScreen
import dev.crafters.kanstrimi.contract.ContentKind
import dev.crafters.kanstrimi.ui.theme.Theme

/**
 * The seven tabs, Profil first: the person's picture alone, no name. Material's suite puts them in a rail on the side
 * when the window is wide, in a bar at the bottom when narrow.
 */
enum class MainTab(val key: String, val title: String, val icon: ImageVector? = null, val drawable: Int? = null) {
    PROFILE("profile", "Profil"),
    HOME("home", "Accueil", icon = Icons.Filled.Home),
    LIVE("live", "Direct", drawable = R.drawable.ic_live_tv),
    MOVIES("movies", "Films", drawable = R.drawable.ic_movie),
    SERIES("series", "Séries", drawable = R.drawable.ic_video_library),
    SEARCH("search", "Recherche", icon = Icons.Filled.Search),
    SETTINGS("settings", "Réglages", icon = Icons.Filled.Settings);

    companion object {
        fun of(key: String?): MainTab = entries.firstOrNull { it.key == key } ?: HOME
    }
}

/**
 * The tabs and, above each, its stack of pushed screens (`Navigator`). A tab once visited stays composed, hidden
 * when another is selected, so that its rows, scroll and stack are there again when it comes back; the screens
 * under the top of a stack stay the same way.
 */
@Composable
fun MainTabs() {
    val env = LocalEnvironment.current
    val selected = MainTab.of(env.navigator.tab)
    // Not snapshot state: the composition reads `selected`, which is, and the set only grows.
    val visited = remember { linkedSetOf<MainTab>() }
    visited.add(selected)
    val profiles by env.profiles.collectAsState()
    val profileId by env.device.profileId.collectAsState()
    val profile = profiles.firstOrNull { it.id == profileId }
    NavigationSuiteScaffold(
        navigationSuiteItems = {
            MainTab.entries.forEach { tab ->
                if (tab == MainTab.PROFILE) {
                    item(
                        selected = tab == selected,
                        onClick = { env.navigator.select(tab.key) },
                        icon = {
                            if (profile != null) Avatar(profile, 30.dp, Modifier.semantics { contentDescription = "Profil ${profile.name}" })
                            else Icon(Icons.Filled.AccountCircle, contentDescription = "Profil")
                        },
                    )
                } else {
                    item(
                        selected = tab == selected,
                        onClick = { env.navigator.select(tab.key) },
                        icon = { if (tab.icon != null) Icon(tab.icon, contentDescription = null) else Icon(painterResource(tab.drawable!!), contentDescription = null) },
                        label = { Text(tab.title) },
                    )
                }
            }
        },
        containerColor = Theme.background,
        navigationSuiteColors = NavigationSuiteDefaults.colors(
            navigationBarContainerColor = Theme.background,
            navigationRailContainerColor = Theme.background,
            navigationDrawerContainerColor = Theme.background,
        ),
    ) {
        ProvideMetrics {
            Box(modifier = Modifier.fillMaxSize()) {
                MainTab.entries.filter { it in visited }.forEach { tab ->
                    key(tab) { Hidden(tab != selected) { TabStack(tab, active = tab == selected) } }
                }
            }
        }
    }
}

/** A tab's root screen and the screens pushed above it; Back pops the top one while the tab is the selected one. */
@Composable
private fun TabStack(tab: MainTab, active: Boolean) {
    val env = LocalEnvironment.current
    val stack = env.navigator.stack(tab.key)
    BackHandler(enabled = active && stack.isNotEmpty()) { env.navigator.pop() }
    Box(modifier = Modifier.fillMaxSize()) {
        Hidden(stack.isNotEmpty()) { TabRoot(tab) }
        stack.forEachIndexed { index, route ->
            key(index, route) {
                Hidden(index != stack.lastIndex) {
                    Box(modifier = Modifier.fillMaxSize()) {
                        RouteScreen(route)
                        BackButton(onClick = { env.navigator.pop() })
                    }
                }
            }
        }
    }
}

@Composable
private fun TabRoot(tab: MainTab) {
    when (tab) {
        MainTab.PROFILE -> ProfilesScreen()
        MainTab.HOME -> HomeScreen()
        MainTab.LIVE -> LiveScreen()
        MainTab.MOVIES -> CatalogScreen(ContentKind.MOVIE)
        MainTab.SERIES -> CatalogScreen(ContentKind.SERIES)
        MainTab.SEARCH -> SearchScreen()
        MainTab.SETTINGS -> SettingsScreen()
    }
}

/** The screen a route resolves to. */
@Composable
private fun RouteScreen(route: Route) {
    when (route) {
        is Route.Detail -> DetailScreen(route.id)
        is Route.Genre -> GenreGridScreen(route.kind, route.row)
        is Route.Studio -> StudioGridScreen(route.kind, route.studio)
        is Route.Saga -> SagaScreen(route.id)
        Route.Sagas -> SagasGridScreen()
        is Route.Person -> PersonScreen(route.ref)
    }
}

/**
 * Keeps `content` composed but, when `hidden`, neither measured, drawn nor touchable: a screen under another one
 * keeps its loaded data and its scroll without costing a layout.
 */
@Composable
private fun Hidden(hidden: Boolean, content: @Composable () -> Unit) {
    Box(
        modifier = Modifier.fillMaxSize().layout { measurable, constraints ->
            if (hidden) {
                layout(0, 0) {}
            } else {
                val placeable = measurable.measure(constraints)
                layout(placeable.width, placeable.height) { placeable.place(0, 0) }
            }
        },
    ) { content() }
}
