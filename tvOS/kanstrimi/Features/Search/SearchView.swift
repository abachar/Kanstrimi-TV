import SwiftUI

/// System search field, scope chips, best result on the left, rows per type on the right [6] [19].
struct SearchView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var text = ""
    @State private var scope: SearchScope = .all
    @State private var only4K = false
    @State private var language: Language?
    @State private var results: SearchResults?
    @State private var error: CatalogError?
    @State private var searchTask: Task<Void, Never>?
    init(initialQuery: String = "") {
        _text = State(initialValue: initialQuery)
    }

    var body: some View {
        NavigationStack {
            content.background(Theme.background)
        }
        .searchable(text: $text, prompt: "Titre, acteur, réalisateur")
        .task { if !text.isEmpty { schedule(immediately: true) } }
        .onChange(of: text) { _, _ in schedule() }
        .onChange(of: scope) { _, _ in schedule(immediately: true) }
    }

    @ViewBuilder private var content: some View {
        VStack(alignment: .leading, spacing: 24) {
            HStack {
                filters
                Spacer()
            }
            .padding(.horizontal, 96)
            if text.trimmingCharacters(in: .whitespaces).isEmpty {
                StatePanel(icon: "magnifyingglass", title: "Rechercher", message: "Un titre, un acteur ou un réalisateur. La dictée Siri fonctionne depuis la télécommande.", actionTitle: nil)
            } else if let error {
                StatePanel(icon: "exclamationmark.triangle", title: "Recherche impossible", message: error.localizedDescription) { schedule(immediately: true) }
            } else if let r = results, r.query == text {
                if filtered(r).isEmpty {
                    StatePanel(icon: "magnifyingglass", title: "Aucun résultat pour « \(r.query) »",
                               message: "Essayez un autre titre, un nom d'acteur ou de réalisateur. La recherche couvre films, séries et chaînes.", actionTitle: nil)
                } else {
                    resultsView(r)
                }
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(80)
            }
            Spacer(minLength: 0)
        }
        .padding(.top, 20)
    }

    private var filters: some View {
        HStack(spacing: 12) {
            ForEach(SearchScope.allCases, id: \.self) { s in
                let n = count(for: s)
                Button(n.map { "\(s.label) · \($0)" } ?? s.label) { scope = s }
                    .tint(scope == s ? Theme.accent : nil)
            }
            Divider().frame(height: 36)
            Button("4K") { only4K.toggle() }.tint(only4K ? Theme.accent : nil)
            ForEach([Language.vf, .vostfr], id: \.self) { l in
                Button(l.rawValue) { language = language == l ? nil : l }.tint(language == l ? Theme.accent : nil)
            }
        }
        .buttonStyle(.bordered)
    }

    private func count(for s: SearchScope) -> Int? {
        guard let r = results else { return nil }
        switch s {
        case .all: return nil
        case .movies: return r.movies.count
        case .series: return r.series.count
        case .live: return r.live.count
        }
    }

    private func filtered(_ r: SearchResults) -> [ContentCard] {
        (r.movies + r.series + r.live).filter(passes)
    }
    private func passes(_ c: ContentCard) -> Bool {
        if only4K, c.maxQuality != .uhd { return false }
        if let language, !c.languages.contains(language) { return false }
        return true
    }

    private func resultsView(_ r: SearchResults) -> some View {
        let all = filtered(r)
        let best = (r.best.flatMap { b in all.first { $0.id == b.id } }) ?? all.first
        return HStack(alignment: .top, spacing: 60) {
            if let best { bestView(best) }
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    let movies = r.movies.filter(passes), series = r.series.filter(passes), live = r.live.filter(passes)
                    if !movies.isEmpty { row("Films", movies) }
                    if !series.isEmpty { row("Séries", series) }
                    if !live.isEmpty { row("En direct", live) }
                }
            }
            .scrollClipDisabled()
        }
        .padding(.leading, 96)
    }

    private func row(_ title: String, _ cards: [ContentCard]) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title).font(.title3.weight(.bold))
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: 30) {
                    ForEach(cards) { c in
                        PosterCard(card: c, width: 200) { open(c) }
                    }
                }
                .padding(.vertical, 24).padding(.horizontal, 10)
            }
            .scrollClipDisabled()
        }
    }

    private func bestView(_ c: ContentCard) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Meilleur résultat").font(.caption.weight(.bold)).tracking(1.5).foregroundStyle(Theme.secondary)
            ArtView(id: c.id, url: c.poster, title: c.title).frame(width: 360, height: 540).clipShape(RoundedRectangle(cornerRadius: 18))
            Text(c.title).font(.title2.weight(.bold)).lineLimit(2)
            Text([c.kind.label, c.year.map(String.init), c.genres.first].compactMap { $0 }.joined(separator: " · ")).foregroundStyle(Theme.secondary)
            VersionBadges(quality: c.qualityBadge, languages: c.languages)
            let choice = c.kind == .live ? nil : nil as VersionChooser.Choice?
            Button { play(c) } label: {
                Label(playLabel(c, choice), systemImage: "play.fill")
            }
            .buttonStyle(.borderedProminent)
            if c.kind != .live {
                Button("Fiche") { env.open(c.id) }.buttonStyle(.bordered)
            }
        }
        .frame(width: 400, alignment: .leading)
    }

    private func playLabel(_ c: ContentCard, _ choice: VersionChooser.Choice?) -> String {
        var parts = ["Lecture"]
        if let q = c.qualityBadge { parts.append(q) }
        if let l = env.preferences.languageOrder.first(where: { c.languages.contains($0) }) ?? c.languages.first { parts.append(l.rawValue) }
        return parts.joined(separator: " · ")
    }

    private func open(_ c: ContentCard) {
        if c.kind == .live { play(c) } else { env.open(c.id) }
    }

    private func play(_ c: ContentCard) {
        Task {
            if c.kind == .live {
                guard let groups = try? await env.call({ try await env.client.channels() }) else { return }
                let all = groups.flatMap(\.channels)
                guard let ch = all.first(where: { $0.id == c.id }) else { return }
                env.player.play(channel: ch, in: all)
                env.recentChannels.record(ch.id)
            } else if let ctx = try? await env.call({ try await env.client.playbackContext(id: c.id) }) {
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
                let r = try await env.call { try await env.client.search(q, scope: scope) }
                if !Task.isCancelled { results = r; error = nil }
            } catch {
                if !Task.isCancelled { self.error = (error as? CatalogError) ?? .server(error.localizedDescription) }
            }
        }
    }
}
