//
//  EmptySearchView.swift
//  Kanstrimi TV
//
//  Created by Claude on 26/10/2025.
//

import SwiftUI

/// Vue affichée quand un tab de recherche est vide
///
/// Gère deux états:
/// - searchText < 3 caractères → "Tapez au moins 3 caractères"
/// - Aucun résultat → "Aucun {contentType} trouvé"
struct EmptySearchView: View {

    let searchText: String
    let contentType: String // "chaînes", "films", "séries"

    var body: some View {
        VStack(spacing: 30) {
            Text(message)
                .font(.title3)
                .foregroundStyle(Color.kanTextSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Computed Properties

    private var message: String {
        if searchText.count < 3 {
            return "Tapez au moins 3 caractères pour rechercher"
        } else {
            return "Aucun \(contentType) trouvé pour '\(searchText)'"
        }
    }
}

// MARK: - Previews

#Preview("Moins de 3 caractères") {
    EmptySearchView(searchText: "ab", contentType: "films")
        .background(Color.kanBackground)
}

#Preview("Aucun résultat") {
    EmptySearchView(searchText: "xyzabc", contentType: "séries")
        .background(Color.kanBackground)
}
