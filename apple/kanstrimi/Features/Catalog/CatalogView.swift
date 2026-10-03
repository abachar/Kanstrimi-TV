import SwiftUI

/// Films and Séries: the server's shelves (`GET /movies`, `GET /series`: Top 10, Nouveautés, genres),
/// then after « Nouveautés » the studio hubs and, for films, the sagas. « Voir tout » opens a paginated grid.
struct CatalogView: View {
    let kind: ContentKind
    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics
    @State private var rows: [CatalogRow] = []
    @State private var error: CatalogError?
    @State private var isLoading = false
    @State private var seeAll: CatalogRow?
    @State private var sagas: Page<ContentItem>?
    /// nil = not loaded yet (or the call failed): retried at the next appearance.
    @State private var studios: [Studio]?
    @State private var openSaga: ContentID?
    @State private var openStudio: Studio?
    @State private var allSagas = false

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
                        // iPhone: the title is the navigation bar's (`phoneLargeTitle`).
                        if !metrics.compact {
                            Text(kind == .series ? "Séries" : "Films").font(.largeTitle.weight(.bold)).padding(.horizontal, metrics.inset).padding(.top, 30)
                        }
                        ForEach(rows) { row in
                            ShelfRow(row: row, ranked: row.id == "top10", onSelect: { env.open($0.id) },
                                     onSeeAll: row.total > row.cards.count ? { seeAll(row) } : nil)
                            if row.id == hubsAnchor {
                                if let studios, !studios.isEmpty { StudioShelf(studios: studios) { open($0) } }
                                if let sagas, !sagas.items.isEmpty {
                                    SagaShelf(sagas: sagas.items, total: sagas.total ?? sagas.items.count, onSelect: { open(saga: $0) },
                                              onSeeAll: sagas.nextCursor != nil ? { seeAllSagas() } : nil)
                                }
                            }
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
        .phoneLargeTitle(kind == .series ? "Séries" : "Films")
        // Every appearance: on tvOS, crossing the tab bar selects then leaves this tab, which cancels the load midway.
        .task { await load() }
        .fullScreenCover(item: $seeAll) { row in
            GenreGridView(kind: kind, row: row).environment(env)
        }
        .fullScreenCover(item: $openSaga) { id in
            SagaView(id: id).environment(env)
        }
        .fullScreenCover(item: $openStudio) { studio in
            GenreGridView(studio: studio, kind: kind).environment(env)
        }
        .fullScreenCover(isPresented: $allSagas) {
            SagasGridView().environment(env)
        }
    }

    /// Studios and sagas come after « Nouveautés », or after the first shelf when there is none.
    private var hubsAnchor: String? { rows.first { $0.id == "recent" }?.id ?? rows.first?.id }

    // Like the genre grid: a cover on tvOS, a pushed screen elsewhere.
    private func open(saga id: ContentID) {
        if Platform.isTV { openSaga = id } else { env.navigate(.saga(id)) }
    }
    private func open(_ studio: Studio) {
        if Platform.isTV { openStudio = studio } else { env.navigate(.studio(kind, studio)) }
    }
    private func seeAllSagas() {
        if Platform.isTV { allSagas = true } else { env.navigate(.sagas) }
    }

    /// The grid is a cover above this screen on tvOS and a pushed screen on iOS.
    private func seeAll(_ row: CatalogRow) {
        if Platform.isTV { seeAll = row } else { env.navigate(.genre(kind, row)) }
    }

    /// Loads what is still missing: the shelves once, then the studios and sagas, whose failure just
    /// leaves them out until the next appearance.
    private func load() async {
        if rows.isEmpty {
            isLoading = true
            defer { isLoading = false }
            do {
                rows = try await env.call { try await env.client.rows(kind: kind) }
                error = nil
            } catch {
                if !Task.isCancelled { self.error = (error as? CatalogError) ?? .server(error.localizedDescription) }
                return
            }
        }
        if studios == nil { studios = try? await env.call { try await env.client.studios(kind: kind) } }
        if kind == .movie, sagas == nil { sagas = try? await env.call { try await env.client.sagas(cursor: nil) } }
    }
}

/// One shelf: title, total, the cards, and « Voir tout » at the end when the server has more.
/// `ranked`: the Top 10, a big rank number beside each poster.
struct ShelfRow: View {
    @Environment(\.metrics) private var metrics
    let row: CatalogRow
    var ranked = false
    let onSelect: (ContentItem) -> Void
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
                    ForEach(Array(row.cards.enumerated()), id: \.element.id) { index, c in
                        HStack(alignment: .bottom, spacing: 0) {
                            if ranked {
                                Text("\(index + 1)")
                                    .font(.system(size: metrics.posterWidth * 0.62, weight: .black, design: .rounded))
                                    .foregroundStyle(Theme.secondary.opacity(0.55))
                                    .offset(x: metrics.cardSpacing * 0.6)
                            }
                            PosterCard(item: c) { onSelect(c) }
                                .frame(width: metrics.posterWidth)
                                .posterMenu(c)
                        }
                    }
                    if let onSeeAll { SeeAllCard(total: row.total, action: onSeeAll).frame(width: metrics.posterWidth) }
                }
                .padding(.horizontal, metrics.inset)
                .padding(.vertical, metrics.rowPadding)
            }
            .scrollClipDisabled()
        }
    }
}

/// « Voir tout » of a genre or a studio: the paginated grid, six per row, version filters above [4] [5] [19].
struct GenreGridView: View {
    let kind: ContentKind
    let title: String
    /// Known for a genre; a studio's comes with the tab's count.
    let total: Int
    /// A studio's grid: its logo in place of the title, its latest title's backdrop behind.
    private var studio: Studio?
    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics
    @State private var paginator: Paginator<ContentItem, ListQuery>?
    @State private var query: ListQuery

    init(kind: ContentKind, row: CatalogRow) {
        self.kind = kind
        title = row.name
        total = row.total
        _query = State(initialValue: ListQuery(kind: kind, genre: row.id))
    }

    init(studio: Studio, kind: ContentKind) {
        self.kind = kind
        title = studio.name
        total = studio.count
        self.studio = studio
        var q = ListQuery(kind: kind)
        q.studio = studio.id
        _query = State(initialValue: q)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 30) {
                header.padding(.horizontal, metrics.inset)
                FilterBar(kind: kind, query: $query)
                grid
            }
            .padding(.vertical, 40)
            .padding(.top, studio == nil ? 0 : metrics.detailTop - 40)
        }
        .background {
            ZStack(alignment: .top) {
                Theme.background
                // Like a saga's screen: the backdrop fades into the background under the header.
                if let studio, let backdrop = studio.backdrop {
                    ZStack {
                        ArtView(id: ContentID(studio.id), url: backdrop)
                        LinearGradient(colors: [.clear, Theme.background.opacity(0.9), Theme.background], startPoint: .top, endPoint: .bottom)
                    }
                    .frame(height: metrics.heroHeight * 1.2)
                }
            }
            .ignoresSafeArea()
        }
        .task {
            if paginator == nil {
                let p = Paginator(client: env.client, query: query)
                paginator = p
                await p.loadFirstPage()
            }
        }
        .onChange(of: query) { _, q in
            Task { await paginator?.apply(q) }
        }
    }

    @ViewBuilder private var header: some View {
        if let studio {
            StudioTile(studio: studio).frame(width: metrics.studioWidth)
        } else {
            HStack(spacing: 14) {
                Text(title).font(.largeTitle.weight(.bold))
                Text(Format.count(total)).font(.title3).foregroundStyle(Theme.secondary)
            }
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
                           message: query.hasFilters ? "Aucun titre ne correspond à ces filtres." : "Cette liste est vide.",
                           actionTitle: query.hasFilters ? "Retirer les filtres" : nil) {
                    query = query.cleared
                }
            } else {
                PagedPosterGrid(paginator: p) { item in
                    PosterCard(item: item) { env.open(item.id) }
                        .posterMenu(item)
                }
            }
        } else {
            ProgressView().frame(maxWidth: .infinity).padding(100)
        }
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
                    Button(role: .destructive) { query = query.cleared } label: { Label("Tout retirer", systemImage: "xmark") }
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

extension Metrics {
    /// Poster grid: fixed columns on TV, as many posters as fit elsewhere.
    var posterColumns: [GridItem] {
        if let n = gridColumns {
            return Array(repeating: GridItem(.fixed(posterWidth), spacing: cardSpacing, alignment: .top), count: n)
        }
        return [GridItem(.adaptive(minimum: posterWidth), spacing: cardSpacing, alignment: .top)]
    }
}
