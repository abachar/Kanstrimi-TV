//
//  MovieDetailView.swift
//  Kanstrimi TV
//
//  Created on 2025-10-27.
//

import SwiftData
import SwiftUI
import NukeUI

/// Vue affichant les détails complets d'un film
///
/// ✅ Migration @Observable: Utilise MoviesStore au lieu de 3 @Query
/// Résout le problème N+1 queries et centralise l'état
struct MovieDetailView: View {
    // MARK: - Properties
    let streamId: Int

    // MARK: - Environment
    @Environment(AppStore.self) private var appStore
    @Environment(\.domainService) private var domainService
    @Environment(\.showPlayer) private var showPlayer

    private var store: MoviesStore {
        appStore.moviesStore
    }

    // ✅ Données depuis le store (déjà chargées par selectMovie)
    private var movie: Movie? {
        store.selectedMovie
    }

    private var movieDetail: MovieDetail? {
        store.selectedMovieDetail
    }

    private var watchHistory: WatchHistory? {
        store.watchHistory
    }

    // MARK: - Body
    var body: some View {
        ZStack {
            Color.appBackground

            if store.isLoadingDetail {
                ProgressView("Chargement des détails...")
            } else {
                // Backdrop image
                backdropView

                VStack(alignment: .leading, spacing: 40) {
                    // Hero Section & Boutons de lecture
                    HStack(alignment: .bottom, spacing: 30) {
                        // Poster
                        posterView

                        // Infos & Boutons de lecture
                        VStack(alignment: .leading) {
                            // Infos
                            infoView

                            // Boutons de lecture
                            playbackButtonsSection
                        }
                    }

                    // Synopsis
                    if let plot = movieDetail?.plot, !plot.isEmpty {
                        synopsisSection(plot: plot)
                    }

                    // Réalisateur
                    if let director = movieDetail?.director, !director.isEmpty {
                        directorSection(director: director)
                    }

                    // Cast
                    if let castImages = movieDetail?.castImages, !castImages.isEmpty {
                        castSection(castImages: castImages)
                    }
                }
                .padding(60)
            }
        }
        .task {
            // Charger le film et ses détails si pas déjà sélectionné
            if store.selectedMovie == nil || store.selectedMovie?.extractedStreamId != streamId {
                // Trouver le film dans le cache
                if let movie = store.findMovie(by: streamId) {
                    await store.selectMovie(movie)
                }
            }
        }
        .ignoresSafeArea()
    }

    // MARK: - Helper Properties
    var title: String {
        movieDetail?.name ?? movie?.name ?? "Film sans titre"
    }

    var rating: Double? {
        movieDetail?.rating ?? movie?.rating
    }

    @ViewBuilder
    private var yearDurationView: some View {
        HStack(spacing: 20) {
            if let year = movieDetail?.year {
                Text(year)
                    .font(.system(size: 20))
                    .foregroundColor(.primary)
            }

            if let duration = movieDetail?.duration {
                Text(duration)
                    .font(.system(size: 20))
                    .foregroundColor(.primary)
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
                .foregroundColor(.primary)
                .padding(.leading, 8)
        }
    }

    private var infoView: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Titre
            Text(title)
                .font(.system(size: 48, weight: .bold))
                .foregroundColor(.primary)

            // Année + Durée (si applicable)
            yearDurationView

            // Rating (étoiles)
            if let movieRating = rating {
                ratingView(rating: movieRating)
            }

            // Genre
            if let genre = movieDetail?.genre {
                Text(genre)
                    .font(.system(size: 18))
                    .foregroundColor(.primary)
                    .lineLimit(2)
            }
        }
        .padding(.bottom, 40)
    }

    var posterURL: String? {
        movieDetail?.cover ?? movie?.streamIcon
    }

    private var posterView: some View {
        LazyImage(url: URL(string: self.posterURL ?? "")) { state in
            if let image = state.image {
                image
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } else if state.isLoading {
                Color.gray.opacity(0.3)
                    .overlay {
                        ProgressView()
                            .tint(.secondary)
                    }
            } else {
                Color.gray.opacity(0.3)
                    .overlay {
                        Image(systemName: "film.fill")
                            .font(.system(size: 60))
                            .foregroundColor(.secondary)
                    }
            }
        }
        .frame(width: 300, height: 450)
        .cornerRadius(16)
        .clipped()
        .shadow(color: .black.opacity(0.5), radius: 20, x: 0, y: 10)
    }

    private var backdropURL: String? {
        movieDetail?.backdropPaths?.first ?? movieDetail?.cover
    }

    // MARK: - Backdrop
    @ViewBuilder
    private var backdropView: some View {
        if let backdropURL = self.backdropURL {
            LazyImage(url: URL(string: backdropURL)) { state in
                if let image = state.image {
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                } else {
                    Color.gray.opacity(0.3)
                }
            }
            .clipped()
            .overlay(
                LinearGradient(
                    gradient: Gradient(colors: [
                        Color.black.opacity(0.4),
                        Color.black.opacity(0.9),
                        Color.black,
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
    }

    // MARK: - Playback Buttons Section
    private var playbackButtonsSection: some View {
        HStack(spacing: 20) {
            // Bouton Play/Reprendre
            if let watchHistory = watchHistory, watchHistory.progressPercentage > 5,
                !watchHistory.isCompleted
            {
                // Bouton "Reprendre"
                Button {
                    if let detail = movieDetail {
                        showPlayer.wrappedValue = .movie(detail)
                    }
                } label: {
                    Label("Reprendre", systemImage: "play.fill")
                }
                .buttonStyle(.borderedProminent)
            } else {
                // Bouton "Lire"
                Button {
                    if let detail = movieDetail {
                        showPlayer.wrappedValue = .movie(detail)
                    }
                } label: {
                    Label("Lire", systemImage: "play.fill")
                }
                .buttonStyle(.borderedProminent)
            }

            // Bouton "Redémarrer" (si déjà commencé)
            if watchHistory != nil, watchHistory!.progressPercentage > 5 {
                Button {
                    if let detail = movieDetail {
                        showPlayer.wrappedValue = .movie(detail)
                    }
                } label: {
                    Label("Redémarrer", systemImage: "arrow.counterclockwise")
                }
                .buttonStyle(.bordered)
            }
        }
    }

    // MARK: - Synopsis Section
    private func synopsisSection(plot: String) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Synopsis")
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(.primary)

            Text(plot)
                .font(.system(size: 18))
                .foregroundColor(.secondary)
                .lineSpacing(6)
        }
    }

    // MARK: - Director Section
    private func directorSection(director: String) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Réalisateur")
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(.primary)

            Text(director)
                .font(.system(size: 18))
                .foregroundColor(.secondary)
        }
    }

    // MARK: - Cast Section
    private func castSection(castImages: [String]) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Casting")
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(.primary)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 20) {
                    ForEach(Array(castImages.enumerated()), id: \.offset) { index, imageURL in
                        LazyImage(url: URL(string: imageURL)) { state in
                            if let image = state.image {
                                image
                                    .resizable()
                                    .aspectRatio(contentMode: .fill)
                                    .frame(width: 120, height: 180)
                                    .cornerRadius(12)
                            } else if state.isLoading {
                                Color.gray.opacity(0.3)
                                    .frame(width: 120, height: 180)
                                    .cornerRadius(12)
                                    .overlay { ProgressView() }
                            } else {
                                Color.gray.opacity(0.3)
                                    .frame(width: 120, height: 180)
                                    .cornerRadius(12)
                                    .overlay {
                                        Image(systemName: "person.fill")
                                            .foregroundColor(.secondary)
                                    }
                            }
                        }
                        .hoverEffect(.lift)
                    }
                }
            }
        }
    }
}

// MARK: - Previews

#Preview("Without Watch History") {
    let container = try! ModelContainer(
        for: Movie.self, MovieDetail.self, WatchHistory.self,
        configurations: ModelConfiguration(isStoredInMemoryOnly: true)
    )

    let context = container.mainContext

    // Utiliser un vrai film de preview avec données complètes
    let movie = Movie.previewMovies[1]  // "AZ - You're Cordially Invited (2025)"
    context.insert(movie)

    // Ajouter les détails complets du film
    let movieDetail = MovieDetail.youreInvitedDetail
    context.insert(movieDetail)

    // Créer le MockDomainService
    let mockDomainService = MockDomainService(container: container)

    return MovieDetailView(streamId: movie.extractedStreamId!)
        .modelContainer(container)
        .environment(\.domainService, mockDomainService)
}

#Preview("With Watch History (50%)") {
    let container = try! ModelContainer(
        for: Movie.self, MovieDetail.self, WatchHistory.self,
        configurations: ModelConfiguration(isStoredInMemoryOnly: true)
    )

    let context = container.mainContext

    // Utiliser un vrai film de preview
    let movie = Movie.previewMovies[1]  // "AZ - You're Cordially Invited (2025)"
    context.insert(movie)

    // Ajouter les détails complets du film
    let movieDetail = MovieDetail.youreInvitedDetail
    context.insert(movieDetail)

    // Créer un historique de visionnage à 50%
    let watchHistory = WatchHistory(
        streamId: movie.extractedStreamId!,
        contentType: "movie",
        lastPosition: 3270,  // 54:30 minutes (50% de 1h49)
        duration: 6540,  // 1h49 (109 minutes)
        lastWatchedDate: Date()
    )
    context.insert(watchHistory)

    // Créer le MockDomainService
    let mockDomainService = MockDomainService(container: container)

    return MovieDetailView(streamId: movie.extractedStreamId!)
        .modelContainer(container)
        .environment(\.domainService, mockDomainService)
}
