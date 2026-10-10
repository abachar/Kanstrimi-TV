package dev.crafters.kanstrimi.player

import dev.crafters.kanstrimi.contract.Credits
import dev.crafters.kanstrimi.contract.FileFacts
import dev.crafters.kanstrimi.contract.PlaybackMarkers
import dev.crafters.kanstrimi.contract.Skip
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** The failures, the restarts and the ends that a real stream cannot be made to play on demand, played by `FakePlaybackEngine`. */
@OptIn(ExperimentalCoroutinesApi::class)
class PlayerServiceTest {
    private val engine = FakePlaybackEngine()
    private val client = FakeCatalogClient()
    private val preferences = FakePreferences()
    private var revisions = 0

    private fun TestScope.service(): PlayerService = PlayerService(
        client = { client }, preferences = preferences, engine = engine, scope = backgroundScope, progressQueue = ProgressQueue(),
        capabilities = VersionChooser.Capabilities(dev.crafters.kanstrimi.contract.Quality.UHD, true, true),
        onProgressReported = { revisions += 1 },
    )

    private fun url(name: String) = "http://provider.test/movie/u/p/$name.mkv"

    @Test
    fun `une panne passe à la source suivante, sans redemander le serveur`() = runTest {
        val player = service()
        player.play(Fixtures.film(sources = listOf("a", "b")))
        assertEquals(listOf(url("a")), engine.loads)
        engine.emitError()
        runCurrent()
        assertEquals(listOf(url("a"), url("b")), engine.loads)
        assertEquals("b", player.source?.id)
        assertEquals(PlayerService.Phase.OPENING, player.phase)
        assertNotNull(player.toast)
        player.stop()
    }

    @Test
    fun `une seule source - deux nouveaux essais, puis le dialogue d'échec`() = runTest {
        val player = service()
        player.play(Fixtures.film(sources = listOf("a")))
        for (n in 2..3) {
            engine.emit(EnginePhase.LOADING)
            engine.emitError()
            runCurrent()
            assertEquals(n, engine.loads.size)
        }
        engine.emit(EnginePhase.LOADING)
        engine.emitError()
        runCurrent()
        assertEquals(PlayerService.Phase.FAILED, player.phase)
        assertEquals(3, engine.loads.size)
        assertEquals(3, player.failure?.attempts)
        player.stop()
    }

    @Test
    fun `sans image après 10 s, la source est relancée`() = runTest {
        val player = service()
        player.play(Fixtures.film(sources = listOf("a", "b")))
        advanceTimeBy(PlayerService.START_TIMEOUT_MS + 1)
        runCurrent()
        assertEquals(listOf(url("a"), url("b")), engine.loads)
        player.stop()
    }

    @Test
    fun `les essais ratés d'un titre ne comptent pas pour le suivant`() = runTest {
        val player = service()
        player.play(Fixtures.film(sources = listOf("a")))
        for (n in 2..3) {
            engine.emit(EnginePhase.LOADING)
            engine.emitError()
            runCurrent()
            assertEquals(n, engine.loads.size)
        }
        player.play(Fixtures.film("tmdb:movie:949", sources = listOf("b")))
        engine.emit(EnginePhase.LOADING)
        engine.emitError()
        runCurrent()
        assertEquals(5, engine.loads.size)
        assertEquals(PlayerService.Phase.OPENING, player.phase)
        assertNull(player.failure)
        player.stop()
    }

    @Test
    fun `un film qui s'arrête loin de sa fin a été coupé - la lecture reprend à la même position`() = runTest {
        val player = service()
        player.play(Fixtures.film(sources = listOf("a")))
        engine.emit(EnginePhase.PLAYING)
        engine.emitTime(1200.0, 6000.0)
        assertEquals(PlayerService.Phase.PLAYING, player.phase)
        engine.emit(EnginePhase.ENDED)
        runCurrent()
        assertEquals(2, engine.loads.size)
        assertEquals(PlayerService.Phase.OPENING, player.phase)
        assertEquals(1200.0, player.time)
        player.stop()
    }

    @Test
    fun `un titre choisi dans un panneau ne se lance pas si le lecteur a été quitté entre-temps`() = runTest {
        val player = service()
        player.play(Fixtures.film(sources = listOf("a")))
        val played = player.playPicked {
            player.stop()
            Fixtures.film("tmdb:movie:949", sources = listOf("b"))
        }
        assertFalse(played)
        assertNull(player.context)
        val again = service()
        again.play(Fixtures.film(sources = listOf("a")))
        assertTrue(again.playPicked { Fixtures.film("tmdb:movie:949", sources = listOf("b")) })
        assertEquals("tmdb:movie:949", again.context?.content?.id)
        again.stop()
    }

    // MARK: - Progress

    @Test
    fun `la position part toutes les 10 s, à la pause et à l'arrêt, et l'accueil se recharge à l'arrêt`() = runTest {
        val player = service()
        player.play(Fixtures.film(sources = listOf("a")))
        engine.emit(EnginePhase.PLAYING)
        engine.emitTime(100.0, 6000.0)
        advanceTimeBy(PlayerService.PROGRESS_INTERVAL_MS + 1)
        runCurrent()
        assertEquals(listOf(100.0), client.reports.map { it.position })
        engine.emitTime(130.0, 6000.0)
        engine.emit(EnginePhase.PAUSED)
        runCurrent()
        assertEquals(listOf(100.0, 130.0), client.reports.map { it.position })
        assertEquals(0, revisions)
        player.stop()
        runCurrent()
        assertEquals(3, client.reports.size)
        assertEquals(1, revisions)
    }

    // MARK: - Next episode

    private fun TestScope.playingEpisode(player: PlayerService): PlaybackContext {
        val ctx = Fixtures.episode()
        player.play(ctx)
        runCurrent()
        engine.emit(EnginePhase.PLAYING)
        assertEquals(PlayerService.Phase.PLAYING, player.phase)
        return ctx
    }

    @Test
    fun `fin réelle avec une suite - une seconde de noir, puis l'épisode suivant se charge`() = runTest {
        val player = service()
        val ctx = playingEpisode(player)
        engine.emitTime(2690.0, 2700.0)
        assertEquals(10, player.nextCountdown)
        engine.emit(EnginePhase.ENDED)
        runCurrent()
        assertTrue(player.isChangingTitle)
        assertEquals(1, engine.loads.size, "le noir passe avant la suite")
        advanceTimeBy(PlayerService.NEXT_BLACK_MS + 1)
        runCurrent()
        assertEquals(2, engine.loads.size)
        assertEquals(ctx.next?.id, player.context?.content?.id)
        assertFalse(player.isChangingTitle)
        player.stop()
    }

    @Test
    fun `carte annulée pendant le compte à rebours - la fin du fichier ramène à la fiche, sans suite`() = runTest {
        val player = service()
        playingEpisode(player)
        engine.emitTime(2690.0, 2700.0)
        assertNotNull(player.nextCountdown)
        player.cancelNext()
        assertNull(player.nextCountdown)
        engine.emit(EnginePhase.ENDED)
        runCurrent()
        assertNull(player.context)
        assertEquals(PlayerService.Phase.IDLE, player.phase)
        assertEquals(1, engine.loads.size)
    }

    @Test
    fun `le moteur ne signale pas la fin - la suite part quand même, 2 s après le compte à 0`() = runTest {
        val player = service()
        val ctx = playingEpisode(player)
        engine.emitTime(2700.0, 2700.0)
        assertEquals(0, player.nextCountdown)
        runCurrent()
        assertEquals(1, engine.loads.size)
        advanceTimeBy(PlayerService.END_WAIT_MS + PlayerService.NEXT_BLACK_MS + 500)
        runCurrent()
        assertEquals(2, engine.loads.size)
        assertEquals(ctx.next?.id, player.context?.content?.id)
        player.stop()
    }

    @Test
    fun `lecture automatique coupée - la fin ramène à la fiche`() = runTest {
        preferences.autoPlayNext = false
        val player = service()
        playingEpisode(player)
        engine.emitTime(2690.0, 2700.0)
        assertNull(player.nextCountdown)
        engine.emit(EnginePhase.ENDED)
        runCurrent()
        assertNull(player.context)
    }

    // MARK: - Markers

    private val netflix = FileFacts(duration = 2700.0, chapters = emptyList())

    @Test
    fun `fichier ouvert - sa durée part au serveur une fois, et de nouveau à chaque ouverture`() = runTest {
        engine.fileFacts = netflix
        val player = service()
        val ctx = playingEpisode(player)
        runCurrent()
        assertEquals(listOf(netflix), client.markersAsked)
        engine.emit(EnginePhase.BUFFERING)
        engine.emit(EnginePhase.PLAYING)
        runCurrent()
        assertEquals(1, client.markersAsked.size)
        // Another version is another file: its own markers.
        player.switchVersion(ctx.versions[0])
        engine.emit(EnginePhase.LOADING)
        engine.emit(EnginePhase.PLAYING)
        runCurrent()
        assertEquals(2, client.markersAsked.size)
        assertNotNull(player.markers)
        player.stop()
        assertNull(player.markers)
    }

    @Test
    fun `un fichier dont le moteur ne sait rien ne demande aucun marqueur`() = runTest {
        val player = service()
        playingEpisode(player)
        engine.emitTime(2500.0, 0.0)
        runCurrent()
        assertTrue(client.markersAsked.isEmpty())
        assertNull(player.nextCountdown)
        player.stop()
    }

    @Test
    fun `passer le récap, passer l'intro - chacun proposé pendant qu'il passe seulement, saute à sa fin`() = runTest {
        engine.fileFacts = netflix
        client.markersAnswer = PlaybackMarkers(skips = listOf(Skip(0.0, 20.0, "Passer le récap"), Skip(71.0, 86.0, "Passer l'intro")))
        val player = service()
        playingEpisode(player)
        runCurrent()
        assertNotNull(player.markers)
        engine.emitTime(5.0)
        assertEquals("Passer le récap", player.skipOffer?.label)
        player.skip()
        assertEquals(listOf(20.0), engine.seeks)
        engine.emitTime(30.0)
        assertNull(player.skipOffer)
        player.skip()
        assertEquals(listOf(20.0), engine.seeks)
        engine.emitTime(75.0)
        assertEquals("Passer l'intro", player.skipOffer?.label)
        player.skip()
        assertEquals(listOf(20.0, 86.0), engine.seeks)
        assertEquals(86.0, player.time)
        assertNull(player.skipOffer)
        player.stop()
    }

    @Test
    fun `générique connu - la carte paraît à son début pour vingt secondes, puis la suite part et l'épisode est vu`() = runTest {
        engine.fileFacts = netflix
        client.markersAnswer = PlaybackMarkers(credits = Credits(at = 2500.0, countdown = 20))
        val player = service()
        val ctx = playingEpisode(player)
        runCurrent()
        engine.emitTime(2499.0)
        assertNull(player.nextCountdown)
        engine.emitTime(2500.0)
        assertEquals(20, player.nextCountdown)
        engine.emitTime(2512.0)
        advanceTimeBy(300)
        assertEquals(8, player.nextCountdown)
        assertEquals(1, engine.loads.size)
        engine.emitTime(2520.0)
        advanceTimeBy(300)
        // No end from the engine, the file still plays its credits: the countdown starts what follows by itself.
        assertTrue(player.isChangingTitle)
        advanceTimeBy(PlayerService.NEXT_BLACK_MS + 1)
        runCurrent()
        assertEquals(2, engine.loads.size)
        assertEquals(ctx.next?.id, player.context?.content?.id)
        assertEquals(2700.0, client.reported(ctx.content.id)?.position)
        player.stop()
    }

    @Test
    fun `générique - quitter après son début laisse l'épisode vu, revenir avant lui retire la carte`() = runTest {
        engine.fileFacts = netflix
        client.markersAnswer = PlaybackMarkers(credits = Credits(at = 2500.0, countdown = 20))
        val player = service()
        val ctx = playingEpisode(player)
        runCurrent()
        engine.emitTime(2505.0)
        assertEquals(20, player.nextCountdown)
        // Rewound before the credits: the card goes, and comes back with them.
        engine.emitTime(2300.0)
        advanceTimeBy(300)
        assertNull(player.nextCountdown)
        engine.emitTime(2510.0)
        assertEquals(20, player.nextCountdown)
        player.cancelNext()
        assertNull(player.nextCountdown)
        player.stop()
        runCurrent()
        assertEquals(2700.0, client.reported(ctx.content.id)?.position)
        assertEquals(1, engine.loads.size)
    }

    @Test
    fun `suggestions demandées 3 s après le départ - Similaires, et la suite d'un film prête avant la fin`() = runTest {
        val next = dev.crafters.kanstrimi.contract.Suggestion(
            item = dev.crafters.kanstrimi.contract.ContentItem(id = "tmdb:movie:604", kind = dev.crafters.kanstrimi.contract.ContentKind.MOVIE, title = "Matrix Reloaded"),
            heading = "À SUIVRE · SUITE DE LA SAGA",
        )
        client.suggestionsAnswer = dev.crafters.kanstrimi.contract.Suggestions(related = listOf(next.item), next = next)
        val player = service()
        player.play(Fixtures.film(sources = listOf("a")))
        engine.emit(EnginePhase.PLAYING)
        assertNull(player.suggestions)
        advanceTimeBy(PlayerService.SUGGESTIONS_DELAY_MS + 1)
        runCurrent()
        assertEquals(1, player.suggestions?.related?.size)
        assertEquals("tmdb:movie:604", player.nextContext?.content?.id)
        assertTrue(player.upNext is PlayerService.UpNext.TitleNext)
        player.stop()
    }
}
