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

// Grouped by screen, in the order of the tabs; a shared prefix keeps a screen's states together in the canvas.
#Preview("App · onglets") { ScreenHost { MainTabsView() } }
#Preview("Appairage") { ScreenHost { PairingView() } }
#Preview("Appairage · code expiré") { ScreenHost(setup: { $0.scenario.pairingExpires = true }) { PairingView() } }
#Preview("Appairage · jeton révoqué") {
    ScreenHost(setup: { $0.device.forget(reason: "L'appareil « Salon » a été retiré depuis l'admin du serveur. Vos favoris et vos reprises sont conservés côté serveur ; il suffit de l'ajouter à nouveau.") }) { PairingView() }
}
#Preview("Accueil") { ScreenHost { HomeView() } }
#Preview("Accueil · hors ligne") { ScreenHost { HomeOfflinePreview() } }
#Preview("Films") { ScreenHost { CatalogView(kind: .movie) } }
#Preview("Séries") { ScreenHost { CatalogView(kind: .series) } }
#Preview("Sagas") { ScreenHost { NavigationStack { SagasGridView() } } }
#Preview("Saga") { ScreenHost { NavigationStack { SagaView(ref: SagaRef(id: "saga:1", name: "Pixar (démo)", count: 3)) } } }
#Preview("Acteur") { ScreenHost { NavigationStack { PersonView(ref: PersonRef(id: "person:7248", name: "Cliff Curtis",
                                                                photo: URL(string: "https://kanstrimi.crafters.dev/img/w185/dfaElGoyJWseFWxXwEMLL9WTi7V.jpg"))) } } }
#Preview("Studio · titres") {
    ScreenHost {
        NavigationStack {
            GenreGridView(studio: Studio(id: "company:3", name: "Pixar", logo: nil, count: 3,
                                         backdrop: URL(string: "https://kanstrimi.crafters.dev/img/w1280/q62bpQ67qaXY0u6b2wFEnQYIbPd.jpg")),
                          kind: .movie)
        }
    }
}
#Preview("Fiche · film") { ScreenHost { NavigationStack { DetailView(id: ContentID("tmdb:movie:535544")) } } }
#Preview("Fiche · série") { ScreenHost { NavigationStack { DetailView(id: ContentID("tmdb:tv:300388")) } } }
#Preview("Fiche · titres similaires") { ScreenHost { RelatedRowPreview() } }
#Preview("Fiche · sans TMDB") { ScreenHost { NavigationStack { DetailView(id: ContentID("fallback:movie:avant-charlie-brown-il-y-avait-schulz:-")) } } }
#Preview("Fiche · erreur") {
    ScreenHost(setup: { $0.scenario.failingDetail = true }) { NavigationStack { DetailView(id: ContentID("tmdb:tv:300388")) } }
}
#Preview("Sélecteur de version") {
    ScreenHost {
        VersionPicker(title: "La Lisière", versions: Fixtures.sevenVersions, recommendedID: "vf-4k-dv") { _, _ in }
    }
}
#Preview("Direct") { ScreenHost { LiveView() } }
#Preview("Recherche") { ScreenHost { SearchView() } }
#Preview("Recherche · résultats") { ScreenHost { SearchView(initialQuery: "le") } }
#Preview("Recherche · vide") { ScreenHost { SearchView(initialQuery: "interstellar xyz") } }
#Preview("Réglages") { ScreenHost { SettingsView() } }

/// The bottom of a movie sheet: the cast row, then « Titres similaires ».
private struct RelatedRowPreview: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics
    @State private var card: Card?
    var body: some View {
        // In a scroll view as on the sheet: outside one, the horizontal rows would share the spare height.
        ScrollView {
            VStack(alignment: .leading, spacing: metrics.compact ? 24 : 34) {
                if let card {
                    CastRow(cast: card.cast) { _ in }
                    RelatedRow(cards: card.related) { _ in }
                }
            }
            .padding(.horizontal, metrics.inset).padding(.top, 60)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Theme.background)
        .task { card = try? await env.client.detail(id: ContentID("tmdb:movie:535544")) }
    }
}

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
        Source(id: id, container: "MKV", streamURL: URL(string: "demo://movie")!, provider: Provider(id: "xtream-a", name: "Fournisseur A", kind: "xtream"), origin: origin)
    }
    static let sevenVersions: [Version] = [
        Version(id: "vf-4k-dv", language: .vf, quality: .uhd, dynamicRange: .dolbyVision, sources: [source("a", origin: "4K DV")]),
        Version(id: "vf-4k-hdr", language: .vf, quality: .uhd, dynamicRange: .hdr, sources: [source("b", origin: "Films 4K UHD"), source("c", origin: "4K LIGHT")]),
        Version(id: "vf-fhd", language: .vf, quality: .fhd, dynamicRange: nil, sources: [source("d", origin: "Films FHD")]),
        Version(id: "vf-fhd-version-longue", language: .vf, quality: .fhd, dynamicRange: nil, sources: [source("h", origin: "Films FHD")], edition: "Version longue"),
        Version(id: "vostfr-4k-hdr", language: .vostfr, quality: .uhd, dynamicRange: .hdr, sources: [source("e", origin: "VOST")]),
        Version(id: "vostfr-fhd", language: .vostfr, quality: .fhd, dynamicRange: nil, sources: [source("f", origin: "VOST")]),
        Version(id: "vo-fhd", language: .vo, quality: .fhd, dynamicRange: nil, sources: [source("g", origin: "VO")]),
    ]
}
#endif
