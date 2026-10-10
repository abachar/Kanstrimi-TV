# kotlinx.serialization: the generated serializers are reached by reflection through the companion objects.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** { kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class dev.crafters.kanstrimi.**$$serializer { *; }
-keepclassmembers class dev.crafters.kanstrimi.** { *** Companion; }
-keepclasseswithmembers class dev.crafters.kanstrimi.** { kotlinx.serialization.KSerializer serializer(...); }

# Jellyfin's FFmpeg decoder: JNI reaches the Java side by name.
-keep class androidx.media3.decoder.ffmpeg.** { *; }
# libmpv: its events and log lines come back from native code by name.
-keep class dev.jdtech.mpv.** { *; }

# OkHttp's optional platforms.
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
