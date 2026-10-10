package dev.crafters.kanstrimi.client

import okhttp3.HttpUrl.Companion.toHttpUrl
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
        assertEquals("Fournisseur muet", HttpCatalogClient.error(500, """{"error":{"code":"upstream","message":"Fournisseur muet"}}""").message)
        assertEquals("Erreur serveur (503)", HttpCatalogClient.error(503, "").message)
    }

    @Test
    fun idsPickTheirCollection() {
        assertEquals("series", collectionOf(kindOf("tmdb:tv:300388")))
        assertEquals("series", collectionOf(kindOf("fallback:series:x")))
        assertEquals("movies", collectionOf(kindOf("tmdb:movie:535544")))
        assertEquals("movies", collectionOf(kindOf("fallback:movie:x")))
    }
}
