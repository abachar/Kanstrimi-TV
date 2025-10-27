//
//  SeriesDetailView.swift
//  Kanstrimi TV
//
//  Created on 2025-10-27.
//

import SwiftUI
import SwiftData

/// Vue affichant les détails complets d'une série
struct SeriesDetailView: View {
    // MARK: - Properties
    let series: Series

    // MARK: - Environment
    @Environment(\.modelContext) private var modelContext

    // MARK: - State
    @State private var seriesDetail: SeriesDetail?
    @State private var isLoading = true
    @State private var error: String?
    @State private var showPlayer = false
    @State private var selectedEpisode: Episode?

    // MARK: - Focus State
    @FocusState private var focusedPlayButton: Bool
    @FocusState private var focusedResumeButton: Bool
    @FocusState private var focusedRestartButton: Bool
    @FocusState private var focusedEpisodeId: String?
    @FocusState private var focusedCastId: String?

    // MARK: - Queries
    @Query private var accounts: [Account]

    // MARK: - State pour les saisons (chargement manuel)
    @State private var seasons: [SeriesSeason] = []

    private var activeAccount: Account? {
        accounts.first
    }

    // MARK: - Initializer
    init(series: Series) {
        self.series = series
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
                        SeriesHeroSection(series: series, seriesDetail: seriesDetail)

                        VStack(alignment: .leading, spacing: 40) {
                            // Boutons de lecture
                            playbackButtonsSection
                                .padding(.horizontal, 60)

                            // Synopsis
                            if let plot = seriesDetail?.plot, !plot.isEmpty {
                                synopsisSection(plot: plot)
                                    .padding(.horizontal, 60)
                            }

                            // Réalisateur
                            if let director = seriesDetail?.director, !director.isEmpty {
                                directorSection(director: director)
                                    .padding(.horizontal, 60)
                            }

                            // Cast
                            if let castImages = seriesDetail?.castImages, !castImages.isEmpty {
                                castSection(castImages: castImages)
                            }

                            // Saisons et épisodes
                            if !seasons.isEmpty {
                                seasonsSection
                            }
                        }
                    }
                    .padding(.bottom, 60)
                }
            }
        }
        .task {
            await loadDetails()
        }
        .ignoresSafeArea()
        .fullScreenCover(isPresented: $showPlayer) {
            if let episode = selectedEpisode {
                UniversalPlayerView(content: .episode(episode))
                    .onDisappear {
                        // Mettre à jour l'historique de visionnage
                        updateEpisodeWatchStatus(episode: episode)
                    }
            }
        }
    }

    // MARK: - Playback Buttons Section
    private var playbackButtonsSection: some View {
        HStack(spacing: 20) {
            // Déterminer le premier épisode non vu
            let firstUnwatchedEpisode = getFirstUnwatchedEpisode()
            let lastWatchedEpisode = getLastWatchedEpisode()

            if let episode = lastWatchedEpisode, !episode.isWatched {
                // Bouton "Reprendre" (épisode en cours)
                PlaybackButton(
                    title: "Reprendre S\(episode.seasonNumber)E\(episode.episodeNum)",
                    icon: "play.fill",
                    action: { playEpisode(episode) },
                    isFocused: $focusedResumeButton
                )
            } else if let episode = firstUnwatchedEpisode {
                // Bouton "Lire" (premier épisode non vu)
                PlaybackButton(
                    title: "Lire S\(episode.seasonNumber)E\(episode.episodeNum)",
                    icon: "play.fill",
                    action: { playEpisode(episode) },
                    isFocused: $focusedPlayButton
                )
            }

            // Bouton "Redémarrer" (premier épisode de la série)
            if let firstEpisode = getFirstEpisode() {
                PlaybackButton(
                    title: "Redémarrer",
                    icon: "arrow.counterclockwise",
                    action: { playEpisode(firstEpisode) },
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
            Text("Créateur")
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
                .padding(.horizontal, 60)

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
                .padding(.horizontal, 60)
            }
        }
    }

    // MARK: - Seasons Section
    private var seasonsSection: some View {
        VStack(alignment: .leading, spacing: 30) {
            Text("Épisodes")
                .font(.system(size: 32, weight: .bold))
                .foregroundColor(.kanTextPrimary)
                .padding(.horizontal, 60)

            ForEach(seasons) { season in
                SeasonRow(
                    season: season,
                    onEpisodeTap: { episode in
                        playEpisode(episode)
                    },
                    focusedEpisodeId: $focusedEpisodeId
                )
            }
        }
    }

    // MARK: - Helper Methods

    /// Charge les détails de la série
    private func loadDetails() async {
        guard let account = activeAccount else {
            error = "Aucun compte actif"
            isLoading = false
            return
        }

        do {
            let detail = try await SeriesDetailService.shared.loadSeriesDetail(
                series: series,
                account: account,
                modelContext: modelContext
            )
            await MainActor.run {
                self.seriesDetail = detail
                self.isLoading = false
            }

            // ✅ Petit délai pour laisser SwiftData finaliser la persistance
            // SwiftData peut avoir besoin d'un cycle pour propager les changements
            try? await Task.sleep(nanoseconds: 100_000_000) // 100ms

            await MainActor.run {
                self.refreshSeasons()
            }
        } catch {
            await MainActor.run {
                self.error = error.localizedDescription
                self.isLoading = false
            }
        }
    }

    /// Rafraîchit la liste des saisons depuis le ModelContext
    private func refreshSeasons() {
        let currentSeriesId = series.seriesId

        print("🔍 [SeriesDetailView] Début refreshSeasons pour seriesId: \(currentSeriesId)")
        print("🔍 [SeriesDetailView] ModelContext: \(ObjectIdentifier(modelContext))")

        // Vérifier toutes les saisons dans le contexte (sans filtre)
        let allSeasonsDescriptor = FetchDescriptor<SeriesSeason>()
        if let allCount = try? modelContext.fetchCount(allSeasonsDescriptor) {
            print("🔍 [SeriesDetailView] Total de saisons dans le contexte: \(allCount)")
        }

        // Forcer la synchronisation du contexte avec le conteneur persistant
        // Cela garantit que les insertions récentes sont visibles
        do {
            try modelContext.save()
            print("🔍 [SeriesDetailView] modelContext.save() réussi")
        } catch {
            print("⚠️ [SeriesDetailView] Erreur lors de la sauvegarde du contexte: \(error)")
        }

        let descriptor = FetchDescriptor<SeriesSeason>(
            predicate: #Predicate<SeriesSeason> { $0.seriesId == currentSeriesId },
            sortBy: [SortDescriptor(\SeriesSeason.seasonNumber, order: .forward)]
        )

        do {
            // Utiliser fetchCount pour diagnostiquer
            let count = try modelContext.fetchCount(descriptor)
            print("🔍 [SeriesDetailView] fetchCount retourne: \(count) saisons pour seriesId \(currentSeriesId)")

            seasons = try modelContext.fetch(descriptor)
            print("🔄 [SeriesDetailView] Saisons rafraîchies: \(seasons.count) saisons pour seriesId \(currentSeriesId)")

            // Log des saisons chargées
            for season in seasons {
                print("   - Saison \(season.seasonNumber): \(season.name ?? "Sans nom") (seriesId: \(season.seriesId))")
            }
        } catch {
            print("⚠️ [SeriesDetailView] Erreur lors du rafraîchissement des saisons: \(error)")
            seasons = []
        }
    }

    /// Récupère le premier épisode non visionné
    private func getFirstUnwatchedEpisode() -> Episode? {
        let currentSeriesId = series.seriesId
        let descriptor = FetchDescriptor<Episode>(
            predicate: #Predicate {
                $0.seriesId == currentSeriesId && !$0.isWatched
            },
            sortBy: [
                SortDescriptor(\Episode.seasonNumber, order: .forward),
                SortDescriptor(\Episode.episodeNum, order: .forward)
            ]
        )

        let episode = try? modelContext.fetch(descriptor).first
        print("🎬 [SeriesDetailView] Premier épisode non visionné: \(episode != nil ? "S\(episode!.seasonNumber)E\(episode!.episodeNum)" : "aucun")")
        return episode
    }

    /// Récupère le dernier épisode visionné (ou en cours)
    private func getLastWatchedEpisode() -> Episode? {
        let currentSeriesId = series.seriesId
        let descriptor = FetchDescriptor<WatchHistory>(
            predicate: #Predicate {
                $0.streamId == currentSeriesId && $0.contentType == "series"
            },
            sortBy: [SortDescriptor(\.lastWatchedDate, order: .reverse)]
        )

        guard let lastHistory = try? modelContext.fetch(descriptor).first,
              let episodeId = lastHistory.episodeId else {
            return nil
        }

        let episodeDescriptor = FetchDescriptor<Episode>(
            predicate: #Predicate { $0.id == episodeId }
        )

        return try? modelContext.fetch(episodeDescriptor).first
    }

    /// Récupère le tout premier épisode (S1E1)
    private func getFirstEpisode() -> Episode? {
        let currentSeriesId = series.seriesId
        let descriptor = FetchDescriptor<Episode>(
            predicate: #Predicate { $0.seriesId == currentSeriesId },
            sortBy: [
                SortDescriptor(\Episode.seasonNumber, order: .forward),
                SortDescriptor(\Episode.episodeNum, order: .forward)
            ]
        )

        let episode = try? modelContext.fetch(descriptor).first
        print("🎬 [SeriesDetailView] Premier épisode (S1E1): \(episode != nil ? "S\(episode!.seasonNumber)E\(episode!.episodeNum)" : "aucun")")
        return episode
    }

    /// Lance la lecture d'un épisode
    private func playEpisode(_ episode: Episode) {
        selectedEpisode = episode
        showPlayer = true
    }

    /// Met à jour le statut de visionnage d'un épisode
    private func updateEpisodeWatchStatus(episode: Episode) {
        // Récupérer l'historique de visionnage de cet épisode
        let currentSeriesId = series.seriesId
        let currentEpisodeId = episode.id
        let descriptor = FetchDescriptor<WatchHistory>(
            predicate: #Predicate {
                $0.streamId == currentSeriesId &&
                $0.contentType == "series" &&
                $0.episodeId == currentEpisodeId
            }
        )

        if let history = try? modelContext.fetch(descriptor).first {
            // Marquer comme vu si >95% visionné
            if history.isCompleted {
                episode.isWatched = true
                try? modelContext.save()
            }
        }
    }

    /// Récupère le nom d'un acteur depuis la liste cast (format: "Nom1, Nom2, Nom3")
    private func getCastName(at index: Int) -> String {
        guard let cast = seriesDetail?.cast else { return "Inconnu" }
        let names = cast.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
        return index < names.count ? names[index] : "Inconnu"
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

    SeriesDetailView(series: sampleSeries)
        .modelContainer(
            for: [Series.self, SeriesDetail.self, SeriesSeason.self, Episode.self, WatchHistory.self, Account.self],
            inMemory: true
        )
}
