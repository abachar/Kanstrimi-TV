package dev.crafters.kanstrimi.app

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import dev.crafters.kanstrimi.contract.CatalogRow
import dev.crafters.kanstrimi.contract.ContentKind
import dev.crafters.kanstrimi.contract.Person
import dev.crafters.kanstrimi.contract.Studio as StudioHub

/** An actor as a screen opens them: the sheet, loaded there, carries the rest. */
data class PersonRef(val id: String, val name: String, val photo: String?)

/** The actor's reference when the server linked them to their titles, null otherwise. */
val Person.ref: PersonRef? get() = id?.let { PersonRef(it, name, photo) }

/** Where a tab's stack can go, like the Apple app's `Route`: every one is a screen pushed above the tab. */
sealed class Route {
    data class Detail(val id: String) : Route()
    data class Genre(val kind: ContentKind, val row: CatalogRow) : Route()
    data class Studio(val kind: ContentKind, val studio: StudioHub) : Route()
    data class Saga(val id: String) : Route()
    data object Sagas : Route()
    data class Person(val ref: PersonRef) : Route()
}

/**
 * One stack of routes per tab, held in snapshot state: `MainTabs` draws the top of the selected tab's stack, the
 * system Back pops it. Kept here rather than in a composable so that the debug hooks and any screen can push.
 */
class Navigator(initialTab: String = "home") {
    var tab: String by mutableStateOf(initialTab)
        private set
    private val stacks = mutableStateMapOf<String, List<Route>>()

    fun stack(tab: String): List<Route> = stacks[tab] ?: emptyList()

    fun select(tab: String) {
        this.tab = tab
    }

    /** Pushes above the selected tab. */
    fun push(route: Route) {
        stacks[tab] = stack(tab) + route
    }

    fun pop() {
        val s = stack(tab)
        if (s.isNotEmpty()) stacks[tab] = s.dropLast(1)
    }
}
