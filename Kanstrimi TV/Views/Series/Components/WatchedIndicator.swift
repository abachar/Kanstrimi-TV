//
//  WatchedIndicator.swift
//  Kanstrimi TV
//
//  Created on 2025-10-27.
//

import SwiftUI

/// Indicateur visuel pour épisode visionné
struct WatchedIndicator: View {
    // MARK: - Properties
    let isWatched: Bool

    // MARK: - Body
    var body: some View {
        if isWatched {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 24))
                .foregroundColor(.green)
                .background(
                    Circle()
                        .fill(Color.black)
                        .frame(width: 28, height: 28)
                )
                .shadow(color: .black.opacity(0.3), radius: 2, x: 0, y: 1)
        }
    }
}

// MARK: - Preview
#Preview {
    VStack(spacing: 20) {
        WatchedIndicator(isWatched: true)
        WatchedIndicator(isWatched: false)
    }
    .padding()
    // .background(Color.gray.opacity(0.3))
}
