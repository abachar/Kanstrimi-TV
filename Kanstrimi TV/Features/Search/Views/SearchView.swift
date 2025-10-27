//
//  SearchView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftUI
import SwiftData

/// Vue de recherche avec 3 tabs (TV en direct, Films, Séries)
///
/// Fonctionnalités:
/// - Recherche multi-mots (split sur espaces, ordre indépendant)
/// - Minimum 3 caractères pour activer la recherche
/// - Count de résultats dans chaque tab
/// - Limite de 20 résultats affichés
/// - EmptySearchView par tab
struct SearchView: View {

    // MARK: - Queries

    @Query private var allLiveChannels: [LiveChannel]
    @Query private var allMovies: [Movie]
    @Query private var allSeries: [Series]

    // MARK: - State

    @State private var searchText = ""
    @State private var selectedTab = 0
    @State private var selectedChannel: LiveChannel?
    @State private var selectedMovie: Movie?

    @FocusState private var focusedTab: Int?
    @FocusState private var focusedChannelId: String?
    @FocusState private var focusedMovieId: String?
    @FocusState private var focusedSeriesId: String?

    // MARK: - Computed Properties

    /// Termes de recherche (splitté sur espaces)
    private var searchTerms: [String] {
        searchText.split(separator: " ").map(String.init)
    }

    /// La recherche est active si >= 3 caractères
    private var isSearchActive: Bool {
        searchText.count >= 3
    }

    // Chaînes TV filtrées
    private var filteredLive: [LiveChannel] {
        guard isSearchActive else { return [] }
        return SearchHelper.filterLiveChannels(allLiveChannels, terms: searchTerms)
    }

    // Films filtrés
    private var filteredMovies: [Movie] {
        guard isSearchActive else { return [] }
        return SearchHelper.filterMovies(allMovies, terms: searchTerms)
    }

    // Séries filtrées
    private var filteredSeries: [Series] {
        guard isSearchActive else { return [] }
        return SearchHelper.filterSeries(allSeries, terms: searchTerms)
    }

    // Counts totaux
    private var liveCount: Int { filteredLive.count }
    private var moviesCount: Int { filteredMovies.count }
    private var seriesCount: Int { filteredSeries.count }

    // Résultats affichés (max 20)
    private var displayedLive: [LiveChannel] { Array(filteredLive.prefix(20)) }
    private var displayedMovies: [Movie] { Array(filteredMovies.prefix(20)) }
    private var displayedSeries: [Series] { Array(filteredSeries.prefix(20)) }

    // MARK: - Body

    var body: some View {
        VStack(spacing: 0) {
            // Tabs en haut avec counts
            HStack(spacing: 20) {
                
                // Contenu des tabs
                TabView(selection: $selectedTab) {
                    // Tab 0: TV en direct
                    SearchResultsGrid(
                        searchText: searchText,
                        contentType: "chaînes",
                        totalCount: liveCount,
                        displayedCount: displayedLive.count
                    ) {
                        ForEach(displayedLive) { channel in
                            ChannelCard(
                                channel: channel,
                                focusedChannelId: $focusedChannelId,
                                selectedChannel: $selectedChannel
                            )
                        }
                    }
                    .tabItem {
                        Label("TV en direct", systemImage: "tv")
                            .font(.caption2)
                    }

                    // Tab 1: Films
                    SearchResultsGrid(
                        searchText: searchText,
                        contentType: "films",
                        totalCount: moviesCount,
                        displayedCount: displayedMovies.count
                    ) {
                        ForEach(displayedMovies) { movie in
                            MovieCard(
                                movie: movie,
                                focusedMovieId: $focusedMovieId,
                                selectedMovie: $selectedMovie
                            )
                        }
                    }
                    .tabItem {
                        Label("Films", systemImage: "film")
                            .font(.caption2)
                    }

                    // Tab 2: Séries
                    SearchResultsGrid(
                        searchText: searchText,
                        contentType: "séries",
                        totalCount: seriesCount,
                        displayedCount: displayedSeries.count
                    ) {
                        ForEach(displayedSeries) { series in
                            SeriesCard(
                                series: series,
                                onTap: { /* TODO: Navigate to SeriesDetailView */ },
                                focusedSeriesId: $focusedSeriesId
                            )
                        }
                    }
                    .tabItem {
                        Label("Séries", systemImage: "film.stack")
                            .font(.caption2)
                    }
                }
                .tabViewStyle(.tabBarOnly)
            }
            .padding(.horizontal, 60)
            .padding(.top, 1)
            .padding(.bottom, 20)
        }
        // .ignoresSafeArea()
        .background(Color.kanBackground)
        .searchable(text: $searchText, prompt: "Rechercher du contenu...")
        .fullScreenCover(item: $selectedChannel) { channel in
            UniversalPlayerView(content: .liveChannel(channel))
        }
        .fullScreenCover(item: $selectedMovie) { movie in
            MovieDetailView(movie: movie)
        }
    }
}

// MARK: - Previews

#Preview("Avec compte") {
    let config = ModelConfiguration(isStoredInMemoryOnly: true)
    let container = try! ModelContainer(for: LiveChannel.self, Movie.self, Series.self, configurations: config)

    // Ajouter des données de test
    let context = container.mainContext

    // Chaînes
    for i in 1...5 {
        let channel = LiveChannel(
            streamId: i,
            name: "TF\(i) HD",
            streamURL: "http://example.com/stream\(i)",
            categoryId: "1",
            sortOrder: i,
            streamIcon: "https://via.placeholder.com/200x120"
        )
        context.insert(channel)
    }

    // Films
    for i in 1...5 {
        let movie = Movie(
            streamId: i,
            name: "Film \(i)",
            streamURL: "http://example.com/movie\(i)",
            sortOrder: i,
            streamIcon: "https://via.placeholder.com/180x270",
            rating5based: 4.0
        )
        context.insert(movie)
    }

    // Séries
    for i in 1...5 {
        let series = Series(
            seriesId: i,
            name: "Série \(i)",
            sortOrder: i,
            cover: "https://via.placeholder.com/180x270",
            backdropPaths: nil,
            rating5based: 4.5,
            genre: "Action"
        )
        context.insert(series)
    }

    return SearchView()
        .modelContainer(container)
}
