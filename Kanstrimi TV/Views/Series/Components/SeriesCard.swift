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
    @Environment(SeriesViewModel.self) private var viewModel

    // MARK: - Computed Configuration
    private var configuration: CardConfiguration {
        CardConfiguration(
            style: .portrait(width: 220, height: 300),
            aspectMode: .fill,
            emptyIcon: "tv.fill",
            showRating: true,
            additionalInfo: series.genre
        )
    }

    // MARK: - Body
    var body: some View {
        GenericContentCard(
            item: series,
            configuration: configuration,
            action: {
                viewModel.selectSeries(series)
            }
        )
    }
}
