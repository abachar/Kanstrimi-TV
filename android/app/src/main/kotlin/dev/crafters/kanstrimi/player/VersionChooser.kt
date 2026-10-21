package dev.crafters.kanstrimi.player

import dev.crafters.kanstrimi.contract.DynamicRange
import dev.crafters.kanstrimi.contract.Language
import dev.crafters.kanstrimi.contract.Quality
import dev.crafters.kanstrimi.contract.RememberedVersion
import dev.crafters.kanstrimi.contract.Source
import dev.crafters.kanstrimi.contract.Version

/**
 * Picks the version and source « Lecture » will play, without asking, like the Apple app's `VersionChooser`.
 * Order: the choice remembered for this title › the series' language › the preferences (language order, quality
 * ceiling) › the tablet's capabilities › the server's order. A recently failed source is skipped. An edition
 * (« Version longue ») is never the automatic choice while the usual cut exists: it plays when picked.
 */
class VersionChooser(
    val languageOrder: List<String>,
    val maxQuality: Quality,
    val capabilities: Capabilities = Capabilities.tablet,
    val isSourceFailed: (String) -> Boolean = { false },
) {
    /** What the screen and the decoders take: the Galaxy Tab S9 shows FHD, HDR10+ yes, no Dolby Vision. */
    data class Capabilities(val maxQuality: Quality = Quality.FHD, val supportsHdr: Boolean = true, val supportsDolbyVision: Boolean = false) {
        companion object {
            val tablet = Capabilities()
        }
    }

    enum class Reason { REMEMBERED, SERIES_LANGUAGE, PREFERENCES, FALLBACK_LANGUAGE, ONLY_ONE }

    data class Choice(val version: Version, val source: Source, val reason: Reason)

    /**
     * @param remembered the version id chosen for this title, played again as is when still listed.
     * @param seriesChoice the language × quality chosen for the title (the series of an episode): the closest version.
     */
    fun choose(versions: List<Version>, remembered: String? = null, seriesChoice: VersionChoiceKey? = null): Choice? {
        val playable = versions.filter { it.sources.isNotEmpty() }
        if (playable.isEmpty()) return null

        if (remembered != null) {
            playable.firstOrNull { it.id == remembered }?.let { v -> bestSource(v)?.let { return Choice(v, it, Reason.REMEMBERED) } }
        }
        if (seriesChoice != null) {
            // The exact match first, then the same language (and edition) at the best allowed quality.
            playable.firstOrNull { VersionChoiceKey(it) == seriesChoice }?.let { v -> bestSource(v)?.let { return Choice(v, it, Reason.SERIES_LANGUAGE) } }
            val sameLanguage = playable.filter { it.language == seriesChoice.language }
            val v = best(sameLanguage.filter { it.edition == seriesChoice.edition }) ?: best(sameLanguage)
            if (v != null) bestSource(v)?.let { return Choice(v, it, Reason.SERIES_LANGUAGE) }
        }
        if (playable.size == 1) bestSource(playable[0])?.let { return Choice(playable[0], it, Reason.ONLY_ONE) }
        for (language in languageOrder.ifEmpty { playable.map { it.language }.distinct() }) {
            val v = best(playable.filter { it.language == language }) ?: continue
            bestSource(v)?.let { return Choice(v, it, Reason.PREFERENCES) }
        }
        // No preferred language: the first of the server's order, within the capabilities if possible.
        val candidate = best(playable, respectingServerOrder = true) ?: playable[0]
        val source = bestSource(candidate) ?: return null
        return Choice(candidate, source, Reason.FALLBACK_LANGUAGE)
    }

    /**
     * The version a title starts in: the one the profile chose for it (the server keeps it, nothing when its setting is
     * off), exactly when still listed, else the same language at the best quality (an episode without it), else the best.
     */
    fun start(versions: List<Version>, remembered: RememberedVersion?): Choice? =
        choose(versions, remembered?.id, remembered?.let(::VersionChoiceKey))

    /** The versions to try after `current`, best first, for « Autre version ». */
    fun alternatives(current: Version, versions: List<Version>): List<Version> =
        versions.filter { it.id != current.id && it.sources.isNotEmpty() }.sortedWith(compareBy({ rank(it, versions).first }, { rank(it, versions).second }, { rank(it, versions).third }, { rank(it, versions).fourth }))

    /** The first source in server order that has not failed recently; else the first anyway. */
    fun bestSource(version: Version): Source? = version.sources.firstOrNull { !isSourceFailed(it.id) } ?: version.sources.firstOrNull()

    /** The next equivalent source after `source`, for the automatic switch; null when none is left. */
    fun nextSource(after: Source, version: Version): Source? {
        val idx = version.sources.indexOfFirst { it.id == after.id }
        if (idx < 0) return null
        val rotated = version.sources.drop(idx + 1) + version.sources.take(idx)
        return rotated.firstOrNull { !isSourceFailed(it.id) && it.id != after.id }
    }

    // MARK: - Internals

    private fun fits(v: Version): Boolean {
        if (v.quality > maxQuality || v.quality > capabilities.maxQuality) return false
        return when (v.dynamicRange) {
            DynamicRange.DOLBY_VISION -> capabilities.supportsDolbyVision
            DynamicRange.HDR -> capabilities.supportsHdr
            null -> true
        }
    }

    /** The highest quality that fits, dynamic range as a tiebreaker; the lowest if nothing fits. The usual cut only, when there is one. */
    private fun best(all: List<Version>, respectingServerOrder: Boolean = false): Version? {
        val usual = all.filter { it.edition == null }
        val candidates = usual.ifEmpty { all }
        if (candidates.isEmpty()) return null
        val fitting = candidates.filter(::fits)
        if (fitting.isEmpty()) return candidates.minByOrNull { it.quality }
        if (respectingServerOrder) return fitting.first()
        return fitting.maxWithOrNull(compareBy<Version> { it.quality }.thenBy { it.dynamicRange?.ordinal ?: -1 })
    }

    private data class Rank(val first: Int, val second: Int, val third: Int, val fourth: Int)

    private fun rank(v: Version, versions: List<Version>): Rank {
        val order = languageOrder.ifEmpty { versions.map { it.language }.distinct() }
        val lang = order.indexOf(v.language).let { if (it < 0) order.size else it }
        return Rank(if (fits(v)) 0 else 1, lang, if (v.edition == null) 0 else 1, -v.quality.ordinal)
    }

    companion object {
        /** « Source A », « Source B »: how the copies of a version are named. */
        fun sourceName(index: Int): String = "Source ${'A' + index}"

        /** The one warning for an episode missing in the language in use, as the Apple app words it. */
        fun languageWarning(episode: Int, alternative: String, current: String, returnsAt: Int? = null): String {
            val back = returnsAt?.let { ", retour en ${Language.short(current)} à l'épisode $it" } ?: "."
            return "É$episode n'existe qu'en ${Language.short(alternative)} : lecture en ${Language.short(alternative)}$back"
        }

        /**
         * The order of every list of versions: the recommended one first, then by language (in the order they
         * appear), the usual cut before the editions, descending quality, then dynamic range.
         */
        fun ordered(versions: List<Version>, recommended: String? = null): List<Version> {
            val languages = versions.map { it.language }.distinct()
            return versions.sortedWith(
                compareBy<Version> { if (it.id == recommended) 0 else 1 }
                    .thenBy { languages.indexOf(it.language) }
                    .thenBy { if (it.edition == null) 0 else 1 }
                    .thenByDescending { it.quality }
                    .thenByDescending { it.dynamicRange?.ordinal ?: -1 },
            )
        }
    }
}
