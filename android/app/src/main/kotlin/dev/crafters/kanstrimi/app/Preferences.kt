package dev.crafters.kanstrimi.app

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import dev.crafters.kanstrimi.contract.ProfileSettings
import dev.crafters.kanstrimi.contract.Wire
import dev.crafters.kanstrimi.player.PlaybackPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * What this device keeps for itself, in the app's private preferences: the server, the device name, the demo client,
 * and a copy of the profile's playback settings so the player has them before `/info` answers. Everything personal
 * (the settings themselves, the versions chosen, the recent channels) lives on the server, with the profile.
 */
class Preferences(context: Context) : PlaybackPreferences {
    private val prefs: SharedPreferences = context.getSharedPreferences("prefs", Context.MODE_PRIVATE)

    private val _serverUrl = MutableStateFlow(prefs.getString(KEY_SERVER, null) ?: COMPILED_SERVER_URL)
    val serverUrl: StateFlow<String> = _serverUrl.asStateFlow()

    private val _deviceName = MutableStateFlow(prefs.getString(KEY_DEVICE_NAME, "") ?: "")
    val deviceName: StateFlow<String> = _deviceName.asStateFlow()

    private val _useMock = MutableStateFlow(prefs.getBoolean(KEY_USE_MOCK, false))
    val useMock: StateFlow<Boolean> = _useMock.asStateFlow()

    /** None of its own: the versions arrive in the order of the profile's filter, the first one plays. */
    override val languageOrder: List<String> get() = emptyList()

    private val _settings = MutableStateFlow(
        prefs.getString(KEY_PROFILE_SETTINGS, null)?.let { runCatching { Wire.json.decodeFromString(ProfileSettings.serializer(), it) }.getOrNull() }
            ?: ProfileSettings.standard,
    )
    override val settings: ProfileSettings get() = _settings.value
    /** The profile's settings as the server last said them, for Réglages › Lecture. */
    val settingsFlow: StateFlow<ProfileSettings> = _settings.asStateFlow()
    fun setSettings(settings: ProfileSettings) {
        _settings.value = settings
        prefs.edit { putString(KEY_PROFILE_SETTINGS, Wire.json.encodeToString(ProfileSettings.serializer(), settings)) }
    }

    fun setServerUrl(url: String) { _serverUrl.value = url; prefs.edit { putString(KEY_SERVER, url) } }
    fun setDeviceName(name: String) { _deviceName.value = name; prefs.edit { putString(KEY_DEVICE_NAME, name) } }
    fun setUseMock(on: Boolean) { _useMock.value = on; prefs.edit { putBoolean(KEY_USE_MOCK, on) } }

    companion object {
        const val COMPILED_SERVER_URL = "https://kanstrimi.crafters.dev"
        private const val KEY_SERVER = "pref.serverURL"
        private const val KEY_DEVICE_NAME = "pref.deviceName"
        private const val KEY_USE_MOCK = "pref.useMock"
        private const val KEY_PROFILE_SETTINGS = "pref.profileSettings"
    }
}
