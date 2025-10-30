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

    // MARK: - Environment
    @Environment(MoviesViewModel.self) private var viewModel

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
                viewModel.selectMovie(movie)
            }
        )
    }
}
