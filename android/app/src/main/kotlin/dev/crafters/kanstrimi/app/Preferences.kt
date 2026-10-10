package dev.crafters.kanstrimi.app

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** What the user set, in the app's private preferences: the server, the device name, the demo client. */
class Preferences(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("prefs", Context.MODE_PRIVATE)

    private val _serverUrl = MutableStateFlow(prefs.getString(KEY_SERVER, null) ?: COMPILED_SERVER_URL)
    val serverUrl: StateFlow<String> = _serverUrl.asStateFlow()

    private val _deviceName = MutableStateFlow(prefs.getString(KEY_DEVICE_NAME, "") ?: "")
    val deviceName: StateFlow<String> = _deviceName.asStateFlow()

    private val _useMock = MutableStateFlow(prefs.getBoolean(KEY_USE_MOCK, false))
    val useMock: StateFlow<Boolean> = _useMock.asStateFlow()

    fun setServerUrl(url: String) { _serverUrl.value = url; prefs.edit { putString(KEY_SERVER, url) } }
    fun setDeviceName(name: String) { _deviceName.value = name; prefs.edit { putString(KEY_DEVICE_NAME, name) } }
    fun setUseMock(on: Boolean) { _useMock.value = on; prefs.edit { putBoolean(KEY_USE_MOCK, on) } }

    companion object {
        const val COMPILED_SERVER_URL = "https://kanstrimi.crafters.dev"
        private const val KEY_SERVER = "pref.serverURL"
        private const val KEY_DEVICE_NAME = "pref.deviceName"
        private const val KEY_USE_MOCK = "pref.useMock"
    }
}
