//
//  ChannelCardCompact.swift
//  Kanstrimi TV
//
//  Created by Claude on 26/10/2025.
//

import SwiftUI

/// Carte compacte représentant une chaîne TV en direct (pour SearchView)
///
/// Version réduite de ChannelCard avec:
/// - Logo 140x90 (au lieu de 200x120)
/// - Texte 14pt (au lieu de 18pt)
/// - Padding 12 (au lieu de 16)
/// - Scale effect 1.08 au focus (au lieu de 1.05)
struct ChannelCardCompact: View {
    // MARK: - Properties
    let channel: LiveChannel


    // MARK: - Body
    var body: some View {
        VStack(spacing: 8) {
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
                                .font(.system(size: 30))
                                .foregroundColor(.secondary)
                        }
                @unknown default:
                    Color.gray.opacity(0.3)
                }
            }
            .frame(width: 140, height: 90)
            .cornerRadius(10)
            .clipped()

            // Nom de la chaîne
            Text(channel.name)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(.primary)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .frame(width: 140, height: 36)
        }
        .padding(12)
        .hoverEffect(.highlight)
    }
}

// MARK: - Preview
#Preview {
    let sampleChannel = LiveChannel(
        streamId: 1,
        name: "TF1 HD",
        streamURL: "http://example.com/stream",
        categoryId: "1",
        sortOrder: 0,
        streamIcon: "https://via.placeholder.com/140x90"
    )

    ChannelCardCompact(channel: sampleChannel)
        .background(Color.black)
}
