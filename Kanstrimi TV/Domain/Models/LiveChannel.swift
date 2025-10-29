//
//  LiveChannel.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import Foundation
import SwiftData
import os

/// Modèle représentant une chaîne TV en direct
@Model
final class LiveChannel {
    #Index<LiveChannel>([\.categoryId])
    
    /// Identifiant unique de la chaîne
    var id: String

    /// Identifiant du flux (stream_id)
    var streamId: Int

    /// Nom de la chaîne
    var name: String

    /// Icône/Logo de la chaîne
    var streamIcon: String?

    /// ID de la catégorie
    var categoryId: String
    
    /// Informations EPG (Electronic Program Guide)
    var epgChannelId: String?
    
    /// Ajouté à la date
    var added: String?
    
    /// Ordre d'affichage (préservé depuis l'API Xtream)
    var sortOrder: Int
    
    /// URL de lecture de la chaîne
    var streamURL: String
    
    /// Initialisation d'une chaîne TV
    /// - Parameters:
    ///   - streamId: ID du flux
    ///   - name: Nom de la chaîne
    ///   - streamType: Type de flux
    ///   - streamIcon: URL de l'icône
    ///   - categoryId: ID de la catégorie
    init(
        streamId: Int,
        name: String,
        streamURL: String,
        categoryId: String,
        sortOrder: Int,
        streamIcon: String? = nil,
        epgChannelId: String? = nil,
        added: String? = nil
    ) {
        self.id = "live-\(streamId)"
        self.streamId = streamId
        self.name = name
        self.streamIcon = streamIcon
        self.categoryId = categoryId
        self.added = added
        self.epgChannelId = epgChannelId
        self.sortOrder = sortOrder
        self.streamURL = streamURL
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
                streamURL: "http://example.com/live/1515148",
                categoryId: "470",
                sortOrder: 0,
                streamIcon: "https://www.herault-tribune.com/wp-content/uploads/2021/03/2020-06-13_083257_new_Info1-500x318-1.jpg",
                epgChannelId: "",
                added: "1753477583"
            ),
            LiveChannel(
                streamId: 22198,
                name: "beIN SPORTS NEWS UHD",
                streamURL: "http://example.com/live/22198",
                categoryId: "470",
                sortOrder: 1,
                streamIcon: "http://138.199.27.237:8080/0tv_logo/110.png",
                epgChannelId: "beinsportsnews.qa",
                added: "1560023298"
            ),
            LiveChannel(
                streamId: 22199,
                name: "beIN SPORTS GLOBAL UHD",
                streamURL: "http://example.com/live/22199",
                categoryId: "470",
                sortOrder: 2,
                streamIcon: "http://138.199.27.237:8080/0tv_logo/3529.png",
                epgChannelId: "beinsportsglobal.qa",
                added: "1560023322"
            ),
            LiveChannel(
                streamId: 190369,
                name: "beIN UHD 2160P",
                streamURL: "http://example.com/live/190369",
                categoryId: "470",
                sortOrder: 3,
                streamIcon: "http://138.199.27.237:8080/BEIN/bein-sport/BIN4K.png",
                epgChannelId: "beinsports4k.qa",
                added: "1637777025"
            ),
            LiveChannel(
                streamId: 114053,
                name: "beIN Sports 1 4K",
                streamURL: "http://example.com/live/114053",
                categoryId: "470",
                sortOrder: 4,
                streamIcon: "http://138.199.27.237:8080/BEIN/bein-sport/BEINSPORT1HD.png",
                epgChannelId: "beinsportsmax1.qa",
                added: "1613220865"
            ),
            LiveChannel(
                streamId: 1100423,
                name: "8K: beIN SP⚽RTS 1 ʰᵉᵛᶜ",
                streamURL: "http://example.com/live/1100423",
                categoryId: "470",
                sortOrder: 5,
                streamIcon: "http://icon-tmdb.me/stalker_portal/misc/logos/320/12782.png?95032",
                epgChannelId: "beinsports1.qa",
                added: "1723062976"
            ),
            LiveChannel(
                streamId: 3854,
                name: "beIN Sports 1 UHD",
                streamURL: "http://example.com/live/3854",
                categoryId: "470",
                sortOrder: 6,
                streamIcon: "http://138.199.27.237:8080/BEIN/bein-sport/BEINSPORT1HD.png",
                epgChannelId: "beinsports1.qa",
                added: "1512474400"
            ),

            // Category 969 - BEIN SPORT ULTRA
            LiveChannel(
                streamId: 2515148,
                name: "|AR| معلومات عن الخدمة ULTRA",
                streamURL: "http://example.com/live/2515148",
                categoryId: "969",
                sortOrder: 7,
                streamIcon: "https://www.herault-tribune.com/wp-content/uploads/2021/03/2020-06-13_083257_new_Info1-500x318-1.jpg",
                epgChannelId: "",
                added: "1753477583"
            ),
            LiveChannel(
                streamId: 32198,
                name: "beIN SPORTS NEWS ULTRA",
                streamURL: "http://example.com/live/32198",
                categoryId: "969",
                sortOrder: 8,
                streamIcon: "http://138.199.27.237:8080/0tv_logo/110.png",
                epgChannelId: "beinsportsnews.qa",
                added: "1560023298"
            ),
            LiveChannel(
                streamId: 32199,
                name: "beIN SPORTS GLOBAL ULTRA",
                streamURL: "http://example.com/live/32199",
                categoryId: "969",
                sortOrder: 9,
                streamIcon: "http://138.199.27.237:8080/0tv_logo/3529.png",
                epgChannelId: "beinsportsglobal.qa",
                added: "1560023322"
            ),
            LiveChannel(
                streamId: 290369,
                name: "beIN ULTRA 2160P",
                streamURL: "http://example.com/live/290369",
                categoryId: "969",
                sortOrder: 10,
                streamIcon: "http://138.199.27.237:8080/BEIN/bein-sport/BIN4K.png",
                epgChannelId: "beinsports4k.qa",
                added: "1637777025"
            ),
            LiveChannel(
                streamId: 214053,
                name: "beIN Sports 1 ULTRA",
                streamURL: "http://example.com/live/214053",
                categoryId: "969",
                sortOrder: 11,
                streamIcon: "http://138.199.27.237:8080/BEIN/bein-sport/BEINSPORT1HD.png",
                epgChannelId: "beinsportsmax1.qa",
                added: "1613220865"
            ),
            LiveChannel(
                streamId: 2100423,
                name: "8K: beIN SP⚽RTS 1 ULTRA ʰᵉᵛᶜ",
                streamURL: "http://example.com/live/2100423",
                categoryId: "969",
                sortOrder: 12,
                streamIcon: "http://icon-tmdb.me/stalker_portal/misc/logos/320/12782.png?95032",
                epgChannelId: "beinsports1.qa",
                added: "1723062976"
            ),
            LiveChannel(
                streamId: 13854,
                name: "beIN Sports 1 ULTRA HD",
                streamURL: "http://example.com/live/13854",
                categoryId: "969",
                sortOrder: 13,
                streamIcon: "http://138.199.27.237:8080/BEIN/bein-sport/BEINSPORT1HD.png",
                epgChannelId: "beinsports1.qa",
                added: "1512474400"
            ),

            // Category 8 - BEIN SPORT HD
            LiveChannel(
                streamId: 3515148,
                name: "|AR| معلومات عن الخدمة HD",
                streamURL: "http://example.com/live/3515148",
                categoryId: "8",
                sortOrder: 14,
                streamIcon: "https://www.herault-tribune.com/wp-content/uploads/2021/03/2020-06-13_083257_new_Info1-500x318-1.jpg",
                epgChannelId: "",
                added: "1753477583"
            ),
            LiveChannel(
                streamId: 42198,
                name: "beIN SPORTS NEWS HD",
                streamURL: "http://example.com/live/42198",
                categoryId: "8",
                sortOrder: 15,
                streamIcon: "http://138.199.27.237:8080/0tv_logo/110.png",
                epgChannelId: "beinsportsnews.qa",
                added: "1560023298"
            ),
            LiveChannel(
                streamId: 42199,
                name: "beIN SPORTS GLOBAL HD",
                streamURL: "http://example.com/live/42199",
                categoryId: "8",
                sortOrder: 16,
                streamIcon: "http://138.199.27.237:8080/0tv_logo/3529.png",
                epgChannelId: "beinsportsglobal.qa",
                added: "1560023322"
            ),
            LiveChannel(
                streamId: 390369,
                name: "beIN HD 1080P",
                streamURL: "http://example.com/live/390369",
                categoryId: "8",
                sortOrder: 17,
                streamIcon: "http://138.199.27.237:8080/BEIN/bein-sport/BIN4K.png",
                epgChannelId: "beinsports4k.qa",
                added: "1637777025"
            ),
            LiveChannel(
                streamId: 314053,
                name: "beIN Sports 1 HD",
                streamURL: "http://example.com/live/314053",
                categoryId: "8",
                sortOrder: 18,
                streamIcon: "http://138.199.27.237:8080/BEIN/bein-sport/BEINSPORT1HD.png",
                epgChannelId: "beinsportsmax1.qa",
                added: "1613220865"
            ),
            LiveChannel(
                streamId: 3100423,
                name: "8K: beIN SP⚽RTS 1 HD ʰᵉᵛᶜ",
                streamURL: "http://example.com/live/3100423",
                categoryId: "8",
                sortOrder: 19,
                streamIcon: "http://icon-tmdb.me/stalker_portal/misc/logos/320/12782.png?95032",
                epgChannelId: "beinsports1.qa",
                added: "1723062976"
            ),
            LiveChannel(
                streamId: 23854,
                name: "beIN Sports 1 HD Classic",
                streamURL: "http://example.com/live/23854",
                categoryId: "8",
                sortOrder: 20,
                streamIcon: "http://138.199.27.237:8080/BEIN/bein-sport/BEINSPORT1HD.png",
                epgChannelId: "beinsports1.qa",
                added: "1512474400"
            )
        ]
    }

    static func previewChannels(for categoryId: String) -> [LiveChannel] {
        previewChannels.filter { $0.categoryId == categoryId }
    }
}
#endif
