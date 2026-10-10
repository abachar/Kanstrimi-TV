package dev.crafters.kanstrimi.features.detail

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.crafters.kanstrimi.app.PersonRef
import dev.crafters.kanstrimi.app.ref
import dev.crafters.kanstrimi.contract.Person
import dev.crafters.kanstrimi.ui.CastCell
import dev.crafters.kanstrimi.ui.LocalMetrics

/**
 * Round photos with name and role, scrolling sideways: the sheet's « Distribution » (and the player's panel, later).
 * An actor with an `id` opens their screen; one without is the same cell, not clickable. `inset`: the margin inside the scroll.
 */
@Composable
fun CastStrip(cast: List<Person>, inset: Dp, onSelect: (PersonRef) -> Unit) {
    val metrics = LocalMetrics.current
    LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(horizontal = inset)) {
        itemsIndexed(cast, key = { i, p -> "$i:${p.name}" }) { _, person ->
            CastCell(person, width = metrics.castCell, photo = metrics.castPhoto, onClick = person.ref?.let { r -> { onSelect(r) } })
        }
    }
}
