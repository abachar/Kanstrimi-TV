package dev.crafters.kanstrimi.player

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class FallbackPlaybackEngineTest {
    private class Ears : PlaybackEngine.Listener {
        val events = ArrayList<String>()
        override fun onPhase(phase: EnginePhase) { events.add("phase:$phase") }
        override fun onTime(position: Double, duration: Double, bufferedPercent: Int) {}
        override fun onFirstFrame() { events.add("frame") }
        override fun onTracks() {}
        override fun onError(message: String) { events.add("error:$message") }
        override fun onUnsupported(codec: String) { events.add("unsupported:$codec") }
    }

    private val description = MediaDescription("Chaîne")

    @Test
    fun `ExoPlayer first, mpv takes the same stream over when the picture is beyond ExoPlayer`() {
        val exo = FakePlaybackEngine()
        val mpv = FakePlaybackEngine()
        val engine = FallbackPlaybackEngine(exo, mpv)
        val ears = Ears().also { engine.listener = it }
        engine.load("http://p/live.ts", true, null, description)
        assertEquals(listOf("http://p/live.ts"), exo.loads)
        assertTrue(mpv.loads.isEmpty())
        assertFalse(engine.usesMpv)
        exo.emitUnsupported("MPEG-2")
        assertTrue(engine.usesMpv)
        assertEquals(1, exo.stops)
        assertEquals(listOf("http://p/live.ts"), mpv.loads)
        assertTrue(ears.events.none { it.startsWith("unsupported") })
        // From now on the player hears mpv, not ExoPlayer.
        mpv.emit(EnginePhase.PLAYING)
        exo.emit(EnginePhase.PAUSED)
        assertEquals(listOf("phase:PLAYING", "frame"), ears.events)
        assertEquals(EnginePhase.PLAYING, engine.phase)
        engine.pause()
        assertEquals(EnginePhase.PAUSED, mpv.phase)
        // The next stream starts on ExoPlayer again.
        engine.load("http://p/film.mkv", false, 12.0, description)
        assertFalse(engine.usesMpv)
        assertEquals(1, mpv.stops)
        assertEquals(listOf("http://p/live.ts", "http://p/film.mkv"), exo.loads)
    }

    @Test
    fun `mpv giving up too, or no mpv at all, reaches the player as unsupported`() {
        val exo = FakePlaybackEngine()
        val mpv = FakePlaybackEngine()
        val engine = FallbackPlaybackEngine(exo, mpv)
        val ears = Ears().also { engine.listener = it }
        engine.load("http://p/live.ts", true, null, description)
        exo.emitUnsupported("MPEG-2")
        mpv.emitUnsupported("MPEG-2")
        assertEquals(listOf("unsupported:MPEG-2"), ears.events)

        val alone = FallbackPlaybackEngine(FakePlaybackEngine(), null)
        val aloneEars = Ears().also { alone.listener = it }
        alone.load("http://p/live.ts", true, null, description)
        alone.exo.emitUnsupported("MPEG-2")
        assertEquals(listOf("unsupported:MPEG-2"), aloneEars.events)
        assertFalse(alone.usesMpv)
    }

    @Test
    fun `stop stops both and comes back to ExoPlayer`() {
        val exo = FakePlaybackEngine()
        val mpv = FakePlaybackEngine()
        val engine = FallbackPlaybackEngine(exo, mpv)
        engine.listener = Ears()
        engine.load("http://p/live.ts", true, null, description)
        exo.emitUnsupported("MPEG-2")
        engine.stop()
        assertFalse(engine.usesMpv)
        assertEquals(2, exo.stops)
        assertEquals(1, mpv.stops)
    }
}
