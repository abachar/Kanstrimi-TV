//
//  FilterManagementView.swift
//  Kanstrimi TV
//
//  Created on 2025-10-31.
//  Vue de gestion des filtres avec réorganisation et édition inline
//

import SwiftUI
import SwiftData

struct FilterManagementView: View {
    // MARK: - Environment
    @Environment(\.dismiss) private var dismiss
    @Environment(\.domainService) private var domainService

    // MARK: - Queries
    @Query(sort: \ContentFilter.priority) private var filters: [ContentFilter]

    // MARK: - State
    @State private var reorderModeFilterId: String?
    @State private var isApplying = false

    // MARK: - Body
    var body: some View {
        ZStack {
            Color.appBackground
                .ignoresSafeArea()

            VStack(alignment: .leading, spacing: 40) {
                // Header
                Text("Gestion des filtres")
                    .font(.largeTitle)
                    .fontWeight(.bold)

                // Liste des filtres
                ScrollView(.vertical, showsIndicators: true) {
                    if filters.isEmpty {
                        ContentUnavailableView {
                            Label("Aucun filtre", systemImage: "slider.horizontal.3")
                        } description: {
                            Text("Ajoutez un filtre pour commencer")
                        }
                        .frame(height: 400)
                    } else {
                        LazyVStack(spacing: 16) {
                            ForEach(Array(filters.enumerated()), id: \.element.id) { index, filter in
                                FilterEditableRowView(
                                    filter: filter,
                                    isReorderMode: reorderModeFilterId == filter.id,
                                    onDelete: {
                                        deleteFilter(filter)
                                    },
                                    onMoveUp: {
                                        moveFilter(at: index, direction: -1)
                                    },
                                    onMoveDown: {
                                        moveFilter(at: index, direction: 1)
                                    },
                                    canMoveUp: index > 0,
                                    canMoveDown: index < filters.count - 1
                                )
                                .onLongPressGesture {
                                    // Activer le mode réorganisation pour ce filtre
                                    if reorderModeFilterId == filter.id {
                                        reorderModeFilterId = nil
                                    } else {
                                        reorderModeFilterId = filter.id
                                    }
                                }
                            }
                        }
                    }
                }

                // Boutons d'action
                HStack(spacing: 30) {
                    Button("Ajouter un filtre") {
                        addNewFilter()
                    }

                    Spacer()

                    Button("Annuler", role: .cancel) {
                        dismiss()
                    }

                    Button(isApplying ? "Application..." : "Sauvegarder et appliquer") {
                        Task {
                            await saveAndApply()
                        }
                    }
                }
                .disabled(isApplying)
            }
        }
    }

    // MARK: - Actions
    private func addNewFilter() {
        // Créer un nouveau filtre avec une priorité maximale
        let newFilter = ContentFilter(
            text: "",
            isActive: true,
            isInclusive: true,
            priority: filters.count,
            applyToCategories: false,
            applyToLive: false,
            applyToMovies: false,
            applyToSeries: false
        )

        do {
            try domainService.saveFilter(newFilter)
        } catch {
            print("❌ Erreur lors de la création du filtre: \(error)")
        }
    }

    private func deleteFilter(_ filter: ContentFilter) {
        do {
            try domainService.deleteFilter(filter)
        } catch {
            print("❌ Erreur lors de la suppression du filtre: \(error)")
        }
    }

    private func moveFilter(at index: Int, direction: Int) {
        let newIndex = index + direction
        guard newIndex >= 0 && newIndex < filters.count else { return }

        var mutableFilters = filters
        let movedFilter = mutableFilters.remove(at: index)
        mutableFilters.insert(movedFilter, at: newIndex)

        // Mettre à jour les priorités
        for (idx, filter) in mutableFilters.enumerated() {
            filter.priority = idx
        }

        do {
            try domainService.reorderFilters(mutableFilters)
        } catch {
            print("❌ Erreur lors de la réorganisation des filtres: \(error)")
        }
    }

    private func saveAndApply() async {
        isApplying = true

        do {
            // Appliquer tous les filtres
            try await domainService.applyFilters()

            // Fermer la vue
            dismiss()
        } catch {
            print("❌ Erreur lors de l'application des filtres: \(error)")
        }

        isApplying = false
    }
}

// MARK: - Previews
#Preview("Avec plusieurs filtres") {
    let container = try! ModelContainer(
        for: ContentFilter.self,
        configurations: ModelConfiguration(isStoredInMemoryOnly: true)
    )

    let context = container.mainContext

    // Créer des filtres de test
    let filters = [
        ContentFilter(
            text: "BEIN",
            isActive: true,
            isInclusive: true,
            priority: 0,
            applyToCategories: true,
            applyToLive: true,
            applyToMovies: false,
            applyToSeries: false
        ),
        ContentFilter(
            text: "4K",
            isActive: true,
            isInclusive: true,
            priority: 1,
            applyToCategories: false,
            applyToLive: true,
            applyToMovies: true,
            applyToSeries: false
        ),
        ContentFilter(
            text: "XXX",
            isActive: true,
            isInclusive: false,
            priority: 2,
            applyToCategories: true,
            applyToLive: true,
            applyToMovies: true,
            applyToSeries: true
        ),
        ContentFilter(
            text: "HD",
            isActive: false,
            isInclusive: true,
            priority: 3,
            applyToCategories: false,
            applyToLive: true,
            applyToMovies: false,
            applyToSeries: false
        ),
        ContentFilter(
            text: "FR",
            isActive: true,
            isInclusive: true,
            priority: 4,
            applyToCategories: true,
            applyToLive: false,
            applyToMovies: true,
            applyToSeries: true
        )
    ]

    for filter in filters {
        context.insert(filter)
    }

    let mockDomainService = MockDomainService(container: container)

    return FilterManagementView()
        .modelContainer(container)
        .environment(\.domainService, mockDomainService)
}

#Preview("Liste vide") {
    let container = try! ModelContainer(
        for: ContentFilter.self,
        configurations: ModelConfiguration(isStoredInMemoryOnly: true)
    )

    let mockDomainService = MockDomainService(container: container)

    return FilterManagementView()
        .modelContainer(container)
        .environment(\.domainService, mockDomainService)
}

#Preview("Un seul filtre") {
    let container = try! ModelContainer(
        for: ContentFilter.self,
        configurations: ModelConfiguration(isStoredInMemoryOnly: true)
    )

    let context = container.mainContext

    let filter = ContentFilter(
        text: "SPORT",
        isActive: true,
        isInclusive: true,
        priority: 0,
        applyToCategories: true,
        applyToLive: true,
        applyToMovies: false,
        applyToSeries: false
    )
    context.insert(filter)

    let mockDomainService = MockDomainService(container: container)

    return FilterManagementView()
        .modelContainer(container)
        .environment(\.domainService, mockDomainService)
}

#Preview("Filtres mixtes (Inclure/Exclure)") {
    let container = try! ModelContainer(
        for: ContentFilter.self,
        configurations: ModelConfiguration(isStoredInMemoryOnly: true)
    )

    let context = container.mainContext

    let filters = [
        ContentFilter(
            text: "Catégories uniquement",
            isActive: true,
            isInclusive: true,
            priority: 0,
            applyToCategories: true,
            applyToLive: false,
            applyToMovies: false,
            applyToSeries: false
        ),
        ContentFilter(
            text: "Exclusion Live",
            isActive: true,
            isInclusive: false,
            priority: 1,
            applyToCategories: false,
            applyToLive: true,
            applyToMovies: false,
            applyToSeries: false
        ),
        ContentFilter(
            text: "Films et Séries",
            isActive: true,
            isInclusive: true,
            priority: 2,
            applyToCategories: false,
            applyToLive: false,
            applyToMovies: true,
            applyToSeries: true
        ),
        ContentFilter(
            text: "Désactivé",
            isActive: false,
            isInclusive: true,
            priority: 3,
            applyToCategories: true,
            applyToLive: false,
            applyToMovies: true,
            applyToSeries: true
        )
    ]

    for filter in filters {
        context.insert(filter)
    }

    let mockDomainService = MockDomainService(container: container)

    return FilterManagementView()
        .modelContainer(container)
        .environment(\.domainService, mockDomainService)
}
