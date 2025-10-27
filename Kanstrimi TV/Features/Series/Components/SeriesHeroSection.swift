//
//  SeriesHeroSection.swift
//  Kanstrimi TV
//
//  Created on 2025-10-27.
//

import SwiftUI

/// Section hero affichant le backdrop, poster et informations principales d'une série
struct SeriesHeroSection: View {
    // MARK: - Properties
    let series: Series
    let seriesDetail: SeriesDetail?

    // MARK: - Computed Properties
    private var backdropURL: String? {
        seriesDetail?.backdropPaths?.first ?? seriesDetail?.cover
    }

    private var posterURL: String? {
        seriesDetail?.cover ?? series.cover
    }

    private var title: String {
        seriesDetail?.name ?? series.name
    }

    private var year: String? {
        seriesDetail?.year
    }

    private var rating: Double? {
        seriesDetail?.rating ?? series.rating5based
    }

    // MARK: - Body
    var body: some View {
        ZStack(alignment: .bottomLeading) {
            // Backdrop image
            if let backdropURL = backdropURL {
                AsyncImage(url: URL(string: backdropURL)) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                    default:
                        Color.kanCardBackground
                    }
                }
                .frame(height: 500)
                .clipped()
                .overlay(
                    LinearGradient(
                        gradient: Gradient(colors: [
                            Color.kanBackground.opacity(0.1),
                            Color.kanBackground.opacity(0.8),
                            Color.kanBackground
                        ]),
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
            } else {
                // Fallback si pas de backdrop
                Color.kanCardBackground
                    .frame(height: 500)
            }

            // Poster + Infos
            HStack(alignment: .bottom, spacing: 30) {
                // Poster
                AsyncImage(url: URL(string: posterURL ?? "")) { phase in
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
                                    .font(.system(size: 60))
                                    .foregroundColor(.kanTextSecondary)
                            }
                    @unknown default:
                        Color.kanCardBackground
                    }
                }
                .frame(width: 300, height: 450)
                .cornerRadius(16)
                .clipped()
                .shadow(color: .black.opacity(0.5), radius: 20, x: 0, y: 10)

                // Infos
                VStack(alignment: .leading, spacing: 16) {
                    // Titre
                    Text(title)
                        .font(.system(size: 48, weight: .bold))
                        .foregroundColor(.kanTextPrimary)

                    // Année
                    if let year = year {
                        Text(year)
                            .font(.system(size: 20))
                            .foregroundColor(.kanTextSecondary)
                    }

                    // Rating (étoiles)
                    if let rating = rating {
                        HStack(spacing: 6) {
                            ForEach(0..<5) { index in
                                Image(systemName: index < Int(rating) ? "star.fill" : "star")
                                    .font(.system(size: 20))
                                    .foregroundColor(.yellow)
                            }
                            Text(String(format: "%.1f", rating))
                                .font(.system(size: 18))
                                .foregroundColor(.kanTextSecondary)
                                .padding(.leading, 8)
                        }
                    }

                    // Genre
                    if let genre = seriesDetail?.genre {
                        Text(genre)
                            .font(.system(size: 18))
                            .foregroundColor(.kanTextSecondary)
                            .lineLimit(2)
                    }
                }
                .padding(.bottom, 40)

                Spacer()
            }
            .padding(.horizontal, 60)
            .padding(.bottom, 40)
        }
    }
}

// MARK: - Preview
#Preview {
    let sampleSeries = Series(
        seriesId: 1,
        name: "Breaking Bad",
        sortOrder: 0,
        cover: "https://via.placeholder.com/300x450",
        backdropPaths: nil,
        rating: "9.5",
        rating5based: 5.0
    )

    let sampleDetail = SeriesDetail(
        seriesId: 1,
        name: "Breaking Bad",
        genre: "Crime, Drama, Thriller",
        rating: 4.8,
        year: "2008",
        cover: "https://via.placeholder.com/300x450",
        plot: "A high school chemistry teacher turned methamphetamine producer."
    )

    SeriesHeroSection(series: sampleSeries, seriesDetail: sampleDetail)
        .background(Color.kanBackground)
}
