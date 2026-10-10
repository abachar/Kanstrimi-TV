package dev.crafters.kanstrimi.player

import dev.crafters.kanstrimi.ui.formatHour
import java.time.Instant
import java.time.ZoneId
import java.util.Locale
import kotlin.math.roundToLong

/** The player's few texts: the clock, the hour it ends at. The rest comes written by the server. */
object PlayerFormat {
    /** « 1:01:00 », « 4:05 ». */
    fun clock(seconds: Double): String {
        val s = seconds.coerceAtLeast(0.0).roundToLong()
        return if (s >= 3600) String.format(Locale.ROOT, "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60)
        else String.format(Locale.ROOT, "%d:%02d", s / 60, s % 60)
    }

    /** « 21:14 ». */
    fun hour(instant: Instant, zone: ZoneId = ZoneId.systemDefault()): String = formatHour(instant, zone)

    /** « −1:01:00 · fin à 21:14 ». */
    fun remainingLine(remaining: Double, now: Instant = Instant.now()): String =
        "−${clock(remaining)} · fin à ${hour(now.plusSeconds(remaining.roundToLong()))}"
}
