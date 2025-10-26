//
//  SyncProgressView.swift
//  Kanstrimi TV
//
//  Created on 2025-10-26.
//  Composant affichant la progression de la synchronisation d'un compte
//

import SwiftUI

/// Vue affichant la progression de la synchronisation d'un compte
struct SyncProgressView: View {
    // MARK: - Properties
    let currentStep: SyncStep

    // MARK: - Body
    var body: some View {
        VStack(spacing: 60) {
            // Titre de l'application
            Text("Kanstrimi TV")
                .font(.system(size: 80, weight: .bold))
                .foregroundColor(.kanTextPrimary)

            VStack(spacing: 40) {
                // Message de l'étape courante
                Text(currentStep.message)
                    .font(.system(size: 36))
                    .foregroundColor(.kanTextSecondary)
                    .multilineTextAlignment(.center)
                    .transition(.opacity)
                    .id(currentStep)  // Force l'animation lors du changement d'étape

                // Barre de progression
                ProgressView(value: currentStep.progress, total: 1.0)
                    .progressViewStyle(.linear)
                    .frame(width: 600)
                    .tint(.kanTabSelected)

                // Indicateur numérique (ex: "3/5")
                Text("\(currentStep.rawValue + 1)/\(SyncStep.allCases.count)")
                    .font(.system(size: 28))
                    .foregroundColor(.kanTextSecondary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Preview
#Preview {
    SyncProgressView(currentStep: .movies)
        .background(Color.kanBackground)
}
