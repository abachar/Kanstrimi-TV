//
//  CastMemberCard.swift
//  Kanstrimi TV
//
//  Created on 2025-10-27.
//

import SwiftUI

/// Carte compacte affichant un acteur avec son image
struct CastMemberCard: View {
    // MARK: - Properties
    let name: String
    let character: String?
    let imageURL: String?
    @FocusState.Binding var focusedCastId: String?

    private var cardId: String {
        name
    }

    private var isFocused: Bool {
        focusedCastId == cardId
    }

    // MARK: - Body
    var body: some View {
        VStack(spacing: 8) {
            // Image de l'acteur
            AsyncImage(url: URL(string: imageURL ?? "")) { phase in
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
                        .aspectRatio(contentMode: .fill)
                case .failure:
                    Color.gray.opacity(0.3)
                        .overlay {
                            Image(systemName: "person.fill")
                                .font(.system(size: 30))
                                .foregroundColor(.secondary)
                        }
                @unknown default:
                    Color.gray.opacity(0.3)
                }
            }
            .frame(width: 120, height: 180)
            .cornerRadius(8)
            .clipped()

            // Nom de l'acteur
            Text(name)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(isFocused ? .primary : .secondary)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .frame(width: 120, height: 36)

            // Nom du personnage (optionnel)
            if let character = character {
                Text(character)
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                    .frame(width: 120)
            }
        }
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(isFocused ? Color.gray.opacity(0.3) : Color.clear)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(isFocused ? Color.blue : Color.clear, lineWidth: 2)
        )
        .scaleEffect(isFocused ? 1.05 : 1.0)
        .animation(.easeInOut(duration: 0.2), value: isFocused)
        .focusable()
        .focused($focusedCastId, equals: cardId)
    }
}
