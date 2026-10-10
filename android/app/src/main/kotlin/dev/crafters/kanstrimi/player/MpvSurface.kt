package dev.crafters.kanstrimi.player

import android.view.SurfaceHolder
import android.view.SurfaceView
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView

/** The `SurfaceView` mpv draws on, attached while it exists; mpv keeps the aspect, black around. */
@Composable
fun MpvSurface(engine: MpvPlaybackEngine, modifier: Modifier = Modifier) {
    AndroidView(
        factory = { ctx ->
            SurfaceView(ctx).apply {
                holder.addCallback(object : SurfaceHolder.Callback {
                    override fun surfaceCreated(holder: SurfaceHolder) {
                        val frame = holder.surfaceFrame
                        engine.attach(holder.surface, frame.width(), frame.height())
                    }
                    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) = engine.surfaceSize(width, height)
                    override fun surfaceDestroyed(holder: SurfaceHolder) = engine.detach()
                })
            }
        },
        modifier = modifier,
        onRelease = { engine.detach() },
    )
}
