package dev.crafters.kanstrimi.player

import dev.crafters.kanstrimi.contract.Channel
import dev.crafters.kanstrimi.contract.Credits
import dev.crafters.kanstrimi.contract.Programme
import dev.crafters.kanstrimi.contract.Quality
import dev.crafters.kanstrimi.contract.PictureSize
import dev.crafters.kanstrimi.contract.Playback
import dev.crafters.kanstrimi.contract.RememberedVariant
import dev.crafters.kanstrimi.contract.FileFacts
import dev.crafters.kanstrimi.contract.PlaybackMarkers
import dev.crafters.kanstrimi.contract.Skip
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Test
import java.time.Instant
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
    private val notices = ArrayList<String>()
    /** The clock the service counts the time watched on, moved by hand. */
    private var now: Instant = Instant.parse("2026-10-10T20:00:00Z")

    private fun TestScope.service(): PlayerService = PlayerService(
        client = { client }, preferences = preferences, engine = engine, scope = backgroundScope, progressQueue = ProgressQueue(),
        capabilities = VariantChooser.Capabilities(Quality.UHD, true, true), notify = { notices += it },
        onProgressReported = { revisions += 1 }, now = { now },
    )

    private fun url(name: String) = "http://provider.test/movie/u/p/$name.mkv"

    @Test
    fun `une panne passe à la variante équivalente suivante, sans redemander le serveur, et le dit`() = runTest {
        val player = service()
        player.play(Fixtures.film(variants = listOf("a", "b")))
        assertEquals(listOf(url("a")), engine.loads)
        engine.emitError()
        runCurrent()
        assertEquals(listOf(url("a"), url("b")), engine.loads)
        assertEquals("b", player.variant?.id)
        assertEquals(PlayerService.Phase.OPENING, player.phase)
        assertEquals(PlayerService.Toast("Variante changée automatiquement", "Fournisseur A → Fournisseur B · FR · HD"), player.toast)
        assertTrue(player.failedVariants.isFailed("a"), "la liste la marque « EN ÉCHEC »")
        assertFalse(player.failedVariants.isFailed("b"))
        // The switch is not the profile's choice: nothing kept, nothing sent.
        assertNull(player.remembered(null, "tmdb:movie:603", player.context!!.variants))
        assertTrue(client.rememberedVariants.isEmpty())
        // The second fails too and the first failed lately: no equivalent left, the same one again, then the dialog.
        engine.emit(EnginePhase.LOADING)
        engine.emitError()
        runCurrent()
        assertEquals(listOf(url("a"), url("b"), url("b")), engine.loads)
        engine.emit(EnginePhase.LOADING)
        engine.emitError()
        runCurrent()
        assertEquals(PlayerService.Phase.FAILED, player.phase)
        assertEquals(listOf("a"), player.alternativeVariants.map { it.id })
        // From the dialog the other one plays after all: its mark goes with its first picture.
        player.playInstead(player.alternativeVariants[0])
        engine.emit(EnginePhase.PLAYING)
        assertFalse(player.failedVariants.isFailed("a"))
        assertTrue(player.failedVariants.isFailed("b"))
        player.stop()
    }

    @Test
    fun `réglage coupé - pas de bascule, la même variante est réessayée`() = runTest {
        preferences.settings = preferences.settings.copy(switchVariantOnFailure = false)
        val player = service()
        player.play(Fixtures.film(variants = listOf("a", "b")))
        engine.emitError()
        runCurrent()
        assertEquals(listOf(url("a"), url("a")), engine.loads)
        assertNull(player.toast)
        player.stop()
    }

    @Test
    fun `sans équivalente - une autre qualité n'est jamais prise d'office, le dialogue liste les autres variantes dans l'ordre du serveur`() = runTest {
        val variants = listOf(
            Fixtures.variant("vf-fhd", "VF", Quality.FHD), Fixtures.variant("vf-hd", "VF", Quality.HD),
            Fixtures.variant("vo-fhd", "VO", Quality.FHD), Fixtures.variant("serie", "VF", Quality.FHD, url = null),
        )
        val player = service()
        player.play(Fixtures.film(variants = emptyList()).copy(variants = variants))
        assertEquals("vf-fhd", player.variant?.id)
        repeat(3) {
            engine.emit(EnginePhase.LOADING)
            engine.emitError()
            runCurrent()
        }
        assertEquals(List(3) { url("vf-fhd") }, engine.loads)
        assertEquals(PlayerService.Phase.FAILED, player.phase)
        assertNull(player.toast)
        assertEquals(listOf("vf-hd", "vo-fhd"), player.alternativeVariants.map { it.id })
        // Another variant from the dialog plays, without becoming the title's choice.
        player.playInstead(variants[2])
        assertEquals(url("vo-fhd"), engine.loads.last())
        assertNull(player.failure)
        runCurrent()
        assertTrue(client.rememberedVariants.isEmpty())
        player.stop()
    }

    @Test
    fun `une seule variante - deux nouveaux essais, puis le dialogue d'échec`() = runTest {
        val player = service()
        player.play(Fixtures.film(variants = listOf("a")))
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
    fun `une image sans décodeur va droit au dialogue, avec la raison, sans autre variante`() = runTest {
        val player = service()
        player.play(Fixtures.film(variants = listOf("a", "b")))
        engine.emit(EnginePhase.LOADING)
        engine.emitUnsupported()
        runCurrent()
        assertEquals(PlayerService.Phase.FAILED, player.phase)
        assertEquals(listOf(url("a")), engine.loads)
        assertEquals("L'image de ce flux est en MPEG-2, qu'aucun décodeur de cet appareil ne sait lire.", player.failure?.reason)
        player.stop()
    }

    @Test
    fun `sans image après 10 s, la variante équivalente est lancée`() = runTest {
        val player = service()
        player.play(Fixtures.film(variants = listOf("a", "b")))
        advanceTimeBy(PlayerService.START_TIMEOUT_MS + 1)
        runCurrent()
        assertEquals(listOf(url("a"), url("b")), engine.loads)
        player.stop()
    }

    @Test
    fun `les essais ratés d'un titre ne comptent pas pour le suivant`() = runTest {
        val player = service()
        player.play(Fixtures.film(variants = listOf("a")))
        for (n in 2..3) {
            engine.emit(EnginePhase.LOADING)
            engine.emitError()
            runCurrent()
            assertEquals(n, engine.loads.size)
        }
        player.play(Fixtures.film("tmdb:movie:949", variants = listOf("b")))
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
        player.play(Fixtures.film(variants = listOf("a")))
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
        player.play(Fixtures.film(variants = listOf("a")))
        val played = player.playPicked {
            player.stop()
            Fixtures.film("tmdb:movie:949", variants = listOf("b"))
        }
        assertFalse(played)
        assertNull(player.context)
        val again = service()
        again.play(Fixtures.film(variants = listOf("a")))
        assertTrue(again.playPicked { Fixtures.film("tmdb:movie:949", variants = listOf("b")) })
        assertEquals("tmdb:movie:949", again.context?.content?.id)
        again.stop()
    }

    // MARK: - Progress

    @Test
    fun `la position part toutes les 10 s, à la pause et à l'arrêt, et l'accueil se recharge à l'arrêt`() = runTest {
        val player = service()
        player.play(Fixtures.film(variants = listOf("a")))
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

    // MARK: - Measured picture

    @Test
    fun `image affichée - sa taille part au serveur une fois par ouverture, avec la variante lue`() = runTest {
        engine.pictureSize = PictureSize(1920, 1080)
        val player = service()
        player.play(Fixtures.film(variants = listOf("a", "b")))
        runCurrent()
        assertTrue(client.measures.isEmpty(), "rien avant la première image")
        engine.emit(EnginePhase.PLAYING)
        runCurrent()
        assertEquals(listOf(Triple("tmdb:movie:603", "a", PictureSize(1920, 1080))), client.measures)
        engine.emit(EnginePhase.BUFFERING)
        engine.emit(EnginePhase.PLAYING)
        engine.emitTime(30.0, 6000.0)
        runCurrent()
        assertEquals(1, client.measures.size)
        // Another variant is another stream: its own picture.
        engine.pictureSize = PictureSize(3840, 1608)
        player.switchVariant(player.context!!.variants[1])
        runCurrent()
        assertEquals(1, client.measures.size, "pas avant l'image de la nouvelle variante")
        engine.emit(EnginePhase.LOADING)
        engine.emit(EnginePhase.PLAYING)
        runCurrent()
        assertEquals(Triple("tmdb:movie:603", "b", PictureSize(3840, 1608)), client.measures.last())
        assertEquals(2, client.measures.size)
        player.stop()
    }

    @Test
    fun `image pas encore lue au premier affichage - envoyée dès que le moteur la connaît, une seule fois`() = runTest {
        val player = service()
        player.play(Fixtures.film(variants = listOf("a")))
        engine.emit(EnginePhase.PLAYING)
        engine.emitTime(1.0, 6000.0)
        runCurrent()
        assertEquals(PlayerService.Phase.PLAYING, player.phase)
        assertTrue(client.measures.isEmpty())
        engine.pictureSize = PictureSize(1280, 720)
        engine.emitTime(2.0, 6000.0)
        engine.emitTime(2.5, 6000.0)
        runCurrent()
        assertEquals(listOf(Triple("tmdb:movie:603", "a", PictureSize(1280, 720))), client.measures)
        player.stop()
    }

    @Test
    fun `chaque ouverture mesure de nouveau - reprise après une panne, zap - et un refus du serveur ne dérange rien`() = runTest {
        client.channelAnswer = { id -> Fixtures.channel(id, now = now) }
        engine.pictureSize = PictureSize(1920, 1080)
        val player = service()
        player.playChannel(tf1, listOf(tf1, france2))
        engine.emit(EnginePhase.PLAYING)
        runCurrent()
        assertEquals(listOf(Triple("live:fr-tf1", "live:fr-tf1-FHD", PictureSize(1920, 1080))), client.measures)
        // The stream is cut and opened again: read again.
        engine.emitError()
        runCurrent()
        engine.emit(EnginePhase.LOADING)
        engine.emit(EnginePhase.PLAYING)
        runCurrent()
        assertEquals(2, client.measures.size)
        // The server refuses the next one: nothing said, playback goes on, and it is not sent again.
        client.measureFails = true
        engine.pictureSize = PictureSize(1280, 720)
        player.zap(1)
        engine.emit(EnginePhase.LOADING)
        engine.emit(EnginePhase.PLAYING)
        engine.emitTime(5.0, 0.0)
        runCurrent()
        assertEquals("live:fr-france2", player.channel?.id)
        assertEquals(PlayerService.Phase.PLAYING, player.phase)
        assertEquals(2, client.measures.size)
        assertNull(player.toast)
        assertTrue(notices.isEmpty())
        client.measureFails = false
        engine.emitTime(6.0, 0.0)
        runCurrent()
        assertEquals(2, client.measures.size)
        player.stop()
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
        // Another start is another file: its own markers.
        player.switchVariant(ctx.variants[0])
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
        player.play(Fixtures.film(variants = listOf("a")))
        engine.emit(EnginePhase.PLAYING)
        assertNull(player.suggestions)
        advanceTimeBy(PlayerService.SUGGESTIONS_DELAY_MS + 1)
        runCurrent()
        assertEquals(1, player.suggestions?.related?.size)
        assertEquals("tmdb:movie:604", player.nextContext?.content?.id)
        assertTrue(player.upNext is PlayerService.UpNext.TitleNext)
        player.stop()
    }

    // MARK: - The profile's choice

    @Test
    fun `la variante choisie sur la fiche d'un film se lit aussitôt, part au serveur et vaut dès maintenant`() = runTest {
        val variants = listOf(Fixtures.variant("vf-fhd", "VF", Quality.FHD), Fixtures.variant("vf-fhd-b", "VF", Quality.FHD, provider = Fixtures.second))
        client.playbackAnswer = { Playback(variants = variants, duration = 6000.0) }
        val player = service()
        player.play("tmdb:movie:603", variantId = "vf-fhd-b")
        runCurrent()
        assertEquals(listOf(url("vf-fhd-b")), engine.loads)
        assertEquals(listOf("tmdb:movie:603" to "vf-fhd-b"), client.rememberedVariants)
        player.stop()
        // The sheet was fetched before the choice: what was chosen here wins over what it served.
        assertEquals("vf-fhd-b", player.startChoice("tmdb:movie:603", variants, RememberedVariant.of(variants[0]))?.id)
        player.forgetVariant("tmdb:movie:603")
        runCurrent()
        assertEquals("vf-fhd", player.startChoice("tmdb:movie:603", variants, RememberedVariant.of(variants[1]))?.id)
        assertEquals("tmdb:movie:603" to "", client.rememberedVariants.last())
    }

    @Test
    fun `la variante choisie sur un épisode part au serveur sous cet épisode, vaut pour la série, et l'épisode suivant démarre sur la sienne sous le même flux`() = runTest {
        // Both providers carry the series in the same language and quality: only the id tells whose stream plays.
        fun episode(n: Int) = listOf(Fixtures.variant("e$n-a", "VF", Quality.HD), Fixtures.variant("e$n-b", "VF", Quality.HD, provider = Fixtures.second))
        // The server keeps the stream chosen and names, on each episode, this episode's variant under it.
        client.playbackAnswer = { Playback(variants = episode(2), duration = 2700.0, remembered = if (client.rememberedVariants.isEmpty()) null else RememberedVariant.of(episode(2)[1])) }
        val player = service()
        val first = Fixtures.episode().copy(variants = episode(1))
        player.play(first)
        runCurrent()
        engine.emit(EnginePhase.PLAYING)
        assertEquals("e1-a", player.variant?.id)
        player.switchVariant(first.variants[1])
        assertEquals("e1-b", player.variant?.id)
        assertEquals("e1-b", player.remembered(null, "tmdb:tv:1396", first.variants)?.id)
        runCurrent()
        assertEquals(listOf("tmdb:tv:1396:s01e01" to "e1-b"), client.rememberedVariants)
        player.playNextNow()
        assertEquals("tmdb:tv:1396:s01e02", player.context?.content?.id)
        assertEquals("e2-b", player.variant?.id)
        player.stop()
        // An episode the server has not translated the choice for: the first of the same language and quality.
        assertEquals("e3-a", player.startChoice("tmdb:tv:1396", episode(3), null)?.id)
    }

    @Test
    fun `la variante choisie sur la fiche d'une série ne se lit pas - elle vaut pour ses épisodes`() = runTest {
        val series = listOf(Fixtures.variant("serie-fhd", "VF", Quality.FHD, url = null), Fixtures.variant("serie-hd", "VF", Quality.HD, url = null))
        val episode = listOf(Fixtures.variant("e1-fhd", "VF", Quality.FHD), Fixtures.variant("e1-hd", "VF", Quality.HD))
        val player = service()
        player.remember(series[1], "tmdb:tv:1396")
        runCurrent()
        assertEquals(listOf("tmdb:tv:1396" to "serie-hd"), client.rememberedVariants)
        assertTrue(engine.loads.isEmpty())
        assertEquals("serie-hd", player.remembered(null, "tmdb:tv:1396", series)?.id)
        assertEquals("e1-hd", player.startChoice("tmdb:tv:1396", episode, null)?.id)
        // A context holding nothing that plays says so instead of opening the player.
        player.play(PlaybackContext(PlaybackContent("tmdb:tv:1396", dev.crafters.kanstrimi.contract.ContentKind.SERIES, "Vincenzo"), series))
        assertNull(player.context)
        assertEquals(listOf("Lecture impossible · aucune variante"), notices)
    }

    @Test
    fun `réglage « mémoriser » coupé - le choix se lit mais ne se garde ni ici ni au serveur`() = runTest {
        preferences.settings = preferences.settings.copy(rememberVariants = false)
        val player = service()
        val ctx = Fixtures.film(variants = listOf("a", "b"))
        player.play(ctx)
        player.switchVariant(ctx.variants[1])
        runCurrent()
        assertEquals("b", player.variant?.id)
        assertTrue(client.rememberedVariants.isEmpty())
        player.stop()
        assertEquals("a", player.startChoice(ctx.content.id, ctx.variants, null)?.id)
    }

    // MARK: - Live

    private val tf1 = Fixtures.channel("live:fr-tf1", "TF1")
    private val france2 = Fixtures.channel("live:fr-france2", "FRANCE 2")

    @Test
    fun `une chaîne s'ouvre dans sa variante de départ, son guide arrive avec son détail, et ne se met jamais en pause`() = runTest {
        client.channelAnswer = { id -> Fixtures.channel(id, now = now) }
        val player = service()
        player.playChannel(tf1, listOf(tf1, france2))
        assertTrue(player.isLive)
        assertEquals(listOf("http://provider.test/live/u/p/live:fr-tf1-FHD.ts"), engine.loads)
        assertEquals(Channel.Guide.empty, player.epg)
        runCurrent()
        assertEquals("Journal", player.epg.now?.title)
        assertEquals("Film du soir", player.epg.next?.title)
        engine.emit(EnginePhase.PLAYING)
        player.togglePlayPause()
        player.pause()
        player.seekBy(-10.0)
        assertEquals(PlayerService.Phase.PLAYING, player.phase)
        assertTrue(engine.seeks.isEmpty())
        player.stop()
    }

    @Test
    fun `zapper envoie le temps regardé de la chaîne quittée sans recharger l'accueil, quitter l'envoie et le recharge`() = runTest {
        client.channelAnswer = { id -> Fixtures.channel(id, now = now) }
        val player = service()
        player.playChannel(tf1, listOf(tf1, france2))
        engine.emit(EnginePhase.PLAYING)
        now = now.plusSeconds(90)
        player.zap(1)
        runCurrent()
        assertEquals("live:fr-france2", player.channel?.id)
        assertEquals(2, engine.loads.size, "the same engine takes the new stream")
        assertEquals(listOf("live:fr-tf1" to 90), client.watchTimes)
        assertEquals(0, revisions, "not reloaded on a zap")
        // Around the end of the list, back to the first.
        engine.emit(EnginePhase.LOADING)
        engine.emit(EnginePhase.PLAYING)
        now = now.plusSeconds(30)
        player.zap(1)
        runCurrent()
        assertEquals("live:fr-tf1", player.channel?.id)
        assertEquals(listOf("live:fr-tf1" to 90, "live:fr-france2" to 30), client.watchTimes)
        engine.emit(EnginePhase.LOADING)
        engine.emit(EnginePhase.PLAYING)
        now = now.plusSeconds(45)
        player.stop()
        runCurrent()
        assertEquals("live:fr-tf1" to 45, client.watchTimes.last())
        assertEquals(1, revisions)
        assertNull(player.channel)
        assertTrue(player.channels.isEmpty())
    }

    @Test
    fun `le temps regardé part toutes les 10 s, le serveur en fait la somme`() = runTest {
        client.channelAnswer = { id -> Fixtures.channel(id, now = now) }
        val player = service()
        player.playChannel(tf1, listOf(tf1))
        engine.emit(EnginePhase.PLAYING)
        now = now.plusSeconds(10)
        advanceTimeBy(PlayerService.PROGRESS_INTERVAL_MS + 1)
        runCurrent()
        assertEquals(listOf("live:fr-tf1" to 10), client.watchTimes)
        now = now.plusSeconds(7)
        player.stop()
        runCurrent()
        assertEquals(listOf("live:fr-tf1" to 10, "live:fr-tf1" to 7), client.watchTimes)
    }

    @Test
    fun `changer de variante en direct garde la position au bord du direct, suit le guide de la variante et se mémorise pour la chaîne`() = runTest {
        client.channelAnswer = { id ->
            val c = Fixtures.channel(id, now = now)
            // The HD variant has a guide of its own.
            c.copy(variants = c.variants.map { v -> if (v.quality == Quality.HD) v.copy(hasEpg = true, now = Programme("Journal HD", now, now.plusSeconds(1800), null), next = null) else v })
        }
        val player = service()
        player.playChannel(tf1, listOf(tf1))
        runCurrent()
        engine.emit(EnginePhase.PLAYING)
        assertEquals("Journal", player.epg.now?.title)
        val hd = tf1.variants.first { it.quality == Quality.HD }
        player.switchVariant(hd)
        assertEquals(2, engine.loads.size)
        assertEquals("Journal HD", player.epg.now?.title)
        assertNull(player.epg.next)
        assertEquals(hd.id, player.remembered(null, "live:fr-tf1", tf1.variants)?.id)
        runCurrent()
        assertEquals(listOf("live:fr-tf1" to hd.id), client.rememberedVariants)
        player.stop()
        // The variant chosen is the one the channel starts in next time, before the server even says it back.
        player.playChannel(tf1, listOf(tf1))
        assertEquals(hd.id, player.variant?.id)
        player.stop()
        // What the server serves for the channel applies to a fresh launch.
        val again = service()
        again.playChannel(tf1.copy(remembered = RememberedVariant.of(hd)), listOf(tf1))
        assertEquals(hd.id, again.variant?.id)
        again.stop()
    }

    @Test
    fun `une chaîne qui ne démarre pas est réessayée puis passe au dialogue, comme un film`() = runTest {
        client.channelAnswer = { id -> Fixtures.channel(id, now = now) }
        val player = service()
        player.playChannel(tf1, listOf(tf1))
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
        assertTrue(player.isLive)
        player.stop()
    }
}
