import Foundation
import Testing
@testable import kanstrimi

/// Real answers of `/player`, written by the server's `contract.db.test.ts` (`Contract/`): each must decode into the
/// type the app reads it with. A shape changed on one side fails here or there.
struct ContractTests {
    /// `top-shelf` belongs to the Top Shelf extension, `error` to the client's error mapping.
    private static let elsewhere: Set<String> = ["top-shelf", "error"]
    private static let names = ["info", "home", "movies", "series", "movies-list", "movies-studio", "movie-detail", "series-detail",
                                "studios-movies", "studios-series", "sagas", "saga", "person", "channels", "channel",
                                "channel-programmes", "playback-movie", "playback-series", "playback-episode", "suggestions",
                                "suggestions-episode", "search"]

    /// How the app reads each file; false for a name it does not know.
    private static func read(_ name: String, _ data: Data) throws -> Bool {
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
        default: return false
        }
        return true
    }

    private static var bundle: Bundle { Bundle(for: StubProtocol.self) }

    @Test("Chaque réponse enregistrée par le serveur se décode dans le type que l'app lit", arguments: names)
    func decodes(_ name: String) throws {
        let url = try #require(Self.bundle.url(forResource: name, withExtension: "json"))
        let data = try Data(contentsOf: url)
        #expect(try Self.read(name, data))
    }

    @Test("Aucune réponse enregistrée n'échappe au test")
    func everyFileIsRead() {
        let files = (Self.bundle.urls(forResourcesWithExtension: "json", subdirectory: nil) ?? []).map { $0.deletingPathExtension().lastPathComponent }
        let unread = Set(files).subtracting(Self.names).subtracting(Self.elsewhere)
        #expect(unread.isEmpty, "sans lecteur : \(unread.sorted())")
        #expect(Set(Self.names).isSubset(of: Set(files)))
    }
}
