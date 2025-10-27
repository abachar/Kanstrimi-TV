//
//  UnifiedContentCard.swift
//  Kanstrimi TV
//
//  Created by Claude on 27/10/2025.
//

import SwiftUI

/// Carte unifiée pour afficher n'importe quel type de contenu (LiveChannel, Movie, Series)
///
/// Fonctionnalités :
/// - Badge en haut à droite indiquant le type (Live/Film/Série)
/// - Détection automatique du type via SearchResult
/// - Taille uniformisée pour tous les types (180x270)
/// - Focus natif tvOS avec .hoverEffect()
struct UnifiedContentCard: View {
    // MARK: - Properties

    let result: SearchResult
    let onSelect: (SearchResult) -> Void

    // MARK: - Body

    var body: some View {
        VStack(spacing: 8) {
            ZStack(alignment: .topTrailing) {
                // Image (poster, cover ou logo)
                CachedImage(url: URL(string: result.imageURL ?? "")) { phase in
                    switch phase {
                    case .empty:
                        Color.gray.opacity(0.3)
                            .overlay {
                                ProgressView()
                                    .tint(.secondary)
                            }
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                    case .failure:
                        Color.gray.opacity(0.3)
                            .overlay {
                                Image(systemName: result.contentType == .live ? "tv.fill" : "film.fill")
                                    .font(.system(size: 40))
                                    .foregroundColor(.secondary)
                            }
                    @unknown default:
                        Color.gray.opacity(0.3)
                    }
                }
                .frame(width: 180, height: 270)
                .cornerRadius(12)
                .clipped()

                // Badge de type (Live/Film/Série)
                ContentTypeBadge(type: result.contentType)
                    .padding(10)
            }

            // Nom du contenu
            Text(result.name)
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(.primary)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .frame(width: 180, height: 44)
        }
        .padding(16)
        .hoverEffect(.highlight)
        .onTapGesture {
            onSelect(result)
        }
    }
}

// MARK: - Previews

#Preview("Live Channel") {
    let channel = LiveChannel(
        streamId: 1,
        name: "TF1 HD",
        streamURL: "http://example.com/stream",
        categoryId: "1",
        sortOrder: 1,
        streamIcon: "https://via.placeholder.com/200x120"
    )

    return UnifiedContentCard(result: .liveChannel(channel)) { _ in }
        .padding()
        .background(Color.black)
}

#Preview("Movie") {
    let movie = Movie(
        streamId: 1,
        name: "Le Parrain",
        streamURL: "http://example.com/movie",
        sortOrder: 1,
        streamIcon: "https://via.placeholder.com/180x270",
        rating5based: 5.0
    )

    return UnifiedContentCard(result: .movie(movie)) { _ in }
        .padding()
        .background(Color.black)
}

#Preview("Series") {
    let series = Series(
        seriesId: 1,
        name: "Breaking Bad",
        sortOrder: 1,
        cover: "https://via.placeholder.com/180x270",
        backdropPaths: nil,
        rating5based: 5.0,
        genre: "Thriller"
    )

    return UnifiedContentCard(result: .series(series)) { _ in }
        .padding()
        .background(Color.black)
}
