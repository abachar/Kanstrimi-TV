package dev.crafters.kanstrimi.features.detail

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import dev.crafters.kanstrimi.contract.Card
import dev.crafters.kanstrimi.contract.ContentKind
import dev.crafters.kanstrimi.contract.Variant
import dev.crafters.kanstrimi.ui.VariantList
import dev.crafters.kanstrimi.ui.VariantMarks
import dev.crafters.kanstrimi.ui.theme.Theme

/**
 * The sheet behind « Variantes », like the Apple app's `VariantPicker`: the title's variants (`VariantList`, a
 * heading per language), the one Lecture would play badged (`recommendedId`), those that failed here lately marked.
 * A movie's row plays it at once; a series' own variants play nothing (« Variante de la série »): the one picked is
 * the series', for every episode.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VariantSheet(card: Card, recommendedId: String?, isFailed: (String) -> Boolean, onDismiss: () -> Unit, onPick: (Variant) -> Unit) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
        contentColor = Theme.text,
    ) {
        Column(
            modifier = Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 28.dp).padding(bottom = 40.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(if (card.kind == ContentKind.SERIES) "Variante de la série" else "Choisir une variante", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Text(card.title, color = Theme.secondary, modifier = Modifier.padding(bottom = 8.dp))
            VariantList(card.variants, marks = { VariantMarks(failed = isFailed(it.id), recommended = it.id == recommendedId) }, onPick = onPick)
        }
    }
}
