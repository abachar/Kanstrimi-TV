package dev.crafters.kanstrimi.player

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class MpvTracksTest {
    @Test
    fun `mpv's track-list becomes audio and subtitle tracks with aid and sid keys`() {
        val json = """[
          {"id":1,"type":"video","codec":"mpeg2video","selected":true},
          {"id":1,"type":"audio","lang":"fra","codec":"mp2","demux-channel-count":2,"selected":true},
          {"id":2,"type":"audio","title":"Audiodescription","lang":"fra","codec":"ac3","demux-channel-count":6,"selected":false},
          {"id":1,"type":"sub","lang":"fra","codec":"dvb_subtitle","selected":false}
        ]"""
        val parsed = MpvPlaybackEngine.parseTracks(Json.parseToJsonElement(json).jsonArray)
        assertEquals(
            listOf(EngineTrack("aid:1", "Français (MP2 stéréo)", "fra", true), EngineTrack("aid:2", "Audiodescription (AC3 5.1)", "fra", false)),
            parsed.audio,
        )
        assertEquals(listOf(EngineTrack("sid:1", "Français", "fra", false)), parsed.text)
    }

    @Test
    fun `a track key maps to mpv's property, anything else is ignored`() {
        assertEquals("aid" to "2", MpvPlaybackEngine.trackSelection("aid:2"))
        assertEquals("sid" to "1", MpvPlaybackEngine.trackSelection("sid:1"))
        assertNull(MpvPlaybackEngine.trackSelection("0:1"))
        assertNull(MpvPlaybackEngine.trackSelection("vid:1"))
    }

    @Test
    fun `codec names as the badges show them`() {
        assertEquals("MPEG-2", MpvPlaybackEngine.codecLabel("mpeg2video"))
        assertEquals("H.264", MpvPlaybackEngine.codecLabel("h264"))
        assertEquals("DVB_SUBTITLE", MpvPlaybackEngine.codecLabel("dvb_subtitle"))
    }
}
