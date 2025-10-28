//
//  GenericHeroSection.swift
//  Kanstrimi TV
//
//  Created on 2025-10-28.
//  Section hero générique affichant backdrop, poster et informations
//

import SwiftUI

/// Section hero générique pour afficher n'importe quel contenu `HeroDisplayable`
///
/// Remplace MovieHeroSection et SeriesHeroSection pour éliminer la duplication de code
struct GenericHeroSection<T: HeroDisplayable>: View {
    // MARK: - Properties

    let item: T
    let configuration: HeroConfiguration

    // MARK: - Body

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            // Backdrop image
            backdropView

            // Poster + Infos
            contentView
        }
    }

    // MARK: - Subviews

    @ViewBuilder
    private var backdropView: some View {
        if let backdropURL = item.backdropURL {
            AsyncImage(url: URL(string: backdropURL)) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                default:
                    Color.gray.opacity(0.3)
                }
            }
            .frame(height: 500)
            .clipped()
            .overlay(gradientOverlay)
        } else {
            // Fallback si pas de backdrop
            Color.gray.opacity(0.3)
                .frame(height: 500)
        }
    }

    private var gradientOverlay: some View {
        LinearGradient(
            gradient: Gradient(colors: [
                Color.black.opacity(0.1),
                Color.black.opacity(0.8),
                Color.black
            ]),
            startPoint: .top,
            endPoint: .bottom
        )
    }

    private var contentView: some View {
        HStack(alignment: .bottom, spacing: 30) {
            // Poster
            posterView

            // Infos
            infoView

            Spacer()
        }
        .padding(.horizontal, 60)
        .padding(.bottom, 40)
    }

    private var posterView: some View {
        AsyncImage(url: URL(string: item.posterURL ?? "")) { phase in
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
                        Image(systemName: configuration.fallbackIcon)
                            .font(.system(size: 60))
                            .foregroundColor(.secondary)
                    }
            @unknown default:
                Color.gray.opacity(0.3)
            }
        }
        .frame(width: 300, height: 450)
        .cornerRadius(16)
        .clipped()
        .shadow(color: .black.opacity(0.5), radius: 20, x: 0, y: 10)
    }

    private var infoView: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Titre
            Text(item.title)
                .font(.system(size: 48, weight: .bold))
                .foregroundColor(.primary)

            // Année + Durée (si applicable)
            yearDurationView

            // Rating (étoiles)
            if let rating = item.rating {
                ratingView(rating: rating)
            }

            // Genre
            if let genre = item.genre {
                Text(genre)
                    .font(.system(size: 18))
                    .foregroundColor(.secondary)
                    .lineLimit(2)
            }
        }
        .padding(.bottom, 40)
    }

    @ViewBuilder
    private var yearDurationView: some View {
        HStack(spacing: 20) {
            if let year = item.year {
                Text(year)
                    .font(.system(size: 20))
                    .foregroundColor(.secondary)
            }

            if configuration.showDuration, let duration = item.duration {
                Text(duration)
                    .font(.system(size: 20))
                    .foregroundColor(.secondary)
            }
        }
    }

    private func ratingView(rating: Double) -> some View {
        HStack(spacing: 6) {
            ForEach(0..<5) { index in
                Image(systemName: index < Int(rating) ? "star.fill" : "star")
                    .font(.system(size: 20))
                    .foregroundColor(.yellow)
            }
            Text(String(format: "%.1f", rating))
                .font(.system(size: 18))
                .foregroundColor(.secondary)
                .padding(.leading, 8)
        }
    }
}
