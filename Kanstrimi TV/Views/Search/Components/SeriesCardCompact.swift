//
//  SeriesCardCompact.swift
//  Kanstrimi TV
//
//  Created by Claude on 26/10/2025.
//

import SwiftUI

/// Carte compacte représentant une série TV (pour SearchView)
///
/// Version réduite de SeriesCard avec:
/// - Cover 140x210 (au lieu de 180x270)
/// - Texte 14pt (au lieu de 16pt)
/// - Padding 12 (au lieu de 16)
/// - Scale effect 1.08 au focus (au lieu de 1.05)
struct SeriesCardCompact: View {
    // MARK: - Properties
    let series: Series
    let onSelect: (Series) -> Void

    // MARK: - Body
    var body: some View {
        VStack(spacing: 8) {
            // Cover de la série
            CachedImage(url: URL(string: series.cover ?? "")) { phase in
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
                            Image(systemName: "tv.fill")
                                .font(.system(size: 30))
                                .foregroundColor(.secondary)
                        }
                @unknown default:
                    Color.gray.opacity(0.3)
                }
            }
            .frame(width: 140, height: 210)
            .cornerRadius(10)
            .clipped()

            // Nom de la série
            Text(series.name)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(.primary)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .frame(width: 140, height: 36)

            // Genre (si disponible)
            if let genre = series.genre, !genre.isEmpty {
                Text(genre)
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                    .frame(width: 140)
            }

            // Rating (étoiles)
            if let rating5based = series.rating5based {
                HStack(spacing: 3) {
                    ForEach(0..<5) { index in
                        Image(systemName: index < Int(rating5based) ? "star.fill" : "star")
                            .font(.system(size: 10))
                            .foregroundColor(.yellow)
                    }
                }
            }
        }
        .padding(12)
        .hoverEffect(.highlight)
        .onTapGesture {
            onSelect(series)
        }
    }
}
