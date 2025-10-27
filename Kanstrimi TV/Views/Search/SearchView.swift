//
//  SearchView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftUI
import SwiftData

/// Vue de recherche unifiée avec grille unique pour tous les types de contenu
///
/// Fonctionnalités:
/// - Recherche multi-mots (split sur espaces, ordre indépendant)
/// - Minimum 3 caractères pour activer la recherche
/// - Tri par pertinence (match au début du nom = prioritaire)
/// - Limite de 30 résultats affichés
/// - Badge Live/Film/Série sur chaque carte
struct SearchView: View {

    // MARK: - Environment

    @Environment(SearchViewModel.self) private var searchViewModel
    @Environment(MoviesViewModel.self) private var moviesViewModel

    // MARK: - Queries

    @Query private var allLiveChannels: [LiveChannel]
    @Query private var allMovies: [Movie]
    @Query private var allSeries: [Series]

    // MARK: - Computed Properties

    /// Résultats filtrés et triés par pertinence (max 30)
    private var allResults: [SearchResult] {
        searchViewModel.filterAllResults(
            liveChannels: allLiveChannels,
            movies: allMovies,
            series: allSeries
        )
    }

    /// Count total avant limite de 30
    private var totalCount: Int {
        guard searchViewModel.isSearchActive else { return 0 }

        let liveCount = SearchHelper.filterLiveChannels(allLiveChannels, terms: searchViewModel.searchTerms).count
        let moviesCount = SearchHelper.filterMovies(allMovies, terms: searchViewModel.searchTerms).count
        let seriesCount = SearchHelper.filterSeries(allSeries, terms: searchViewModel.searchTerms).count

        return liveCount + moviesCount + seriesCount
    }

    // MARK: - Body

    var body: some View {
        @Bindable var searchVM = searchViewModel
        @Bindable var moviesVM = moviesViewModel

        VStack(spacing: 0) {
            // Grille unifiée de résultats
            SearchResultsGrid(
                searchText: searchViewModel.searchText,
                results: allResults,
                totalCount: totalCount,
                onSelect: { result in
                    searchViewModel.selectResult(result)
                }
            )
        }
        .background(Color.black)
        .searchable(text: $searchVM.searchText, prompt: "Rechercher du contenu...")
        .fullScreenCover(item: $searchVM.selectedResult) { result in
            switch result {
            case .liveChannel(let channel):
                UniversalPlayerView(content: .liveChannel(channel))
            case .movie(let movie):
                MovieDetailView(movie: movie)
            case .series(let series):
                SeriesDetailView(series: series)
            }
        }
        .fullScreenCover(item: $moviesVM.playingContent) { content in
            UniversalPlayerView(content: content)
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
