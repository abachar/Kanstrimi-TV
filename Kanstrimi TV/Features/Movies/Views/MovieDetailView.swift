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
    @Environment(\.modelContext) private var modelContext

    // MARK: - State
    @State private var movieDetail: MovieDetail?
    @State private var watchHistory: WatchHistory?
    @State private var isLoading = true
    @State private var error: String?
    @State private var showPlayer = false
    @State private var playbackPosition: TimeInterval = 0

    // MARK: - Focus State
    @FocusState private var focusedPlayButton: Bool
    @FocusState private var focusedResumeButton: Bool
    @FocusState private var focusedRestartButton: Bool
    @FocusState private var focusedCastId: String?

    // MARK: - Queries
    @Query private var accounts: [Account]

    private var activeAccount: Account? {
        accounts.first
    }

    // MARK: - Body
    var body: some View {
        ZStack {
            Color.kanBackground
                .ignoresSafeArea()

            if isLoading {
                // État de chargement
                VStack(spacing: 30) {
                    ProgressView()
                        .tint(.kanHighlight)
                        .scaleEffect(1.5)
                    Text("Chargement des détails...")
                        .font(.title3)
                        .foregroundColor(.kanTextSecondary)
                }
            } else if let error = error {
                // État d'erreur
                VStack(spacing: 30) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.system(size: 80))
                        .foregroundColor(.kanError)

                    Text("Erreur")
                        .font(.title)
                        .foregroundColor(.kanTextPrimary)

                    Text(error)
                        .font(.body)
                        .foregroundColor(.kanTextSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 60)
                }
            } else {
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
        }
        .task {
            await loadDetails()
            loadWatchHistory()
        }
        .fullScreenCover(isPresented: $showPlayer) {
            UniversalPlayerView(content: .movie(movie))
                .onDisappear {
                    // Mettre à jour l'historique de visionnage
                    // TODO: Récupérer la position actuelle depuis le player
                }
        }
    }

    // MARK: - Playback Buttons Section
    private var playbackButtonsSection: some View {
        HStack(spacing: 20) {
            // Bouton Play/Reprendre
            if let watchHistory = watchHistory, watchHistory.progressPercentage > 5, !watchHistory.isCompleted {
                // Bouton "Reprendre"
                PlaybackButton(
                    title: "Reprendre",
                    icon: "play.fill",
                    action: { playMovie(from: watchHistory.lastPosition) },
                    isFocused: $focusedResumeButton
                )
            } else {
                // Bouton "Lire"
                PlaybackButton(
                    title: "Lire",
                    icon: "play.fill",
                    action: { playMovie(from: 0) },
                    isFocused: $focusedPlayButton
                )
            }

            // Bouton "Redémarrer" (si déjà commencé)
            if watchHistory != nil, watchHistory!.progressPercentage > 5 {
                PlaybackButton(
                    title: "Redémarrer",
                    icon: "arrow.counterclockwise",
                    action: { playMovie(from: 0) },
                    isFocused: $focusedRestartButton
                )
            }
        }
    }

    // MARK: - Synopsis Section
    private func synopsisSection(plot: String) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Synopsis")
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(.kanTextPrimary)

            Text(plot)
                .font(.system(size: 18))
                .foregroundColor(.kanTextSecondary)
                .lineSpacing(6)
        }
    }

    // MARK: - Director Section
    private func directorSection(director: String) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Réalisateur")
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(.kanTextPrimary)

            Text(director)
                .font(.system(size: 18))
                .foregroundColor(.kanTextSecondary)
        }
    }

    // MARK: - Cast Section
    private func castSection(castImages: [String]) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Casting")
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(.kanTextPrimary)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 20) {
                    ForEach(Array(castImages.enumerated()), id: \.offset) { index, imageURL in
                        CastMemberCard(
                            name: getCastName(at: index),
                            character: nil,
                            imageURL: imageURL,
                            focusedCastId: $focusedCastId
                        )
                    }
                }
            }
        }
    }

    // MARK: - Helper Methods

    /// Charge les détails du film
    private func loadDetails() async {
        guard let account = activeAccount else {
            error = "Aucun compte actif"
            isLoading = false
            return
        }

        do {
            let detail = try await MovieDetailService.shared.loadMovieDetail(
                movie: movie,
                account: account,
                modelContext: modelContext
            )
            await MainActor.run {
                self.movieDetail = detail
                self.isLoading = false
            }
        } catch {
            await MainActor.run {
                self.error = error.localizedDescription
                self.isLoading = false
            }
        }
    }

    /// Charge l'historique de visionnage
    private func loadWatchHistory() {
        let streamId = movie.streamId
        let descriptor = FetchDescriptor<WatchHistory>(
            predicate: #Predicate { $0.streamId == streamId && $0.contentType == "movie" }
        )

        if let history = try? modelContext.fetch(descriptor).first {
            watchHistory = history
        }
    }

    /// Lance la lecture du film
    private func playMovie(from position: TimeInterval) {
        playbackPosition = position
        showPlayer = true

        // Créer ou mettre à jour l'historique de visionnage
        updateWatchHistory(position: position)
    }

    /// Met à jour l'historique de visionnage
    private func updateWatchHistory(position: TimeInterval) {
        if let existing = watchHistory {
            existing.lastPosition = position
            existing.lastWatchedDate = Date()
        } else {
            let newHistory = WatchHistory(
                streamId: movie.streamId,
                contentType: "movie",
                lastPosition: position,
                duration: 0 // TODO: Récupérer la durée réelle
            )
            modelContext.insert(newHistory)
            watchHistory = newHistory
        }

        try? modelContext.save()
    }

    /// Récupère le nom d'un acteur depuis la liste cast (format: "Nom1, Nom2, Nom3")
    private func getCastName(at index: Int) -> String {
        guard let cast = movieDetail?.cast else { return "Inconnu" }
        let names = cast.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
        return index < names.count ? names[index] : "Inconnu"
    }
}

// MARK: - Preview
#Preview {
    let sampleMovie = Movie(
        streamId: 1,
        name: "Inception",
        streamURL: "http://example.com/movie",
        sortOrder: 0,
        streamIcon: "https://via.placeholder.com/300x450",
        rating5based: 4.5
    )

    MovieDetailView(movie: sampleMovie)
        .modelContainer(for: [Movie.self, MovieDetail.self, WatchHistory.self, Account.self], inMemory: true)
}
