package dev.crafters.kanstrimi.app

import android.app.Application
import androidx.compose.runtime.staticCompositionLocalOf
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import coil3.disk.DiskCache
import coil3.disk.directory
import coil3.request.crossfade

class KanstrimiApplication : Application(), SingletonImageLoader.Factory {
    lateinit var environment: AppEnvironment
        private set

    override fun onCreate() {
        super.onCreate()
        environment = AppEnvironment(this)
    }

    /** Posters and logos (`/img`, cached a year by the server) stay on disk between launches. */
    override fun newImageLoader(context: PlatformContext): ImageLoader = ImageLoader.Builder(context)
        .diskCache { DiskCache.Builder().directory(cacheDir.resolve("images")).maxSizeBytes(512L * 1024 * 1024).build() }
        .crossfade(true)
        .build()
}

val LocalEnvironment = staticCompositionLocalOf<AppEnvironment> { error("AppEnvironment absent") }
