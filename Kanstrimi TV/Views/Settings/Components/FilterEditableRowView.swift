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
    let filter: ContentFilter
    let isReorderMode: Bool
    let onDelete: () -> Void
    let onMoveUp: () -> Void
    let onMoveDown: () -> Void
    let canMoveUp: Bool
    let canMoveDown: Bool

    // MARK: - State
    @State private var editedText: String = ""

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
                get: { filter.isActive },
                set: { filter.isActive = $0 }
            ))
            .toggleStyle(.switch)
            .labelsHidden()
            
            // TextField pour le texte
            TextField("Texte du filtre", text: $editedText)
                .onAppear {
                    editedText = filter.text
                }
                .onChange(of: editedText) { _, newValue in
                    filter.text = newValue
                }
            
            Button(filter.isInclusive ? "Inclure" : "Exclure") {
                filter.isInclusive.toggle()
            }
            .tint(filter.isInclusive ? .green : .red)

            // ControlGroup {
                Button("Cat") {
                    filter.applyToCategories.toggle()
                }
                .tint(filter.applyToCategories ? .blue : .gray)

                Button("Live") {
                    filter.applyToLive.toggle()
                }
                .tint(filter.applyToLive ? .purple : .gray)

                Button("Films") {
                    filter.applyToMovies.toggle()
                }
                .tint(filter.applyToMovies ? .orange : .gray)

                Button("Séries") {
                    filter.applyToSeries.toggle()
                }
                .tint(filter.applyToSeries ? .pink : .gray)
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
