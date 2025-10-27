//
//  ContentTypeBadge.swift
//  Kanstrimi TV
//
//  Created by Claude on 27/10/2025.
//

import SwiftUI

/// Badge compact pour afficher le type de contenu (Live/Film/Série)
///
/// Utilisé dans UnifiedContentCard pour distinguer visuellement les types de contenu.
/// 3 variantes avec couleurs distinctes :
/// - Live : bleu avec icône radiowaves
/// - Film : rouge avec icône film
/// - Série : vert avec icône tv
struct ContentTypeBadge: View {
    // MARK: - Properties

    let type: ContentType

    // MARK: - Body

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: type.icon)
                .font(.system(size: 10, weight: .semibold))

            Text(type.label)
                .font(.system(size: 11, weight: .semibold))
        }
        .foregroundColor(.white)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(type.color)
        .cornerRadius(6)
        .shadow(color: .black.opacity(0.3), radius: 2, x: 0, y: 1)
    }
}

// MARK: - Previews

#Preview("Live") {
    ContentTypeBadge(type: .live)
        .padding()
        .background(Color.gray)
}

#Preview("Film") {
    ContentTypeBadge(type: .movie)
        .padding()
        .background(Color.gray)
}

#Preview("Série") {
    ContentTypeBadge(type: .series)
        .padding()
        .background(Color.gray)
}
