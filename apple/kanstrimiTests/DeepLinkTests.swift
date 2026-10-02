import Foundation
import Testing
@testable import kanstrimi

struct DeepLinkTests {
    @Test("Liens du Top Shelf : fiche et lecture, aller-retour, rien d'autre")
    func topShelfLinks() {
        #expect(DeepLink(url: URL(string: "kanstrimi://open/tmdb:tv:1396")!) == .open(ContentID("tmdb:tv:1396")))
        #expect(DeepLink(url: URL(string: "kanstrimi://play/tmdb:tv:1396:s01e02")!) == .play(ContentID("tmdb:tv:1396:s01e02")))
        #expect(DeepLink(url: DeepLink.play(ContentID("tmdb:movie:603")).url) == .play(ContentID("tmdb:movie:603")))
        #expect(DeepLink(url: URL(string: "kanstrimi://open/")!) == nil)
        #expect(DeepLink(url: URL(string: "kanstrimi://watch/tmdb:movie:603")!) == nil)
        #expect(DeepLink(url: URL(string: "https://open/tmdb:movie:603")!) == nil)
        // Opened by any app: only our ids, nothing that walks the API's paths.
        #expect(DeepLink(url: URL(string: "kanstrimi://open/devices%2FK7Q4MZ")!) == nil)
        #expect(DeepLink(url: URL(string: "kanstrimi://open/tmdb:movie:1%2F..%2F..%2Finfo")!) == nil)
        #expect(DeepLink(url: URL(string: "kanstrimi://open/live:fr-tf1")!) == .open(ContentID("live:fr-tf1")))
    }
}
