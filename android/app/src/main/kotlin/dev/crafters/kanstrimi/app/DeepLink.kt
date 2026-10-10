package dev.crafters.kanstrimi.app

import android.net.Uri
import java.time.Duration
import java.time.Instant

/**
 * `kanstrimi://open/<id>` (a sheet) and `kanstrimi://play/<id>` (a title played where it was left, or a channel),
 * like the Apple app's `DeepLink`: only our own ids, nothing that could walk the API's paths.
 */
sealed class DeepLink {
    data class Open(val id: String) : DeepLink()
    data class Play(val id: String) : DeepLink()

    companion object {
        fun parse(uri: Uri?): DeepLink? {
            if (uri == null || uri.scheme != "kanstrimi") return null
            val id = uri.pathSegments.joinToString("/").ifEmpty { return null }
            if (!isContentId(id)) return null
            return when (uri.host) {
                "open" -> Open(id)
                "play" -> Play(id)
                else -> null
            }
        }

        /** The id is opaque: only what could walk the API's paths is refused, since any app may open a `kanstrimi://` link. */
        fun isContentId(id: String): Boolean = id.isNotEmpty() && !id.contains('/') && !id.contains("..") && id.length <= 300
    }
}

/**
 * Back after a long absence (the tablet left on the sofa): the home and the Direct reload, their lists being stale.
 * Counts from the first time the app left the foreground; a short absence changes nothing.
 */
class AbsenceClock(private val now: () -> Instant = Instant::now, private val longAbsence: Duration = Duration.ofMinutes(10)) {
    private var inactiveSince: Instant? = null

    /** True when the app comes back after more than `longAbsence`. */
    fun became(active: Boolean): Boolean {
        if (!active) {
            if (inactiveSince == null) inactiveSince = now()
            return false
        }
        val since = inactiveSince
        inactiveSince = null
        return since != null && Duration.between(since, now()) > longAbsence
    }
}
