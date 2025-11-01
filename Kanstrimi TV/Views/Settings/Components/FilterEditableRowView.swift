//
//  FilterEditableRowView.swift
//  Kanstrimi TV
//
//  Created on 2025-10-31.
//  Ligne de filtre entièrement éditable
//

import SwiftUI

struct FilterEditableRowView: View {
    // MARK: - Properties
    @Binding var editState: FilterEditState
    let isReorderMode: Bool
    let onDelete: () -> Void
    let onMoveUp: () -> Void
    let onMoveDown: () -> Void
    let canMoveUp: Bool
    let canMoveDown: Bool
    let onChange: () -> Void

    // MARK: - Body
    var body: some View {
        HStack(spacing: 20) {
            if isReorderMode {
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

            // Toggle activation
            Toggle("", isOn: Binding(
                get: { editState.isActive },
                set: {
                    editState.isActive = $0
                    onChange()
                }
            ))
            .toggleStyle(.switch)
            .labelsHidden()

            // TextField pour le texte
            TextField("Texte du filtre", text: Binding(
                get: { editState.text },
                set: {
                    editState.text = $0
                    onChange()
                }
            ))

            Button(editState.isInclusive ? "Inclure" : "Exclure") {
                editState.isInclusive.toggle()
                onChange()
            }
            .tint(editState.isInclusive ? .green : .red)

            // ControlGroup {
                Button("Cat") {
                    editState.applyToCategories.toggle()
                    onChange()
                }
                .tint(editState.applyToCategories ? .blue : .gray)

                Button("Live") {
                    editState.applyToLive.toggle()
                    onChange()
                }
                .tint(editState.applyToLive ? .purple : .gray)

                Button("Films") {
                    editState.applyToMovies.toggle()
                    onChange()
                }
                .tint(editState.applyToMovies ? .orange : .gray)

                Button("Séries") {
                    editState.applyToSeries.toggle()
                    onChange()
                }
                .tint(editState.applyToSeries ? .pink : .gray)
            //}
            //.padding()

            Button("Supprimer", systemImage: "trash", role: .destructive) {
                onDelete()
            }
            .labelStyle(.iconOnly)
        }
        .padding()
        .background(Color.gray.opacity(0.2))
        .cornerRadius(12)
    }
}
