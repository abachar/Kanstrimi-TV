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
                .foregroundStyle(Color.blue)

            Text("\(displayedCount) résultats affichés sur \(totalCount) disponibles")
                .font(.callout)
                .foregroundStyle(Color.secondary)
        }
        .padding(.horizontal, 30)
        .padding(.vertical, 20)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.gray.opacity(0.3).opacity(0.5))
        )
        .padding(.top, 20)
    }
}
