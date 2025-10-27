//
//  MovieHeroSection.swift
//  Kanstrimi TV
//
//  Created on 2025-10-27.
//

import SwiftUI

/// Section hero affichant le backdrop, poster et informations principales d'un film
struct MovieHeroSection: View {
    // MARK: - Properties
    let movie: Movie
    let movieDetail: MovieDetail?

    // MARK: - Computed Properties
    private var backdropURL: String? {
        movieDetail?.backdropPaths?.first ?? movieDetail?.cover
    }

    private var posterURL: String? {
        movieDetail?.cover ?? movie.streamIcon
    }

    private var title: String {
        movieDetail?.name ?? movie.name
    }

    private var year: String? {
        movieDetail?.year
    }

    private var duration: String? {
        movieDetail?.duration
    }

    private var rating: Double? {
        movieDetail?.rating ?? movie.rating5based
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
                        Color.gray.opacity(0.3)
                    }
                }
                .frame(height: 500)
                .clipped()
                .overlay(
                    LinearGradient(
                        gradient: Gradient(colors: [
                            Color.black.opacity(0.1),
                            Color.black.opacity(0.8),
                            Color.black
                        ]),
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
            } else {
                // Fallback si pas de backdrop
                Color.gray.opacity(0.3)
                    .frame(height: 500)
            }

            // Poster + Infos
            HStack(alignment: .bottom, spacing: 30) {
                // Poster
                AsyncImage(url: URL(string: posterURL ?? "")) { phase in
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
                                Image(systemName: "film.fill")
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

                // Infos
                VStack(alignment: .leading, spacing: 16) {
                    // Titre
                    Text(title)
                        .font(.system(size: 48, weight: .bold))
                        .foregroundColor(.primary)

                    // Année + Durée
                    HStack(spacing: 20) {
                        if let year = year {
                            Text(year)
                                .font(.system(size: 20))
                                .foregroundColor(.secondary)
                        }

                        if let duration = duration {
                            Text(duration)
                                .font(.system(size: 20))
                                .foregroundColor(.secondary)
                        }
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
                                .foregroundColor(.secondary)
                                .padding(.leading, 8)
                        }
                    }

                    // Genre
                    if let genre = movieDetail?.genre {
                        Text(genre)
                            .font(.system(size: 18))
                            .foregroundColor(.secondary)
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
