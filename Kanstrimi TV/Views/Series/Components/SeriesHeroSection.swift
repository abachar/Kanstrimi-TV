//
//  SeriesHeroSection.swift
//  Kanstrimi TV
//
//  Created on 2025-10-27.
//

import SwiftUI

/// Section hero affichant le backdrop, poster et informations principales d'une série
struct SeriesHeroSection: View {
    // MARK: - Properties
    let series: Series
    let seriesDetail: SeriesDetail?

    // MARK: - Hero Data Wrapper
    private var heroData: SeriesHeroData {
        SeriesHeroData(series: series, seriesDetail: seriesDetail)
    }

    private let configuration = HeroConfiguration(
        showDuration: false,
        fallbackIcon: "tv.fill"
    )

    // MARK: - Body
    var body: some View {
        GenericHeroSection(item: heroData, configuration: configuration)
    }
}

// MARK: - SeriesHeroData

/// Wrapper pour les données d'affichage hero d'une série
private struct SeriesHeroData: HeroDisplayable {
    let series: Series
    let seriesDetail: SeriesDetail?

    var backdropURL: String? {
        seriesDetail?.backdropPaths?.first ?? seriesDetail?.cover
    }

    var posterURL: String? {
        seriesDetail?.cover ?? series.cover
    }

    var title: String {
        seriesDetail?.name ?? series.name
    }

    var year: String? {
        seriesDetail?.year
    }

    var duration: String? {
        nil // Les séries n'ont pas de durée unique
    }

    var rating: Double? {
        seriesDetail?.rating ?? series.rating5based
    }

    var genre: String? {
        seriesDetail?.genre
    }

    var fallbackIcon: String {
        "tv.fill"
    }
}
