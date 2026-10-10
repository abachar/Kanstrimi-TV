package dev.crafters.kanstrimi.player

import dev.crafters.kanstrimi.contract.DynamicRange
import dev.crafters.kanstrimi.contract.Language
import dev.crafters.kanstrimi.contract.Quality
import dev.crafters.kanstrimi.contract.Version

/**
 * What the player reads in the preferences, as an interface so the JVM tests can hand it a plain object:
 * `Preferences` implements it over the app's shared preferences.
 */
interface PlaybackPreferences {
    /** The languages to try in order (`VF`, `VOSTFR`, `VO`). */
    val languageOrder: List<String>
    val maxQuality: Quality
    val autoPlayNext: Boolean
    val rememberVersionPerTitle: Boolean
    val switchSourceOnFailure: Boolean

    /** The version id remembered for a title (a movie, a channel), set from the version picker. */
    fun rememberedVersion(id: String): String?
    fun remember(versionId: String?, id: String)

    /** The language × quality kept for a series, applied to every episode. */
    fun seriesChoice(seriesId: String): VersionChoiceKey?
    fun setSeriesChoice(key: VersionChoiceKey?, seriesId: String)

    companion object {
        val defaultLanguageOrder: List<String> = listOf(Language.VF, Language.VOSTFR, Language.VO)
    }
}

/** A language × quality choice that survives across the episodes of a series (« FR · FHD HDR »). */
data class VersionChoiceKey(val language: String, val quality: Quality, val dynamicRange: DynamicRange?, val edition: String? = null) {
    constructor(version: Version) : this(version.language, version.quality, version.dynamicRange, version.edition)

    /** `VF/FHD/HDR`, plus `/<edition>` for an edition; the dynamic range part is empty for SDR. */
    val rawValue: String
        get() {
            val base = "$language/${quality.label}/${dynamicRange?.label ?: ""}"
            return if (edition != null) "$base/$edition" else base
        }

    val label: String
        get() {
            val dr = dynamicRange?.let { " ${it.label}" } ?: ""
            return listOfNotNull("${Language.short(language)} · ${quality.label}$dr", edition).joinToString(" · ")
        }

    companion object {
        fun parse(raw: String): VersionChoiceKey? {
            val parts = raw.split('/', limit = 4)
            if (parts.size < 3) return null
            val quality = Quality.entries.firstOrNull { it.label == parts[1] } ?: return null
            val dr = if (parts[2].isEmpty()) null else DynamicRange.entries.firstOrNull { it.label == parts[2] }
            val edition = if (parts.size == 4 && parts[3].isNotEmpty()) parts[3] else null
            return VersionChoiceKey(parts[0], quality, dr, edition)
        }
    }
}
