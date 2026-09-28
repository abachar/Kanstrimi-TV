import SwiftUI

/// Films and Séries: shelves by genre (`GET /movies`, `GET /series`), twenty cards each,
/// « Voir tout » opening the paginated grid of a genre.
struct CatalogView: View {
    let kind: ContentKind
    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics
    @State private var rows: [CatalogRow] = []
    @State private var error: CatalogError?
    @State private var isLoading = false
    @State private var seeAll: CatalogRow?

    var body: some View {
        Group {
            if let error, rows.isEmpty {
                StatePanel(icon: "exclamationmark.triangle", title: "Impossible de charger la liste", message: error.localizedDescription) {
                    Task { await load() }
                }
            } else if rows.isEmpty, isLoading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if rows.isEmpty {
                StatePanel(icon: "film", title: kind == .series ? "Aucune série" : "Aucun film", message: "Le catalogue est vide.", actionTitle: nil)
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 10) {
                        Text(kind == .series ? "Séries" : "Films").font(.largeTitle.weight(.bold)).padding(.horizontal, metrics.inset).padding(.top, 30)
                        ForEach(rows) { row in
                            ShelfRow(row: row, onSelect: { env.open($0.id) }, onSeeAll: row.total > row.cards.count ? { seeAll(row) } : nil)
                        }
                        Spacer(minLength: 60)
                    }
                }
                .scrollClipDisabled()
                // Like Home: the margin is Theme.inset alone, not the tvOS safe area plus the inset.
                .ignoresSafeArea(edges: .horizontal)
            }
        }
        .background(Theme.background)
        .task { if rows.isEmpty { await load() } }
        .fullScreenCover(item: $seeAll) { row in
            GenreGridView(kind: kind, row: row).environment(env)
        }
    }

    /// The grid is a cover above this screen on tvOS and a pushed screen on iOS.
    private func seeAll(_ row: CatalogRow) {
        if Platform.isTV { seeAll = row } else { env.navigate(.genre(kind, row)) }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            rows = try await env.call { try await env.client.rows(kind: kind) }
            error = nil
        } catch {
            self.error = (error as? CatalogError) ?? .server(error.localizedDescription)
        }
    }
}

/// One shelf: title, total, the cards, and « Voir tout » at the end when the server has more.
struct ShelfRow: View {
    @Environment(\.metrics) private var metrics
    let row: CatalogRow
    let onSelect: (Card) -> Void
    var onSeeAll: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                Text(row.name).font(.title3.weight(.bold))
                Text(Format.count(row.total)).font(.callout).foregroundStyle(Theme.secondary)
            }
            .padding(.horizontal, metrics.inset)
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: metrics.cardSpacing) {
                    ForEach(row.cards) { c in
                        PosterCard(card: c) { onSelect(c) }
                    }
                    if let onSeeAll {
                        Button(action: onSeeAll) {
                            VStack(spacing: 12) {
                                Image(systemName: "square.grid.3x3").font(.system(size: metrics.stateIcon * 0.7))
                                Text("Voir tout").font(.headline)
                                Text(Format.count(row.total)).font(.caption).foregroundStyle(Theme.secondary)
                            }
                            .frame(width: metrics.posterWidth, height: metrics.posterWidth * 1.5)
                        }
                        .cardButtonStyle()
                    }
                }
                .padding(.horizontal, metrics.inset)
                .padding(.vertical, metrics.rowPadding)
            }
            .scrollClipDisabled()
        }
    }
}

/// « Voir tout » of a genre: the paginated grid, six per row, version filters above [4] [5] [19].
struct GenreGridView: View {
    let kind: ContentKind
    let row: CatalogRow
    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics
    @State private var paginator: Paginator?
    @State private var query: ListQuery

    /// Six fixed columns on TV; on a phone as many posters as fit.
    private var columns: [GridItem] {
        if let n = metrics.gridColumns {
            return Array(repeating: GridItem(.fixed(metrics.posterWidth), spacing: metrics.cardSpacing, alignment: .top), count: n)
        }
        return [GridItem(.adaptive(minimum: metrics.posterWidth), spacing: metrics.cardSpacing, alignment: .top)]
    }

    init(kind: ContentKind, row: CatalogRow) {
        self.kind = kind
        self.row = row
        _query = State(initialValue: ListQuery(kind: kind, genre: row.id))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 30) {
                HStack(spacing: 14) {
                    Text(row.name).font(.largeTitle.weight(.bold))
                    Text(Format.count(row.total)).font(.title3).foregroundStyle(Theme.secondary)
                }
                .padding(.horizontal, metrics.inset)
                FilterBar(kind: kind, query: $query)
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
            }
        }
        .onChange(of: query) { _, q in
            if kind == .series { env.preferences.catalogSortSeries = q.sort } else { env.preferences.catalogSortMovies = q.sort }
            Task { await paginator?.apply(q) }
        }
    }

    @ViewBuilder private var grid: some View {
        if let p = paginator {
            if let error = p.firstPageError {
                StatePanel(icon: "exclamationmark.triangle", title: "Impossible de charger la liste", message: error.localizedDescription) {
                    Task { await p.retry() }
                }
            } else if p.isEmpty {
                StatePanel(icon: "line.3.horizontal.decrease.circle", title: "Aucun titre",
                           message: query.hasFilters ? "Aucun titre ne correspond à ces filtres." : "Ce genre est vide.",
                           actionTitle: query.hasFilters ? "Retirer les filtres" : nil) {
                    query = ListQuery(kind: kind, genre: row.id)
                }
            } else {
                LazyVGrid(columns: columns, alignment: .leading, spacing: metrics.cardSpacing) {
                    ForEach(Array(p.items.enumerated()), id: \.element.id) { index, card in
                        Button { env.open(card.id) } label: {
                            PosterCardLabel(card: card)
                        }
                        .cardButtonStyle()
                        // A cell appearing near the end asks for the next page: works for a focus
                        // walk on TV and for a scroll on a phone alike.
                        .onAppear { Task { await p.loadMoreIfNeeded(reaching: index) } }
                    }
                    if let e = p.pageError {
                        RetryCard(message: e.localizedDescription) { Task { await p.retry() } }
                            .frame(width: metrics.posterWidth, height: metrics.posterWidth * 1.5)
                    } else if p.isLoading {
                        ProgressView().frame(width: metrics.posterWidth, height: metrics.posterWidth * 1.5)
                    }
                }
                .padding(.horizontal, metrics.inset)
                .padding(.vertical, metrics.rowPadding)
            }
        } else {
            ProgressView().frame(maxWidth: .infinity).padding(100)
        }
    }
}

/// The poster card content, without a button, for grid buttons.
struct PosterCardLabel: View {
    @Environment(\.metrics) private var metrics
    let card: Card
    var width: CGFloat? = nil
    var body: some View {
        let width = width ?? metrics.posterWidth
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

/// Sort and version filters of the grid. Active filters are chips a click removes.
struct FilterBar: View {
    @Environment(\.metrics) private var metrics
    let kind: ContentKind
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
                ForEach([Language.vf, .vostfr, .vo], id: \.self) { l in
                    chip(l.rawValue, on: query.language == l) { query.language = query.language == l ? nil : l }
                }
                chip("4K", on: query.minQuality == .uhd) { query.minQuality = query.minQuality == .uhd ? nil : .uhd }
                chip("Dolby Vision", on: query.dynamicRange == .dolbyVision) { query.dynamicRange = query.dynamicRange == .dolbyVision ? nil : .dolbyVision }
                chip("VF disponible", on: query.vfAvailable) { query.vfAvailable.toggle() }
                if query.hasFilters {
                    Button(role: .destructive) { query = ListQuery(kind: kind, genre: query.genre) } label: { Label("Tout retirer", systemImage: "xmark") }
                }
            }
            .padding(.horizontal, metrics.inset)
            .padding(.vertical, 20)
        }
        .scrollClipDisabled()
        .buttonStyle(.bordered)
    }

    private func chip(_ text: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if on { Image(systemName: "checkmark") }
                Text(text)
            }
        }
        .tint(on ? Theme.accent : nil)
    }
}
