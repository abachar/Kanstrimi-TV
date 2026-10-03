import Foundation
import Testing

/// The cards of `Shared/Cards/` draw what they are given: no `AppEnvironment`, nothing loaded, no width of their own.
/// Loading, state, actions and the card's width stay with the screens (`apple/README.md`).
struct CardsArchitectureTests {
    private static var cardsFolder: URL {
        URL(filePath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
            .appending(path: "kanstrimi/Shared/Cards", directoryHint: .isDirectory)
    }

    private static func sources() throws -> [(name: String, source: String)] {
        try FileManager.default.contentsOfDirectory(at: cardsFolder, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "swift" }
            .map { ($0.lastPathComponent, try String(contentsOf: $0, encoding: .utf8)) }
    }

    @Test("Une carte ne lit pas AppEnvironment et ne charge rien")
    func cardsAreDumb() throws {
        let files = try Self.sources()
        #expect(!files.isEmpty)
        for (name, source) in files {
            #expect(!source.contains("AppEnvironment"), "\(name) lit AppEnvironment")
            #expect(!source.contains(".task"), "\(name) charge des données")
        }
    }

    @Test("Une carte reçoit sa largeur de son parent")
    func parentSetsTheWidth() throws {
        for (name, source) in try Self.sources() {
            #expect(!source.contains("var width:") && !source.contains("let width:"), "\(name) prend une largeur en paramètre")
        }
    }
}
