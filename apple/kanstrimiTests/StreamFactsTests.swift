import Testing
@testable import kanstrimi

@MainActor
struct StreamFactsTests {
    @Test("Nom d'une piste audio : codec connu, disposition connue, sinon repli, parties vides omises")
    func soundLabel() {
        #expect(StreamFacts.soundLabel(codec: "eac3", channels: 6) == "E-AC-3 5.1")
        #expect(StreamFacts.soundLabel(codec: "opus", channels: 3) == "OPUS 3 ch")
        #expect(StreamFacts.soundLabel(codec: "aac", channels: 0) == "AAC")
        #expect(StreamFacts.soundLabel(codec: "", channels: 2) == "2.0")
    }
}
