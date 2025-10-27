//
//  AppInfoPanel.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftUI

/// Panneau d'informations sur l'application (colonne gauche de SettingsView)
struct AppInfoPanel: View {
    // MARK: - Properties
    let appInfo: AppInfo

    // MARK: - Body
    var body: some View {
        VStack(alignment: .leading, spacing: 40) {
            // Logo et nom de l'app
            VStack(alignment: .leading, spacing: 16) {
                Image(systemName: "play.tv.fill")
                    .font(.system(size: 80, weight: .bold))
                    .foregroundColor(.blue)

                Text(appInfo.appName)
                    .font(.system(size: 48, weight: .bold))
                    .foregroundColor(.primary)
            }

            Spacer()

            // Disclaimer légal
            VStack(alignment: .leading, spacing: 16) {
                Text("Avertissement")
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundColor(.primary)

                Text(appInfo.disclaimer)
                    .font(.system(size: 20, weight: .light))
                    .foregroundColor(.secondary)
                    .lineSpacing(6)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer()
        }
        .frame(maxWidth: 500)
        .padding(40)
    }
}

// MARK: - Preview
#Preview {
    AppInfoPanel(appInfo: AppInfo())
        .background(Color.black)
}
