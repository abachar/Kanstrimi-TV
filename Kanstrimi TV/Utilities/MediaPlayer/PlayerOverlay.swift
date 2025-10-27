//
//  PlayerOverlay.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 27/10/2025.
//

import SwiftUI

/// Overlay du player (désactivé Phase 1, structure pour Phase 2)
///
/// Fonctionnalités futures :
/// - Header : Nom de la chaîne / film / série
/// - Footer : Barre de progression (VOD uniquement)
/// - Boutons : Audio, Sous-titres, Reprendre, Episode suivant/précédent, Info
struct PlayerOverlay: View {
    let content: PlaybackContent
    @Binding var isVisible: Bool

    var body: some View {
        if isVisible {
            ZStack {
                // Background semi-transparent
                Color.black.opacity(0.75)
                    .ignoresSafeArea()

                VStack {
                    // Header : Titre du contenu
                    HStack {
                        Text(content.title)
                            .font(.title2)
                            .foregroundColor(.primary)

                        Spacer()

                        if content.contentType == .live {
                            Text("LIVE")
                                .font(.caption)
                                .fontWeight(.bold)
                                .foregroundColor(.black)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(Color.red)
                                .cornerRadius(4)
                        }
                    }
                    .padding(.horizontal, 60)
                    .padding(.top, 60)

                    Spacer()

                    // Footer : Barre de progression et boutons (Phase 2)
                    // TODO: Implémenter barre de progression pour VOD
                    // TODO: Implémenter boutons (Audio, Sous-titres, Reprendre, Info)
                }
            }
            .transition(.opacity)
        }
    }
}
