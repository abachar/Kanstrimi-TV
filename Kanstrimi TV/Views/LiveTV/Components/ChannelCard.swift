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
    @Environment(LiveTVNavigationViewModel.self) private var navigationViewModel

    // MARK: - Configuration
    private let configuration = CardConfiguration(
        style: .landscape(width: 250, height: 150),
        aspectMode: .fit,
        emptyIcon: "tv.fill",
        showName: true
    )

    // MARK: - Body
    var body: some View {
        GenericContentCard(
            item: channel,
            configuration: configuration,
            action: {
                navigationViewModel.selectChannel(channel)
            }
        )
    }
}
