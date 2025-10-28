//
//  MovieHeroSection.swift
//  Kanstrimi TV
//
//  Created on 2025-10-27.
//

import SwiftUI

/// Section hero affichant le backdrop, poster et informations principales d'un film
struct MovieHeroSection: View {
    // MARK: - Properties
    let movie: Movie
    let movieDetail: MovieDetail?

    // MARK: - Hero Data Wrapper
    private var heroData: MovieHeroData {
        MovieHeroData(movie: movie, movieDetail: movieDetail)
    }

    private let configuration = HeroConfiguration(
        showDuration: true,
        fallbackIcon: "film.fill"
    )

    // MARK: - Body
    var body: some View {
        GenericHeroSection(item: heroData, configuration: configuration)
    }
}

// MARK: - MovieHeroData

/// Wrapper pour les données d'affichage hero d'un film
private struct MovieHeroData: HeroDisplayable {
    let movie: Movie
    let movieDetail: MovieDetail?

    var backdropURL: String? {
        movieDetail?.backdropPaths?.first ?? movieDetail?.cover
    }

    var posterURL: String? {
        movieDetail?.cover ?? movie.streamIcon
    }

    var title: String {
        movieDetail?.name ?? movie.name
    }

    var year: String? {
        movieDetail?.year
    }

    var duration: String? {
        movieDetail?.duration
    }

    var rating: Double? {
        movieDetail?.rating ?? movie.rating5based
    }

    var genre: String? {
        movieDetail?.genre
    }

    var fallbackIcon: String {
        "film.fill"
    }
}
