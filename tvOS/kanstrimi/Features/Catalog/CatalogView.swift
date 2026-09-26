import SwiftUI

/// Films and Séries: the same paginated grid, six per row, with a filter bar above [4] [5] [19].
struct CatalogView: View {
    let kind: ContentKind
    @Environment(AppEnvironment.self) private var env
    @State private var paginator: Paginator?
    @State private var genres: [Genre] = []
    @State private var query: ListQuery
    @FocusState private var focusedCard: ContentID?

    private let columns = Array(repeating: GridItem(.fixed(250), spacing: 40, alignment: .top), count: 6)

    init(kind: ContentKind) {
        self.kind = kind
        _query = State(initialValue: ListQuery(kind: kind))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 30) {
                header
                FilterBar(kind: kind, genres: genres, query: $query)
                grid
            }
            .padding(.vertical, 40)
        }
        .background(Theme.background)
        .task {
            if paginator == nil {
                query.sort = kind == .series ? env.preferences.catalogSortSeries : env.preferences.catalogSortMovies
                let p = Paginator(client: env.client, query: query)
                paginator = p
                await p.loadFirstPage()
                genres = (try? await env.client.genres(kind: kind)) ?? []
            }
        }
        .onChange(of: query) { _, q in
            if kind == .series { env.preferences.catalogSortSeries = q.sort } else { env.preferences.catalogSortMovies = q.sort }
            Task { await paginator?.apply(q) }
        }
    }

    private var header: some View {
        HStack {
            Text(kind == .series ? "Séries" : "Films").font(.largeTitle.weight(.bold))
            Spacer()
        }
        .padding(.horizontal, 96)
    }

    @ViewBuilder private var grid: some View {
        if let p = paginator {
            if let error = p.firstPageError {
                StatePanel(icon: "exclamationmark.triangle", title: "Impossible de charger la liste", message: error.localizedDescription) {
                    Task { await p.retry() }
                }
            } else if p.isEmpty {
                StatePanel(icon: "line.3.horizontal.decrease.circle", title: "Aucun titre",
                           message: query.hasFilters ? "Aucun titre ne correspond à ces filtres." : "Le catalogue est vide.",
                           actionTitle: query.hasFilters ? "Retirer les filtres" : nil) {
                    query = ListQuery(kind: kind)
                }
            } else {
                LazyVGrid(columns: columns, alignment: .leading, spacing: 40) {
                    ForEach(Array(p.items.enumerated()), id: \.element.id) { index, card in
                        Button { env.open(card.id) } label: {
                            PosterCardLabel(card: card)
                        }
                        .buttonStyle(.card)
                        .focused($focusedCard, equals: card.id)
                        .onChange(of: focusedCard) { _, f in
                            if f == card.id { Task { await p.loadMoreIfNeeded(reaching: index) } }
                        }
                    }
                    if let e = p.pageError {
                        RetryCard(message: e.localizedDescription) { Task { await p.retry() } }
                            .frame(width: 250, height: 375)
                    } else if p.isLoading {
                        ProgressView().frame(width: 250, height: 375)
                    }
                }
                .padding(.horizontal, 96)
                .padding(.vertical, 30)
            }
        } else {
            ProgressView().frame(maxWidth: .infinity).padding(100)
        }
    }
}

/// The poster card content, without a button, for grid buttons.
struct PosterCardLabel: View {
    let card: ContentCard
    var width: CGFloat = 250
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ZStack(alignment: .bottomLeading) {
                ArtView(id: card.id, url: card.poster, title: card.title).frame(width: width, height: width * 1.5)
                LinearGradient(colors: [.clear, .black.opacity(0.75)], startPoint: .center, endPoint: .bottom)
                VStack(alignment: .leading, spacing: 6) {
                    if let hint = card.hint {
                        Text(hint).font(.caption2.weight(.bold)).padding(.horizontal, 8).padding(.vertical, 3)
                            .background(Theme.accent, in: Capsule()).foregroundStyle(.black)
                    }
                    VersionBadges(quality: card.qualityBadge, languages: card.languages, compact: true)
                }
                .padding(12)
                if let p = card.progress, p.isResumable {
                    ProgressBar(fraction: p.fraction, height: 5).padding(.horizontal, 12).padding(.bottom, 6)
                }
            }
            .frame(width: width, height: width * 1.5)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            Text(card.title).font(.callout.weight(.semibold)).lineLimit(1)
            Text([card.year.map(String.init), card.genres.first].compactMap { $0 }.joined(separator: " · "))
                .font(.caption).foregroundStyle(Theme.secondary).lineLimit(1)
        }
        .frame(width: width)
    }
}

/// Sort, genres and version filters at the same level. Active filters are chips a click removes.
struct FilterBar: View {
    let kind: ContentKind
    let genres: [Genre]
    @Binding var query: ListQuery

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 14) {
                Button {
                    let options = CatalogSort.options(for: kind)
                    let i = options.firstIndex(of: query.sort) ?? 0
                    query.sort = options[(i + 1) % options.count]
                } label: {
                    Label("Trier : \(query.sort.label)", systemImage: "arrow.up.arrow.down")
                }
                Divider().frame(height: 40)
                ForEach(genres.prefix(8)) { g in
                    chip(g.name, count: g.count, on: query.genre == g.name) { query.genre = query.genre == g.name ? nil : g.name }
                }
                Divider().frame(height: 40)
                ForEach([Language.vf, .vostfr, .vo], id: \.self) { l in
                    chip(l.rawValue, on: query.language == l) { query.language = query.language == l ? nil : l }
                }
                chip("4K", on: query.minQuality == .uhd) { query.minQuality = query.minQuality == .uhd ? nil : .uhd }
                chip("Dolby Vision", on: query.dynamicRange == .dolbyVision) { query.dynamicRange = query.dynamicRange == .dolbyVision ? nil : .dolbyVision }
                chip("VF disponible", on: query.vfAvailable) { query.vfAvailable.toggle() }
                if kind == .series {
                    chip("Nouveaux épisodes", on: query.newEpisodes) { query.newEpisodes.toggle() }
                    chip("Saison complète en VF", on: query.completeSeasonVF) { query.completeSeasonVF.toggle() }
                }
                if query.hasFilters {
                    Button(role: .destructive) { query = ListQuery(kind: kind) } label: { Label("Tout retirer", systemImage: "xmark") }
                }
            }
            .padding(.horizontal, 96)
            .padding(.vertical, 20)
        }
        .scrollClipDisabled()
        .buttonStyle(.bordered)
    }

    private func chip(_ text: String, count: Int? = nil, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if on { Image(systemName: "checkmark") }
                Text(text)
                if let count { Text("\(count)").foregroundStyle(Theme.secondary) }
            }
        }
        .tint(on ? Theme.accent : nil)
    }
}
