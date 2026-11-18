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
#Preview("App · onglets") {
    ScreenHost(setup: { env in
        env.device.choose(profile: 1); env.adopt(profiles: PreviewData.profiles)
        env.tabAvatar = TabAvatar.render(nil, profile: PreviewData.profiles[0])
    }) { MainTabsView() }
}
#Preview("Appairage") { ScreenHost { PairingView() } }
#Preview("Profil · qui regarde ?") {
    ScreenHost(setup: { env in env.device.store(token: "mock-debug", code: "DEBUG0"); env.device.choose(profile: nil); env.adopt(profiles: PreviewData.profiles) }) {
        ProfilePickerView()
    }
}
#Preview("Profil") {
    ScreenHost(setup: { env in env.device.store(token: "mock-debug", code: "DEBUG0"); env.device.choose(profile: 2); env.adopt(profiles: PreviewData.profiles) }) {
        NavigationStack { ProfileView() }
    }
}
#Preview("Appairage · code expiré") { ScreenHost(setup: { $0.scenario.pairingExpires = true }) { PairingView() } }
#Preview("Appairage · jeton révoqué") {
    ScreenHost(setup: { $0.device.forget(reason: "L'appareil « Salon » a été retiré depuis l'admin du serveur. Vos favoris et vos reprises sont conservés côté serveur ; il suffit de l'ajouter à nouveau.") }) { PairingView() }
}
#Preview("Accueil") { ScreenHost { HomeView() } }
#Preview("Accueil · hors ligne") { ScreenHost { HomeOfflinePreview() } }
#Preview("Films") { ScreenHost { CatalogView(kind: .movie) } }
#Preview("Séries") { ScreenHost { CatalogView(kind: .series) } }
#Preview("Sagas") { ScreenHost { NavigationStack { SagasGridView() } } }
#Preview("Saga") { ScreenHost { NavigationStack { SagaView(id: ContentID("saga:1")) } } }
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
#Preview("Sélecteur de variantes") {
    ScreenHost {
        VariantPicker(title: "La Lisière", variants: Fixtures.eightVariants, recommendedID: "a") { _ in }
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
    static let providerA = Provider(id: "xtream-a", name: "Fournisseur A", kind: "xtream", rank: 1)
    static let providerB = Provider(id: "xtream-b", name: "Fournisseur B", kind: "xtream", rank: 2)
    static func variant(_ id: String, _ language: Language, _ quality: Quality, _ dynamicRange: DynamicRange? = nil, edition: String? = nil,
                        by provider: Provider = providerA, name: String, category: String) -> Variant {
        Variant(id: id, language: language, quality: quality, dynamicRange: dynamicRange, edition: edition, provider: provider, name: name,
                category: category, streamURL: URL(string: "demo://movie"))
    }
    static let eightVariants: [Variant] = [
        variant("a", .vf, .uhd, .dolbyVision, name: "La Lisière (2025) 4K DV", category: "|FR| FILMS 4K DOLBY VISION"),
        variant("b", .vf, .uhd, .hdr, name: "La Lisière (2025) UHD", category: "|FR| FILMS 4K UHD"),
        variant("c", .vf, .uhd, .hdr, by: providerB, name: "FR - La Lisiere 2025 2160p", category: "VOD | 4K LIGHT"),
        variant("d", .vf, .fhd, name: "La Lisière (2025)", category: "|FR| FILMS RÉCENTS"),
        variant("h", .vf, .fhd, edition: "Version longue", name: "La Lisière (2025) VERSION LONGUE", category: "|FR| FILMS RÉCENTS"),
        variant("e", .vostfr, .uhd, .hdr, name: "La Lisière (2025) VOSTFR 4K", category: "|FR| V.O SOUS TITRÉS"),
        variant("f", .vostfr, .fhd, name: "La Lisière (2025) VOSTFR", category: "|FR| V.O SOUS TITRÉS"),
        variant("g", .vo, .fhd, by: providerB, name: "EN - The Edge (2025)", category: "EN | MOVIES"),
    ]
}
#endif
