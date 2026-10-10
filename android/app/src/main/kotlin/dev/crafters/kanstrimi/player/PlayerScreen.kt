package dev.crafters.kanstrimi.player

import android.app.Activity
import android.app.PictureInPictureParams
import android.content.Context
import android.content.ContextWrapper
import android.content.pm.PackageManager
import android.graphics.Color as AndroidColor
import android.os.Build
import android.util.Rational
import android.util.TypedValue
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.annotation.OptIn
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.util.Consumer
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.CaptionStyleCompat
import androidx.media3.ui.SubtitleView
import androidx.media3.ui.compose.ContentFrame
import androidx.media3.ui.compose.SURFACE_TYPE_SURFACE_VIEW
import dev.crafters.kanstrimi.app.LocalEnvironment
import kotlinx.coroutines.delay

/**
 * The player screen, full screen over the tabs, driven by touch like the Apple app's `PlayerScreen+iOS`:
 * a tap shows or hides the controls (or closes the open panel), a double tap on a side seeks ±10 s, a horizontal
 * drag scrubs. The controls hide by themselves after 4 s of playback. Immersive (system bars hidden), the screen
 * stays on, Picture-in-Picture reduces it; Back closes the panel, then the player.
 */
@OptIn(UnstableApi::class)
@Composable
fun PlayerScreen() {
    val env = LocalEnvironment.current
    val player = env.player
    val engine = env.playerEngine
    var controlsVisible by remember { mutableStateOf(true) }
    var panel by remember { mutableStateOf<BarPanel?>(null) }
    /** Live: the channel list beside the video (« Chaînes », or a swipe to the right). */
    var channelsOpen by remember { mutableStateOf(false) }
    var scrubTime by remember { mutableStateOf<Double?>(null) }
    /** Bumped at each touch in the controls: the hide countdown starts again. */
    var activity by remember { mutableIntStateOf(0) }
    val notice by env.notice.collectAsState()
    val context = LocalContext.current
    val host = remember(context) { context.findActivity() }
    val pip = remember(host) { PictureInPictureHost(host) }

    fun showControls() { controlsVisible = true; activity += 1 }

    BackHandler {
        when {
            channelsOpen -> { channelsOpen = false; showControls() }
            panel != null -> { panel = null; showControls() }
            else -> player.stop()
        }
    }
    // Hidden by themselves after 4 s of playback, unless a panel is open or a touch restarted the countdown.
    LaunchedEffect(controlsVisible, player.phase, panel, activity) {
        if (controlsVisible && player.phase == PlayerService.Phase.PLAYING && panel == null) {
            delay(4000)
            controlsVisible = false
        }
    }
    LaunchedEffect(player.phase) { if (player.phase != PlayerService.Phase.PLAYING) showControls() }
    LaunchedEffect(player.context?.content?.id) { panel = null; showControls() }
    LaunchedEffect(player.isLive) { if (!player.isLive) channelsOpen = false }

    ImmersiveWindow()
    pip.Observe(player)

    Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
        engine.player?.let { p -> ContentFrame(p, Modifier.fillMaxSize(), SURFACE_TYPE_SURFACE_VIEW, ContentScale.Fit) }
        if (player.debugFrame) PreviewFrame()
        // Edge to edge like the video: a bitmap subtitle is placed against the picture's frame.
        AndroidView(
            factory = { ctx ->
                SubtitleView(ctx).apply {
                    setFixedTextSize(TypedValue.COMPLEX_UNIT_SP, 24f)
                    setStyle(CaptionStyleCompat(AndroidColor.WHITE, AndroidColor.TRANSPARENT, AndroidColor.TRANSPARENT, CaptionStyleCompat.EDGE_TYPE_OUTLINE, AndroidColor.BLACK, null))
                    setBottomPaddingFraction(0.08f)
                }
            },
            update = { it.setCues(engine.cues) },
            modifier = Modifier.fillMaxSize(),
        )
        if (player.isMinimized) return@Box

        val dialogUp = player.failure != null || player.nextCountdown != null || channelsOpen
        if (!dialogUp) {
            Box(
                modifier = Modifier.fillMaxSize()
                    .pointerInput(player.isLive) {
                        detectTapGestures(
                            onTap = {
                                if (panel != null) { panel = null; showControls() } else if (controlsVisible) controlsVisible = false else showControls()
                            },
                            onDoubleTap = { offset ->
                                if (!player.isLive) { player.seekBy(if (offset.x < size.width / 2) -10.0 else 10.0); showControls() }
                            },
                        )
                    }
                    .pointerInput(player.isLive) {
                        var start = 0.0
                        var travelled = 0f
                        detectHorizontalDragGestures(
                            onDragStart = { start = player.time; travelled = 0f },
                            onHorizontalDrag = { change, dx ->
                                travelled += dx
                                if (player.isLive || player.duration <= 0) return@detectHorizontalDragGestures
                                change.consume()
                                // Half the width sweeps half the file.
                                val target = start + travelled / size.width * player.duration * 0.5
                                scrubTime = target.coerceIn(0.0, player.duration - 1)
                                controlsVisible = true
                            },
                            onDragEnd = {
                                // Live: a swipe to the right brings the channels.
                                if (player.isLive && travelled > 60.dp.toPx()) channelsOpen = true
                                scrubTime?.let { player.seekTo(it) }; scrubTime = null; showControls()
                            },
                            onDragCancel = { scrubTime = null },
                        )
                    },
            )
        }

        AnimatedVisibility(visible = controlsVisible && player.failure == null && !player.isChangingTitle, enter = fadeIn(), exit = fadeOut()) {
            PlayerControls(
                player = player, env = env, scrubTime = scrubTime, panel = panel, onPanel = { panel = it; showControls() },
                onExit = { player.stop() }, onPictureInPicture = if (pip.isAvailable) ({ pip.enter(engine) }) else null,
                onChannels = { channelsOpen = true }, onActivity = { showControls() },
            )
        }
        if (channelsOpen) ChannelListOverlay(player, env) { channelsOpen = false; showControls() }
        val offer = player.skipOffer
        if (offer != null && panel == null && !dialogUp && !player.isChangingTitle) {
            SkipButton(offer.label, barShown = controlsVisible) { player.skip(); showControls() }
        }
        LoadingBadge(player)
        player.toast?.let { ToastView(it.text, it.detail) } ?: notice?.let { ToastView(it, warning = true) }
        if (player.isChangingTitle) Box(modifier = Modifier.fillMaxSize().background(Color.Black))
        if (player.nextCountdown != null) NextEpisodeCard(player)
        if (player.failure != null) StreamFailureDialog(player)
    }
}

/** The system bars hidden (a swipe brings them back for a moment), the screen kept on, for as long as the player is up. */
@Composable
private fun ImmersiveWindow() {
    val view = LocalView.current
    DisposableEffect(view) {
        val window = view.context.findActivity()?.window
        val controller = window?.let { WindowCompat.getInsetsController(it, view) }
        controller?.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller?.hide(WindowInsetsCompat.Type.systemBars())
        window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        onDispose {
            controller?.show(WindowInsetsCompat.Type.systemBars())
            window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }
}

/**
 * Picture-in-Picture: entered from the button, or by Android when the home gesture leaves the app while a film
 * plays (Android 12+). The player screen keeps only the video while reduced; the window closed stops playback,
 * expanded brings the controls back.
 */
private class PictureInPictureHost(private val activity: ComponentActivity?) {
    val isAvailable: Boolean = activity != null && activity.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)

    private fun params(engine: ExoPlaybackEngine, autoEnter: Boolean): PictureInPictureParams {
        val size = engine.player?.videoSize
        val ratio = if (size != null && size.width > 0 && size.height > 0) Rational(size.width, size.height) else Rational(16, 9)
        // Android refuses a ratio outside 1:2.39 … 2.39:1.
        val clamped = if (ratio.toFloat() > 2.39f) Rational(239, 100) else if (ratio.toFloat() < 1 / 2.39f) Rational(100, 239) else ratio
        val builder = PictureInPictureParams.Builder().setAspectRatio(clamped)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) builder.setAutoEnterEnabled(autoEnter)
        return builder.build()
    }

    fun enter(engine: ExoPlaybackEngine) {
        if (!isAvailable) return
        runCatching { activity?.enterPictureInPictureMode(params(engine, autoEnter = false)) }
    }

    @Composable
    fun Observe(player: PlayerService) {
        val host = activity ?: return
        val env = LocalEnvironment.current
        val lifecycleOwner = LocalLifecycleOwner.current
        DisposableEffect(host) {
            val listener = Consumer<androidx.core.app.PictureInPictureModeChangedInfo> { info ->
                player.isMinimized = info.isInPictureInPictureMode
                // Left for good (the window closed) rather than expanded: the activity is stopped, not started.
                if (!info.isInPictureInPictureMode && host.lifecycle.currentState == Lifecycle.State.CREATED) player.stop()
            }
            host.addOnPictureInPictureModeChangedListener(listener)
            val observer = LifecycleEventObserver { _, event ->
                // The app left without Picture-in-Picture: the film waits, like any player on a tablet; a channel
                // never pauses, so it is left, as a television switched off.
                if (event == Lifecycle.Event.ON_STOP && !player.isMinimized) { if (player.isLive) player.stop() else player.pause() }
            }
            lifecycleOwner.lifecycle.addObserver(observer)
            onDispose {
                host.removeOnPictureInPictureModeChangedListener(listener)
                lifecycleOwner.lifecycle.removeObserver(observer)
                if (isAvailable && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) runCatching { host.setPictureInPictureParams(PictureInPictureParams.Builder().setAutoEnterEnabled(false).build()) }
            }
        }
        // The home gesture reduces a film that plays; a paused or failed one stays where it is.
        LaunchedEffect(player.phase, isAvailable) {
            if (isAvailable && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                runCatching { host.setPictureInPictureParams(params(env.playerEngine, autoEnter = player.phase == PlayerService.Phase.PLAYING && !player.isLive)) }
            }
        }
    }
}

/** The activity behind a Compose context, through the theme wrappers. */
fun Context.findActivity(): ComponentActivity? {
    var c: Context? = this
    while (c is ContextWrapper) {
        if (c is ComponentActivity) return c
        if (c is Activity) return null
        c = c.baseContext
    }
    return null
}
