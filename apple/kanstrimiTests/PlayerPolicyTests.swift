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
