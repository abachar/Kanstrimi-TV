package dev.crafters.kanstrimi.client

import dev.crafters.kanstrimi.contract.MeasureResult
import dev.crafters.kanstrimi.contract.PictureSize
import dev.crafters.kanstrimi.contract.ProfileSettings
import dev.crafters.kanstrimi.contract.ProfileSettingsPatch
import dev.crafters.kanstrimi.contract.Quality
import kotlinx.coroutines.runBlocking
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class HttpCatalogClientTest {
    @Test
    fun tokenTravelsOverHttpsOrTheLanOnly() {
        assertTrue(HttpCatalogClient.mayCarryToken("https://kanstrimi.example/player".toHttpUrl()))
        assertTrue(HttpCatalogClient.mayCarryToken("http://192.168.1.20:3000/player".toHttpUrl()))
        assertTrue(HttpCatalogClient.mayCarryToken("http://harbor.local/player".toHttpUrl()))
        assertTrue(HttpCatalogClient.mayCarryToken("http://localhost:3000/player".toHttpUrl()))
        assertFalse(HttpCatalogClient.mayCarryToken("http://kanstrimi.example/player".toHttpUrl()))
        assertFalse(HttpCatalogClient.mayCarryToken("http://8.8.8.8/player".toHttpUrl()))
    }

    @Test
    fun proxyErrorsAreTransientButTheServersAreAnswers() {
        assertTrue(HttpCatalogClient.isTransient(502, "<html>Bad Gateway</html>"))
        assertFalse(HttpCatalogClient.isTransient(502, """{"error":{"code":"upstream","message":"Fournisseur muet"}}"""))
        assertFalse(HttpCatalogClient.isTransient(500, ""))
    }

    @Test
    fun statusesMapToTheirErrors() {
        assertTrue(HttpCatalogClient.error(401, "") is CatalogException.Unauthorized)
        assertTrue(HttpCatalogClient.error(404, "") is CatalogException.NotFound)
        // A profile deleted since: its own error, the app asks again; any other 404 stays « introuvable ».
        assertTrue(HttpCatalogClient.error(404, """{"error":{"code":"unknown_profile","message":"Profil inconnu"}}""") is CatalogException.UnknownProfile)
        assertTrue(HttpCatalogClient.error(404, """{"error":{"code":"not_found","message":"Contenu introuvable"}}""") is CatalogException.NotFound)
        assertEquals("Fournisseur muet", HttpCatalogClient.error(500, """{"error":{"code":"upstream","message":"Fournisseur muet"}}""").message)
        assertEquals("Erreur serveur (503)", HttpCatalogClient.error(503, "").message)
    }

    @Test
    fun theVariantRoutesTheMeasureAndTheSettingsLeaveWithTheContractsNames() {
        // The calls stop at an interceptor: what would have left for the server, answered as it would.
        val sent = ArrayList<String>()
        val profile = """{"id":1,"name":"Hakim","is_default":true,"avatar":"a","settings":{"max_quality":"FHD","auto_play_next":true,"remember_variants":false,"switch_variant_on_failure":true}}"""
        val http = OkHttpClient.Builder().addInterceptor { chain ->
            val request = chain.request()
            val body = request.body?.let { b -> Buffer().also(b::writeTo).readUtf8() }.orEmpty()
            sent += listOf(request.method, request.url.encodedPath + (request.url.encodedQuery?.let { "?$it" } ?: ""), body).filter { it.isNotEmpty() }.joinToString(" ")
            val answer = when {
                request.url.encodedPath.endsWith("/programmes") -> "[]"
                request.url.encodedPath.endsWith("/settings") -> profile
                request.url.encodedPath.endsWith("/measure") -> """{"quality":"FHD","changed":true}"""
                else -> ""
            }
            Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("OK").body(answer.toResponseBody()).build()
        }.build()
        val client = HttpCatalogClient("https://kanstrimi.example", token = { "t" }, http = http)
        runBlocking {
            client.rememberVariant("tmdb:tv:1396:s01e02", "src-e2")
            client.forgetVariant("tmdb:movie:603")
            client.programmes("live:fr-tf1", "src-i8")
            client.programmes("live:fr-tf1", null)
            assertEquals(MeasureResult(Quality.FHD, changed = true), client.reportMeasure("tmdb:tv:1396:s01e02", "src-e2", PictureSize(1920, 1080)))
            val answered = client.updateSettings(ProfileSettingsPatch(ProfileSettings(Quality.FHD, autoPlayNext = true, rememberVariants = false, switchVariantOnFailure = true)))
            assertFalse(answered.settings.rememberVariants)
        }
        http.dispatcher.executorService.shutdown()
        assertEquals(
            listOf(
                """PUT /player/playback/tmdb:tv:1396:s01e02/variant {"variant":"src-e2"}""",
                "DELETE /player/playback/tmdb:movie:603/variant",
                "GET /player/channels/live:fr-tf1/programmes?variant=src-i8",
                "GET /player/channels/live:fr-tf1/programmes",
                """POST /player/playback/tmdb:tv:1396:s01e02/measure {"variant":"src-e2","width":1920,"height":1080}""",
                """PUT /player/profiles/me/settings {"max_quality":"FHD","auto_play_next":true,"remember_variants":false,"switch_variant_on_failure":true}""",
            ),
            sent,
        )
    }

    @Test
    fun idsPickTheirCollection() {
        assertEquals("series", collectionOf(kindOf("tmdb:tv:300388")))
        assertEquals("series", collectionOf(kindOf("fallback:series:x")))
        assertEquals("movies", collectionOf(kindOf("tmdb:movie:535544")))
        assertEquals("movies", collectionOf(kindOf("fallback:movie:x")))
    }
}
