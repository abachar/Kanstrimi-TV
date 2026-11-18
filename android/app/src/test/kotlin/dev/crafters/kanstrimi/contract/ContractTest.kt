package dev.crafters.kanstrimi.contract

import dev.crafters.kanstrimi.client.HttpCatalogClient
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.serializer
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlin.test.fail

/**
 * Real answers of `/player`, written by the server's `contract.db.test.ts` in `apple/kanstrimiTests/Contract/`:
 * each must decode into the type the app reads it with. A shape changed on one side fails here or there.
 */
class ContractTest {
    private val dir = File("../../apple/kanstrimiTests/Contract")

    private val readers: Map<String, (String) -> Unit> = mapOf(
        "info" to { decode<ServerInfo>(it).also { info -> assertTrue(info.counts.movies > 0); assertNotNull(info.profile) } },
        "profiles" to { text ->
            decode<Profiles>(text).also { p -> assertTrue(p.profiles.any { it.isDefault }) }
            // The settings carry the contract's names: a renamed key would read as its default, silently.
            val settings = Wire.json.parseToJsonElement(text).jsonObject.getValue("profiles").jsonArray[0].jsonObject.getValue("settings").jsonObject
            assertTrue(settings.keys.containsAll(settingsKeys), "réglages attendus : $settingsKeys")
        },
        "home" to { decode<Home>(it).also { home -> assertTrue(home.rows.isNotEmpty() && home.heroes.isNotEmpty()) } },
        "movies" to { decode<List<CatalogRow>>(it).also { rows -> assertTrue(rows.all { r -> r.cards.isNotEmpty() }) } },
        "series" to { decode<List<CatalogRow>>(it).also { rows -> assertTrue(rows.all { r -> r.cards.isNotEmpty() }) } },
        "movies-list" to { decode<Page<ContentItem>>(it) },
        "movies-studio" to { decode<Page<ContentItem>>(it) },
        "movie-detail" to {
            decode<Card>(it).also { c ->
                assertEquals(ContentKind.MOVIE, c.kind)
                assertTrue(c.variants.isNotEmpty() && c.variants.all { v -> v.isPlayable && v.badge.isNotEmpty() && v.label.isNotEmpty() })
                assertTrue(c.variants.any { v -> v.id == c.remembered?.id }, "la variante mémorisée est une de celles de la fiche")
            }
        },
        "series-detail" to {
            decode<Card>(it).also { c ->
                assertEquals(ContentKind.SERIES, c.kind)
                assertTrue(!c.seasons.isNullOrEmpty())
                // A series' own variants name its streams and play nothing; its episodes' play.
                assertTrue(c.variants.isNotEmpty() && c.variants.none { v -> v.isPlayable })
                assertTrue(c.seasons!!.flatMap { s -> s.episodes }.flatMap { e -> e.variants }.all { v -> v.isPlayable })
            }
        },
        "studios-movies" to { decode<List<Studio>>(it) },
        "studios-series" to { decode<List<Studio>>(it) },
        "sagas" to { decode<Page<ContentItem>>(it) },
        "saga" to { decode<SagaSheet>(it) },
        "person" to { decode<PersonSheet>(it) },
        "channels" to { decode<List<ChannelGroup>>(it).also { g -> assertTrue(g.flatMap { it.channels }.isNotEmpty()) } },
        "channel" to {
            decode<Channel>(it).also { c ->
                assertTrue(c.variants.isNotEmpty() && c.chips.isNotEmpty())
                assertTrue(c.variants.all { v -> v.chip in c.chips }, "chaque variante a sa pastille parmi celles de la chaîne")
                assertNotNull(c.remembered)
            }
        },
        "channel-programmes" to { decode<List<Programme>>(it) },
        "playback-movie" to { decode<Playback>(it).also { p -> assertTrue(p.variants.any { v -> v.id == p.remembered?.id }) } },
        "playback-series" to { decode<Playback>(it).also { p -> assertNotNull(p.episode) } },
        // The series' choice comes back as this episode's own variant.
        "playback-episode" to { decode<Playback>(it).also { p -> assertTrue(p.variants.any { v -> v.id == p.remembered?.id && v.isPlayable }) } },
        "suggestions" to { decode<Suggestions>(it) },
        "suggestions-episode" to { decode<Suggestions>(it) },
        "markers-episode" to { assertEquals(20, decode<PlaybackMarkers>(it).credits?.countdown) },
        "markers-none" to { assertEquals(PlaybackMarkers(), decode<PlaybackMarkers>(it)) },
        "search" to { decode<SearchResults>(it) },
        "error" to {
            // The client's error mapping must find the server's message in it.
            val e = HttpCatalogClient.error(500, it)
            assertTrue(e.message != "Erreur serveur (500)", "message du serveur attendu")
        },
        // The Top Shelf is tvOS only: the file must still be a non-empty list of objects.
        "top-shelf" to { assertTrue((Wire.json.parseToJsonElement(it) as JsonArray).all { e -> e.jsonObject.isNotEmpty() }) },
    )

    private inline fun <reified T> decode(text: String): T = Wire.json.decodeFromString(serializer<T>(), text)

    private val settingsKeys = setOf("max_quality", "auto_play_next", "remember_variants", "switch_variant_on_failure")

    @Test
    fun profileSettingsReadAndWriteTheContractsKeys() {
        val off = decode<ProfileSettings>("""{"max_quality":"HD","auto_play_next":false,"remember_variants":false,"switch_variant_on_failure":false}""")
        assertEquals(ProfileSettings(Quality.HD, autoPlayNext = false, rememberVariants = false, switchVariantOnFailure = false), off)
        val patch = Wire.json.encodeToString(ProfileSettingsPatch.serializer(), ProfileSettingsPatch(off))
        assertEquals(settingsKeys, Wire.json.parseToJsonElement(patch).jsonObject.keys)
    }

    @Test
    fun aVariantsLinesSayWhatItIsAndWhoseStreamItIs() {
        val variants = decode<Card>(File(dir, "movie-detail.json").readText()).variants
        assertTrue(variants.mixLanguages)
        assertEquals("FR · 4K DV", variants[0].title(amongLanguages = true))
        assertEquals("4K DV", variants[0].title(amongLanguages = false))
        assertEquals("provider.test · |FR| Matrix (4K)", variants[0].stream)
        val long = variants[0].copy(edition = "Version longue")
        assertEquals("4K DV · Version longue", long.title(amongLanguages = false))
        assertFalse(listOf(variants[0], long).mixLanguages)
    }

    @Test
    fun everyRecordedAnswerDecodes() {
        assertTrue(dir.isDirectory, "dossier des réponses absent : ${dir.absolutePath}")
        for ((name, read) in readers) {
            val file = File(dir, "$name.json")
            assertTrue(file.isFile, "réponse absente : $name")
            try { read(file.readText()) } catch (e: AssertionError) { throw e } catch (e: Exception) { fail("$name : ${e.message}") }
        }
    }

    @Test
    fun noRecordedAnswerEscapesTheTest() {
        val files = dir.listFiles { f -> f.extension == "json" }!!.map { it.nameWithoutExtension }.toSet()
        assertEquals(readers.keys, files)
    }

    @Test
    fun datesReadWithAndWithoutFractionalSeconds() {
        assertEquals(InstantSerializer.parse("2026-09-30T18:30:00.000Z"), InstantSerializer.parse("2026-09-30T18:30:00Z"))
        assertEquals(InstantSerializer.parse("2026-09-30T20:30:00+02:00"), InstantSerializer.parse("2026-09-30T18:30:00Z"))
    }

    @Test
    fun unknownEnumerationValuesReadAsOther() {
        val item = decode<ContentItem>("""{"id":"x","kind":"hologram","title":"T","logo":null,"poster":null,"picture":null,"facts":null,"quality":null,"badges":[],"hint":null,"progress":null,"watched":false,"caption":null,"overview":null}""")
        assertEquals(ContentKind.OTHER, item.kind)
        val row = decode<HomeRow>("""{"id":"r","kind":"mystery","title":"R","cards":[]}""")
        assertEquals(HomeRowKind.OTHER, row.kind)
    }
}
