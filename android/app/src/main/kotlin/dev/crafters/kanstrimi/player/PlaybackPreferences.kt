package dev.crafters.kanstrimi.player

import dev.crafters.kanstrimi.contract.DynamicRange
import dev.crafters.kanstrimi.contract.Language
import dev.crafters.kanstrimi.contract.ProfileSettings
import dev.crafters.kanstrimi.contract.Quality
import dev.crafters.kanstrimi.contract.RememberedVersion
import dev.crafters.kanstrimi.contract.Version

/**
 * What the player reads of the preferences, as an interface so the JVM tests can hand it a plain object:
 * `Preferences` implements it over the app's shared preferences, where the profile's settings are cached.
 */
interface PlaybackPreferences {
    /** The languages to try in order (`VF`, `VOSTFR`, `VO`); empty: the server's order, the profile's filter. */
    val languageOrder: List<String>
    /** The profile's playback settings, as the server last said them (`/info`, `PUT /profiles/me/settings`). */
    val settings: ProfileSettings

    companion object {
        val defaultLanguageOrder: List<String> = listOf(Language.VF, Language.VOSTFR, Language.VO)
    }
}

/** A language × quality choice that applies across the episodes of a series (« FR · FHD HDR »). */
data class VersionChoiceKey(val language: String, val quality: Quality, val dynamicRange: DynamicRange?, val edition: String? = null) {
    constructor(version: Version) : this(version.language, version.quality, version.dynamicRange, version.edition)
    constructor(remembered: RememberedVersion) : this(remembered.language, remembered.quality, remembered.dynamicRange, remembered.edition)

    val label: String
        get() {
            val dr = dynamicRange?.let { " ${it.label}" } ?: ""
            return listOfNotNull("${Language.short(language)} · ${quality.label}$dr", edition).joinToString(" · ")
        }
}
