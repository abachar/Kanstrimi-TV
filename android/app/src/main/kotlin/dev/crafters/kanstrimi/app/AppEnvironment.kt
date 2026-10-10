package dev.crafters.kanstrimi.app

import android.content.Context
import dev.crafters.kanstrimi.client.CatalogClient
import dev.crafters.kanstrimi.client.CatalogException
import dev.crafters.kanstrimi.client.HttpCatalogClient
import dev.crafters.kanstrimi.client.MockCatalogClient
import dev.crafters.kanstrimi.contract.Channel
import dev.crafters.kanstrimi.contract.Programme
import dev.crafters.kanstrimi.contract.ServerInfo
import dev.crafters.kanstrimi.contract.Version
import dev.crafters.kanstrimi.player.ExoPlaybackEngine
import dev.crafters.kanstrimi.player.FallbackPlaybackEngine
import dev.crafters.kanstrimi.player.MpvPlaybackEngine
import dev.crafters.kanstrimi.player.LivePreview
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

    /** Bumped when the app comes back after more than ten minutes away: the home and the Direct reload on it. */
    private val _resumeRevision = MutableStateFlow(0)
    val resumeRevision: StateFlow<Int> = _resumeRevision.asStateFlow()
    private val absence = AbsenceClock()

    fun sceneBecame(active: Boolean) {
        if (absence.became(active)) _resumeRevision.value += 1
    }

    /** A `kanstrimi://` link, once the device is paired: a sheet above the tab, or a title played where it was left. */
    fun handle(link: DeepLink) {
        if (!device.isPaired) return
        when (link) {
            is DeepLink.Open -> { if (player.isPresented) player.stop(); open(link.id) }
            is DeepLink.Play -> if (link.id.startsWith("live:")) scope.launch { watchChannel(link.id) } else player.play(link.id)
        }
    }

    /** The engines (ExoPlayer, mpv behind it for what ExoPlayer cannot decode) and the player service, the one entry point of every « Lecture ». */
    val playerEngine = FallbackPlaybackEngine(ExoPlaybackEngine(context), MpvPlaybackEngine(context))
    val player = PlayerService(
        client = { client }, preferences = preferences, engine = playerEngine, scope = scope,
        progressQueue = ProgressQueue(PreferencesQueueStore(context)),
        notify = { notify(it) }, onProgressReported = { _progressRevision.value += 1 },
    )

    /** The Direct: the channel details asked at selection, the channels watched lately, the side preview of the Direct screen. */
    val channelCache = ChannelCache(client = { client }, scope = scope)
    val recentChannels = RecentChannels(context.getSharedPreferences("prefs", Context.MODE_PRIVATE))
    val livePreview = LivePreview(context)

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

    /** Opens a title's sheet, or a saga's screen, above the selected tab. A channel plays. */
    fun open(id: String) {
        when {
            id.startsWith("saga:") -> navigate(Route.Saga(id))
            id.startsWith("live:") -> scope.launch { watchChannel(id) }
            else -> navigate(Route.Detail(id))
        }
    }

    // MARK: - Direct

    /**
     * The version a channel is shown in: the one playing, else the one it would start in (remembered for it, else
     * the best). Its quality and language are the channel's badges, its guide the one shown.
     */
    fun liveVersion(channel: Channel): Version? =
        if (player.channel?.id == channel.id) player.version else player.startChoice(channel.id, channel.versions)?.version

    /** A channel's guide as the app shows it, `liveVersion`'s: each quality may have its own (« M6 4K »). */
    fun guide(channel: Channel): Channel.Guide = LiveGuide.guide(channel, liveVersion(channel))

    /** What a channel shows now, wherever it is drawn: the detail received while its programme airs, else its list's guide. */
    fun nowPlaying(channel: Channel): Programme? = LiveGuide.nowPlaying(channel, channelCache.latest(channel.id), liveVersion(channel))

    /** Asks the channel's detail when nothing on air is known, unless the server says it has no guide. */
    suspend fun loadNowPlaying(channel: Channel) {
        if (nowPlaying(channel) != null || guide(channel).hasEpg == false) return
        channelCache.channel(channel.id)
    }

    /**
     * Plays a channel from a card (the search, the home, a link): its detail gives its versions, the zapping order is
     * the channel alone. The side preview of the Direct is cut first: the account allows one connection.
     */
    suspend fun watchChannel(id: String) {
        livePreview.stop()
        val channel = attempt("Lecture") { client.channel(id) } ?: return
        player.playChannel(channel, order = listOf(channel))
        recentChannels.record(channel)
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
