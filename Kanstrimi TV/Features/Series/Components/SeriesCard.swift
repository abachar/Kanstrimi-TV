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
    let onTap: () -> Void
    @FocusState.Binding var focusedSeriesId: String?

    private var isFocused: Bool {
        focusedSeriesId == series.id
    }

    // MARK: - Body
    var body: some View {
        VStack(spacing: 12) {
            // Cover de la série
            AsyncImage(url: URL(string: series.cover ?? "")) { phase in
                switch phase {
                case .empty:
                    Color.kanCardBackground
                        .overlay {
                            ProgressView()
                                .tint(.kanTextSecondary)
                        }
                case .success(let image):
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                case .failure:
                    Color.kanCardBackground
                        .overlay {
                            Image(systemName: "tv.fill")
                                .font(.system(size: 40))
                                .foregroundColor(.kanTextSecondary)
                        }
                @unknown default:
                    Color.kanCardBackground
                }
            }
            .frame(width: 180, height: 270)
            .cornerRadius(12)
            .clipped()

            // Nom de la série
            Text(series.name)
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(isFocused ? .kanTextPrimary : .kanTextSecondary)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .frame(width: 180, height: 40)

            // Genre (si disponible)
            if let genre = series.genre, !genre.isEmpty {
                Text(genre)
                    .font(.system(size: 12))
                    .foregroundColor(.kanTextSecondary)
                    .lineLimit(1)
                    .frame(width: 180)
            }

            // Rating (étoiles)
            if let rating5based = series.rating5based {
                HStack(spacing: 4) {
                    ForEach(0..<5) { index in
                        Image(systemName: index < Int(rating5based) ? "star.fill" : "star")
                            .font(.system(size: 12))
                            .foregroundColor(.yellow)
                    }
                }
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(isFocused ? Color.kanCardBackground : Color.clear)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(isFocused ? Color.kanHighlight : Color.clear, lineWidth: 3)
        )
        .scaleEffect(isFocused ? 1.05 : 1.0)
        .animation(.easeInOut(duration: 0.2), value: isFocused)
        .focusable()
        .focused($focusedSeriesId, equals: series.id)
        .onTapGesture {
            onTap()
        }
    }
}

// MARK: - Preview
#Preview {
    @Previewable @FocusState var focusedSeriesId: String?

    let sampleSeries = Series(
        seriesId: 1,
        name: "Breaking Bad",
        sortOrder: 0,
        cover: "https://via.placeholder.com/180x270",
        backdropPaths: nil,
        rating5based: 4.9,
        genre: "Drama, Crime"
    )

    SeriesCard(series: sampleSeries, onTap: {}, focusedSeriesId: $focusedSeriesId)
        .background(Color.kanBackground)
}
