//
//  ResultLimitIndicator.swift
//  Kanstrimi TV
//
//  Created by Claude on 26/10/2025.
//

import SwiftUI

/// Indicateur affiché quand il y a plus de 20 résultats
///
/// Affiche: "20 résultats affichés sur X disponibles"
struct ResultLimitIndicator: View {

    let displayedCount: Int
    let totalCount: Int

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "info.circle.fill")
                .font(.title3)
                .foregroundStyle(Color.kanHighlight)

            Text("\(displayedCount) résultats affichés sur \(totalCount) disponibles")
                .font(.callout)
                .foregroundStyle(Color.kanTextSecondary)
        }
        .padding(.horizontal, 30)
        .padding(.vertical, 20)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.kanCardBackground.opacity(0.5))
        )
        .padding(.top, 20)
    }
}

// MARK: - Previews

#Preview {
    VStack {
        ResultLimitIndicator(displayedCount: 20, totalCount: 156)
        ResultLimitIndicator(displayedCount: 20, totalCount: 42)
    }
    .padding()
    .background(Color.kanBackground)
}
