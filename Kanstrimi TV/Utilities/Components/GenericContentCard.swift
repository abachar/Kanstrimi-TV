//
//  GenericContentCard.swift
//  Kanstrimi TV
//
//  Created on 2025-10-28.
//  Composant de carte générique pour tout type de contenu
//

import SwiftUI

/// Carte générique pour afficher n'importe quel contenu `CardDisplayable`
///
/// Remplace MovieCard, SeriesCard et ChannelCard pour éliminer la duplication de code
struct GenericContentCard<T: CardDisplayable>: View {
    // MARK: - Properties

    let item: T
    let configuration: CardConfiguration
    let action: () -> Void

    // MARK: - Computed Properties

    private var dimensions: (width: CGFloat, height: CGFloat) {
        switch configuration.style {
        case .portrait(let width, let height):
            return (width, height)
        case .landscape(let width, let height):
            return (width, height)
        }
    }

    // MARK: - Body

    var body: some View {
        Button(action: action) {
            VStack(spacing: 12) {
                // Image principale
                imageView

                // Nom du contenu
                Text(item.name)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(.primary)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                    .frame(width: dimensions.width, height: 40)

                // Information additionnelle (genre, etc.)
                if let additionalInfo = configuration.additionalInfo, !additionalInfo.isEmpty {
                    Text(additionalInfo)
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                        .frame(width: dimensions.width)
                }

                // Rating (étoiles)
                if configuration.showRating, let rating = item.rating5based {
                    ratingView(rating: rating)
                }
            }
            .padding(16)
            .hoverEffect(.highlight)
        }
    }

    // MARK: - Subviews

    private var imageView: some View {
        CachedImage(url: URL(string: item.imageURL ?? "")) { phase in
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
                    .aspectRatio(contentMode: configuration.aspectMode)
            case .failure:
                Color.gray.opacity(0.3)
                    .overlay {
                        Image(systemName: configuration.emptyIcon)
                            .font(.system(size: 40))
                            .foregroundColor(.secondary)
                    }
            @unknown default:
                Color.gray.opacity(0.3)
            }
        }
        .frame(width: dimensions.width, height: dimensions.height)
        .cornerRadius(12)
        .clipped()
    }

    private func ratingView(rating: Double) -> some View {
        HStack(spacing: 4) {
            ForEach(0..<5) { index in
                Image(systemName: index < Int(rating) ? "star.fill" : "star")
                    .font(.system(size: 12))
                    .foregroundColor(.yellow)
            }
        }
    }
}

// MARK: - Previews

#Preview("Movie Card") {
    let movie = Movie(
        streamId: 1,
        name: "Test Movie",
        streamURL: "https://example.com",
        sortOrder: 0
    )

    let config = CardConfiguration(
        style: .portrait(width: 180, height: 270),
        aspectMode: .fill,
        emptyIcon: "film.fill",
        showRating: true
    )

    return GenericContentCard(
        item: movie,
        configuration: config,
        action: {}
    )
}

#Preview("Channel Card") {
    let channel = LiveChannel(
        streamId: 1,
        name: "Test Channel",
        streamURL: "https://example.com",
        categoryId: "1",
        sortOrder: 0
    )

    let config = CardConfiguration(
        style: .landscape(width: 200, height: 120),
        aspectMode: .fit,
        emptyIcon: "tv.fill",
        showRating: false
    )

    return GenericContentCard(
        item: channel,
        configuration: config,
        action: {}
    )
}
