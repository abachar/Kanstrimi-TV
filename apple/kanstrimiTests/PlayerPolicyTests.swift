import AetherEngine
import Foundation
import Testing
@testable import kanstrimi

struct PlayerFailureTests {
    @Test("Panne : la source suivante d'abord, si le réglage le permet")
    func nextSourceFirst() {
        let b = Fixtures.source("b")
        #expect(PlayerService.failureStep(attempts: 1, switchesSources: true, nextSource: b) == .otherSource(b))
        #expect(PlayerService.failureStep(attempts: 1, switchesSources: false, nextSource: b) == .sameSource)
    }

    @Test("Sans autre source : deux nouveaux essais, puis le dialogue")
    func twoRetriesThenDialog() {
        #expect(PlayerService.failureStep(attempts: 1, switchesSources: true, nextSource: nil) == .sameSource)
        #expect(PlayerService.failureStep(attempts: 2, switchesSources: true, nextSource: nil) == .sameSource)
        #expect(PlayerService.failureStep(attempts: 3, switchesSources: true, nextSource: nil) == .giveUp)
    }
}

/// `PlayerCore.options`: the account allows one stream, so no option may open a second connection to the provider.
@MainActor
struct PlayerOptionsTests {
    @Test("Une seule connexion au fournisseur, en VOD, en direct et en aperçu", arguments: [(false, false), (true, false), (true, true)])
    func oneConnectionAtMost(live: Bool, preview: Bool) {
        let options = PlayerCore.options(live: live, preview: preview)
        #expect(options.maxConcurrentSourceRequests == 1)
        // Atmos confirmation would probe the stream through a second connection.
        #expect(options.confirmAtmos == false)
    }

    @Test("Direct : décodé par le moteur, fenêtre de retour de 30 s ; l'aperçu supprime les critères d'affichage")
    func liveOptions() {
        let live = PlayerCore.options(live: true, preview: false)
        #expect(live.isLive)
        #expect(live.preferredDecodePath == .software)
        #expect(live.dvrWindowSeconds == 30)
        #expect(live.suppressDisplayCriteria == false)
        #expect(PlayerCore.options(live: true, preview: true).suppressDisplayCriteria == true)
    }

    @Test("VOD : ni fenêtre de retour ni direct")
    func vodOptions() {
        let vod = PlayerCore.options(live: false, preview: false)
        #expect(!vod.isLive)
        #expect(vod.dvrWindowSeconds != 30)
        #expect(vod.suppressDisplayCriteria == false)
    }
}
