package dev.crafters.kanstrimi.player

import dev.crafters.kanstrimi.contract.DynamicRange
import dev.crafters.kanstrimi.contract.Quality
import dev.crafters.kanstrimi.contract.Version
import org.junit.Test
import java.time.Instant
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class VersionChooserTest {
    private val versions = Fixtures.canvasVersions
    private val uhd = VersionChooser.Capabilities(maxQuality = Quality.UHD, supportsHdr = true, supportsDolbyVision = true)

    @Test
    fun `préférences - VF puis meilleure qualité qui tient dans le plafond`() {
        val chooser = VersionChooser(listOf("VF", "VOSTFR", "VO"), Quality.UHD, uhd)
        val choice = chooser.choose(versions)
        assertEquals("vf-4k-dv", choice?.version?.id)
        assertEquals(VersionChooser.Reason.PREFERENCES, choice?.reason)
        assertEquals("vf-4k-dv-s0", choice?.source?.id)
    }

    @Test
    fun `le plafond de qualité écarte le 4K`() {
        val chooser = VersionChooser(listOf("VF"), Quality.FHD, uhd)
        assertEquals("vf-fhd", chooser.choose(versions)?.version?.id)
    }

    @Test
    fun `la tablette plafonne à la Full HD et sans Dolby Vision même si les réglages demandent le 4K`() {
        val chooser = VersionChooser(listOf("VF"), Quality.UHD)
        assertEquals("vf-fhd", chooser.choose(versions)?.version?.id)
        val noDv = VersionChooser(listOf("VF"), Quality.UHD, VersionChooser.Capabilities(Quality.UHD, supportsHdr = true, supportsDolbyVision = false))
        assertEquals("vf-4k-hdr", noDv.choose(versions)?.version?.id)
    }

    @Test
    fun `le choix mémorisé pour le titre prime sur tout`() {
        val chooser = VersionChooser(listOf("VF"), Quality.UHD, uhd)
        val choice = chooser.choose(versions, remembered = "vo-fhd")
        assertEquals("vo-fhd", choice?.version?.id)
        assertEquals(VersionChooser.Reason.REMEMBERED, choice?.reason)
    }

    @Test
    fun `un titre passé en FHD repart en FHD, la première fois la meilleure, plus rien quand la préférence est coupée`() {
        val prefs = FakePreferences(languageOrder = listOf("VF"))
        val chooser = VersionChooser(listOf("VF"), Quality.UHD, uhd)
        val list = listOf(Fixtures.version("vf-4k", "VF", Quality.UHD), Fixtures.version("vf-fhd", "VF", Quality.FHD), Fixtures.version("vf-hd", "VF", Quality.HD))
        assertEquals("vf-4k", chooser.start("live:fr-tf1", list, null, prefs)?.version?.id)
        prefs.remember("vf-fhd", "live:fr-tf1")
        assertEquals("vf-fhd", chooser.start("live:fr-tf1", list, null, prefs)?.version?.id)
        assertEquals("vf-4k", chooser.start("live:fr-m6", list, null, prefs)?.version?.id)
        prefs.rememberVersionPerTitle = false
        assertEquals("vf-4k", chooser.start("live:fr-tf1", list, null, prefs)?.version?.id)
    }

    @Test
    fun `la langue de la série s'applique même si la qualité exacte manque`() {
        val chooser = VersionChooser(listOf("VF"), Quality.UHD, uhd)
        val key = VersionChoiceKey("VOSTFR", Quality.HD, null)
        val choice = chooser.choose(versions, seriesChoice = key)
        assertEquals("VOSTFR", choice?.version?.language)
        assertEquals("vostfr-4k-hdr", choice?.version?.id)
        assertEquals(VersionChooser.Reason.SERIES_LANGUAGE, choice?.reason)
    }

    @Test
    fun `aucune version dans la langue préférée - première de l'ordre serveur`() {
        val chooser = VersionChooser(listOf("DE"), Quality.UHD, uhd)
        val choice = chooser.choose(versions)
        assertEquals("vf-4k-dv", choice?.version?.id)
        assertEquals(VersionChooser.Reason.FALLBACK_LANGUAGE, choice?.reason)
    }

    @Test
    fun `une source en échec récent est écartée au profit de la suivante, toutes en échec la première rejoue`() {
        val chooser = VersionChooser(listOf("VF"), Quality.UHD, uhd) { it == "vf-4k-hdr-s0" }
        assertEquals("vf-4k-hdr-s1", chooser.choose(versions, remembered = "vf-4k-hdr")?.source?.id)
        val allFailed = VersionChooser(listOf("VF"), Quality.UHD, uhd) { true }
        assertEquals("vf-4k-dv-s0", allFailed.choose(versions)?.source?.id)
    }

    @Test
    fun `source suivante pour la bascule automatique, puis plus rien`() {
        val chooser = VersionChooser(listOf("VF"), Quality.UHD, uhd)
        val v = versions[1]
        assertEquals("vf-4k-hdr-s1", chooser.nextSource(v.sources[0], v)?.id)
        assertEquals("vf-4k-hdr-s0", chooser.nextSource(v.sources[1], v)?.id)
        assertNull(chooser.nextSource(versions[0].sources[0], versions[0]))
    }

    @Test
    fun `les alternatives suivent la langue préférée puis la qualité`() {
        val chooser = VersionChooser(listOf("VF", "VOSTFR", "VO"), Quality.UHD, uhd)
        assertEquals(listOf("vf-4k-hdr", "vf-fhd", "vostfr-4k-hdr", "vostfr-fhd", "vo-fhd"), chooser.alternatives(versions[0], versions).map { it.id })
    }

    @Test
    fun `une seule version - elle est jouée quelle que soit la langue`() {
        val chooser = VersionChooser(listOf("VF"), Quality.UHD, uhd)
        assertEquals(VersionChooser.Reason.ONLY_ONE, chooser.choose(listOf(Fixtures.version("vostfr-fhd", "VOSTFR", Quality.FHD)))?.reason)
    }

    @Test
    fun `une édition n'est jamais le choix automatique tant que le montage habituel existe`() {
        val chooser = VersionChooser(listOf("VF"), Quality.UHD, uhd)
        val list = listOf(Fixtures.version("vf-hd", "VF", Quality.HD), Fixtures.version("vf-4k-version-longue", "VF", Quality.UHD, edition = "Version longue"))
        assertEquals("vf-hd", chooser.choose(list)?.version?.id)
        assertEquals("vf-4k-version-longue", chooser.choose(list, remembered = "vf-4k-version-longue")?.version?.id)
        assertEquals(listOf("vf-hd"), chooser.alternatives(list[1], list).map { it.id })
        val only = listOf(Fixtures.version("vf-hd-nb", "VF", Quality.HD, edition = "Noir et blanc"), Fixtures.version("vo-hd", "VO", Quality.HD))
        assertEquals("vf-hd-nb", chooser.choose(only)?.version?.id)
    }

    @Test
    fun `la série regardée dans une édition y reste, la clé survit à l'aller-retour texte`() {
        val chooser = VersionChooser(listOf("VF"), Quality.UHD, uhd)
        val key = VersionChoiceKey(Fixtures.version("vf-hd-nb", "VF", Quality.HD, edition = "Noir et blanc"))
        assertEquals(key, VersionChoiceKey.parse(key.rawValue))
        assertNull(VersionChoiceKey.parse("VF/HD/")?.edition)
        assertEquals("FR · HD · Noir et blanc", key.label)
        val episode = listOf(Fixtures.version("vf-4k", "VF", Quality.UHD), Fixtures.version("vf-fhd-nb", "VF", Quality.FHD, edition = "Noir et blanc"))
        assertEquals("vf-fhd-nb", chooser.choose(episode, seriesChoice = key)?.version?.id)
    }

    @Test
    fun `sans versions ou sans sources - rien à jouer`() {
        val chooser = VersionChooser(listOf("VF"), Quality.UHD, uhd)
        assertNull(chooser.choose(emptyList()))
        assertNull(chooser.choose(listOf(Version(id = "x", language = "VF", quality = Quality.HD))))
    }

    @Test
    fun `versions classées - langue, montage habituel avant édition, meilleure qualité`() {
        val list = listOf(
            Fixtures.version("vf-long", "VF", Quality.UHD, edition = "Version longue"),
            Fixtures.version("vf-fhd", "VF", Quality.FHD),
            Fixtures.version("vo-fhd", "VO", Quality.FHD),
            Fixtures.version("vf-4k", "VF", Quality.UHD),
            Fixtures.version("vf-4k-dv", "VF", Quality.UHD, dr = DynamicRange.DOLBY_VISION),
        )
        assertEquals(listOf("vf-4k-dv", "vf-4k", "vf-fhd", "vf-long", "vo-fhd"), VersionChooser.ordered(list).map { it.id })
        assertEquals(listOf("vo-fhd", "vf-4k-dv", "vf-4k", "vf-fhd", "vf-long"), VersionChooser.ordered(list, recommended = "vo-fhd").map { it.id })
    }

    @Test
    fun `une source en échec l'est pendant 24 h, puis plus, et un démarrage réussi efface la marque`() {
        var now = Instant.ofEpochSecond(1_000_000)
        val store = FailedSourcesStore { now }
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

    @Test
    fun withoutAnOrderTheServersOrderWinsTheProfilesFilter() {
        val vostFirst = listOf(Fixtures.version("vostfr-fhd", "VOSTFR", Quality.FHD), Fixtures.version("vf-fhd", "VF", Quality.FHD))
        val chooser = VersionChooser(emptyList(), Quality.FHD)
        assertEquals("vostfr-fhd", chooser.choose(vostFirst)?.version?.id)
        assertEquals("vf-fhd", chooser.choose(vostFirst.reversed())?.version?.id)
    }
}
