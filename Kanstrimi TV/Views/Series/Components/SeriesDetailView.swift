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
    @Environment(SeriesViewModel.self) private var viewModel

    // MARK: - Queries
    @Query private var seriesDetails: [SeriesDetail]
    @Query private var seasons: [SeriesSeason]
    @Query private var episodes: [Episode]
    @Query private var watchHistories: [WatchHistory]

    // MARK: - Computed Properties
    private var seriesDetail: SeriesDetail? {
        seriesDetails.first
    }

    private var episodesBySeason: [Int: [Episode]] {
        Dictionary(grouping: episodes, by: { $0.seasonNumber })
    }

    // MARK: - Init
    init(series: Series) {
        self.series = series
        let seriesId = series.seriesId

        // Filtrer SeriesDetail par seriesId
        _seriesDetails = Query(
            filter: #Predicate<SeriesDetail> { $0.seriesId == seriesId }
        )

        // Filtrer SeriesSeason par seriesId + sort
        _seasons = Query(
            filter: #Predicate<SeriesSeason> { $0.seriesId == seriesId },
            sort: [SortDescriptor(\SeriesSeason.seasonNumber, order: .forward)]
        )

        // Filtrer Episode par seriesId + sort
        _episodes = Query(
            filter: #Predicate<Episode> { $0.seriesId == seriesId },
            sort: [
                SortDescriptor(\Episode.seasonNumber, order: .forward),
                SortDescriptor(\Episode.episodeNum, order: .forward)
            ]
        )

        // Filtrer WatchHistory par seriesId + contentType
        _watchHistories = Query(
            filter: #Predicate<WatchHistory> {
                $0.streamId == seriesId && $0.contentType == "series"
            },
            sort: [SortDescriptor(\.lastWatchedDate, order: .reverse)]
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
                    SeriesHeroSection(series: series, seriesDetail: seriesDetail)

                    VStack(alignment: .leading, spacing: 40) {
                        // Boutons de lecture
                        playbackButtonsSection

                        // Synopsis
                        if let plot = seriesDetail?.plot, !plot.isEmpty {
                            synopsisSection(plot: plot)
                        }

                        // Réalisateur
                        if let director = seriesDetail?.director, !director.isEmpty {
                            directorSection(director: director)
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
                    .padding(.horizontal, 60)
                }
                .padding(.bottom, 60)
            }
        }
        .task {
            await DomainService.shared.loadSeriesDetailsIfNeeded(series: series)
        }
        .ignoresSafeArea()
    }

    // MARK: - Playback Buttons Section
    private var playbackButtonsSection: some View {
        HStack(spacing: 20) {
            // Déterminer le dernier épisode regardé (en cours)
            if let lastWatchedEpisode = lastWatchedEpisode, !lastWatchedEpisode.isWatched {
                // Bouton "Reprendre" (épisode en cours)
                Button {
                    viewModel.playingContent = .episode(lastWatchedEpisode)
                } label: {
                    Label("Reprendre S\(lastWatchedEpisode.seasonNumber)E\(lastWatchedEpisode.episodeNum)", systemImage: "play.fill")
                        .font(.title3)
                }
                .buttonStyle(.borderedProminent)
            } else if let firstUnwatchedEpisode = firstUnwatchedEpisode {
                // Bouton "Lire" (premier épisode non vu)
                Button {
                    viewModel.playingContent = .episode(firstUnwatchedEpisode)
                } label: {
                    Label("Lire S\(firstUnwatchedEpisode.seasonNumber)E\(firstUnwatchedEpisode.episodeNum)", systemImage: "play.fill")
                        .font(.title3)
                }
                .buttonStyle(.borderedProminent)
            }

            // Bouton "Redémarrer" (premier épisode de la série)
            if let firstEpisode = firstEpisode {
                Button {
                    viewModel.playingContent = .episode(firstEpisode)
                } label: {
                    Label("Redémarrer", systemImage: "arrow.counterclockwise")
                        .font(.title3)
                }
                .buttonStyle(.bordered)
            }
        }
    }

    // MARK: - Computed Properties for Episodes
    private var firstUnwatchedEpisode: Episode? {
        episodes.first { !$0.isWatched }
    }

    private var lastWatchedEpisode: Episode? {
        guard let lastHistory = watchHistories.first,
              let episodeId = lastHistory.episodeId else {
            return nil
        }
        return episodes.first { $0.id == episodeId }
    }

    private var firstEpisode: Episode? {
        episodes.first
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
            Text("Créateur")
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

    // MARK: - Seasons Section
    private var seasonsSection: some View {
        VStack(alignment: .leading, spacing: 30) {
            Text("Épisodes")
                .font(.system(size: 32, weight: .bold))
                .foregroundColor(.primary)

            ForEach(seasons) { season in
                SeasonRow(
                    season: season,
                    episodes: episodesBySeason[season.seasonNumber] ?? [],
                    onEpisodeTap: { episode in
                        viewModel.playingContent = .episode(episode)
                    }
                )
            }
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

    SeriesDetailView(series: sampleSeries)
        .modelContainer(
            for: [Series.self, SeriesDetail.self, SeriesSeason.self, Episode.self, WatchHistory.self],
            inMemory: true
        )
        .environment(SeriesViewModel())
}
