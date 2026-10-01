import Foundation
import Security
import TVServices

/// The Apple TV home screen's full-screen carousel: `GET /player/top-shelf`, built by the server (the last title in
/// progress, a series with a new episode, the week's top movies). The token and the server address come from the
/// Keychain group shared with the app; without them, or offline, tvOS keeps the static Top Shelf image.
final class ContentProvider: TVTopShelfContentProvider {
    override func loadTopShelfContent() async -> (any TVTopShelfContent)? {
        guard let token = Keychain.read("device-token") else { return nil }
        let server = Keychain.read("server-url") ?? "https://kanstrimi.crafters.dev"
        guard let url = URL(string: "\(server)/player/top-shelf") else { return nil }
        var request = URLRequest(url: url, timeoutInterval: 10)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let wire = try? JSONDecoder().decode([Wire].self, from: data), !wire.isEmpty else { return nil }
        return TVTopShelfCarouselContent(style: .details, items: wire.map(\.item))
    }
}

/// `TopShelfItem` of the server's contract (`server/src/player/types.ts`).
private struct Wire: Decodable {
    let id: String
    let context: String
    let title: String
    let summary: String?
    let genre: String?
    let duration: Double?
    let releaseDate: String?
    let image: String
    let image2x: String
    let cast: [String]
    let maxQuality: String?
    let dynamicRange: String?
    let playId: String
    let openId: String

    enum CodingKeys: String, CodingKey {
        case id, context, title, summary, genre, duration, image, cast
        case releaseDate = "release_date", image2x = "image_2x", maxQuality = "max_quality"
        case dynamicRange = "dynamic_range", playId = "play_id", openId = "open_id"
    }

    var item: TVTopShelfCarouselItem {
        let item = TVTopShelfCarouselItem(identifier: id)
        item.title = title
        item.contextTitle = context
        item.summary = summary
        item.genre = genre
        item.duration = duration ?? 0
        item.creationDate = releaseDate.flatMap { try? Date($0, strategy: .iso8601.year().month().day()) }
        item.setImageURL(URL(string: image), for: .screenScale1x)
        item.setImageURL(URL(string: image2x), for: .screenScale2x)
        var media: TVTopShelfCarouselItem.MediaOptions = maxQuality == "4K" ? .videoResolution4K : .videoResolutionHD
        if dynamicRange == "DV" { media.insert(.videoColorSpaceDolbyVision) }
        if dynamicRange == "HDR" { media.insert(.videoColorSpaceHDR) }
        item.mediaOptions = media
        if !cast.isEmpty { item.namedAttributes = [TVTopShelfNamedAttribute(name: "Avec", values: cast)] }
        // The app's links (`DeepLink`): Lecture plays or resumes, Plus d'infos opens the sheet.
        item.playAction = URL(string: "kanstrimi://play/\(playId)").map { TVTopShelfAction(url: $0) }
        item.displayAction = URL(string: "kanstrimi://open/\(openId)").map { TVTopShelfAction(url: $0) }
        return item
    }
}

/// Reads what the app wrote (`DeviceStore`): same service, the Keychain group both targets share.
private enum Keychain {
    static func read(_ account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "dev.crafters.kanstrimi",
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var out: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
}
