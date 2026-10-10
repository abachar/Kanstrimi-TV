package dev.crafters.kanstrimi.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteDefaults
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import dev.crafters.kanstrimi.R
import dev.crafters.kanstrimi.features.home.HomeScreen
import dev.crafters.kanstrimi.features.settings.SettingsScreen
import dev.crafters.kanstrimi.ui.theme.Theme

/** The six tabs. Material's suite puts them in a rail on the side when the window is wide, in a bar at the bottom when narrow. */
enum class MainTab(val key: String, val title: String, val icon: ImageVector? = null, val drawable: Int? = null) {
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

@Composable
fun MainTabs(initialTab: String? = null) {
    var selected by rememberSaveable { mutableStateOf(MainTab.of(initialTab)) }
    NavigationSuiteScaffold(
        navigationSuiteItems = {
            MainTab.entries.forEach { tab ->
                item(
                    selected = tab == selected,
                    onClick = { selected = tab },
                    icon = { if (tab.icon != null) Icon(tab.icon, contentDescription = null) else Icon(painterResource(tab.drawable!!), contentDescription = null) },
                    label = { Text(tab.title) },
                )
            }
        },
        containerColor = Theme.background,
        navigationSuiteColors = NavigationSuiteDefaults.colors(
            navigationBarContainerColor = Theme.background,
            navigationRailContainerColor = Theme.background,
            navigationDrawerContainerColor = Theme.background,
        ),
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            when (selected) {
                MainTab.HOME -> HomeScreen()
                MainTab.SETTINGS -> SettingsScreen()
                else -> ComingSoon(selected.title)
            }
        }
    }
}
