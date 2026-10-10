package dev.crafters.kanstrimi.app

import dev.crafters.kanstrimi.contract.Channel
import dev.crafters.kanstrimi.contract.Programme
import dev.crafters.kanstrimi.contract.Quality
import dev.crafters.kanstrimi.contract.Version
import org.junit.Test
import java.time.Instant
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** The one rule for « what is on air », and the recent channels list. */
class LiveGuideTest {
    private val now: Instant = Instant.parse("2026-10-10T20:30:00Z")
    private fun programme(title: String, from: Long, to: Long) = Programme(title, now.plusSeconds(from), now.plusSeconds(to), null)

    private val fhd = Version(id = "fhd", language = "VF", quality = Quality.FHD)
    private val hd = Version(id = "hd", language = "VF", quality = Quality.HD, hasEpg = true, now = programme("Journal HD", -600, 1200), next = null)
    private val listed = Channel(id = "live:fr-tf1", name = "TF1", hasEpg = true, versions = listOf(fhd, hd), now = programme("Journal", -1200, 1800), next = programme("Film", 1800, 9000))

    @Test
    fun `le guide est celui de la version quand elle en a un, sinon celui de la chaîne`() {
        assertEquals("Journal", LiveGuide.guide(listed, fhd).now?.title)
        assertEquals("Journal", LiveGuide.guide(listed, null).now?.title)
        assertEquals("Journal HD", LiveGuide.guide(listed, hd).now?.title)
        assertNull(LiveGuide.guide(listed, hd).next)
        assertEquals(true, LiveGuide.guide(listed, hd).hasEpg)
    }

    @Test
    fun `le détail prime sur la copie de la liste tant que son programme dure`() {
        val detail = listed.copy(now = programme("Journal (détail)", -300, 600), next = null)
        assertEquals("Journal (détail)", LiveGuide.nowPlaying(listed, detail, fhd, now)?.title)
        // Its programme over: the list's copy, even stale, rather than nothing.
        val stale = listed.copy(now = programme("Météo", -3600, -1800), next = null)
        assertEquals("Journal", LiveGuide.nowPlaying(listed, stale, fhd, now)?.title)
        // A card from the home knows nothing of the guide: the detail alone tells.
        val bare = Channel(id = "live:fr-tf1", name = "TF1")
        assertEquals("Journal (détail)", LiveGuide.nowPlaying(bare, detail, null, now)?.title)
        assertNull(LiveGuide.nowPlaying(bare, stale, null, now))
        assertNull(LiveGuide.nowPlaying(bare, null, null, now))
    }

    @Test
    fun `une chaîne sans guide le dit`() {
        val mute = Channel(id = "live:fr-m6", name = "M6", hasEpg = false)
        assertFalse(LiveGuide.guide(mute, null).hasEpg!!)
        assertNull(LiveGuide.nowPlaying(mute, null, null, now))
    }

    @Test
    fun `les chaînes récentes - la dernière d'abord, une seule fois, vingt au plus`() {
        var clock = now
        val recents = RecentChannels(prefs = null, now = { clock })
        for (i in 1..25) {
            clock = clock.plusSeconds(60)
            recents.record(Channel(id = "live:$i", name = "Chaîne $i"))
        }
        assertEquals(RecentChannels.CAPACITY, recents.entries.size)
        assertEquals("live:25", recents.entries.first().id)
        assertEquals("live:6", recents.entries.last().id)
        clock = clock.plusSeconds(60)
        recents.record(Channel(id = "live:7", name = "Chaîne 7"))
        assertEquals("live:7", recents.entries.first().id)
        assertEquals(1, recents.entries.count { it.id == "live:7" })
        assertEquals("live:25", recents.previous("live:7")?.id)
        assertTrue(recents.entries.first().watchedInstant == clock)
    }
}
