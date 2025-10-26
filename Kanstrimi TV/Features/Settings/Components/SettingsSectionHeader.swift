//
//  SettingsSectionHeader.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftUI

/// Header réutilisable pour les sections de paramètres
struct SettingsSectionHeader: View {
    // MARK: - Properties
    let icon: String
    let title: String

    // MARK: - Body
    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: icon)
                .font(.system(size: 32, weight: .semibold))
                .foregroundColor(.kanTabSelected)
                .frame(width: 40, height: 40)

            Text(title)
                .font(.system(size: 38, weight: .bold))
                .foregroundColor(.kanTextPrimary)

            Spacer()
        }
        .padding(.bottom, 16)
    }
}

// MARK: - Preview
#Preview {
    VStack(spacing: 30) {
        SettingsSectionHeader(icon: "person.circle.fill", title: "Compte")
        SettingsSectionHeader(icon: "play.circle.fill", title: "Lecture")
        SettingsSectionHeader(icon: "info.circle.fill", title: "Informations")
    }
    .padding(60)
    .background(Color.kanBackground)
}
