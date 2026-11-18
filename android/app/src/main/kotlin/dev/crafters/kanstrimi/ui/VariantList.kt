package dev.crafters.kanstrimi.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.crafters.kanstrimi.contract.Language
import dev.crafters.kanstrimi.contract.Variant
import dev.crafters.kanstrimi.contract.mixLanguages
import dev.crafters.kanstrimi.ui.theme.Theme

// How the variants of a title are listed, like the Apple app's `VariantList`: the sheet, the failure dialog, the player's side list.

/**
 * What a list knows of a variant besides itself: the one playing, one that failed on this device lately, the one
 * Lecture would play.
 */
data class VariantMarks(val playing: Boolean = false, val failed: Boolean = false, val recommended: Boolean = false)

/**
 * The variants of a title as a list, in the order given (the server's), one row each. A title in several languages
 * has a heading per language (« Français », « VOSTF »), or names the language on each row (`inline`, for a short
 * list); a title in one language does not say it. `severalLanguages` is the title's, when the list is only a part
 * of its variants. `nameLines`: how many lines a name may take where the list is narrow. `shownId`: the variant the
 * list opens on, scrolled into view.
 */
@Composable
fun VariantList(
    variants: List<Variant>,
    modifier: Modifier = Modifier,
    marks: (Variant) -> VariantMarks = { VariantMarks() },
    inline: Boolean = false,
    severalLanguages: Boolean = variants.mixLanguages,
    nameLines: Int = 1,
    shownId: String? = null,
    onPick: (Variant) -> Unit,
) {
    val shown = remember { BringIntoViewRequester() }
    LaunchedEffect(Unit) { if (shownId != null) shown.bringIntoView() }
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        variants.map { it.language }.distinct().forEach { language ->
            if (severalLanguages && !inline) {
                Text(Language.label(language), style = MaterialTheme.typography.titleSmall, color = Theme.secondary, modifier = Modifier.padding(top = 6.dp))
            }
            variants.filter { it.language == language }.forEach { v ->
                VariantRow(
                    v, modifier = if (v.id == shownId) Modifier.bringIntoViewRequester(shown) else Modifier,
                    marks = marks(v), showsLanguage = severalLanguages && inline, nameLines = nameLines,
                ) { onPick(v) }
            }
        }
    }
}

/**
 * One row of `VariantList`: the quality in a column of its own (after the language when `showsLanguage`), the
 * provider's own name of the stream over « edition · provider · category », then the marks: « EN ÉCHEC »,
 * « RECOMMANDÉ », a tick for the one playing. A narrow list (`nameLines` above one) puts the first two under the
 * name, which keeps the width.
 */
@Composable
fun VariantRow(
    variant: Variant,
    modifier: Modifier = Modifier,
    marks: VariantMarks = VariantMarks(),
    showsLanguage: Boolean = false,
    nameLines: Int = 1,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(12.dp)
    val narrow = nameLines > 1
    val tags: @Composable () -> Unit = {
        if (marks.failed) FailedLabel()
        if (marks.recommended) AccentTag("RECOMMANDÉ")
    }
    Row(
        modifier = modifier.fillMaxWidth().clip(shape).background(Theme.surface, shape).clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            if (showsLanguage) "${Language.short(variant.language)} · ${variant.badge}" else variant.badge,
            style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 1,
            modifier = Modifier.width(if (showsLanguage) 150.dp else 84.dp),
        )
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(variant.name, style = MaterialTheme.typography.bodyLarge, maxLines = nameLines, overflow = TextOverflow.Ellipsis)
            Text(
                listOfNotNull(variant.edition, variant.provider.name, variant.category).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall, color = Theme.secondary, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            if (narrow && (marks.failed || marks.recommended)) {
                Row(modifier = Modifier.padding(top = 2.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) { tags() }
            }
        }
        if (!narrow) tags()
        if (marks.playing) Icon(Icons.Filled.Check, contentDescription = "En cours", tint = Theme.text)
    }
}
