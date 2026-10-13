package dev.crafters.kanstrimi.client

import dev.crafters.kanstrimi.contract.ApiError
import dev.crafters.kanstrimi.contract.Card
import dev.crafters.kanstrimi.contract.CatalogRow
import dev.crafters.kanstrimi.contract.Channel
import dev.crafters.kanstrimi.contract.ChannelGroup
import dev.crafters.kanstrimi.contract.ContentItem
import dev.crafters.kanstrimi.contract.ContentKind
import dev.crafters.kanstrimi.contract.FileFacts
import dev.crafters.kanstrimi.contract.Home
import dev.crafters.kanstrimi.contract.Page
import dev.crafters.kanstrimi.contract.PairingCode
import dev.crafters.kanstrimi.contract.PairingStatus
import dev.crafters.kanstrimi.contract.PairingStatusWire
import dev.crafters.kanstrimi.contract.PersonSheet
import dev.crafters.kanstrimi.contract.Playback
import dev.crafters.kanstrimi.contract.PlaybackMarkers
import dev.crafters.kanstrimi.contract.Profile
import dev.crafters.kanstrimi.contract.Profiles
import dev.crafters.kanstrimi.contract.Programme
import dev.crafters.kanstrimi.contract.ProgressReport
import dev.crafters.kanstrimi.contract.SagaSheet
import dev.crafters.kanstrimi.contract.SearchResults
import dev.crafters.kanstrimi.contract.ServerInfo
import dev.crafters.kanstrimi.contract.Studio
import dev.crafters.kanstrimi.contract.Suggestions
import dev.crafters.kanstrimi.contract.Wire
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerializationException
import kotlinx.serialization.Serializable
import kotlinx.serialization.serializer
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.math.roundToLong

/**
 * The server over HTTP. The token and the profile come from `token` and `profileId` at each call, so a device paired,
 * unpaired or switched meanwhile is seen at once; a 401 reaches `onUnauthorized`, an `unknown_profile` reaches
 * `onUnknownProfile`, whatever the caller. A GET answered 502-504 by the reverse proxy
 * (the server restarting) is tried twice more; a write is never replayed.
 */
class HttpCatalogClient(
    baseUrl: String,
    private val token: () -> String?,
    private val onUnauthorized: () -> Unit = {},
    /** The profile this device is on, sent as `X-Profile`; null: none chosen yet, the server answers for the default one. */
    private val profileId: () -> Int? = { null },
    private val onUnknownProfile: () -> Unit = {},
    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS).readTimeout(20, TimeUnit.SECONDS).build(),
) : CatalogClient {
    override val isMock = false
    private val base: HttpUrl = requireNotNull(baseUrl.trimEnd('/').toHttpUrlOrNull()) { "URL du serveur invalide : $baseUrl" }
        .newBuilder().addPathSegment("player").build()
    private val jsonType = "application/json".toMediaType()

    override suspend fun createDevice(): PairingCode = send("POST", "devices", auth = false)
    override suspend fun pollDevice(code: String): PairingStatus = PairingStatus.of(send<PairingStatusWire>("GET", "devices/$code", auth = false))
    override suspend fun deleteDevice(code: String) = sendNoContent("DELETE", "devices/$code")
    override suspend fun info(): ServerInfo = send("GET", "info")
    override suspend fun profiles(): List<Profile> = send<Profiles>("GET", "profiles").profiles

    override suspend fun home(): Home = send("GET", "home")
    override suspend fun rows(kind: ContentKind): List<CatalogRow> = send("GET", collectionOf(kind))
    override suspend fun list(query: ListQuery): Page<ContentItem> {
        val q = buildList {
            add("sort" to query.sort.wire)
            query.genre?.let { add("genre" to it) }
            query.language?.let { add("language" to it) }
            query.minQuality?.let { add("min_quality" to it.label) }
            query.dynamicRange?.let { add("dynamic_range" to it.label) }
            if (query.vfAvailable) add("vf_available" to "1")
            query.studio?.let { add("studio" to it) }
            query.cursor?.let { add("cursor" to it) }
        }
        return send("GET", collectionOf(query.kind), query = q)
    }
    override suspend fun detail(id: String): Card = send("GET", "${collectionOf(kindOf(id))}/$id")
    override suspend fun studios(kind: ContentKind): List<Studio> = send("GET", "${collectionOf(kind)}/studios")
    override suspend fun sagas(cursor: String?): Page<ContentItem> = send("GET", "movies/sagas", query = listOfNotNull(cursor?.let { "cursor" to it }))
    override suspend fun saga(id: String): SagaSheet = send("GET", "movies/sagas/$id")
    override suspend fun person(id: String): PersonSheet = send("GET", "people/$id")

    override suspend fun channels(): List<ChannelGroup> = send("GET", "channels")
    override suspend fun channel(id: String): Channel = send("GET", "channels/$id")
    override suspend fun programmes(channelId: String, version: String?): List<Programme> =
        send("GET", "channels/$channelId/programmes", query = listOfNotNull(version?.let { "version" to it }))

    override suspend fun playback(id: String): Playback = send("GET", "playback/$id")
    override suspend fun suggestions(id: String): Suggestions = send("GET", "playback/$id/suggestions")
    override suspend fun markers(id: String, file: FileFacts): PlaybackMarkers = send("POST", "playback/$id/markers", body = file)
    override suspend fun report(progress: ProgressReport) =
        sendNoContent("PUT", "playback/${progress.contentId}/progress",
            body = ProgressBody(progress.position.roundToLong().toDouble(), progress.duration.roundToLong().toDouble()))
    override suspend fun reportWatchTime(id: String, seconds: Int) = sendNoContent("POST", "playback/$id/watch-time", body = WatchTimeBody(seconds))

    override suspend fun search(query: String): SearchResults = send("GET", "search", query = listOf("q" to query))
    override suspend fun removeFromResume(id: String) = sendNoContent("DELETE", "playback/$id/progress")
    override suspend fun setWatched(id: String, watched: Boolean, season: Int?) = sendNoContent("PUT", "playback/$id/watched", body = WatchedBody(watched, season))
    override suspend fun setFavorite(id: String, favorite: Boolean) = sendNoContent(if (favorite) "PUT" else "DELETE", "favorites/$id")

    @Serializable private data class ProgressBody(val position: Double, val duration: Double)
    @Serializable private data class WatchTimeBody(val seconds: Int)
    @Serializable private data class WatchedBody(val watched: Boolean, val season: Int? = null)

    // MARK: - Plumbing

    private suspend inline fun <reified T> send(method: String, path: String, query: List<Pair<String, String>> = emptyList(), auth: Boolean = true, body: Any? = null): T {
        val text = perform(request(method, path, query, auth, body))
        return withContext(Dispatchers.Default) {
            try {
                Wire.json.decodeFromString(serializer<T>(), text)
            } catch (e: SerializationException) {
                throw CatalogException.Decoding(e.message ?: "format inattendu")
            } catch (e: IllegalArgumentException) {
                throw CatalogException.Decoding(e.message ?: "valeur inattendue")
            }
        }
    }

    private suspend fun sendNoContent(method: String, path: String, auth: Boolean = true, body: Any? = null) {
        perform(request(method, path, emptyList(), auth, body))
    }

    private inline fun <reified B> encode(body: B): String = Wire.json.encodeToString(serializer<B>(), body)

    private fun request(method: String, path: String, query: List<Pair<String, String>>, auth: Boolean, body: Any?): Request {
        val url = base.newBuilder().apply {
            path.split('/').forEach { addPathSegment(it) }
            query.forEach { (k, v) -> addQueryParameter(k, v) }
        }.build()
        val payload = when (body) {
            null -> null
            is FileFacts -> encode(body)
            is ProgressBody -> encode(body)
            is WatchTimeBody -> encode(body)
            is WatchedBody -> encode(body)
            else -> error("corps non sérialisable : ${body::class}")
        }
        val requestBody = when {
            payload != null -> payload.toRequestBody(jsonType)
            method == "POST" || method == "PUT" -> "".toRequestBody(null)
            else -> null
        }
        return Request.Builder().url(url).method(method, requestBody).apply {
            header("Accept", "application/json")
            if (auth) {
                val t = token() ?: throw CatalogException.Unauthorized()
                if (mayCarryToken(url)) header("Authorization", "Bearer $t")
                profileId()?.let { header("X-Profile", it.toString()) }
            }
        }.build()
    }

    /** The body of a 2xx answer, after the retries of a GET; the server's message otherwise. */
    private suspend fun perform(request: Request): String {
        val delays = if (request.method == "GET") ArrayDeque(listOf(500L, 1500L)) else ArrayDeque()
        while (true) {
            val response = try {
                http.newCall(request).await()
            } catch (e: IOException) {
                if (isTransient(e) && delays.isNotEmpty()) { delay(delays.removeFirst()); continue }
                throw map(e)
            }
            response.use { r ->
                val text = r.body.string()
                if (r.isSuccessful) return text
                if (isTransient(r.code, text) && delays.isNotEmpty()) { delay(delays.removeFirst()); return@use }
                val error = error(r.code, text)
                if (error is CatalogException.Unauthorized) onUnauthorized()
                if (error is CatalogException.UnknownProfile) onUnknownProfile()
                throw error
            }
        }
    }

    companion object {
        /** The token travels over HTTPS, or in clear on the local network only (a development server). */
        fun mayCarryToken(url: HttpUrl): Boolean {
            if (url.scheme == "https") return true
            val host = url.host.lowercase()
            if (host == "localhost" || host.endsWith(".local") || !host.contains('.')) return true
            val parts = host.split('.').mapNotNull { it.toIntOrNull() }
            if (parts.size != 4) return false
            return parts[0] == 10 || parts[0] == 127 || (parts[0] == 192 && parts[1] == 168) || (parts[0] == 172 && parts[1] in 16..31)
        }

        /** A connection dropped or refused, a name not resolved: worth another try. Not a timeout (20 s already spent). */
        fun isTransient(e: IOException): Boolean = e is ConnectException || e is UnknownHostException

        /** 502-504 without the server's JSON error: the reverse proxy answering while the server restarts. */
        fun isTransient(status: Int, body: String): Boolean = status in 502..504 && parseError(body) == null

        fun error(status: Int, body: String): CatalogException = when (status) {
            401 -> CatalogException.Unauthorized()
            404 -> if (parseError(body)?.error?.code == "unknown_profile") CatalogException.UnknownProfile() else CatalogException.NotFound()
            else -> CatalogException.Server(parseError(body)?.error?.message ?: "Erreur serveur ($status)")
        }

        fun parseError(body: String): ApiError? = runCatching { Wire.json.decodeFromString(ApiError.serializer(), body) }.getOrNull()

        fun map(e: IOException): CatalogException = when (e) {
            is UnknownHostException, is ConnectException, is SocketTimeoutException -> CatalogException.Offline(e.message ?: e::class.simpleName.orEmpty())
            else -> CatalogException.Server(e.message ?: "Erreur réseau")
        }
    }
}

/** OkHttp's asynchronous call as a suspension, cancelled with the coroutine. */
private suspend fun Call.await(): Response = suspendCancellableCoroutine { continuation ->
    enqueue(object : Callback {
        override fun onResponse(call: Call, response: Response) { continuation.resume(response) }
        override fun onFailure(call: Call, e: IOException) {
            if (continuation.isCancelled) return
            continuation.resumeWithException(e)
        }
    })
    continuation.invokeOnCancellation { runCatching { cancel() } }
}
