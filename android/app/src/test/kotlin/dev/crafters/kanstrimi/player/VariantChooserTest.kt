package dev.crafters.kanstrimi.player

import dev.crafters.kanstrimi.contract.DynamicRange
import dev.crafters.kanstrimi.contract.Quality
import dev.crafters.kanstrimi.contract.RememberedVariant
import org.junit.Test
import java.time.Instant
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class VariantChooserTest {
    private val variants = Fixtures.canvasVariants
    private val uhd = VariantChooser.Capabilities(maxQuality = Quality.UHD, supportsHdr = true, supportsDolbyVision = true)
    private fun remembered(id: String, language: String, quality: Quality, dr: DynamicRange? = null, edition: String? = null) =
        RememberedVariant(id, language, quality, dr, edition, label = "")

    // MARK: - Without a choice

    @Test
    fun `sans choix - la première langue du serveur, sa meilleure qualité qui convient`() {
        assertEquals("vf-4k-dv", VariantChooser(Quality.UHD, uhd).start(variants)?.id)
        // The server's order is the profile's: VOSTFR first there, VOSTFR here.
        val vostFirst = variants.filter { it.language == "VOSTFR" } + variants.filter { it.language != "VOSTFR" }
        assertEquals("vostfr-4k-hdr", VariantChooser(Quality.UHD, uhd).start(vostFirst)?.id)
    }

    @Test
    fun `la qualité maximale du profil écarte le 4K`() {
        assertEquals("vf-fhd", VariantChooser(Quality.FHD, uhd).start(variants)?.id)
    }

    @Test
    fun `la tablette plafonne à la Full HD et sans Dolby Vision même si le profil demande le 4K`() {
        assertEquals("vf-fhd", VariantChooser(Quality.UHD).start(variants)?.id)
        val noDv = VariantChooser(Quality.UHD, VariantChooser.Capabilities(Quality.UHD, supportsHdr = true, supportsDolbyVision = false))
        assertEquals("vf-4k-hdr", noDv.start(variants)?.id)
        val sdr = VariantChooser(Quality.UHD, VariantChooser.Capabilities(Quality.UHD, supportsHdr = false, supportsDolbyVision = false))
        assertEquals("vf-fhd", sdr.start(variants)?.id)
    }

    @Test
    fun `à qualité et plage égales - le premier fournisseur qui n'est pas en échec, tous en échec le premier`() {
        val noDv = VariantChooser.Capabilities(Quality.UHD, supportsHdr = true, supportsDolbyVision = false)
        assertEquals("vf-4k-hdr-b", VariantChooser(Quality.UHD, noDv) { it == "vf-4k-hdr" }.start(variants)?.id)
        assertEquals("vf-4k-hdr", VariantChooser(Quality.UHD, noDv) { true }.start(variants)?.id)
        // A failure does not lower the quality: the equivalents only.
        assertEquals("vf-4k-dv", VariantChooser(Quality.UHD, uhd) { it == "vf-4k-dv" }.start(variants)?.id)
    }

    @Test
    fun `rien ne convient - la plus basse qualité, l'image la plus simple`() {
        val list = listOf(
            Fixtures.variant("vf-4k-dv", "VF", Quality.UHD, dr = DynamicRange.DOLBY_VISION),
            Fixtures.variant("vf-4k", "VF", Quality.UHD),
            Fixtures.variant("vf-fhd-dv", "VF", Quality.FHD, dr = DynamicRange.DOLBY_VISION),
            Fixtures.variant("vf-fhd-hdr", "VF", Quality.FHD, dr = DynamicRange.HDR),
        )
        val chooser = VariantChooser(Quality.HD, VariantChooser.Capabilities(Quality.UHD, supportsHdr = false, supportsDolbyVision = false))
        assertEquals("vf-fhd-hdr", chooser.start(list)?.id)
    }

    @Test
    fun `une seule variante jouable - elle, quoi qu'elle soit`() {
        val only = listOf(Fixtures.variant("vostfr-4k-dv", "VOSTFR", Quality.UHD, dr = DynamicRange.DOLBY_VISION))
        assertEquals("vostfr-4k-dv", VariantChooser(Quality.HD).start(only)?.id)
        // The series' own variants beside it play nothing and do not count.
        val withSeries = only + Fixtures.variant("serie", "VF", Quality.HD, url = null)
        assertEquals("vostfr-4k-dv", VariantChooser(Quality.HD).start(withSeries)?.id)
    }

    @Test
    fun `une édition n'est jamais le choix automatique tant que le montage habituel existe`() {
        val chooser = VariantChooser(Quality.UHD, uhd)
        val long = Fixtures.variant("vf-4k-longue", "VF", Quality.UHD, edition = "Version longue")
        val list = listOf(Fixtures.variant("vf-hd", "VF", Quality.HD), long)
        assertEquals("vf-hd", chooser.start(list)?.id)
        assertEquals("vf-4k-longue", chooser.start(list, RememberedVariant.of(long))?.id)
        // No usual cut in the first language: its edition, not the next language.
        val only = listOf(Fixtures.variant("vf-hd-nb", "VF", Quality.HD, edition = "Noir et blanc"), Fixtures.variant("vo-hd", "VO", Quality.HD))
        assertEquals("vf-hd-nb", chooser.start(only)?.id)
    }

    // MARK: - With the profile's choice

    @Test
    fun `la variante mémorisée, encore dans la liste, prime sur tout`() {
        val chooser = VariantChooser(Quality.HD) { true }
        // Above the ceilings, failed lately, behind another language: still the one chosen.
        assertEquals("vo-fhd", chooser.start(variants, remembered("vo-fhd", "VO", Quality.FHD))?.id)
        assertEquals("vf-4k-hdr-b", chooser.start(variants, remembered("vf-4k-hdr-b", "VF", Quality.UHD, DynamicRange.HDR))?.id)
    }

    @Test
    fun `variante mémorisée absente - la première de même langue, qualité, plage et montage, pas en échec d'abord`() {
        val gone = remembered("src-gone", "VF", Quality.UHD, DynamicRange.HDR)
        assertEquals("vf-4k-hdr", VariantChooser(Quality.FHD).start(variants, gone)?.id)
        assertEquals("vf-4k-hdr-b", VariantChooser(Quality.FHD) { it == "vf-4k-hdr" }.start(variants, gone)?.id)
        assertEquals("vf-4k-hdr", VariantChooser(Quality.FHD) { true }.start(variants, gone)?.id)
    }

    @Test
    fun `variante mémorisée absente et sans équivalente - la meilleure de sa langue, son montage d'abord`() {
        val chooser = VariantChooser(Quality.UHD, uhd)
        // VOSTFR in HD is not listed: the best VOSTFR that fits, not the first language.
        assertEquals("vostfr-4k-hdr", chooser.start(variants, remembered("src-gone", "VOSTFR", Quality.HD))?.id)
        assertEquals("vostfr-fhd", VariantChooser(Quality.FHD, uhd).start(variants, remembered("src-gone", "VOSTFR", Quality.HD))?.id)
        // A series watched in an edition stays in it when the episode has it, in another quality.
        val episode = listOf(Fixtures.variant("vf-4k", "VF", Quality.UHD), Fixtures.variant("vf-fhd-nb", "VF", Quality.FHD, edition = "Noir et blanc"))
        assertEquals("vf-fhd-nb", chooser.start(episode, remembered("src-gone", "VF", Quality.HD, edition = "Noir et blanc"))?.id)
        // The episode does not have that edition: the whole language, its usual cut.
        assertEquals("vf-4k", chooser.start(episode, remembered("src-gone", "VF", Quality.HD, edition = "Version longue"))?.id)
        // The language is gone altogether: as if nothing had been chosen.
        assertEquals("vf-4k-dv", chooser.start(variants, remembered("src-gone", "DE", Quality.HD))?.id)
    }

    // MARK: - Failures

    @Test
    fun `les équivalentes d'une variante - même langue, qualité, plage et montage, dans l'ordre du serveur`() {
        val chooser = VariantChooser(Quality.UHD, uhd)
        assertEquals(listOf("vf-4k-hdr", "vf-4k-hdr-b"), chooser.equivalents(variants[1], variants).map { it.id })
        assertEquals(listOf("vf-4k-dv"), chooser.equivalents(variants[0], variants).map { it.id })
        val long = Fixtures.variant("vf-4k-hdr-longue", "VF", Quality.UHD, dr = DynamicRange.HDR, edition = "Version longue")
        assertEquals(listOf("vf-4k-hdr-longue"), chooser.equivalents(long, variants + long).map { it.id })
    }

    @Test
    fun `bascule automatique - l'équivalente suivante qui n'est pas en échec, puis plus rien`() {
        val chooser = VariantChooser(Quality.UHD, uhd)
        assertEquals("vf-4k-hdr-b", chooser.next(variants[1], variants)?.id)
        assertEquals("vf-4k-hdr", chooser.next(variants[2], variants)?.id)
        assertNull(chooser.next(variants[0], variants), "aucune équivalente")
        val failed = VariantChooser(Quality.UHD, uhd) { it == "vf-4k-hdr-b" }
        assertNull(failed.next(variants[1], variants), "la seule équivalente est en échec")
    }

    @Test
    fun `le dialogue d'échec propose toutes les autres variantes, dans l'ordre du serveur`() {
        val chooser = VariantChooser(Quality.HD)
        assertEquals(listOf("vf-4k-dv", "vf-4k-hdr", "vf-4k-hdr-b", "vostfr-4k-hdr", "vostfr-fhd", "vo-fhd"), chooser.alternatives(variants[3], variants).map { it.id })
    }

    @Test
    fun `sans variante jouable - rien à lire`() {
        val chooser = VariantChooser(Quality.UHD, uhd)
        assertNull(chooser.start(emptyList()))
        // A series' own variants, on its sheet, name its streams and play nothing.
        val series = listOf(Fixtures.variant("serie-a", "VF", Quality.HD, url = null), Fixtures.variant("serie-b", "VF", Quality.HD, provider = Fixtures.second, url = null))
        assertNull(chooser.start(series))
        assertNull(chooser.start(series, RememberedVariant.of(series[1])))
        assertTrue(chooser.alternatives(series[0], series).isEmpty())
    }

    @Test
    fun `une variante en échec l'est pendant 24 h, puis plus, et un démarrage réussi efface la marque`() {
        var now = Instant.ofEpochSecond(1_000_000)
        val store = FailedVariantsStore { now }
        store.markFailed("a")
        assertTrue(store.isFailed("a"))
        now = now.plusSeconds(23 * 3600)
        assertTrue(store.isFailed("a"))
        now = now.plusSeconds(2 * 3600)
        assertFalse(store.isFailed("a"))
        store.markFailed("b")
        store.clear("b")
        assertFalse(store.isFailed("b"))
    }

    @Test
    fun `l'identifiant de série d'un épisode`() {
        assertEquals("tmdb:tv:1396", seriesIdOf("tmdb:tv:1396:s01e05"))
        assertNull(seriesIdOf("tmdb:movie:603"))
    }
}
