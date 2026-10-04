import Foundation
import Testing
@testable import kanstrimi

struct ContentIDTests {
    @Test("seriesID : épisodes à deux chiffres ou plus")
    func seriesID() {
        #expect(ContentID("tmdb:tv:1:s01e05").seriesID == ContentID("tmdb:tv:1"))
        #expect(ContentID("tmdb:tv:1:s01e100").seriesID == ContentID("tmdb:tv:1"))
        #expect(ContentID("tmdb:tv:1").seriesID == nil)
    }
}
