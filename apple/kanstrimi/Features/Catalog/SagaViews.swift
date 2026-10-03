import SwiftUI

/// The « Sagas » shelf of the Films tab: one poster per TMDB collection with two visible movies or more.
struct SagaShelf: View {
    @Environment(\.metrics) private var metrics
    let sagas: [ContentItem]
    let total: Int
    let onSelect: (ContentID) -> Void
    var onSeeAll: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                Text("Sagas").font(.title3.weight(.bold))
                Text(Format.count(total)).font(.callout).foregroundStyle(Theme.secondary)
            }
            .padding(.horizontal, metrics.inset)
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: metrics.cardSpacing) {
                    ForEach(sagas) { saga in
                        PosterCard(item: saga) { onSelect(saga.id) }.frame(width: metrics.posterWidth)
                    }
                    if let onSeeAll { SeeAllCard(total: total, action: onSeeAll).frame(width: metrics.posterWidth) }
                }
                .padding(.horizontal, metrics.inset)
                .padding(.vertical, metrics.rowPadding)
            }
            .scrollClipDisabled()
        }
    }
}

/// One saga: its backdrop, its name, its movies in release order. A cover on tvOS, a pushed screen elsewhere.
struct SagaView: View {
    let id: ContentID
    /// What a movie does when chosen; the sheet opens it by default.
    var onSelect: ((ContentID) -> Void)?
    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics

    var body: some View {
        LoadedScreen(errorTitle: "Saga indisponible", load: { try await env.call { try await env.client.saga(id: id.rawValue) } }) { s in
            content(s)
        }
    }

    private func content(_ s: SagaSheet) -> some View {
        ZStack(alignment: .topLeading) {
            ZStack {
                ArtView(id: ContentID(s.id), url: s.backdrop)
                LinearGradient(colors: [.clear, Theme.background.opacity(0.9), Theme.background], startPoint: .top, endPoint: .bottom)
            }
            .ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 30) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("SAGA").font(.caption.weight(.bold)).tracking(2).foregroundStyle(Theme.accent)
                        Text(s.name).font(.system(size: metrics.detailTitle, weight: .heavy)).lineLimit(2)
                        Text(filmCount(s.count)).font(.title3).foregroundStyle(Theme.secondary)
                    }
                    .padding(.horizontal, metrics.inset)
                    .padding(.top, metrics.detailTop)
                    PosterGrid(items: s.movies, onSelect: onSelect ?? env.open)
                }
                .padding(.bottom, 60)
            }
        }
    }
}

/// « Voir tout » of the sagas: every saga, freshest first, page by page.
struct SagasGridView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics
    @State private var paginator: Paginator<ContentItem, SagaQuery>?
    @State private var total: Int?
    @State private var openSaga: ContentID?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 30) {
                HStack(spacing: 14) {
                    Text("Sagas").font(.largeTitle.weight(.bold))
                    if let total { Text(Format.count(total)).font(.title3).foregroundStyle(Theme.secondary) }
                }
                .padding(.horizontal, metrics.inset)
                grid
            }
            .padding(.vertical, 40)
        }
        .background(Theme.background)
        .task {
            guard paginator == nil else { return }
            let p = Paginator<ContentItem, SagaQuery>(query: SagaQuery()) { q in
                let page = try await env.call { try await env.client.sagas(cursor: q.cursor) }
                if q.cursor == nil { total = page.total }
                return page
            }
            paginator = p
            await p.loadFirstPage()
        }
        .fullScreenCover(item: $openSaga) { id in
            SagaView(id: id).environment(env)
        }
    }

    @ViewBuilder private var grid: some View {
        if let p = paginator {
            if let error = p.firstPageError {
                StatePanel(icon: "exclamationmark.triangle", title: "Impossible de charger les sagas", message: error.localizedDescription) {
                    Task { await p.retry() }
                }
            } else {
                PagedPosterGrid(paginator: p) { saga in
                    PosterCard(item: saga) { open(saga.id) }
                }
            }
        } else {
            ProgressView().frame(maxWidth: .infinity).padding(100)
        }
    }

    private func open(_ saga: ContentID) {
        if Platform.isTV { openSaga = saga } else { env.navigate(.saga(saga)) }
    }
}

/// The « Studios » shelf: one logo tile per hub chosen in the admin.
struct StudioShelf: View {
    @Environment(\.metrics) private var metrics
    let studios: [Studio]
    let onSelect: (Studio) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Studios").font(.title3.weight(.bold)).padding(.horizontal, metrics.inset)
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: metrics.cardSpacing) {
                    ForEach(studios) { studio in
                        Button { onSelect(studio) } label: { StudioTile(studio: studio).frame(width: metrics.studioWidth) }
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

private func filmCount(_ n: Int) -> String { n > 1 ? "\(n) films" : "\(n) film" }
