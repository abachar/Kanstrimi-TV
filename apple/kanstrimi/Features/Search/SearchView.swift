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
            if let best = r.best ?? (r.live + r.movies + r.series).first {
                resultsView(r, best: best)
            } else {
                StatePanel(icon: "magnifyingglass", title: "Aucun résultat pour « \(r.query) »",
                           message: "Essayez un autre titre, un nom d'acteur ou de réalisateur. La recherche couvre films, séries et chaînes.", actionTitle: nil)
            }
        } else {
            ProgressView().frame(maxWidth: .infinity).padding(80)
        }
    }

    private func resultsView(_ r: SearchResults, best: Card) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: metrics.compact ? 20 : 30) {
                bestView(best)
                if !r.live.isEmpty { row("En direct", r.live) }
                if !r.movies.isEmpty { row("Films", r.movies) }
                if !r.series.isEmpty { row("Séries", r.series) }
            }
            .padding(.leading, metrics.inset)
            .padding(.vertical, metrics.compact ? 12 : 20)
        }
        .scrollClipDisabled()
    }

    private func row(_ title: String, _ cards: [Card]) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title).font(.title3.weight(.bold))
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: metrics.cardSpacing) {
                    ForEach(cards) { c in
                        PosterCard(card: c) { open(c) }.posterMenu(c)
                    }
                }
                .padding(.vertical, metrics.rowPadding).padding(.horizontal, metrics.compact ? 0 : 10)
            }
            .scrollClipDisabled()
        }
    }

    /// The wide picture (a channel's logo on its colour) is the button, like any card: the sheet, or
    /// the channel. On TV the title, facts and overview beside it, so the next row shows under it;
    /// on a phone the facts alone, below it.
    private func bestView(_ c: Card) -> some View {
        let card = Button { open(c) } label: { widePicture(c) }
            .cardButtonStyle()
            .posterMenu(c)
        return VStack(alignment: .leading, spacing: metrics.compact ? 12 : 18) {
            Text("MEILLEUR RÉSULTAT").font(.caption.weight(.bold)).tracking(1.5).foregroundStyle(Theme.secondary)
            if let width = metrics.searchBest {
                HStack(alignment: .top, spacing: 40) {
                    card.frame(width: width)
                    bestFacts(c)
                }
            } else {
                card
                bestFacts(c)
            }
        }
        .padding(.trailing, metrics.inset)
    }

    private func bestFacts(_ c: Card) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            if !metrics.compact { Text(c.title).font(.title2.weight(.bold)).lineLimit(2) }
            HStack(spacing: 12) {
                Text([c.kind.label, c.year.map(String.init), c.genres.first].compactMap { $0 }.joined(separator: " · "))
                    .foregroundStyle(Theme.secondary).lineLimit(1)
                VersionBadges(quality: c.qualityBadge, languages: c.languages)
            }
            if !metrics.compact, let overview = c.overview, !overview.isEmpty {
                Text(overview).font(.callout).foregroundStyle(Theme.secondary).lineLimit(4)
            }
        }
    }

    private func widePicture(_ c: Card) -> some View {
        ZStack(alignment: .bottomLeading) {
            if c.kind == .live {
                Rectangle().fill(Theme.art(for: c.id))
                    .overlay {
                        AsyncImage(url: c.poster) { phase in
                            if let image = phase.image { image.resizable().scaledToFit() }
                        }
                        .padding(metrics.compact ? 40 : 70)
                    }
            } else {
                ArtView(id: c.id, url: c.backdrop ?? c.poster)
                    .overlay {
                        LinearGradient(colors: [.clear, .clear, Theme.background.opacity(0.85)], startPoint: .top, endPoint: .bottom)
                    }
                bestTitle(c).padding(metrics.compact ? 14 : 24)
            }
        }
        .aspectRatio(16 / 9, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: metrics.compact ? 14 : 18))
    }

    /// The title's logo over the picture; else the title, on a phone only: on TV it is written beside.
    @ViewBuilder private func bestTitle(_ c: Card) -> some View {
        if let logo = c.logo {
            AsyncImage(url: logo) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFit()
                        .frame(maxWidth: metrics.compact ? 180 : 320, maxHeight: metrics.compact ? 60 : 110, alignment: .bottomLeading)
                        .shadow(color: .black.opacity(0.5), radius: 12)
                        .accessibilityLabel(c.title)
                } else {
                    titleOverPicture(c)
                }
            }
        } else {
            titleOverPicture(c)
        }
    }

    @ViewBuilder private func titleOverPicture(_ c: Card) -> some View {
        if metrics.compact {
            Text(c.title).font(.title3.weight(.bold)).lineLimit(2).shadow(color: .black.opacity(0.6), radius: 8)
        }
    }

    private func open(_ c: Card) {
        if c.kind == .live { play(c) } else { env.open(c.id) }
    }

    private func play(_ c: Card) {
        Task {
            if c.kind == .live {
                await env.watchChannel(c.id)
            } else if let ctx = try? await env.playbackContext(for: c) {
                env.player.play(ctx)
            }
        }
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
