//
//  LiveChannel.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import Foundation
import SwiftData
import os

/// Modèle représentant une chaîne TV en direct (optimisé pour listing)
@Model
final class LiveChannel {
    #Index<LiveChannel>([\.categoryId])

    /// Identifiant unique de la chaîne (format: "live-{streamId}")
    var id: String

    /// Nom de la chaîne
    var name: String

    /// Icône/Logo de la chaîne
    var streamIcon: String?

    /// ID de la catégorie
    var categoryId: String

    /// Ordre d'affichage (préservé depuis l'API Xtream)
    var sortOrder: Int

    /// Initialisation d'une chaîne TV
    /// - Parameters:
    ///   - streamId: ID du flux (utilisé pour générer l'ID unique)
    ///   - name: Nom de la chaîne
    ///   - streamIcon: URL de l'icône
    ///   - categoryId: ID de la catégorie
    ///   - sortOrder: Ordre d'affichage
    init(
        streamId: Int,
        name: String,
        categoryId: String,
        sortOrder: Int,
        streamIcon: String? = nil
    ) {
        self.id = "live-\(streamId)"
        self.name = name
        self.streamIcon = streamIcon
        self.categoryId = categoryId
        self.sortOrder = sortOrder
    }

    /// Extrait le streamId depuis l'ID
    var extractedStreamId: Int? {
        let components = id.split(separator: "-")
        guard components.count == 2 else { return nil }
        return Int(components[1])
    }
}

// MARK: - Searchable Conformance
extension LiveChannel: Searchable {}

// MARK: - CardDisplayable Conformance
extension LiveChannel: CardDisplayable {
    var imageURL: String? { streamIcon }
    var rating: Double? { nil }
}

// MARK: - Preview Data
#if DEBUG
extension LiveChannel {
    static var previewChannels: [LiveChannel] {
        [
            // Category 470 - BEIN SPORT 4K
            LiveChannel(
                streamId: 1515148,
                name: "|AR| معلومات عن الخدمة",
                categoryId: "470",
                sortOrder: 0,
                streamIcon: "https://www.herault-tribune.com/wp-content/uploads/2021/03/2020-06-13_083257_new_Info1-500x318-1.jpg"
            ),
            LiveChannel(
                streamId: 22198,
                name: "beIN SPORTS NEWS UHD",
                categoryId: "470",
                sortOrder: 1,
                streamIcon: "http://138.199.27.237:8080/0tv_logo/110.png"
            ),
            LiveChannel(
                streamId: 22199,
                name: "beIN SPORTS GLOBAL UHD",
                categoryId: "470",
                sortOrder: 2,
                streamIcon: "http://138.199.27.237:8080/0tv_logo/3529.png"
            ),
            LiveChannel(
                streamId: 190369,
                name: "beIN UHD 2160P",
                categoryId: "470",
                sortOrder: 3,
                streamIcon: "http://138.199.27.237:8080/BEIN/bein-sport/BIN4K.png"
            ),
            LiveChannel(
                streamId: 114053,
                name: "beIN Sports 1 4K",
                categoryId: "470",
                sortOrder: 4,
                streamIcon: "http://138.199.27.237:8080/BEIN/bein-sport/BEINSPORT1HD.png"
            ),
            LiveChannel(
                streamId: 1100423,
                name: "8K: beIN SP⚽RTS 1 ʰᵉᵛᶜ",
                categoryId: "470",
                sortOrder: 5,
                streamIcon: "http://icon-tmdb.me/stalker_portal/misc/logos/320/12782.png?95032"
            ),
            LiveChannel(
                streamId: 3854,
                name: "beIN Sports 1 UHD",
                categoryId: "470",
                sortOrder: 6,
                streamIcon: "http://138.199.27.237:8080/BEIN/bein-sport/BEINSPORT1HD.png"
            ),

            // Category 969 - BEIN SPORT ULTRA
            LiveChannel(
                streamId: 2515148,
                name: "|AR| معلومات عن الخدمة ULTRA",
                categoryId: "969",
                sortOrder: 7,
                streamIcon: "https://www.herault-tribune.com/wp-content/uploads/2021/03/2020-06-13_083257_new_Info1-500x318-1.jpg"
            ),
            LiveChannel(
                streamId: 32198,
                name: "beIN SPORTS NEWS ULTRA",
                categoryId: "969",
                sortOrder: 8,
                streamIcon: "http://138.199.27.237:8080/0tv_logo/110.png"
            ),
            LiveChannel(
                streamId: 32199,
                name: "beIN SPORTS GLOBAL ULTRA",
                categoryId: "969",
                sortOrder: 9,
                streamIcon: "http://138.199.27.237:8080/0tv_logo/3529.png"
            ),
            LiveChannel(
                streamId: 290369,
                name: "beIN ULTRA 2160P",
                categoryId: "969",
                sortOrder: 10,
                streamIcon: "http://138.199.27.237:8080/BEIN/bein-sport/BIN4K.png"
            ),
            LiveChannel(
                streamId: 214053,
                name: "beIN Sports 1 ULTRA",
                categoryId: "969",
                sortOrder: 11,
                streamIcon: "http://138.199.27.237:8080/BEIN/bein-sport/BEINSPORT1HD.png"
            ),
            LiveChannel(
                streamId: 2100423,
                name: "8K: beIN SP⚽RTS 1 ULTRA ʰᵉᵛᶜ",
                categoryId: "969",
                sortOrder: 12,
                streamIcon: "http://icon-tmdb.me/stalker_portal/misc/logos/320/12782.png?95032"
            ),
            LiveChannel(
                streamId: 13854,
                name: "beIN Sports 1 ULTRA HD",
                categoryId: "969",
                sortOrder: 13,
                streamIcon: "http://138.199.27.237:8080/BEIN/bein-sport/BEINSPORT1HD.png"
            ),

            // Category 8 - BEIN SPORT HD
            LiveChannel(
                streamId: 3515148,
                name: "|AR| معلومات عن الخدمة HD",
                categoryId: "8",
                sortOrder: 14,
                streamIcon: "https://www.herault-tribune.com/wp-content/uploads/2021/03/2020-06-13_083257_new_Info1-500x318-1.jpg"
            ),
            LiveChannel(
                streamId: 42198,
                name: "beIN SPORTS NEWS HD",
                categoryId: "8",
                sortOrder: 15,
                streamIcon: "http://138.199.27.237:8080/0tv_logo/110.png"
            ),
            LiveChannel(
                streamId: 42199,
                name: "beIN SPORTS GLOBAL HD",
                categoryId: "8",
                sortOrder: 16,
                streamIcon: "http://138.199.27.237:8080/0tv_logo/3529.png"
            ),
            LiveChannel(
                streamId: 390369,
                name: "beIN HD 1080P",
                categoryId: "8",
                sortOrder: 17,
                streamIcon: "http://138.199.27.237:8080/BEIN/bein-sport/BIN4K.png"
            ),
            LiveChannel(
                streamId: 314053,
                name: "beIN Sports 1 HD",
                categoryId: "8",
                sortOrder: 18,
                streamIcon: "http://138.199.27.237:8080/BEIN/bein-sport/BEINSPORT1HD.png"
            ),
            LiveChannel(
                streamId: 3100423,
                name: "8K: beIN SP⚽RTS 1 HD ʰᵉᵛᶜ",
                categoryId: "8",
                sortOrder: 19,
                streamIcon: "http://icon-tmdb.me/stalker_portal/misc/logos/320/12782.png?95032"
            ),
            LiveChannel(
                streamId: 23854,
                name: "beIN Sports 1 HD Classic",
                categoryId: "8",
                sortOrder: 20,
                streamIcon: "http://138.199.27.237:8080/BEIN/bein-sport/BEINSPORT1HD.png"
            )
        ]
    }

    static func previewChannels(for categoryId: String) -> [LiveChannel] {
        previewChannels.filter { $0.categoryId == categoryId }
    }
}
#endif
