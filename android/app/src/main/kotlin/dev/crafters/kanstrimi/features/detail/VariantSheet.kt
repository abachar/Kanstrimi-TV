package dev.crafters.kanstrimi.features.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import dev.crafters.kanstrimi.contract.Card
import dev.crafters.kanstrimi.contract.ContentKind
import dev.crafters.kanstrimi.contract.Variant
import dev.crafters.kanstrimi.contract.mixLanguages
import dev.crafters.kanstrimi.ui.VariantLine
import dev.crafters.kanstrimi.ui.theme.Theme

/**
 * The sheet behind « Variantes »: the title's variants in the server's order, one row each (`VariantLine`). A movie's
 * row plays it at once; a series' own variants play nothing: the one picked is the series', for every episode.
 * `selectedId`: the variant the title starts in, checked.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VariantSheet(card: Card, selectedId: String?, onDismiss: () -> Unit, onPick: (Variant) -> Unit) {
    val amongLanguages = card.variants.mixLanguages
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
            card.variants.forEach { variant ->
                Row(
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { onPick(variant) }.background(Theme.surface).padding(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(18.dp), verticalAlignment = Alignment.CenterVertically,
                ) {
                    VariantLine(variant, amongLanguages, modifier = Modifier.weight(1f))
                    if (variant.id == selectedId) Icon(Icons.Filled.Check, contentDescription = "Variante choisie", tint = Theme.accent)
                }
            }
        }
    }
}
