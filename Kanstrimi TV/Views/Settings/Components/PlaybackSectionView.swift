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

    private var bufferSize: Int {
        currentPlayerSettings?.bufferSize ?? 30
    }

    // Options de buffer disponibles (en secondes)
    private let bufferOptions = [5, 10, 20, 30]

    // MARK: - Body
    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            SettingsSectionHeader(icon: "play.circle.fill", title: "Lecture")

            VStack(alignment: .leading, spacing: 20) {
                // Description
                Text("Taille du buffer")
                    .font(.system(size: 24, weight: .medium))
                    .foregroundColor(.primary)

                Text("Taille du buffer avant le démarrage de la lecture. Une valeur plus élevée améliore la stabilité mais augmente le délai de démarrage.")
                    .font(.system(size: 18, weight: .light))
                    .foregroundColor(.secondary)
                    .lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)

                // Picker segment\u00e9
                Picker("Taille du buffer", selection: Binding(
                    get: { bufferSize },
                    set: { newValue in updateBufferSize(newValue) }
                )) {
                    ForEach(bufferOptions, id: \.self) { option in
                        Text("\(option) sec").tag(option)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.top, 8)
            }
            .padding(24)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.appSecondaryBackground)
            )
        }
    }

    // MARK: - Actions
    private func updateBufferSize(_ newValue: Int) {
        guard let settings = currentPlayerSettings else { return }
        settings.bufferSize = newValue
        try? domainService.updatePlayerSettings(settings)
    }
}
