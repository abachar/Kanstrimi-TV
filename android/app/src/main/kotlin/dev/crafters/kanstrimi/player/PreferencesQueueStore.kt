package dev.crafters.kanstrimi.player

import android.content.Context
import androidx.core.content.edit

/** The offline progress queue, persisted as one string in the app's private preferences. */
class PreferencesQueueStore(context: Context) : ProgressQueue.Store {
    private val prefs = context.getSharedPreferences("progress-queue", Context.MODE_PRIVATE)
    override fun read(): String? = prefs.getString(KEY, null)
    override fun write(text: String?) { prefs.edit { if (text == null) remove(KEY) else putString(KEY, text) } }

    private companion object {
        const val KEY = "pending"
    }
}
