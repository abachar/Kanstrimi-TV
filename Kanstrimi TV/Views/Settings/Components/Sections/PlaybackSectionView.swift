//
//  PlaybackSectionView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftUI
import SwiftData

/// Section affichant les paramètres de lecture
struct PlaybackSectionView: View {
    // MARK: - Environment
    @Environment(\.domainService) private var domainService

    // MARK: - Queries
    @Query private var playerSettings: [PlayerSettings]

    // MARK: - Computed Properties
    private var currentPlayerSettings: PlayerSettings? {
        playerSettings.first
    }

    private var liveBufferSize: Int {
        currentPlayerSettings?.liveBufferSize ?? 3
    }

    private var vodBufferSize: Int {
        currentPlayerSettings?.vodBufferSize ?? 10
    }

    // MARK: - Body
    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            SettingsSectionHeader(icon: "play.circle.fill", title: "Lecture")

            VStack(alignment: .leading, spacing: 20) {
                // Description générale
                Text("Configuration du buffer")
                    .font(.system(size: 24, weight: .medium))
                    .foregroundColor(.primary)

                Text("Taille du buffer avant le démarrage de la lecture. Une valeur plus élevée améliore la stabilité mais augmente le délai de démarrage.")
                    .font(.system(size: 18, weight: .light))
                    .foregroundColor(.secondary)
                    .lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)

                // Buffer Live TV
                VStack(alignment: .leading, spacing: 8) {
                    Text("Buffer Live TV")
                        .font(.system(size: 20, weight: .medium))
                        .foregroundColor(.primary)

                    Picker("Buffer Live TV", selection: Binding(
                        get: { liveBufferSize },
                        set: { newValue in updateLiveBufferSize(newValue) }
                    )) {
                        ForEach(PlayerSettings.liveBufferOptions, id: \.self) { option in
                            Text("\(option) sec").tag(option)
                        }
                    }
                    .pickerStyle(.segmented)
                }
                .padding(.top, 12)

                // Buffer VOD/Séries
                VStack(alignment: .leading, spacing: 8) {
                    Text("Buffer VOD/Séries")
                        .font(.system(size: 20, weight: .medium))
                        .foregroundColor(.primary)

                    Picker("Buffer VOD", selection: Binding(
                        get: { vodBufferSize },
                        set: { newValue in updateVodBufferSize(newValue) }
                    )) {
                        ForEach(PlayerSettings.vodBufferOptions, id: \.self) { option in
                            Text("\(option) sec").tag(option)
                        }
                    }
                    .pickerStyle(.segmented)
                }
                .padding(.top, 12)
            }
            .padding(24)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.appSecondaryBackground)
            )
        }
    }

    // MARK: - Actions
    private func updateLiveBufferSize(_ newValue: Int) {
        guard let settings = currentPlayerSettings else { return }
        settings.liveBufferSize = newValue
        try? domainService.updatePlayerSettings(settings)
    }

    private func updateVodBufferSize(_ newValue: Int) {
        guard let settings = currentPlayerSettings else { return }
        settings.vodBufferSize = newValue
        try? domainService.updatePlayerSettings(settings)
    }
}
