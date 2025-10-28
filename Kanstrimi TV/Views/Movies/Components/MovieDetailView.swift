//
//  MovieDetailView.swift
//  Kanstrimi TV
//
//  Created on 2025-10-27.
//

import SwiftUI
import SwiftData

/// Vue affichant les détails complets d'un film
struct MovieDetailView: View {
    // MARK: - Properties
    let movie: Movie

    // MARK: - Environment
    @Environment(MoviesViewModel.self) private var viewModel

    // MARK: - Queries
    @Query private var movieDetails: [MovieDetail]
    @Query private var watchHistories: [WatchHistory]

    private var movieDetail: MovieDetail? {
        movieDetails.first
    }

    private var watchHistory: WatchHistory? {
        watchHistories.first
    }

    // MARK: - Init
    init(movie: Movie) {
        self.movie = movie
        let streamId = movie.streamId

        // Filtrer MovieDetail par streamId
        _movieDetails = Query(
            filter: #Predicate<MovieDetail> { $0.streamId == streamId }
        )

        // Filtrer WatchHistory par streamId ET contentType
        _watchHistories = Query(
            filter: #Predicate<WatchHistory> {
                $0.streamId == streamId && $0.contentType == "movie"
            }
        )
    }

    // MARK: - Body
    var body: some View {
        ZStack {
            Color.black
                .ignoresSafeArea()

            // Contenu principal
            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 40) {
                    // Hero Section
                    MovieHeroSection(movie: movie, movieDetail: movieDetail)

                    VStack(alignment: .leading, spacing: 40) {
                        // Boutons de lecture
                        playbackButtonsSection

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
                    .padding(.horizontal, 60)
                }
                .padding(.bottom, 60)
            }
        }
        .task {
            await DomainService.shared.loadMovieDetailsIfNeeded(movie: movie)
        }
        .ignoresSafeArea()
    }

    // MARK: - Playback Buttons Section
    private var playbackButtonsSection: some View {
        HStack(spacing: 20) {
            // Bouton Play/Reprendre
            if let watchHistory = watchHistory, watchHistory.progressPercentage > 5, !watchHistory.isCompleted {
                // Bouton "Reprendre"
                Button {
                    viewModel.playingContent = .movie(movie)
                } label: {
                    Label("Reprendre", systemImage: "play.fill")
                        .font(.title3)
                }
                .buttonStyle(.borderedProminent)
            } else {
                // Bouton "Lire"
                Button {
                    viewModel.playContent(.movie(movie))
                } label: {
                    Label("Lire", systemImage: "play.fill")
                        .font(.title3)
                }
                .buttonStyle(.borderedProminent)
            }

            // Bouton "Redémarrer" (si déjà commencé)
            if watchHistory != nil, watchHistory!.progressPercentage > 5 {
                Button {
                    viewModel.playingContent = .movie(movie)
                } label: {
                    Label("Redémarrer", systemImage: "arrow.counterclockwise")
                        .font(.title3)
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
                        CachedImage(url: URL(string: imageURL)) { phase in
                            switch phase {
                            case .success(let image):
                                image
                                    .resizable()
                                    .aspectRatio(contentMode: .fill)
                                    .frame(width: 120, height: 180)
                                    .cornerRadius(12)
                            case .empty:
                                Color.gray.opacity(0.3)
                                    .frame(width: 120, height: 180)
                                    .cornerRadius(12)
                                    .overlay { ProgressView() }
                            case .failure:
                                Color.gray.opacity(0.3)
                                    .frame(width: 120, height: 180)
                                    .cornerRadius(12)
                                    .overlay {
                                        Image(systemName: "person.fill")
                                            .foregroundColor(.secondary)
                                    }
                            @unknown default:
                                EmptyView()
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
    let movie = Movie.previewMovies[1] // "AZ - You're Cordially Invited (2025)"
    context.insert(movie)

    // Ajouter les détails complets du film
    let movieDetail = MovieDetail.youreInvitedDetail
    context.insert(movieDetail)

    return MovieDetailView(movie: movie)
        .modelContainer(container)
        .environment(MoviesViewModel())
}

#Preview("With Watch History (50%)") {
    let container = try! ModelContainer(
        for: Movie.self, MovieDetail.self, WatchHistory.self,
        configurations: ModelConfiguration(isStoredInMemoryOnly: true)
    )

    let context = container.mainContext

    // Utiliser un vrai film de preview
    let movie = Movie.previewMovies[1] // "AZ - You're Cordially Invited (2025)"
    context.insert(movie)

    // Ajouter les détails complets du film
    let movieDetail = MovieDetail.youreInvitedDetail
    context.insert(movieDetail)

    // Créer un historique de visionnage à 50%
    let watchHistory = WatchHistory(
        streamId: movie.streamId,
        contentType: "movie",
        lastPosition: 3270, // 54:30 minutes (50% de 1h49)
        duration: 6540, // 1h49 (109 minutes)
        lastWatchedDate: Date()
    )
    context.insert(watchHistory)

    return MovieDetailView(movie: movie)
        .modelContainer(container)
        .environment(MoviesViewModel())
}
