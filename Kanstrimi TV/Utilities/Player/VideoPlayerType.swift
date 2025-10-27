//
//  VideoPlayerType.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 27/10/2025.
//

import Foundation

/// Type de player vidéo à utiliser selon le format
enum VideoPlayerType {
    case avPlayer  // AVPlayer natif Apple (MP4, M4V, MOV)
    case vlcPlayer // VLC Player pour formats avancés (M3U8, TS, MKV, AVI, FLV)

    /// Détecte automatiquement le type de player à utiliser selon l'URL
    /// - Parameter url: URL du stream vidéo
    /// - Returns: Type de player approprié
    static func detect(from url: String) -> VideoPlayerType {
        let ext = (url as NSString).pathExtension.lowercased()

        // Formats supportés nativement par AVPlayer
        let avFormats = ["mp4", "m4v", "mov"]
        if avFormats.contains(ext) {
            return .avPlayer
        }

        // Tous les autres formats utilisent VLC
        // M3U8 (HLS), TS, MKV, AVI, FLV, etc.
        return .vlcPlayer
    }
}
