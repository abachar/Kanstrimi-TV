package dev.crafters.kanstrimi.contract

import dev.crafters.kanstrimi.client.HttpCatalogClient
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.serializer
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
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
        "info" to { decode<ServerInfo>(it).also { info -> assertTrue(info.counts.movies > 0) } },
        "home" to { decode<Home>(it).also { home -> assertTrue(home.rows.isNotEmpty() && home.heroes.isNotEmpty()) } },
        "movies" to { decode<List<CatalogRow>>(it).also { rows -> assertTrue(rows.all { r -> r.cards.isNotEmpty() }) } },
        "series" to { decode<List<CatalogRow>>(it).also { rows -> assertTrue(rows.all { r -> r.cards.isNotEmpty() }) } },
        "movies-list" to { decode<Page<ContentItem>>(it) },
        "movies-studio" to { decode<Page<ContentItem>>(it) },
        "movie-detail" to { decode<Card>(it).also { c -> assertEquals(ContentKind.MOVIE, c.kind); assertTrue(c.versions.isNotEmpty()) } },
        "series-detail" to { decode<Card>(it).also { c -> assertEquals(ContentKind.SERIES, c.kind); assertTrue(!c.seasons.isNullOrEmpty()) } },
        "studios-movies" to { decode<List<Studio>>(it) },
        "studios-series" to { decode<List<Studio>>(it) },
        "sagas" to { decode<Page<ContentItem>>(it) },
        "saga" to { decode<SagaSheet>(it) },
        "person" to { decode<PersonSheet>(it) },
        "channels" to { decode<List<ChannelGroup>>(it).also { g -> assertTrue(g.flatMap { it.channels }.isNotEmpty()) } },
        "channel" to { decode<Channel>(it).also { c -> assertTrue(c.versions.isNotEmpty()) } },
        "channel-programmes" to { decode<List<Programme>>(it) },
        "playback-movie" to { decode<Playback>(it) },
        "playback-series" to { decode<Playback>(it).also { p -> assertNotNull(p.episode) } },
        "playback-episode" to { decode<Playback>(it) },
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
