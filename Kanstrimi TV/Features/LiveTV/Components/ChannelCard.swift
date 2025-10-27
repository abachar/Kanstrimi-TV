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
    @FocusState.Binding var focusedChannelId: String?
    @Binding var selectedChannel: LiveChannel?

    private var isFocused: Bool {
        focusedChannelId == channel.id
    }

    // MARK: - Body
    var body: some View {
        VStack(spacing: 12) {
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
                                .font(.system(size: 40))
                                .foregroundColor(.kanTextSecondary)
                        }
                @unknown default:
                    Color.kanCardBackground
                }
            }
            .frame(width: 200, height: 120)
            .cornerRadius(12)

            // Nom de la chaîne
            Text(channel.name)
                .font(.system(size: 18, weight: .medium))
                .foregroundColor(isFocused ? .kanTextPrimary : .kanTextSecondary)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .frame(width: 200)
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(isFocused ? Color.kanCardBackground : Color.clear)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(isFocused ? Color.kanHighlight : Color.clear, lineWidth: 3)
        )
        .scaleEffect(isFocused ? 1.05 : 1.0)
        .animation(.easeInOut(duration: 0.2), value: isFocused)
        .focusable()
        .focused($focusedChannelId, equals: channel.id)
        .onTapGesture {
            selectedChannel = channel
        }
    }
}

// MARK: - Preview
#Preview {
    @Previewable @FocusState var focusedChannelId: String?
    @Previewable @State var selectedChannel: LiveChannel?

    let sampleChannel = LiveChannel(
        streamId: 1,
        name: "TF1 HD",
        streamURL: "http://example.com/stream",
        categoryId: "1",
        sortOrder: 0,
        streamIcon: "https://via.placeholder.com/200x120"
    )

    ChannelCard(
        channel: sampleChannel,
        focusedChannelId: $focusedChannelId,
        selectedChannel: $selectedChannel
    )
    .background(Color.kanBackground)
}
