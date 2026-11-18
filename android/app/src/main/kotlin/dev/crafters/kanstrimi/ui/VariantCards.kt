package dev.crafters.kanstrimi.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.crafters.kanstrimi.contract.Language
import dev.crafters.kanstrimi.contract.Variant
import dev.crafters.kanstrimi.contract.mixLanguages
import dev.crafters.kanstrimi.ui.theme.Theme

// How a variant is drawn, like the Apple app's `VariantCard`: a card in the player's strip, a row in the lists.

/**
 * What a list knows of a variant besides itself: the one playing, one that failed on this device lately, the one
 * Lecture would play.
 */
data class VariantMarks(val playing: Boolean = false, val failed: Boolean = false, val recommended: Boolean = false)

/**
 * A variant as a card, in the sizes of a channel card of « Récentes »: the provider's own name of the stream
 * (`nameLines` kept: two for a movie or an episode, whose names are long and differ by their end), « EN COURS » or
 * « EN ÉCHEC », then its provider and category, its language when the title comes in several, and its quality.
 */
@Composable
fun VariantCard(
    variant: Variant,
    modifier: Modifier = Modifier,
    marks: VariantMarks = VariantMarks(),
    showsLanguage: Boolean = false,
    nameLines: Int = 1,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(14.dp)
    Column(
        modifier = modifier.clip(shape).background(if (marks.playing) Theme.surfaceRaised else Theme.surface, shape).clickable(onClick = onClick).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(variant.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, minLines = nameLines, maxLines = nameLines, overflow = TextOverflow.Ellipsis)
            // The mark's line is kept when there is none: every card of a strip is as tall.
            when {
                marks.playing -> OnAirLabel()
                marks.failed -> FailedLabel()
                else -> Box(modifier = Modifier.alpha(0f)) { OnAirLabel() }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.Bottom) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(listOfNotNull(variant.provider.name, variant.edition).joinToString(" · "), style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(variant.category ?: " ", style = MaterialTheme.typography.bodySmall, color = Theme.secondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (showsLanguage) Badge(Language.short(variant.language))
            Badge(variant.badge)
        }
    }
}

/**
 * The variants of a title as a list, in the order given (the server's), one row each. A title in several languages
 * has a heading per language (« Français », « VOSTF »), or names the language on each row (`inline`, for a short
 * list); a title in one language does not say it. `severalLanguages` is the title's, when the list is only a part
 * of its variants.
 */
@Composable
fun VariantList(
    variants: List<Variant>,
    modifier: Modifier = Modifier,
    marks: (Variant) -> VariantMarks = { VariantMarks() },
    inline: Boolean = false,
    severalLanguages: Boolean = variants.mixLanguages,
    onPick: (Variant) -> Unit,
) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        variants.map { it.language }.distinct().forEach { language ->
            if (severalLanguages && !inline) {
                Text(Language.label(language), style = MaterialTheme.typography.titleSmall, color = Theme.secondary, modifier = Modifier.padding(top = 6.dp))
            }
            variants.filter { it.language == language }.forEach { v ->
                VariantRow(v, marks(v), showsLanguage = severalLanguages && inline) { onPick(v) }
            }
        }
    }
}

/**
 * One row of `VariantList`: the quality in a column of its own (after the language when `showsLanguage`), the
 * provider's own name of the stream over « edition · provider · category », then the marks: « EN ÉCHEC »,
 * « RECOMMANDÉ », a tick for the one playing.
 */
@Composable
fun VariantRow(variant: Variant, marks: VariantMarks = VariantMarks(), showsLanguage: Boolean = false, onClick: () -> Unit) {
    val shape = RoundedCornerShape(12.dp)
    Row(
        modifier = Modifier.fillMaxWidth().clip(shape).background(Theme.surface, shape).clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            if (showsLanguage) "${Language.short(variant.language)} · ${variant.badge}" else variant.badge,
            style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 1,
            modifier = Modifier.width(if (showsLanguage) 150.dp else 84.dp),
        )
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(variant.name, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                listOfNotNull(variant.edition, variant.provider.name, variant.category).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall, color = Theme.secondary, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        if (marks.failed) FailedLabel()
        if (marks.recommended) AccentTag("RECOMMANDÉ")
        if (marks.playing) Icon(Icons.Filled.Check, contentDescription = "En cours", tint = Theme.text)
    }
}
