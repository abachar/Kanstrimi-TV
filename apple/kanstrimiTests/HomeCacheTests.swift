import Foundation
import Testing
@testable import kanstrimi

@MainActor
struct HomeCacheTests {
    @Test("Le cache d'accueil, qui contient le compte du fournisseur, reste hors des sauvegardes")
    func fileIsExcludedFromBackup() throws {
        let bundle = Bundle(for: StubProtocol.self)
        let source = try #require(bundle.url(forResource: "home", withExtension: "json"))
        let home = try HTTPCatalogClient.makeDecoder().decode(HomeScreen.self, from: Data(contentsOf: source))
        let url = Fixtures.tempFile("home-cache")
        defer { try? FileManager.default.removeItem(at: url) }
        let cache = HomeCache(fileURL: url)
        cache.save(home)
        #expect(try url.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true)
        cache.save(home) // an atomic write replaces the file: still excluded
        #expect(try url.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true)
    }

    private static func goldenHome() throws -> HomeScreen {
        let source = try #require(Bundle(for: StubProtocol.self).url(forResource: "home", withExtension: "json"))
        return try HTTPCatalogClient.makeDecoder().decode(HomeScreen.self, from: Data(contentsOf: source))
    }

    @Test("Le cache rend l'accueil enregistré : mêmes héros, mêmes rangées")
    func roundTrip() throws {
        let home = try Self.goldenHome()
        #expect(!home.rows.isEmpty && !home.heroes.isEmpty)
        let url = Fixtures.tempFile("home-roundtrip")
        defer { try? FileManager.default.removeItem(at: url) }
        HomeCache(fileURL: url).save(home)
        let loaded = try #require(HomeCache(fileURL: url).load())
        #expect(loaded.heroes == home.heroes)
        #expect(loaded.rows == home.rows)
        #expect(abs(loaded.generatedAt.timeIntervalSince(home.generatedAt)) < 1)
    }

    @Test("Un accueil mis en cache par une version à héros unique se relit, sans carrousel")
    func cacheWithASingleHeroStillReads() throws {
        let url = Fixtures.tempFile("home-old")
        defer { try? FileManager.default.removeItem(at: url) }
        try Data(#"{"hero":null,"rows":[],"generated_at":"2026-10-01T18:00:00Z"}"#.utf8).write(to: url)
        let home = try #require(HomeCache(fileURL: url).load())
        #expect(home.heroes.isEmpty)
    }
}
