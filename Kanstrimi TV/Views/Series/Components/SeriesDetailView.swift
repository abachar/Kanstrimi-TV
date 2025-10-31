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
    let seriesId: Int

    // MARK: - Environment
    @Environment(\.domainService) private var domainService
    @Environment(SeriesNavigationViewModel.self) private var navigationViewModel

    // MARK: - Queries
    @Query private var seriesArray: [Series]
    @Query private var seriesDetails: [SeriesDetail]
    @Query private var seasons: [SeriesSeason]
    @Query private var episodes: [Episode]
    @Query private var watchHistories: [WatchHistory]

    // MARK: - Computed Properties
    private var series: Series? {
        seriesArray.first
    }

    private var seriesDetail: SeriesDetail? {
        seriesDetails.first
    }

    private var episodesBySeason: [Int: [Episode]] {
        Dictionary(grouping: episodes, by: { $0.seasonNumber })
    }

    // MARK: - Init
    init(seriesId: Int) {
        self.seriesId = seriesId

        // Filtrer Series par seriesId (via l'ID)
        _seriesArray = Query(
            filter: #Predicate<Series> { $0.id == "series-\(seriesId)" }
        )

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
            Color.appBackground
            
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
                
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 30) {
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
                }
            }
            .padding(60)
        }
        .task {
            guard let series = series else { return }
            await domainService.loadSeriesDetailsIfNeeded(series: series)
        }
        .ignoresSafeArea()
    }

    // MARK: - Helper Properties
    private var returnDestination: SeriesNavigationState.ReturnDestination {
        // Déterminer la destination de retour en fonction de l'état actuel
        if case .seriesDetail(_, let returnTo) = navigationViewModel.currentState {
            return returnTo
        }
        return .seriesList
    }

    var title: String {
        seriesDetail?.name ?? series?.name ?? "Série sans titre"
    }

    var rating: Double? {
        seriesDetail?.rating ?? series?.rating
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

            // Rating (étoiles)
            if let rating = rating {
                ratingView(rating: rating)
            }

            // Genre
            if let genre = seriesDetail?.genre {
                Text(genre)
                    .font(.system(size: 18))
                    .foregroundColor(.primary)
                    .lineLimit(2)
            }
        }
        .padding(.bottom, 40)
    }
    
    var posterURL: String? {
        seriesDetail?.cover ?? series?.cover
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
        seriesDetail?.backdropPaths?.first ?? seriesDetail?.cover
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
    }

    // MARK: - Playback Buttons Section
    private var playbackButtonsSection: some View {
        HStack(spacing: 20) {
            // Déterminer le dernier épisode regardé (en cours)
            if let lastWatchedEpisode = lastWatchedEpisode, !lastWatchedEpisode.isWatched {
                // Bouton "Reprendre" (épisode en cours)
                Button {
                    let (previous, next) = getAdjacentEpisodes(for: lastWatchedEpisode)
                    navigationViewModel.navigateToPlayer(
                        content: .episode(
                            lastWatchedEpisode,
                            seriesName: title,
                            previousEpisode: previous,
                            nextEpisode: next
                        ),
                        from: returnDestination
                    )
                } label: {
                    Label("Reprendre S\(lastWatchedEpisode.seasonNumber)E\(lastWatchedEpisode.episodeNum)", systemImage: "play.fill")
                }
                .buttonStyle(.borderedProminent)
            } else if let firstUnwatchedEpisode = firstUnwatchedEpisode {
                // Bouton "Lire" (premier épisode non vu)
                Button {
                    let (previous, next) = getAdjacentEpisodes(for: firstUnwatchedEpisode)
                    navigationViewModel.navigateToPlayer(
                        content: .episode(
                            firstUnwatchedEpisode,
                            seriesName: title,
                            previousEpisode: previous,
                            nextEpisode: next
                        ),
                        from: returnDestination
                    )
                } label: {
                    Label("Lire S\(firstUnwatchedEpisode.seasonNumber)E\(firstUnwatchedEpisode.episodeNum)", systemImage: "play.fill")
                }
                .buttonStyle(.borderedProminent)
            }

            if lastWatchedEpisode != nil {
                // Bouton "Redémarrer" (premier épisode de la série)
                if let firstEpisode = firstEpisode {
                    Button {
                        let (previous, next) = getAdjacentEpisodes(for: firstEpisode)
                        navigationViewModel.navigateToPlayer(
                            content: .episode(
                                firstEpisode,
                                seriesName: title,
                                previousEpisode: previous,
                                nextEpisode: next
                            ),
                            from: returnDestination
                        )
                    } label: {
                        Label("Redémarrer", systemImage: "arrow.counterclockwise")
                    }
                    .buttonStyle(.bordered)
                }
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

    /// Récupère les épisodes précédent et suivant pour un épisode donné
    private func getAdjacentEpisodes(for episode: Episode) -> (previous: Episode?, next: Episode?) {
        guard let currentIndex = episodes.firstIndex(where: { $0.id == episode.id }) else {
            return (nil, nil)
        }

        let previous = currentIndex > 0 ? episodes[currentIndex - 1] : nil
        let next = currentIndex < episodes.count - 1 ? episodes[currentIndex + 1] : nil

        return (previous, next)
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
                        let (previous, next) = getAdjacentEpisodes(for: episode)
                        navigationViewModel.navigateToPlayer(
                            content: .episode(
                                episode,
                                seriesName: title,
                                previousEpisode: previous,
                                nextEpisode: next
                            ),
                            from: returnDestination
                        )
                    }
                )
            }
        }
    }
}

// MARK: - Previews

#Preview("Without Watch History") {
    let container = try! ModelContainer(
        for: Series.self, SeriesDetail.self, SeriesSeason.self, Episode.self, WatchHistory.self,
        configurations: ModelConfiguration(isStoredInMemoryOnly: true)
    )

    let context = container.mainContext

    // Utiliser Yellowstone avec données complètes
    let series = Series.previewSeries[3] // "Yellowstone (US)_msub"
    context.insert(series)

    // Ajouter les détails complets de la série
    let seriesDetail = SeriesDetail.previewSeriesDetails
    context.insert(seriesDetail)

    // Ajouter les saisons
    SeriesSeason.previewSeriesSeasons.forEach { context.insert($0) }

    // Ajouter les épisodes
    Episode.previewEpisodes.forEach { context.insert($0) }

        // Créer le MockDomainService
    let mockDomainService = MockDomainService(container: container)

    return SeriesDetailView(seriesId: series.extractedSeriesId!)
        .modelContainer(container)
        .environment(\.domainService, mockDomainService)
        .environment(SeriesNavigationViewModel())
}

#Preview("With Watch History") {
    let container = try! ModelContainer(
        for: Series.self, SeriesDetail.self, SeriesSeason.self, Episode.self, WatchHistory.self,
        configurations: ModelConfiguration(isStoredInMemoryOnly: true)
    )

    let context = container.mainContext

    // Utiliser Yellowstone avec données complètes
    let series = Series.previewSeries[3] // "Yellowstone (US)_msub"
    context.insert(series)

    // Ajouter les détails complets de la série
    let seriesDetail = SeriesDetail.previewSeriesDetails
    context.insert(seriesDetail)

    // Ajouter les saisons
    SeriesSeason.previewSeriesSeasons.forEach { context.insert($0) }

    // Ajouter les épisodes
    Episode.previewEpisodes.forEach { context.insert($0) }

    // Créer un historique de visionnage pour l'épisode 3 de la saison 1
    let episode3 = Episode.previewEpisodes[2] // S01E03 "No Good Horses"
    let watchHistory = WatchHistory(
        streamId: series.extractedSeriesId!,
        contentType: "series",
        episodeId: episode3.id, // "episode-3073-1-3"
        lastPosition: 1800, // 30 minutes
        duration: 3300, // 55 minutes total (60%)
        lastWatchedDate: Date()
    )
    context.insert(watchHistory)

    // Créer le MockDomainService
    let mockDomainService = MockDomainService(container: container)

    return SeriesDetailView(seriesId: series.extractedSeriesId!)
        .modelContainer(container)
        .environment(\.domainService, mockDomainService)
        .environment(SeriesNavigationViewModel())
}
