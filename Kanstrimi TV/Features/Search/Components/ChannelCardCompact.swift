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
    @FocusState.Binding var focusedChannelId: String?

    private var isFocused: Bool {
        focusedChannelId == channel.id
    }

    // MARK: - Body
    var body: some View {
        VStack(spacing: 8) {
            // Logo de la chaîne
            AsyncImage(url: URL(string: channel.streamIcon ?? "")) { phase in
                switch phase {
                case .empty:
                    Color.kanCardBackground
                        .overlay {
                            ProgressView()
                                .tint(.kanTextSecondary)
                        }
                case .success(let image):
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                case .failure:
                    Color.kanCardBackground
                        .overlay {
                            Image(systemName: "tv.fill")
                                .font(.system(size: 30))
                                .foregroundColor(.kanTextSecondary)
                        }
                @unknown default:
                    Color.kanCardBackground
                }
            }
            .frame(width: 140, height: 90)
            .cornerRadius(10)

            // Nom de la chaîne
            Text(channel.name)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(isFocused ? .kanTextPrimary : .kanTextSecondary)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .frame(width: 140, height: 36)
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(isFocused ? Color.kanCardBackground : Color.clear)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(isFocused ? Color.kanHighlight : Color.clear, lineWidth: 3)
        )
        .scaleEffect(isFocused ? 1.08 : 1.0)
        .animation(.easeInOut(duration: 0.2), value: isFocused)
        .focusable()
        .focused($focusedChannelId, equals: channel.id)
    }
}

// MARK: - Preview
#Preview {
    @Previewable @FocusState var focusedChannelId: String?

    let sampleChannel = LiveChannel(
        streamId: 1,
        name: "TF1 HD",
        streamURL: "http://example.com/stream",
        categoryId: "1",
        sortOrder: 0,
        streamIcon: "https://via.placeholder.com/140x90"
    )

    ChannelCardCompact(channel: sampleChannel, focusedChannelId: $focusedChannelId)
        .background(Color.kanBackground)
}
