//
//  SeriesCard.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftUI

/// Carte représentant une série TV
struct SeriesCard: View {
    // MARK: - Properties
    let series: Series

    // MARK: - Environment
    @Environment(SeriesViewModel.self) private var viewModel

    // MARK: - Body
    var body: some View {
        Button(action: {
            viewModel.selectSeries(series)
        }) {
            VStack(spacing: 12) {
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

                // Nom de la série
                Text(series.name)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(.primary)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                    .frame(width: 180, height: 40)

                // Genre (si disponible)
                if let genre = series.genre, !genre.isEmpty {
                    Text(genre)
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                        .frame(width: 180)
                }

                // Rating (étoiles)
                if let rating5based = series.rating5based {
                    HStack(spacing: 4) {
                        ForEach(0..<5) { index in
                            Image(
                                systemName: index < Int(rating5based)
                                    ? "star.fill" : "star"
                            )
                            .font(.system(size: 12))
                            .foregroundColor(.yellow)
                        }
                    }
                }
            }
            .padding(16)
            .hoverEffect(.highlight)
        }
    }
}
