import SwiftUI

/// The « Sagas » shelf of the Films tab: one poster per TMDB collection with two visible movies or more.
struct SagaShelf: View {
    @Environment(\.metrics) private var metrics
    let sagas: [Saga]
    let onSelect: (SagaRef) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                Text("Sagas").font(.title3.weight(.bold))
                Text(Format.count(sagas.count)).font(.callout).foregroundStyle(Theme.secondary)
            }
            .padding(.horizontal, metrics.inset)
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: metrics.cardSpacing) {
                    ForEach(sagas) { saga in
                        Button { onSelect(saga.ref) } label: { SagaCardLabel(saga: saga) }
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

/// A saga poster with its name and its number of movies.
struct SagaCardLabel: View {
    @Environment(\.metrics) private var metrics
    let saga: Saga

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ArtView(id: ContentID(saga.id), url: saga.poster, title: saga.name)
                .frame(width: metrics.posterWidth, height: metrics.posterWidth * 1.5)
                .clipShape(RoundedRectangle(cornerRadius: 14))
            Text(saga.name).font(.callout.weight(.semibold)).lineLimit(1)
            Text(filmCount(saga.count)).font(.caption).foregroundStyle(Theme.secondary)
        }
        .frame(width: metrics.posterWidth)
    }
}

/// One saga: its backdrop, its name, its movies in release order. A cover on tvOS, a pushed screen elsewhere.
struct SagaView: View {
    let ref: SagaRef
    /// What a movie does when chosen; the sheet opens it by default.
    var onSelect: ((ContentID) -> Void)?
    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics
    @State private var sheet: SagaSheet?
    @State private var error: CatalogError?

    var body: some View {
        Group {
            if let sheet {
                content(sheet)
            } else if let error {
                StatePanel(icon: "exclamationmark.triangle", title: "Saga indisponible", message: error.localizedDescription) {
                    Task { await load() }
                }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Theme.background)
        .task { if sheet == nil { await load() } }
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
                    LazyVGrid(columns: metrics.posterColumns, alignment: .leading, spacing: metrics.cardSpacing) {
                        ForEach(s.movies) { card in
                            Button { (onSelect ?? env.open)(card.id) } label: { PosterCardLabel(card: card) }
                                .cardButtonStyle()
                        }
                    }
                    .padding(.horizontal, metrics.inset)
                    .padding(.vertical, metrics.rowPadding)
                }
                .padding(.bottom, 60)
            }
        }
    }

    private func load() async {
        do {
            sheet = try await env.call { try await env.client.saga(id: ref.id) }
            error = nil
        } catch {
            self.error = (error as? CatalogError) ?? .server(error.localizedDescription)
        }
    }
}

private func filmCount(_ n: Int) -> String { n > 1 ? "\(n) films" : "\(n) film" }
