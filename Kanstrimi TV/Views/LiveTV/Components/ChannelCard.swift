//
//  ChannelCard.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftUI

/// Carte représentant une chaîne TV en direct
struct ChannelCard: View {
    // MARK: - Properties
    let channel: LiveChannel

    // MARK: - Environment
    @Environment(LiveTVViewModel.self) private var viewModel

    // MARK: - Body
    var body: some View {
        Button(action: {
            viewModel.selectChannel(channel)
        }, label: {
            VStack(spacing: 12) {
                // Logo de la chaîne
                CachedImage(url: URL(string: channel.streamIcon ?? "")) { phase in
                    switch phase {
                    case .empty:
                        Color.gray.opacity(0.3)
                            .overlay {
                                ProgressView()
                                    .tint(.secondary)
                            }
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                    case .failure:
                        Color.gray.opacity(0.3)
                            .overlay {
                                Image(systemName: "tv.fill")
                                    .font(.system(size: 40))
                                    .foregroundColor(.secondary)
                            }
                    @unknown default:
                        Color.gray.opacity(0.3)
                    }
                }
                .frame(width: 200, height: 120)
                .cornerRadius(12)
                .clipped()

                // Nom de la chaîne
                Text(channel.name)
                    .font(.system(size: 18, weight: .medium))
                    .foregroundColor(.primary)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                    .frame(width: 200)
            }
            .padding(16)
            .hoverEffect(.highlight)
        })
    }
}
