//
//  ChannelCard.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftUI

/// Carte représentant une chaîne TV en direct
struct ChannelCard: View {
    // MARK: - Properties
    let channel: LiveChannel

    // MARK: - Environment
    @Environment(LiveTVViewModel.self) private var viewModel

    // MARK: - Configuration
    private let configuration = CardConfiguration(
        style: .landscape(width: 200, height: 120),
        aspectMode: .fit,
        emptyIcon: "tv.fill",
        showRating: false
    )

    // MARK: - Body
    var body: some View {
        GenericContentCard(
            item: channel,
            configuration: configuration,
            action: {
                viewModel.selectChannel(channel)
            }
        )
    }
}
