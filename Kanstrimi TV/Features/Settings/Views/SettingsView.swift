//
//  SettingsView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftUI

struct SettingsView: View {
    var body: some View {
        ZStack {
            Color.kanBackground
                .ignoresSafeArea()

            VStack(spacing: 40) {
                Text("Paramètres")
                    .font(.system(size: 60, weight: .bold))
                    .foregroundColor(.kanTextPrimary)

                Text("Configuration de l'application")
                    .font(.title3)
                    .foregroundColor(.kanTextSecondary)
            }
            .padding(60)
        }
    }
}

#Preview {
    SettingsView()
}
