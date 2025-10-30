//
//  MovieCard.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftUI

/// Carte représentant un film VOD
struct MovieCard: View {
    // MARK: - Properties
    let movie: Movie
    let returnTo: MovieNavigationState.ReturnDestination

    // MARK: - Environment
    @Environment(MovieNavigationViewModel.self) private var navigationViewModel

    // MARK: - Configuration
    private let configuration = CardConfiguration(
        style: .portrait(width: 250, height: 375),
        aspectMode: .fill,
        emptyIcon: "film.fill"
    )

    /*250 / 375*/

    // MARK: - Body
    var body: some View {
        GenericContentCard(
            item: movie,
            configuration: configuration,
            action: {
                if let streamId = movie.extractedStreamId {
                    navigationViewModel.navigateToDetail(streamId: streamId, from: returnTo)
                }
            }
        )
    }
}
