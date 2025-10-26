//
//  MovieCardCompact.swift
//  Kanstrimi TV
//
//  Created by Claude on 26/10/2025.
//

import SwiftUI

/// Carte compacte représentant un film VOD (pour SearchView)
///
/// Version réduite de MovieCard avec:
/// - Poster 140x210 (au lieu de 180x270)
/// - Texte 14pt (au lieu de 16pt)
/// - Padding 12 (au lieu de 16)
/// - Scale effect 1.08 au focus (au lieu de 1.05)
struct MovieCardCompact: View {
    // MARK: - Properties
    let movie: Movie
    @FocusState.Binding var focusedMovieId: String?

    private var isFocused: Bool {
        focusedMovieId == movie.id
    }

    // MARK: - Body
    var body: some View {
        VStack(spacing: 8) {
            // Poster du film
            AsyncImage(url: URL(string: movie.streamIcon ?? "")) { phase in
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
                            Image(systemName: "film.fill")
                                .font(.system(size: 30))
                                .foregroundColor(.kanTextSecondary)
                        }
                @unknown default:
                    Color.kanCardBackground
                }
            }
            .frame(width: 140, height: 210)
            .cornerRadius(10)
            .clipped()

            // Nom du film
            Text(movie.name)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(isFocused ? .kanTextPrimary : .kanTextSecondary)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .frame(width: 140, height: 36)

            // Rating (étoiles)
            if let rating5based = movie.rating5based {
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
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(isFocused ? Color.kanCardBackground : Color.clear)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(isFocused ? Color.kanHighlight : Color.clear, lineWidth: 3)
        )
        .scaleEffect(isFocused ? 1.08 : 1.0)
        .animation(.easeInOut(duration: 0.2), value: isFocused)
        .focusable()
        .focused($focusedMovieId, equals: movie.id)
    }
}

// MARK: - Preview
#Preview {
    @Previewable @FocusState var focusedMovieId: String?

    let sampleMovie = Movie(
        streamId: 1,
        name: "Inception",
        streamURL: "http://example.com/movie",
        sortOrder: 0,
        streamIcon: "https://via.placeholder.com/140x210",
        rating5based: 4.5
    )

    MovieCardCompact(movie: sampleMovie, focusedMovieId: $focusedMovieId)
        .background(Color.kanBackground)
}
