import Foundation
import Testing
@testable import kanstrimi

/// Real answers of `/player`, written by the server's `contract.db.test.ts` (`Contract/`): each must decode into the
/// type the app reads it with. A shape changed on one side fails here or there.
struct ContractTests {
    private static let names = ["info", "home", "movies", "series", "movies-list", "movies-studio", "movie-detail", "series-detail",
                                "studios-movies", "studios-series", "sagas", "saga", "person", "channels", "channel",
                                "channel-programmes", "playback-movie", "playback-series", "playback-episode", "suggestions",
                                "suggestions-episode", "search", "error", "top-shelf"]

    /// How the app reads each file; false for a name it does not know.
    @MainActor private static func read(_ name: String, _ data: Data) throws -> Bool {
        let d = HTTPCatalogClient.makeDecoder()
        switch name {
        case "info": _ = try d.decode(ServerInfo.self, from: data)
        case "home": _ = try d.decode(HomeScreen.self, from: data)
        case "movies", "series": _ = try d.decode([CatalogRow].self, from: data)
        case "movies-list", "movies-studio": _ = try d.decode(Page<ContentItem>.self, from: data)
        case "movie-detail", "series-detail": _ = try d.decode(Card.self, from: data)
        case "studios-movies", "studios-series": _ = try d.decode([Studio].self, from: data)
        case "sagas": _ = try d.decode(Page<ContentItem>.self, from: data)
        case "saga": _ = try d.decode(SagaSheet.self, from: data)
        case "person": _ = try d.decode(PersonSheet.self, from: data)
        case "channels": _ = try d.decode([ChannelGroup].self, from: data)
        case "channel": _ = try d.decode(Channel.self, from: data)
        case "channel-programmes": _ = try d.decode([Programme].self, from: data)
        case "playback-movie", "playback-series", "playback-episode": _ = try d.decode(Playback.self, from: data)
        case "suggestions", "suggestions-episode": _ = try d.decode(Suggestions.self, from: data)
        case "search": _ = try d.decode(SearchResults.self, from: data)
        case "error":
            // The client's error mapping must find the server's message in it.
            guard case .server(let message) = HTTPCatalogClient.error(status: 500, data: data) else { return false }
            return message != "Erreur serveur (500)"
        case "top-shelf": return try topShelfIsReadable(data)
        default: return false
        }
        return true
    }

    /// The Top Shelf extension (`TopShelf/ContentProvider.swift`, `Wire`) shares no file with the app and is not in
    /// the test target: its fields are checked here on the raw JSON. Keep in step with `Wire`.
    private static func topShelfIsReadable(_ data: Data) throws -> Bool {
        guard let items = try JSONSerialization.jsonObject(with: data) as? [[String: Any]], !items.isEmpty else { return false }
        let strings = ["id", "context", "title", "image", "image_2x", "play_id", "open_id"]
        // Optional in `Wire`: absent, null or a string. A renamed key would silently read as absent, so each must
        // appear as a string in at least one item of the file.
        let optionalStrings = ["summary", "genre", "release_date", "max_quality", "dynamic_range"]
        let wellTyped = items.allSatisfy { item in
            strings.allSatisfy { item[$0] is String }
                && optionalStrings.allSatisfy { item[$0] == nil || item[$0] is String || item[$0] is NSNull }
                && (item["duration"] == nil || item["duration"] is NSNumber || item["duration"] is NSNull)
                && (item["cast"] as? [Any])?.allSatisfy { $0 is String } == true
        }
        let seen = optionalStrings.allSatisfy { key in items.contains { $0[key] is String } }
        return wellTyped && seen && items.contains { $0["duration"] is NSNumber }
    }

    /// The enumerations the app reads leniently (an unknown value becomes a default): a renamed value would pass the
    /// decoding above unnoticed, so the raw values of the files are checked against what each enumeration knows.
    private static func unknownEnumValues(in node: Any, path: [String] = []) -> [String] {
        if let list = node as? [Any] { return list.flatMap { unknownEnumValues(in: $0, path: path) } }
        guard let dict = node as? [String: Any] else { return [] }
        var unknown: [String] = []
        for (key, value) in dict {
            if let text = value as? String {
                // nil: not an enumeration key. `.other` is the fallback itself, never a value the server writes.
                let known: Bool? = switch key {
                case "kind" where path.last == "provider": nil // a source's provider, not a content kind
                case "kind" where path.last == "rows": text != "other" && HomeRowKind(rawValue: text) != nil
                case "kind": ContentItem.Kind(rawValue: text) != nil // movie, series, episode, live, saga: ContentKind's too
                case "quality" where path.last == "versions", "max_quality": Quality(rawValue: text) != nil // elsewhere « quality » is a display text (« 4K DV »)
                case "dynamic_range": DynamicRange(rawValue: text) != nil
                case "reason": text != "other" && Suggestion.Reason(rawValue: text) != nil
                default: nil
                }
                if known == false { unknown.append("\((path + [key]).joined(separator: "/")) = \(text)") }
            } else {
                unknown += unknownEnumValues(in: value, path: path + [key])
            }
        }
        return unknown
    }

    private static var bundle: Bundle { Bundle(for: StubProtocol.self) }

    @Test("Chaque réponse enregistrée par le serveur se décode dans le type que l'app lit", arguments: names)
    @MainActor func decodes(_ name: String) throws {
        let url = try #require(Self.bundle.url(forResource: name, withExtension: "json"))
        let data = try Data(contentsOf: url)
        #expect(try Self.read(name, data))
    }

    @Test("Aucune valeur d'énumération des réponses n'est inconnue de l'app : le décodeur indulgent la masquerait", arguments: names)
    func enumValuesAreKnown(_ name: String) throws {
        guard !["error", "top-shelf"].contains(name) else { return }
        let url = try #require(Self.bundle.url(forResource: name, withExtension: "json"))
        let json = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        let unknown = Self.unknownEnumValues(in: json)
        #expect(unknown.isEmpty, "valeurs inconnues dans \(name) : \(unknown.sorted())")
    }

    @Test("Aucune réponse enregistrée n'échappe au test")
    func everyFileIsRead() {
        let files = (Self.bundle.urls(forResourcesWithExtension: "json", subdirectory: nil) ?? []).map { $0.deletingPathExtension().lastPathComponent }
        let unread = Set(files).subtracting(Self.names)
        #expect(unread.isEmpty, "sans lecteur : \(unread.sorted())")
        #expect(Set(Self.names).isSubset(of: Set(files)))
    }
}
