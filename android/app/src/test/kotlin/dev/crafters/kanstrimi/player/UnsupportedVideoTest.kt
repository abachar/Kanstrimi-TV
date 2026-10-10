package dev.crafters.kanstrimi.player

import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.MimeTypes
import androidx.media3.common.TrackGroup
import androidx.media3.common.Tracks
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class UnsupportedVideoTest {
    private fun group(mime: String, support: Int, selected: Boolean = false): Tracks.Group {
        val format = Format.Builder().setSampleMimeType(mime).build()
        return Tracks.Group(TrackGroup(format), false, intArrayOf(support), booleanArrayOf(selected))
    }

    @Test
    fun `mpeg2 sans décodeur - la raison nomme le codec`() {
        val tracks = Tracks(listOf(group(MimeTypes.VIDEO_MPEG2, C.FORMAT_UNSUPPORTED_SUBTYPE), group(MimeTypes.AUDIO_MPEG, C.FORMAT_HANDLED, true)))
        assertEquals("L'image de ce flux est en MPEG-2, que cet appareil ne sait pas décoder.", ExoPlaybackEngine.unsupportedVideo(tracks))
    }

    @Test
    fun `une vidéo décodable, même au-delà des capacités - rien`() {
        assertNull(ExoPlaybackEngine.unsupportedVideo(Tracks(listOf(group(MimeTypes.VIDEO_H265, C.FORMAT_EXCEEDS_CAPABILITIES), group(MimeTypes.AUDIO_AAC, C.FORMAT_HANDLED, true)))))
        assertNull(ExoPlaybackEngine.unsupportedVideo(Tracks(listOf(group(MimeTypes.VIDEO_H264, C.FORMAT_HANDLED, true)))))
    }

    @Test
    fun `un flux sans vidéo - rien`() {
        assertNull(ExoPlaybackEngine.unsupportedVideo(Tracks(listOf(group(MimeTypes.AUDIO_AAC, C.FORMAT_HANDLED, true)))))
        assertNull(ExoPlaybackEngine.unsupportedVideo(Tracks.EMPTY))
    }
}
