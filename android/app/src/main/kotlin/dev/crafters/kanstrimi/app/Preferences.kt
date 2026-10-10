package dev.crafters.kanstrimi.app

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import dev.crafters.kanstrimi.contract.Quality
import dev.crafters.kanstrimi.player.PlaybackPreferences
import dev.crafters.kanstrimi.player.VersionChoiceKey
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** What the user set, in the app's private preferences: the server, the device name, the demo client, the player's. */
class Preferences(context: Context) : PlaybackPreferences {
    private val prefs: SharedPreferences = context.getSharedPreferences("prefs", Context.MODE_PRIVATE)

    private val _serverUrl = MutableStateFlow(prefs.getString(KEY_SERVER, null) ?: COMPILED_SERVER_URL)
    val serverUrl: StateFlow<String> = _serverUrl.asStateFlow()

    private val _deviceName = MutableStateFlow(prefs.getString(KEY_DEVICE_NAME, "") ?: "")
    val deviceName: StateFlow<String> = _deviceName.asStateFlow()

    private val _useMock = MutableStateFlow(prefs.getBoolean(KEY_USE_MOCK, false))
    val useMock: StateFlow<Boolean> = _useMock.asStateFlow()

    // The player's: the language order, the quality ceiling (FHD, the tablet's screen), what follows a title, the
    // remembered versions. Plain values read by `PlayerService` through `PlaybackPreferences`, flows for the screens.
    private val _languageOrder = MutableStateFlow(prefs.getString(KEY_LANGUAGE_ORDER, null)?.split(',')?.filter { it.isNotEmpty() } ?: PlaybackPreferences.defaultLanguageOrder)
    override val languageOrder: List<String> get() = _languageOrder.value
    val languageOrderFlow: StateFlow<List<String>> = _languageOrder.asStateFlow()
    private val _maxQuality = MutableStateFlow(Quality.entries.firstOrNull { it.label == prefs.getString(KEY_MAX_QUALITY, null) } ?: Quality.FHD)
    override val maxQuality: Quality get() = _maxQuality.value
    val maxQualityFlow: StateFlow<Quality> = _maxQuality.asStateFlow()
    private val _autoPlayNext = MutableStateFlow(prefs.getBoolean(KEY_AUTO_PLAY_NEXT, true))
    override val autoPlayNext: Boolean get() = _autoPlayNext.value
    val autoPlayNextFlow: StateFlow<Boolean> = _autoPlayNext.asStateFlow()
    private val _rememberVersionPerTitle = MutableStateFlow(prefs.getBoolean(KEY_REMEMBER_VERSION, true))
    override val rememberVersionPerTitle: Boolean get() = _rememberVersionPerTitle.value
    val rememberVersionPerTitleFlow: StateFlow<Boolean> = _rememberVersionPerTitle.asStateFlow()
    private val _switchSourceOnFailure = MutableStateFlow(prefs.getBoolean(KEY_SWITCH_SOURCE, true))
    override val switchSourceOnFailure: Boolean get() = _switchSourceOnFailure.value
    val switchSourceOnFailureFlow: StateFlow<Boolean> = _switchSourceOnFailure.asStateFlow()

    fun setLanguageOrder(order: List<String>) { _languageOrder.value = order; prefs.edit { putString(KEY_LANGUAGE_ORDER, order.joinToString(",")) } }
    fun setMaxQuality(quality: Quality) { _maxQuality.value = quality; prefs.edit { putString(KEY_MAX_QUALITY, quality.label) } }
    fun setAutoPlayNext(on: Boolean) { _autoPlayNext.value = on; prefs.edit { putBoolean(KEY_AUTO_PLAY_NEXT, on) } }
    fun setRememberVersionPerTitle(on: Boolean) { _rememberVersionPerTitle.value = on; prefs.edit { putBoolean(KEY_REMEMBER_VERSION, on) } }
    fun setSwitchSourceOnFailure(on: Boolean) { _switchSourceOnFailure.value = on; prefs.edit { putBoolean(KEY_SWITCH_SOURCE, on) } }

    override fun rememberedVersion(id: String): String? = prefs.getString("$KEY_REMEMBERED_PREFIX$id", null)
    override fun remember(versionId: String?, id: String) {
        prefs.edit { if (versionId != null) putString("$KEY_REMEMBERED_PREFIX$id", versionId) else remove("$KEY_REMEMBERED_PREFIX$id") }
    }
    override fun seriesChoice(seriesId: String): VersionChoiceKey? = prefs.getString("$KEY_SERIES_PREFIX$seriesId", null)?.let(VersionChoiceKey::parse)
    override fun setSeriesChoice(key: VersionChoiceKey?, seriesId: String) {
        prefs.edit { if (key != null) putString("$KEY_SERIES_PREFIX$seriesId", key.rawValue) else remove("$KEY_SERIES_PREFIX$seriesId") }
    }

    fun setServerUrl(url: String) { _serverUrl.value = url; prefs.edit { putString(KEY_SERVER, url) } }
    fun setDeviceName(name: String) { _deviceName.value = name; prefs.edit { putString(KEY_DEVICE_NAME, name) } }
    fun setUseMock(on: Boolean) { _useMock.value = on; prefs.edit { putBoolean(KEY_USE_MOCK, on) } }

    companion object {
        const val COMPILED_SERVER_URL = "https://kanstrimi.crafters.dev"
        private const val KEY_SERVER = "pref.serverURL"
        private const val KEY_DEVICE_NAME = "pref.deviceName"
        private const val KEY_USE_MOCK = "pref.useMock"
        private const val KEY_LANGUAGE_ORDER = "pref.languageOrder"
        private const val KEY_MAX_QUALITY = "pref.maxQuality"
        private const val KEY_AUTO_PLAY_NEXT = "pref.autoPlayNext"
        private const val KEY_REMEMBER_VERSION = "pref.rememberVersion"
        private const val KEY_SWITCH_SOURCE = "pref.switchSource"
        private const val KEY_REMEMBERED_PREFIX = "pref.rememberedVersion."
        private const val KEY_SERIES_PREFIX = "pref.seriesChoice."
    }
}
