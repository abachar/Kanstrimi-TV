package dev.crafters.kanstrimi.player

import dev.crafters.kanstrimi.contract.ProfileSettings

/**
 * What the player reads of the preferences, as an interface so the JVM tests can hand it a plain object:
 * `Preferences` implements it over the app's shared preferences, where the profile's settings are cached.
 */
interface PlaybackPreferences {
    /** The profile's playback settings, as the server last said them (`/info`, `PUT /profiles/me/settings`). */
    val settings: ProfileSettings
}
