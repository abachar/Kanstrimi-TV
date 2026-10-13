package dev.crafters.kanstrimi.app

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The device's token and code, and the profile it is on, in the app's private storage (sandboxed and encrypted at rest by Android; nothing
 * else on the device reads it). The token carries the provider's account through the stream URLs the server
 * returns: it never leaves the app otherwise.
 */
class DeviceStore(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("device", Context.MODE_PRIVATE)

    private val _token = MutableStateFlow(prefs.getString(KEY_TOKEN, null))
    val token: StateFlow<String?> = _token.asStateFlow()
    private val _code = MutableStateFlow(prefs.getString(KEY_CODE, null))
    val code: StateFlow<String?> = _code.asStateFlow()
    /** The profile last chosen on this device (`X-Profile` on every call); null until chosen. */
    private val _profileId = MutableStateFlow(prefs.getInt(KEY_PROFILE, 0).takeIf { it > 0 })
    val profileId: StateFlow<Int?> = _profileId.asStateFlow()
    /** Why the device was unpaired from outside (a 401), shown once on the pairing screen. */
    private val _lastRevocationMessage = MutableStateFlow<String?>(null)
    val lastRevocationMessage: StateFlow<String?> = _lastRevocationMessage.asStateFlow()

    val isPaired: Boolean get() = _token.value != null

    fun store(token: String, code: String) {
        prefs.edit { putString(KEY_TOKEN, token); putString(KEY_CODE, code) }
        _token.value = token
        _code.value = code
        _lastRevocationMessage.value = null
    }

    /** The profile chosen on this device, kept until another is chosen; null when the server no longer knows it. */
    fun choose(profileId: Int?) {
        prefs.edit { if (profileId != null) putInt(KEY_PROFILE, profileId) else remove(KEY_PROFILE) }
        _profileId.value = profileId
    }

    fun forget(reason: String?) {
        prefs.edit { remove(KEY_TOKEN); remove(KEY_CODE); remove(KEY_PROFILE) }
        _token.value = null
        _code.value = null
        _profileId.value = null
        _lastRevocationMessage.value = reason
    }

    companion object {
        private const val KEY_TOKEN = "token"
        private const val KEY_CODE = "code"
        private const val KEY_PROFILE = "profile"
    }
}
