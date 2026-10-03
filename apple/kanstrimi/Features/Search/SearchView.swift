import SwiftUI

/// System search field, then one column: the best result wide, then the channels, films and series
/// that match, a row each [6] [19]. No filters: the search covers everything at once.
struct SearchView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics
    @State private var text = ""
    @State private var results: SearchResults?
    @State private var error: CatalogError?
    @State private var searchTask: Task<Void, Never>?

    init(initialQuery: String = "") {
        _text = State(initialValue: initialQuery)
    }

    var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(Theme.background)
            .searchField(text: $text, prompt: "Titre, acteur, réalisateur")
            .phoneLargeTitle("Recherche")
            .task {
                #if DEBUG
                // `debug.search` (RootView.debugHooks): the screen is built after the hooks ran, it reads the key itself.
                if let q = UserDefaults.standard.string(forKey: "debug.search") {
                    UserDefaults.standard.removeObject(forKey: "debug.search")
                    text = q
                }
                #endif
                if !text.isEmpty { schedule(immediately: true) }
            }
            .onChange(of: text) { _, _ in schedule() }
    }

    @ViewBuilder private var content: some View {
        if text.trimmingCharacters(in: .whitespaces).isEmpty {
            StatePanel(icon: "magnifyingglass", title: "Rechercher", message: "Un titre, un acteur ou un réalisateur. La recherche couvre films, séries et chaînes.", actionTitle: nil)
        } else if let error {
            StatePanel(icon: "exclamationmark.triangle", title: "Recherche impossible", message: error.localizedDescription) { schedule(immediately: true) }
        } else if let r = results, r.query == text {
            if let best = r.best {
                resultsView(r, best: best)
            } else {
                StatePanel(icon: "magnifyingglass", title: "Aucun résultat pour « \(r.query) »",
                           message: "Essayez un autre titre, un nom d'acteur ou de réalisateur. La recherche couvre films, séries et chaînes.", actionTitle: nil)
            }
        } else {
            ProgressView().frame(maxWidth: .infinity).padding(80)
        }
    }

    private func resultsView(_ r: SearchResults, best: ContentItem) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: metrics.compact ? 20 : 30) {
                BestResult(item: best) { open(best) }.posterMenu(best)
                if !r.live.isEmpty { row("En direct") { items(r.live) } }
                if !r.movies.isEmpty { row("Films") { items(r.movies) } }
                if !r.series.isEmpty { row("Séries") { items(r.series) } }
            }
            .padding(.leading, metrics.inset)
            .padding(.vertical, metrics.compact ? 12 : 20)
        }
        .scrollClipDisabled()
    }

    private func items(_ items: [ContentItem]) -> some View {
        ForEach(items) { item in PosterCard(item: item) { open(item) }.frame(width: metrics.posterWidth).posterMenu(item) }
    }

    private func row(_ title: String, @ViewBuilder cards: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title).font(.title3.weight(.bold))
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: metrics.cardSpacing) {
                    cards()
                }
                .padding(.vertical, metrics.rowPadding).padding(.horizontal, metrics.compact ? 0 : 10)
            }
            .scrollClipDisabled()
        }
    }

    /// A channel plays at once; anything else opens its sheet.
    private func open(_ item: ContentItem) {
        if item.kind == .live { Task { await env.watchChannel(item.id) } } else { env.open(item.id) }
    }

    /// 300 ms without a keystroke, the previous search cancelled.
    private func schedule(immediately: Bool = false) {
        searchTask?.cancel()
        let q = text
        guard !q.trimmingCharacters(in: .whitespaces).isEmpty else { results = nil; error = nil; return }
        searchTask = Task {
            if !immediately { try? await Task.sleep(for: .milliseconds(300)) }
            if Task.isCancelled { return }
            do {
                let r = try await env.call { try await env.client.search(q) }
                if !Task.isCancelled { results = r; error = nil }
            } catch {
                if !Task.isCancelled { self.error = (error as? CatalogError) ?? .server(error.localizedDescription) }
            }
        }
    }
}
