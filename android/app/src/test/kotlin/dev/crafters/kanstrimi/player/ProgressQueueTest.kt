package dev.crafters.kanstrimi.player

import dev.crafters.kanstrimi.client.CatalogException
import kotlinx.coroutines.test.runTest
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ProgressQueueTest {
    /** A store in memory, read back by a second queue like the preferences after a restart. */
    private class MemoryStore : ProgressQueue.Store {
        var text: String? = null
        override fun read(): String? = text
        override fun write(text: String?) { this.text = text }
    }

    @Test
    fun `une position envoyée efface l'ancienne du même titre restée en file - la reprise ne recule pas`() = runTest {
        val client = FakeCatalogClient()
        val queue = ProgressQueue()
        queue.enqueue(Fixtures.report("tmdb:movie:1", 600.0))
        PlaybackReporter({ client }, queue).report(Fixtures.report("tmdb:movie:1", 2400.0))
        assertTrue(queue.pending.isEmpty())
        assertEquals(listOf(2400.0), client.reports.map { it.position })
    }

    @Test
    fun `hors ligne, la position attend en file et rejoue au prochain succès - un titre retiré n'y entre pas`() = runTest {
        val client = FakeCatalogClient()
        val queue = ProgressQueue()
        val reporter = PlaybackReporter({ client }, queue)
        client.reportFails = { CatalogException.Offline("hors ligne") }
        reporter.report(Fixtures.report("tmdb:movie:1", 100.0))
        assertEquals(listOf("tmdb:movie:1"), queue.pending.map { it.contentId })
        client.reportFails = { CatalogException.NotFound() }
        reporter.report(Fixtures.report("tmdb:movie:2", 100.0))
        assertEquals(listOf("tmdb:movie:1"), queue.pending.map { it.contentId })
        client.reportFails = null
        reporter.report(Fixtures.report("tmdb:movie:3", 50.0))
        assertTrue(queue.pending.isEmpty())
        assertEquals(listOf("tmdb:movie:3", "tmdb:movie:1"), client.reports.map { it.contentId })
    }

    @Test
    fun `la file survit à un redémarrage par le magasin`() {
        val store = MemoryStore()
        ProgressQueue(store).enqueue(Fixtures.report("tmdb:movie:1", 600.0))
        val reloaded = ProgressQueue(store)
        assertEquals(listOf(600.0), reloaded.pending.map { it.position })
        reloaded.drop("tmdb:movie:1")
        assertTrue(ProgressQueue(store).pending.isEmpty())
    }
}
