//
//  SeriesCard.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftUI

/// Carte représentant une série TV
struct SeriesCard: View {
    // MARK: - Properties
    let series: Series

    // MARK: - Environment
    @Environment(\.navigationPath) private var navigationPath

    // MARK: - Computed Configuration
    private var configuration: CardConfiguration {
        CardConfiguration(
            style: .portrait(width: 250, height: 375),
            aspectMode: .fill,
            emptyIcon: "tv.fill"
        )
    }

    // MARK: - Body
    var body: some View {
        GenericContentCard(
            item: series,
            configuration: configuration,
            action: {
                if let seriesId = series.extractedSeriesId {
                    navigationPath.wrappedValue.append(NavigationDestination.seriesDetail(seriesId: seriesId))
                }
            }
        )
    }
}
