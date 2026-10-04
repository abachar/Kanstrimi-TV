import SwiftUI

/// One actor: their photo and name, then their visible films and series. A cover on tvOS, a pushed screen elsewhere.
struct PersonView: View {
    let ref: PersonRef
    /// What a title does when chosen; the sheet opens it by default.
    var onSelect: ((ContentID) -> Void)?
    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics

    var body: some View {
        LoadedScreen(errorTitle: "Acteur indisponible", load: { try await env.client.person(id: ref.id) }) { s in
            content(s)
        }
    }

    private func content(_ s: PersonSheet) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 30) {
                HStack(spacing: metrics.compact ? 16 : 32) {
                    CastPhoto(name: s.name, url: s.photo ?? ref.photo, diameter: metrics.castPhoto * 1.6)
                    VStack(alignment: .leading, spacing: 8) {
                        Text(s.name).font(.system(size: metrics.detailTitle, weight: .heavy)).lineLimit(2)
                        Text(titleCount(s.movies.count + s.series.count)).font(.title3).foregroundStyle(Theme.secondary)
                    }
                }
                .padding(.horizontal, metrics.inset)
                .padding(.top, metrics.detailTop)
                section("Films", s.movies)
                section("Séries", s.series)
            }
            .padding(.bottom, 60)
        }
    }

    /// A titled grid; nothing at all when the actor has no title of that kind.
    @ViewBuilder private func section(_ title: String, _ items: [ContentItem]) -> some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 16) {
                RowTitle(title).padding(.horizontal, metrics.inset)
                PosterGrid(items: items, onSelect: onSelect ?? env.open)
            }
        }
    }

    private func titleCount(_ n: Int) -> String { n > 1 ? "\(n) titres" : "\(n) titre" }
}
