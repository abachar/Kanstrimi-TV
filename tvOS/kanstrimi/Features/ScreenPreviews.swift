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
#Preview("Accueil") { ScreenHost { HomeView() } }
#Preview("Accueil hors ligne") {
    ScreenHost(setup: { env in
        env.scenario.offline = true
        let cached = HomeScreen(hero: nil, rows: [], generatedAt: .now.addingTimeInterval(-3600 * 5))
        _ = cached
    }) { HomeOfflinePreview() }
}
#Preview("Appairage") { ScreenHost { PairingView() } }
#Preview("Appairage · code expiré") { ScreenHost(setup: { $0.scenario.pairingExpires = true }) { PairingView() } }
#Preview("Appairage · jeton révoqué") {
    ScreenHost(setup: { $0.device.forget(reason: "L'appareil « Salon » a été retiré depuis l'admin du serveur. Vos favoris et vos reprises sont conservés côté serveur ; il suffit de l'ajouter à nouveau.") }) { PairingView() }
}
#Preview("Réglages") { ScreenHost { SettingsView() } }

/// Loads the home online once to fill the cache, then goes offline and reloads from it.
private struct HomeOfflinePreview: View {
    @Environment(AppEnvironment.self) private var env
    @State private var ready = false
    var body: some View {
        Group { if ready { HomeView() } else { Color.clear } }
            .task {
                env.scenario.offline = false
                if let h = try? await env.client.home() { env.homeCache.save(h) }
                env.scenario.offline = true
                ready = true
            }
    }
}

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
#if DEBUG
#Preview("Direct") { ScreenHost { LiveView() } }
#Preview("Recherche") { ScreenHost { SearchView() } }
#Preview("Recherche · résultats") { ScreenHost { SearchView(initialQuery: "le") } }
#Preview("Recherche · vide") { ScreenHost { SearchView(initialQuery: "interstellar xyz") } }
#endif
