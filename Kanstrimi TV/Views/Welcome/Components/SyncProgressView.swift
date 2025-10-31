//
//  SyncProgressView.swift
//  Kanstrimi TV
//
//  Created on 2025-10-26.
//  Composant affichant la progression de la synchronisation d'un compte
//

import SwiftUI

/// Vue affichant la progression de la synchronisation d'un compte
/// Composant minimaliste contenant uniquement la barre de progression, le message et l'indicateur numérique
struct SyncProgressView: View {
    // MARK: - Properties
    let currentStep: SyncStep

    // MARK: - Body
    var body: some View {
        ZStack {
            Color.appBackground
                .ignoresSafeArea()
            
            VStack(spacing: 30) {
                // Message de l'étape courante
                Text(currentStep.message)
                    .font(.system(size: 32))
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .transition(.opacity)
                    .id(currentStep)  // Force l'animation lors du changement d'étape

                // Barre de progression
                ProgressView(value: currentStep.progress, total: 1.0)
                    .progressViewStyle(.linear)
                    .frame(width: 600)
                    .tint(.blue)

                // Indicateur numérique (ex: "3/5")
                Text("\(currentStep.rawValue + 1)/\(SyncStep.allCases.count)")
                    .font(.system(size: 24))
                    .foregroundColor(.secondary)
            }
            .padding(40)
        }
    }
}
