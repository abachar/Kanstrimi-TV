import SwiftUI

/// The six tabs of the app, the same on every platform.
enum MainTab: String, Hashable, CaseIterable {
    case home, live, movies, series, search, settings
}

/// Where a tab's navigation stack can go. On iOS these are pushed screens; on tvOS a detail
/// is a full-screen cover above the tabs, the grids, a saga, a studio and an actor covers above their screen.
nonisolated enum Route: Hashable {
    case detail(ContentID)
    case genre(ContentKind, CatalogRow)
    case saga(ContentID)
    case sagas
    case person(PersonRef)
    case studio(ContentKind, Studio)
    /// iPhone only: the tab bar holds five tabs, so Réglages is pushed from the home screen.
    case settings
}

/// The screen a route resolves to. Registered once per tab stack.
struct RouteView: View {
    let route: Route
    var body: some View {
        switch route {
        case .detail(let id): DetailView(id: id)
        case .genre(let kind, let row): GenreGridView(kind: kind, row: row)
        case .saga(let id): SagaView(id: id)
        case .sagas: SagasGridView()
        case .person(let ref): PersonView(ref: ref)
        case .studio(let kind, let studio): GenreGridView(studio: studio, kind: kind)
        case .settings: SettingsView()
        }
    }
}

extension View {
    /// tvOS: the detail sheet is a full-screen cover above the tabs, and the player stacks above it.
    /// iOS: details are pushed, so nothing to add here.
    @ViewBuilder func detailCover(_ env: AppEnvironment) -> some View {
        #if os(tvOS)
        @Bindable var env = env
        fullScreenCover(item: $env.presentedDetail) { id in
            DetailView(id: id)
                .environment(env)
                .playerCover(env)
        }
        // An actor opened from the player; a title chosen there replaces it by its sheet.
        .fullScreenCover(item: $env.presentedPerson) { ref in
            PersonView(ref: ref, onSelect: { id in env.presentedPerson = nil; env.open(id) }).environment(env)
        }
        #else
        self
        #endif
    }

    /// iPhone: the gear that opens Réglages from the home screen. tvOS has a tab for it.
    @ViewBuilder func settingsToolbar(_ env: AppEnvironment) -> some View {
        #if os(iOS)
        toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { env.navigate(.settings) } label: { Image(systemName: "gearshape") }
                    .accessibilityLabel("Réglages")
            }
        }
        #else
        self
        #endif
    }

    /// Chrome of a pushed detail on iOS: the backdrop runs under a transparent bar with a plain
    /// back button. tvOS has no navigation bar.
    @ViewBuilder func detailChrome() -> some View {
        #if os(iOS)
        toolbarBackground(.hidden, for: .navigationBar)
            .toolbarRole(.editor)
            .toolbar(.hidden, for: .tabBar)
        #else
        self
        #endif
    }
}
