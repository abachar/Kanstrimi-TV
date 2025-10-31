//
//  MovieDetailView.swift
//  Kanstrimi TV
//
//  Created on 2025-10-27.
//

import SwiftData
import SwiftUI

/// Vue affichant les détails complets d'un film
struct MovieDetailView: View {
    // MARK: - Properties
    let streamId: Int

    // MARK: - Environment
    @Environment(\.domainService) private var domainService
    @Environment(MovieNavigationViewModel.self) private var navigationViewModel

    // MARK: - Queries
    @Query private var movies: [Movie]
    @Query private var movieDetails: [MovieDetail]
    @Query private var watchHistories: [WatchHistory]

    private var movie: Movie? {
        movies.first
    }

    private var movieDetail: MovieDetail? {
        movieDetails.first
    }

    private var watchHistory: WatchHistory? {
        watchHistories.first
    }

    // MARK: - Init
    init(streamId: Int) {
        self.streamId = streamId

        // Filtrer Movie par streamId (via l'ID)
        _movies = Query(
            filter: #Predicate<Movie> { $0.id == "movie-\(streamId)" }
        )

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
            Color.appBackground
                .ignoresSafeArea()
            
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
        .task {
            guard let movie = movie else { return }
            await domainService.loadMovieDetailsIfNeeded(movie: movie)
        }
        .ignoresSafeArea()
    }

    // MARK: - Helper Properties
    private var returnDestination: MovieNavigationState.ReturnDestination {
        // Déterminer la destination de retour en fonction de l'état actuel
        if case .movieDetail(_, let returnTo) = navigationViewModel.currentState {
            return returnTo
        }
        return .moviesList
    }

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
        AsyncImage(url: URL(string: self.posterURL ?? "")) { phase in
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
    }

    private var backdropURL: String? {
        movieDetail?.backdropPaths?.first ?? movieDetail?.cover
    }

    // MARK: - Backdrop
    @ViewBuilder
    private var backdropView: some View {
        if let backdropURL = self.backdropURL {
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
                        navigationViewModel.navigateToPlayer(
                            content: .movie(detail),
                            from: returnDestination
                        )
                    }
                } label: {
                    Label("Reprendre", systemImage: "play.fill")
                }
                .buttonStyle(.borderedProminent)
            } else {
                // Bouton "Lire"
                Button {
                    if let detail = movieDetail {
                        navigationViewModel.navigateToPlayer(
                            content: .movie(detail),
                            from: returnDestination
                        )
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
                        navigationViewModel.navigateToPlayer(
                            content: .movie(detail),
                            from: returnDestination
                        )
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
        .environment(MovieNavigationViewModel())
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
        .environment(MovieNavigationViewModel())
}
