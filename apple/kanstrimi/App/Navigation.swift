import SwiftUI

/// The tabs of the app; iPhone shows five, Réglages being pushed from the home screen.
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

extension Route: Identifiable {
    var id: Route { self }
}

/// The screen a route resolves to. Registered once per tab stack; on tvOS, `routeCover` presents it.
struct RouteView: View {
    let route: Route
    /// What a title does when chosen in a saga or an actor's screen; the sheet opens it by default.
    var onSelect: ((ContentID) -> Void)?
    var body: some View {
        switch route {
        case .detail(let id): DetailView(id: id)
        case .genre(let kind, let row): GenreGridView(kind: kind, row: row)
        case .saga(let id): SagaView(id: id, onSelect: onSelect)
        case .sagas: SagasGridView()
        case .person(let ref): PersonView(ref: ref, onSelect: onSelect)
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
            // A title chosen from a saga, an actor or the related row replaces the cover's content in place:
            // the identity makes it a new sheet, which loads that title instead of keeping the previous one.
            DetailView(id: id)
                .id(id)
                .environment(env)
                .playerCover(env)
        }
        // An actor opened from the player; a title chosen there replaces it by its sheet.
        .routeCover($env.presentedCover, closesOnSelect: true)
        #else
        self
        #endif
    }

    /// tvOS: the route is a full-screen cover above this screen. A title chosen there opens its sheet above it; from a
    /// screen that is itself a sheet or the player (`closesOnSelect`), the cover closes first.
    /// iOS: routes are pushed (`AppEnvironment.open(_:cover:)`), so nothing to add here.
    @ViewBuilder func routeCover(_ route: Binding<Route?>, closesOnSelect: Bool = false) -> some View {
        #if os(tvOS)
        modifier(RouteCover(route: route, closesOnSelect: closesOnSelect))
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

#if os(tvOS)
private struct RouteCover: ViewModifier {
    @Environment(AppEnvironment.self) private var env
    @Binding var route: Route?
    let closesOnSelect: Bool

    func body(content: Content) -> some View {
        content.fullScreenCover(item: $route) { route in
            RouteView(route: route, onSelect: closesOnSelect ? { id in self.route = nil; env.open(id) } : nil).environment(env)
        }
    }
}
#endif

extension AppEnvironment {
    /// Opens a saga, a studio, an actor or a grid from a screen: a cover owned by that screen on tvOS (`routeCover`),
    /// a push in the current tab on iOS.
    func open(_ route: Route, cover: Binding<Route?>) {
        if Platform.isTV { cover.wrappedValue = route } else { navigate(route) }
    }
}
