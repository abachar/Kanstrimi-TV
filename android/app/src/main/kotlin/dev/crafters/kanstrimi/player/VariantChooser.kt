package dev.crafters.kanstrimi.player

import dev.crafters.kanstrimi.contract.DynamicRange
import dev.crafters.kanstrimi.contract.Language
import dev.crafters.kanstrimi.contract.Quality
import dev.crafters.kanstrimi.contract.RememberedVariant
import dev.crafters.kanstrimi.contract.Variant

/**
 * What makes two variants the same to watch: the language, the quality, the dynamic range and the cut. Variants of
 * the same key differ by the provider's stream only: they are « equivalent », one stands in for the other.
 */
data class VariantKey(val language: String, val quality: Quality, val dynamicRange: DynamicRange?, val edition: String?) {
    constructor(variant: Variant) : this(variant.language, variant.quality, variant.dynamicRange, variant.edition)
    constructor(remembered: RememberedVariant) : this(remembered.language, remembered.quality, remembered.dynamicRange, remembered.edition)
}

/**
 * Picks the variant « Lecture » will play, without asking, like the Apple app's `VariantChooser`. The server sends
 * the variants in the order they are listed and tried (the profile's languages, the usual cut before an edition,
 * descending quality then dynamic range, the providers in the order of preference): the chooser never reorders them.
 * Order: the choice remembered for the title › the only variant › the best of the first language. Only the
 * variants that play count (a series' own, on its sheet, have no stream). A recently failed variant gives way to an
 * equivalent one. An edition (« Version longue ») is never the automatic choice while the usual cut exists.
 */
class VariantChooser(
    /** The profile's quality ceiling. */
    val maxQuality: Quality,
    val capabilities: Capabilities = Capabilities.tablet,
    val isFailed: (String) -> Boolean = { false },
) {
    /** What the screen and the decoders take: the Galaxy Tab S9 shows FHD, HDR10+ yes, no Dolby Vision. */
    data class Capabilities(val maxQuality: Quality = Quality.FHD, val supportsHdr: Boolean = true, val supportsDolbyVision: Boolean = false) {
        companion object {
            val tablet = Capabilities()
        }
    }

    /**
     * The variant a title starts in. `remembered` (the profile's choice, nothing when its setting is off): that very
     * variant when it is listed; else the first of the same language × quality × dynamic range × edition, else the
     * best of its language (its edition first). Without a choice: the only variant, else the best of the first
     * language in the server's order.
     */
    fun start(variants: List<Variant>, remembered: RememberedVariant? = null): Variant? {
        val playable = variants.filter { it.isPlayable }
        if (playable.isEmpty()) return null
        if (remembered != null) {
            playable.firstOrNull { it.id == remembered.id }?.let { return it }
            val key = VariantKey(remembered)
            working(playable.filter { VariantKey(it) == key })?.let { return it }
            val sameLanguage = playable.filter { it.language == remembered.language }
            (best(sameLanguage.filter { it.edition == remembered.edition }) ?: best(sameLanguage))?.let { return it }
        }
        if (playable.size == 1) return playable[0]
        // `best` always finds one in a language that has variants: the first language of the server's order wins.
        return best(playable.filter { it.language == playable[0].language })
    }

    /** The variants that stand in for `variant`, itself included: same language × quality × dynamic range × edition, in the server's order. */
    fun equivalents(variant: Variant, variants: List<Variant>): List<Variant> {
        val key = VariantKey(variant)
        return variants.filter { it.isPlayable && VariantKey(it) == key }
    }

    /** The equivalent tried after `failed`, for the automatic switch: the next one that has not failed recently, around the end of their list; null when none is left. */
    fun next(failed: Variant, variants: List<Variant>): Variant? {
        val same = equivalents(failed, variants)
        val idx = same.indexOfFirst { it.id == failed.id }
        val after = if (idx < 0) same else same.drop(idx + 1) + same.take(idx)
        return after.firstOrNull { it.id != failed.id && !isFailed(it.id) }
    }

    /** Every other variant that plays, in the server's order: what the failure dialog offers. */
    fun alternatives(current: Variant, variants: List<Variant>): List<Variant> = variants.filter { it.isPlayable && it.id != current.id }

    // MARK: - Internals

    /** Within the profile's ceiling and what this device shows and decodes. */
    private fun fits(v: Variant): Boolean {
        if (v.quality > maxQuality || v.quality > capabilities.maxQuality) return false
        return when (v.dynamicRange) {
            DynamicRange.DOLBY_VISION -> capabilities.supportsDolbyVision
            DynamicRange.HDR -> capabilities.supportsHdr
            null -> true
        }
    }

    /** Among equivalent variants in the server's order: the first that has not failed recently, else the first anyway. */
    private fun working(same: List<Variant>): Variant? = same.firstOrNull { !isFailed(it.id) } ?: same.firstOrNull()

    /**
     * The best of these variants: the usual cut only, when there is one; the highest quality that fits, then the
     * highest dynamic range; when nothing fits, the lowest quality and the plainest picture. Among the providers
     * that carry it, the first that has not failed recently.
     */
    private fun best(all: List<Variant>): Variant? {
        val candidates = all.filter { it.edition == null }.ifEmpty { all }
        if (candidates.isEmpty()) return null
        val byPicture = compareBy<Variant> { it.quality }.thenBy { it.dynamicRange?.ordinal ?: -1 }
        val fitting = candidates.filter(::fits)
        val pool = fitting.ifEmpty { candidates }
        val top = if (fitting.isEmpty()) pool.minWith(byPicture) else pool.maxWith(byPicture)
        return working(pool.filter { it.quality == top.quality && it.dynamicRange == top.dynamicRange })
    }

    companion object {
        /** The one warning for an episode missing in the language in use, as the Apple app words it. */
        fun languageWarning(episode: Int, alternative: String, current: String, returnsAt: Int? = null): String {
            val back = returnsAt?.let { ", retour en ${Language.short(current)} à l'épisode $it" } ?: "."
            return "É$episode n'existe qu'en ${Language.short(alternative)} : lecture en ${Language.short(alternative)}$back"
        }
    }
}
