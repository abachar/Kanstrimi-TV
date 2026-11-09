package dev.crafters.kanstrimi.features.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
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
import dev.crafters.kanstrimi.contract.Source
import dev.crafters.kanstrimi.contract.SourceLine
import dev.crafters.kanstrimi.contract.Version
import dev.crafters.kanstrimi.ui.theme.Theme

/** How many lines the picker shows for these versions (one per source): with one, there is nothing to choose. */
fun versionLines(versions: List<Version>): Int = versions.sumOf { maxOf(1, it.sources.size) }

/**
 * The sheet behind « Versions »: the copies grouped by provider in the order of preference (`SourceLine.grouped`),
 * one row each (« FR · 4K DV · LIGHT »), which plays it at once; a series' versions carry no sources, one row per
 * version then. The engine's own choice stays the default: nothing is remembered.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VersionSheet(card: Card, onDismiss: () -> Unit, onPick: (Version, Source?) -> Unit) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
        contentColor = Theme.text,
    ) {
        Column(modifier = Modifier.padding(horizontal = 28.dp).padding(bottom = 40.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text("Choisir une version", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Text(card.title, color = Theme.secondary, modifier = Modifier.padding(bottom = 8.dp))
            SourceLine.grouped(card.versions).forEach { (provider, lines) ->
                provider?.let { Text(it, style = MaterialTheme.typography.titleSmall, color = Theme.secondary, modifier = Modifier.padding(top = 6.dp)) }
                lines.forEach { line ->
                    Row(
                        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { onPick(line.version, line.source) }.background(Theme.surface).padding(16.dp),
                        horizontalArrangement = Arrangement.spacedBy(18.dp), verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(line.text, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}
