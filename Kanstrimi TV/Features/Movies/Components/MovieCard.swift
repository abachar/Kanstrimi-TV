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
    @FocusState.Binding var focusedMovieId: String?
    @Binding var selectedMovie: Movie?

    private var isFocused: Bool {
        focusedMovieId == movie.id
    }

    // MARK: - Body
    var body: some View {
        VStack(spacing: 12) {
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

            // Nom du film
            Text(movie.name)
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(isFocused ? .kanTextPrimary : .kanTextSecondary)
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
        .focused($focusedMovieId, equals: movie.id)
        .onTapGesture {
            selectedMovie = movie
        }
    }
}

// MARK: - Preview
#Preview {
    @Previewable @FocusState var focusedMovieId: String?
    @Previewable @State var selectedMovie: Movie?

    let sampleMovie = Movie(
        streamId: 1,
        name: "Inception",
        streamURL: "http://example.com/movie",
        sortOrder: 0,
        streamIcon: "https://via.placeholder.com/180x270",
        rating5based: 4.5
    )

    MovieCard(movie: sampleMovie, focusedMovieId: $focusedMovieId, selectedMovie: $selectedMovie)
        .background(Color.kanBackground)
}
