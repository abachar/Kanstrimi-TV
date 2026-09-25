#if DEBUG
import SwiftUI

private struct ScreenHost<Content: View>: View {
    @State private var env = PreviewData.makeEnv()
    var setup: (AppEnvironment) -> Void = { _ in }
    @ViewBuilder let content: () -> Content
    var body: some View {
        content()
            .environment(env)
            .preferredColorScheme(.dark)
            .onAppear { setup(env) }
    }
}

#Preview("Films") { ScreenHost { CatalogView(kind: .movie) } }
#Preview("Séries") { ScreenHost { CatalogView(kind: .series) } }
#Preview("Fiche film") { ScreenHost { NavigationStack { DetailView(id: ContentID("tmdb:movie:100000")) } } }
#Preview("Fiche série") { ScreenHost { NavigationStack { DetailView(id: ContentID("tmdb:tv:20000")) } } }
#Preview("Fiche sans TMDB") { ScreenHost { NavigationStack { DetailView(id: ContentID("fallback:movie:silver-book-of-dreams:2013")) } } }
#Preview("Saison en erreur") {
    ScreenHost(setup: { $0.scenario.failingSeason = 2 }) { NavigationStack { DetailView(id: ContentID("tmdb:tv:20000")) } }
}
#Preview("Page suivante en erreur") {
    ScreenHost(setup: { $0.scenario.failingSecondPage = true }) { CatalogView(kind: .movie) }
}
#Preview("Sélecteur") {
    ScreenHost {
        VersionPicker(title: "La Lisière", versions: Fixtures.sevenVersions, recommendedID: "vf-4k-dv") { _, _, _, _ in }
    }
}
#Preview("Appairage") { ScreenHost { PairingView() } }
#Preview("Réglages") { ScreenHost { SettingsView() } }

private enum Fixtures {
    static func source(_ id: String, origin: String) -> Source {
        Source(id: id, container: "MKV", streamURL: DemoStreams.movie, origin: origin)
    }
    static let sevenVersions: [Version] = [
        Version(id: "vf-4k-dv", language: .vf, quality: .uhd, dynamicRange: .dolbyVision, sources: [source("a", origin: "4K DV")]),
        Version(id: "vf-4k-hdr", language: .vf, quality: .uhd, dynamicRange: .hdr, sources: [source("b", origin: "Films 4K UHD"), source("c", origin: "4K LIGHT")]),
        Version(id: "vf-fhd", language: .vf, quality: .fhd, dynamicRange: nil, sources: [source("d", origin: "Films FHD")]),
        Version(id: "vostfr-4k-hdr", language: .vostfr, quality: .uhd, dynamicRange: .hdr, sources: [source("e", origin: "VOST")]),
        Version(id: "vostfr-fhd", language: .vostfr, quality: .fhd, dynamicRange: nil, sources: [source("f", origin: "VOST")]),
        Version(id: "vo-fhd", language: .vo, quality: .fhd, dynamicRange: nil, sources: [source("g", origin: "VO")]),
    ]
}
#endif
