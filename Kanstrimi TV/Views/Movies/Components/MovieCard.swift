//
//  MovieCard.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftUI

/// Carte représentant un film VOD
struct MovieCard: View {
    // MARK: - Properties
    let movie: Movie

    // MARK: - Environment
    @Environment(MoviesViewModel.self) private var viewModel

    // MARK: - Body
    var body: some View {
        Button(action: {
            viewModel.selectMovie(movie)
        }) {
            VStack(spacing: 12) {
                // Poster du film
                CachedImage(url: URL(string: movie.streamIcon ?? "")) { phase in
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
                
                // Nom du film
                Text(movie.name)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(.primary)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                    .frame(width: 180, height: 40)
                
                // Rating (étoiles)
                if let rating5based = movie.rating5based {
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
            .hoverEffect(.highlight)
        }
    }
}

// MARK: - Preview
#Preview {
    let sampleMovie = Movie(
        streamId: 1,
        name: "Inception",
        streamURL: "http://example.com/movie",
        sortOrder: 0,
        streamIcon: "https://via.placeholder.com/180x270",
        rating5based: 4.5
    )

    MovieCard(movie: sampleMovie)
        .background(Color.black)
        .environment(MoviesViewModel())
}
