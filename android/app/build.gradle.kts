plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "dev.crafters.kanstrimi"
    compileSdk = 37

    defaultConfig {
        applicationId = "dev.crafters.kanstrimi"
        minSdk = 29
        targetSdk = 37
        // One version for the server and every app: `server/package.json`, `MARKETING_VERSION` of the Apple targets.
        versionCode = 1
        versionName = "1.4"
        // libmpv ships four ABIs (100 Mo); the tablet and the emulator are arm64: the others are left out.
        ndk { abiFilters += listOf("arm64-v8a") }
    }

    buildTypes {
        release {
            // R8: the app shrinks and obfuscates; `proguard-rules.pro` keeps what reflection and JNI reach.
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Signed with the debug key until a release key exists: installable on the tablet, not publishable.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }
    kotlin {
        jvmToolchain(21)
    }
    sourceSets {
        // The demo client reads the real answers of the server recorded for the contract tests, the same
        // files the Apple app and `ContractTest` read: one set of fixtures for every client.
        getByName("main").assets.directories.add("../../apple/kanstrimiTests/Contract")
    }
    lint {
        abortOnError = true
        warningsAsErrors = false
    }
    testOptions {
        // The player logs through `android.util.Log`, which the JVM tests have no implementation of.
        unitTests.isReturnDefaultValues = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.compose.material3.adaptive.navigation.suite)
    implementation(libs.compose.material3.window.size)
    implementation(libs.compose.material.icons.core)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.okhttp)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    // The player: ExoPlayer, its Compose surface and the View subtitle renderer, the media session, and Jellyfin's
    // build of the FFmpeg audio decoder (DTS, TrueHD, anything the device has no codec for).
    implementation(libs.media3.exoplayer)
    implementation(libs.media3.ui)
    implementation(libs.media3.ui.compose)
    implementation(libs.media3.session)
    implementation(libs.media3.ffmpeg.decoder)
    implementation(libs.libmpv)
    debugImplementation(libs.compose.ui.tooling)
    testImplementation(libs.junit)
    testImplementation(libs.kotlin.test)
    testImplementation(libs.kotlinx.coroutines.test)
}
