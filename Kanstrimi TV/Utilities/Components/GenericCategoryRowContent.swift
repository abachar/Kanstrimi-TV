//
//  GenericCategoryRowContent.swift
//  Kanstrimi TV
//
//  Created on 2025-10-28.
//  Composant générique pour afficher une ligne de catégorie
//

import SwiftUI

/// Composant d'affichage générique pour une ligne de catégorie
///
/// Ne gère PAS les @Query (qui doivent rester dans les composants spécifiques)
/// mais factorie l'affichage du header et de la liste horizontale
struct GenericCategoryRowContent<T: Identifiable, CardView: View>: View {
    // MARK: - Properties

    let categoryName: String
    let items: [T]
    let cardBuilder: (T) -> CardView

    // MARK: - Body

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            // Header : Nom de la catégorie + Badge count
            headerView

            // Liste horizontale scrollable
            scrollableContent
        }
        .padding(.bottom, 20)
    }

    // MARK: - Subviews

    private var headerView: some View {
        HStack(spacing: 12) {
            Text(categoryName)
                .font(.system(size: 32, weight: .semibold))
                .foregroundColor(.primary)

            Text("\(items.count)")
                .font(.system(size: 20, weight: .medium))
                .foregroundColor(.secondary)
                .padding(.horizontal, 16)
                .padding(.vertical, 6)
                .background(
                    Capsule()
                        .fill(Color.gray.opacity(0.3))
                )
        }
        .padding(.leading, 60)
    }

    private var scrollableContent: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(spacing: 40) {
                ForEach(items) { item in
                    cardBuilder(item)
                }
            }
            .padding(.vertical, 20)
            .padding(.horizontal, 60)
        }
    }
}
