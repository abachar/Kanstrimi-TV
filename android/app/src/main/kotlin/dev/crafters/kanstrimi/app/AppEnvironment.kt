package dev.crafters.kanstrimi.app

import android.content.Context
import dev.crafters.kanstrimi.client.CatalogClient
import dev.crafters.kanstrimi.client.CatalogException
import dev.crafters.kanstrimi.client.HttpCatalogClient
import dev.crafters.kanstrimi.client.MockCatalogClient
import dev.crafters.kanstrimi.contract.ServerInfo
import dev.crafters.kanstrimi.player.ExoPlaybackEngine
import dev.crafters.kanstrimi.player.PlayerService
import dev.crafters.kanstrimi.player.PreferencesQueueStore
import dev.crafters.kanstrimi.player.ProgressQueue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** The services every screen shares: preferences, the device, the client (the server or the demo), the server's info. */
class AppEnvironment(context: Context) {
    val preferences = Preferences(context)
    val device = DeviceStore(context)
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val mock = MockCatalogClient(context.assets)
    private var http: HttpCatalogClient = makeHttp(preferences.serverUrl.value)

    /** The server, or the demo client when the preference says so. */
    val client: CatalogClient get() = if (preferences.useMock.value) mock else http

    /** Bumped once the final report of a playback reached the server (or the offline queue): the home reloads on it. */
    private val _progressRevision = MutableStateFlow(0)
    val progressRevision: StateFlow<Int> = _progressRevision.asStateFlow()

    /** The engine (one ExoPlayer at a time) and the player service, the one entry point of every « Lecture ». */
    val playerEngine = ExoPlaybackEngine(context)
    val player = PlayerService(
        client = { client }, preferences = preferences, engine = playerEngine, scope = scope,
        progressQueue = ProgressQueue(PreferencesQueueStore(context)),
        notify = { notify(it) }, onProgressReported = { _progressRevision.value += 1 },
    )

    /** The tab selected and what each tab pushed above itself. */
    val navigator = Navigator()

    /** `debug.search` (MainActivity): the query the search screen starts with, read once. */
    var debugSearch: String? = null

    private val _info = MutableStateFlow<ServerInfo?>(null)
    val info: StateFlow<ServerInfo?> = _info.asStateFlow()

    /** A message shown a few seconds over everything (an action that failed outside its screen). */
    private val _notice = MutableStateFlow<String?>(null)
    val notice: StateFlow<String?> = _notice.asStateFlow()

    init {
        scope.launch { preferences.serverUrl.collect { http = makeHttp(it) } }
    }

    private fun makeHttp(url: String) = HttpCatalogClient(url, token = { device.token.value }, onUnauthorized = {
        scope.launch {
            device.forget("Le serveur a refusé le jeton de cet appareil : il a été retiré depuis l'admin. Vos favoris et vos reprises sont conservés côté serveur ; il suffit de l'ajouter à nouveau.")
            _info.value = null
        }
    })

    suspend fun loadInfo() {
        if (!device.isPaired) return
        runCatching { _info.value = client.info() }
    }

    /** Runs an action that may fail outside its screen: the failure is said in a notice, nothing thrown. */
    suspend fun <T> attempt(action: String, block: suspend () -> T): T? = try {
        block()
    } catch (e: CatalogException.Unauthorized) {
        null
    } catch (e: CatalogException) {
        notify("$action impossible · ${e.message}")
        null
    }

    /** Opens a title's sheet, or a saga's screen, above the selected tab. A channel plays (the Direct lot). */
    fun open(id: String) {
        when {
            id.startsWith("saga:") -> navigate(Route.Saga(id))
            id.startsWith("live:") -> notify("Direct : prochain lot")
            else -> navigate(Route.Detail(id))
        }
    }

    fun navigate(route: Route) = navigator.push(route)

    fun notify(message: String) {
        _notice.value = message
        scope.launch {
            kotlinx.coroutines.delay(4000)
            if (_notice.value == message) _notice.value = null
        }
    }

    suspend fun unpair() {
        device.code.value?.let { code -> runCatching { client.deleteDevice(code) } }
        device.forget(null)
        _info.value = null
    }
}
