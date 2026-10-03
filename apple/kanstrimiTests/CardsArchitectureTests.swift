import Foundation
import Testing

/// The cards of `Shared/Cards/` draw what they are given: no `AppEnvironment`, nothing loaded. Loading, state and
/// actions stay with the screens (`apple/README.md`).
struct CardsArchitectureTests {
    private static var cardsFolder: URL {
        URL(filePath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
            .appending(path: "kanstrimi/Shared/Cards", directoryHint: .isDirectory)
    }

    @Test("Une carte ne lit pas AppEnvironment et ne charge rien")
    func cardsAreDumb() throws {
        let files = try FileManager.default.contentsOfDirectory(at: Self.cardsFolder, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "swift" }
        #expect(!files.isEmpty)
        for file in files {
            let source = try String(contentsOf: file, encoding: .utf8)
            #expect(!source.contains("AppEnvironment"), "\(file.lastPathComponent) lit AppEnvironment")
            #expect(!source.contains(".task"), "\(file.lastPathComponent) charge des données")
        }
    }
}
