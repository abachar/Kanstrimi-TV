package dev.crafters.kanstrimi.app

import java.time.Duration
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class DeepLinkTest {
    @Test
    fun onlyOurIdsPass() {
        assertTrue(DeepLink.isContentId("tmdb:movie:603"))
        assertTrue(DeepLink.isContentId("live:fr-tf1"))
        assertFalse(DeepLink.isContentId(""))
        assertFalse(DeepLink.isContentId("a/b"))
        assertFalse(DeepLink.isContentId("..x"))
        assertFalse(DeepLink.isContentId("x".repeat(301)))
    }

    @Test
    fun aLongAbsenceReloadsAShortOneDoesNot() {
        var now = Instant.parse("2026-10-10T20:00:00Z")
        val clock = AbsenceClock(now = { now }, longAbsence = Duration.ofMinutes(10))
        clock.became(false)
        now = now.plusSeconds(5 * 60)
        assertFalse(clock.became(true))
        clock.became(false)
        // Counted from the first time the app left, even if told again later.
        now = now.plusSeconds(8 * 60)
        clock.became(false)
        now = now.plusSeconds(3 * 60)
        assertTrue(clock.became(true))
        assertFalse(clock.became(true))
    }
}
