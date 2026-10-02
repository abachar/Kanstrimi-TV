import SwiftUI

/// The « Sagas » shelf of the Films tab: one poster per TMDB collection with two visible movies or more.
struct SagaShelf: View {
    @Environment(\.metrics) private var metrics
    let sagas: [Saga]
    let total: Int
    let onSelect: (SagaRef) -> Void
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
                        Button { onSelect(saga.ref) } label: { SagaCardLabel(saga: saga) }
                            .cardButtonStyle()
                    }
                    if let onSeeAll { SeeAllCard(total: total, action: onSeeAll) }
                }
                .padding(.horizontal, metrics.inset)
                .padding(.vertical, metrics.rowPadding)
            }
            .scrollClipDisabled()
        }
    }
}

/// A saga poster with its number of movies drawn on it, like a movie's year on its poster. No text
/// under it: the poster names the saga (`ArtView` draws the name until it loads, or instead of it).
struct SagaCardLabel: View {
    @Environment(\.metrics) private var metrics
    let saga: Saga

    var body: some View {
        PosterFrame(id: ContentID(saga.id), url: saga.poster, title: saga.name) {
            PosterFacts(text: filmCount(saga.count)).padding(metrics.compact ? 8 : 12)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(saga.name), \(filmCount(saga.count))")
    }
}

/// One saga: its backdrop, its name, its movies in release order. A cover on tvOS, a pushed screen elsewhere.
struct SagaView: View {
    let ref: SagaRef
    /// What a movie does when chosen; the sheet opens it by default.
    var onSelect: ((ContentID) -> Void)?
    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics

    var body: some View {
        LoadedScreen(errorTitle: "Saga indisponible", load: { try await env.call { try await env.client.saga(id: ref.id) } }) { s in
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
                    PosterGrid(cards: s.movies, onSelect: onSelect ?? env.open)
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
    @State private var paginator: Paginator<Saga, SagaQuery>?
    @State private var total: Int?
    @State private var openSaga: SagaRef?

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
            let p = Paginator<Saga, SagaQuery>(query: SagaQuery()) { q in
                let page = try await env.call { try await env.client.sagas(cursor: q.cursor) }
                if q.cursor == nil { total = page.total }
                return page
            }
            paginator = p
            await p.loadFirstPage()
        }
        .fullScreenCover(item: $openSaga) { ref in
            SagaView(ref: ref).environment(env)
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
                    Button { open(saga.ref) } label: { SagaCardLabel(saga: saga) }
                        .cardButtonStyle()
                }
            }
        } else {
            ProgressView().frame(maxWidth: .infinity).padding(100)
        }
    }

    private func open(_ saga: SagaRef) {
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
                        Button { onSelect(studio) } label: { StudioTile(studio: studio) }
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

/// A studio logo on a light tile (TMDB logos are drawn for a light background), its name when there
/// is no logo. Nothing else, on it or under it.
struct StudioTile: View {
    @Environment(\.metrics) private var metrics
    let studio: Studio

    var body: some View {
        ZStack {
            // Phone: without a logo the name sits on a dark tile, a white block glares on the dark screen.
            RoundedRectangle(cornerRadius: metrics.cardRadius).fill(darkTile ? Color.white.opacity(0.1) : .white)
            Group {
                if let logo = studio.logo {
                    AsyncImage(url: logo) { image in
                        image.resizable().scaledToFit()
                    } placeholder: {
                        name
                    }
                    .padding(metrics.posterWidth * 0.12)
                } else {
                    name
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(width: metrics.posterWidth * 1.5, height: metrics.posterWidth * 0.75)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(studio.name)
    }

    private var darkTile: Bool { metrics.compact && studio.logo == nil }

    private var name: some View {
        Text(studio.name).font(.headline).foregroundStyle(darkTile ? Theme.text : .black).multilineTextAlignment(.center).padding(8)
    }
}

/// The last card of a shelf that has more: « Voir tout » and the total.
struct SeeAllCard: View {
    @Environment(\.metrics) private var metrics
    let total: Int
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 12) {
                Image(systemName: "square.grid.3x3").font(.system(size: metrics.stateIcon * 0.7))
                Text("Voir tout").font(.headline)
                Text(Format.count(total)).font(.caption).foregroundStyle(Theme.secondary)
            }
            .frame(width: metrics.posterSize.width, height: metrics.posterSize.height)
        }
        .cardButtonStyle()
    }
}

private func filmCount(_ n: Int) -> String { n > 1 ? "\(n) films" : "\(n) film" }
