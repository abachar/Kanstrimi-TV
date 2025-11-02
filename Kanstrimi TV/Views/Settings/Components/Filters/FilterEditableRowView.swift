//
//  FilterEditableRowView.swift
//  Kanstrimi TV
//
//  Created on 2025-10-31.
//  Ligne de filtre entièrement éditable
//  Refactorisée le 2025-11-01 : utilise EditableFilter au lieu de ContentFilter
//

import SwiftUI

struct FilterEditableRowView: View {
    // MARK: - Properties
    @Binding var filter: EditableFilter
    let isReorderMode: Bool
    let onDelete: () -> Void
    let onMoveUp: () -> Void
    let onMoveDown: () -> Void
    let canMoveUp: Bool
    let canMoveDown: Bool

    // MARK: - Body
    var body: some View {
        HStack(spacing: 30) {
            // Boutons de réorganisation
            if isReorderMode {
                VStack(spacing: 8) {
                    Button {
                        onMoveUp()
                    } label: {
                        Image(systemName: "arrow.up")
                    }
                    .disabled(!canMoveUp)
                    .opacity(canMoveUp ? 1 : 0.3)

                    Button {
                        onMoveDown()
                    } label: {
                        Image(systemName: "arrow.down")
                    }
                    .disabled(!canMoveDown)
                    .opacity(canMoveDown ? 1 : 0.3)
                }
            }

            // Actif
            VStack(alignment: .leading, spacing: 4) {
                Text("Actif")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Toggle("", isOn: $filter.isActive)
                    .toggleStyle(.switch)
                    .labelsHidden()
            }
            .frame(width: 100)

            // Texte du filtre
            VStack(alignment: .leading, spacing: 4) {
                Text("Rechercher")
                    .font(.caption)
                    .foregroundColor(.secondary)
                TextField("Texte du filtre", text: $filter.text)
            }
            .frame(maxWidth: .infinity)

            // Mode inclusion/exclusion
            VStack(alignment: .leading, spacing: 4) {
                Text("Mode")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Button(filter.isInclusive ? "Inclure" : "Exclure") {
                    filter.isInclusive.toggle()
                }
                .tint(filter.isInclusive ? .green : .red)
            }
            .frame(width: 160)

            // Appliquer à
            VStack(alignment: .leading, spacing: 4) {
                Text("Appliquer à")
                    .font(.caption)
                    .foregroundColor(.secondary)

                HStack(spacing: 12) {
                    Button("Live") {
                        filter.applyToLive.toggle()
                    }
                    .tint(filter.applyToLive ? .blue : .gray)
                    .help("Applique sur les chaînes Live et leurs catégories")

                    Button("Films") {
                        filter.applyToMovies.toggle()
                    }
                    .tint(filter.applyToMovies ? .blue : .gray)
                    .help("Applique sur les films VOD et leurs catégories")

                    Button("Séries") {
                        filter.applyToSeries.toggle()
                    }
                    .tint(filter.applyToSeries ? .blue : .gray)
                    .help("Applique sur les séries TV et leurs catégories")
                }
            }
            
            // Bouton suppression
            VStack(alignment: .leading, spacing: 4) {
                Text("Supprimer")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Button("Supprimer", systemImage: "trash", role: .destructive) {
                    onDelete()
                }
                .labelStyle(.iconOnly)
            }
        }
        .padding()
        .background(Color.gray.opacity(0.2))
        .cornerRadius(12)
    }
}
