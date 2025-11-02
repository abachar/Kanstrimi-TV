//
//  FilterManagementView.swift
//  Kanstrimi TV
//
//  Created on 2025-10-31.
//  Vue de gestion des filtres avec réorganisation et édition inline
//  Refactorisée le 2025-11-01 : copy-on-load pattern avec EditableFilter
//

import SwiftUI
import SwiftData

struct FilterManagementView: View {
    // MARK: - Environment
    @Environment(\.dismiss) private var dismiss
    @Environment(\.domainService) private var domainService

    // MARK: - Queries (lecture seule pour chargement initial)
    @Query(sort: \ContentFilter.priority) private var persistedFilters: [ContentFilter]

    // MARK: - State (édition en mémoire)
    @State private var editableFilters: [EditableFilter] = []
    @State private var reorderModeFilterId: String?
    @State private var isApplying = false
    @State private var hasLoadedFilters = false

    // MARK: - Body
    var body: some View {
        ZStack {
            Color.appBackground
                .ignoresSafeArea()

            VStack(alignment: .leading, spacing: 40) {
                // Header
                VStack(alignment: .leading, spacing: 12) {
                    Text("Gestion des filtres")
                        .font(.largeTitle)
                        .fontWeight(.bold)

                    // Message d'aide
                    Text("💡 Les types de contenu sans filtres afficheront tous leurs éléments par défaut")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                // Liste des filtres
                ScrollView(.vertical, showsIndicators: true) {
                    if editableFilters.isEmpty {
                        ContentUnavailableView {
                            Label("Aucun filtre", systemImage: "slider.horizontal.3")
                        } description: {
                            Text("Ajoutez un filtre pour commencer")
                        }
                        .frame(height: 400)
                    } else {
                        LazyVStack(spacing: 30) {
                            ForEach(Array(editableFilters.enumerated()), id: \.element.id) { index, filter in
                                FilterEditableRowView(
                                    filter: binding(for: filter),
                                    isReorderMode: reorderModeFilterId == filter.id,
                                    onDelete: {
                                        deleteFilter(at: index)
                                    },
                                    onMoveUp: {
                                        moveFilter(at: index, direction: -1)
                                    },
                                    onMoveDown: {
                                        moveFilter(at: index, direction: 1)
                                    },
                                    canMoveUp: index > 0,
                                    canMoveDown: index < editableFilters.count - 1
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
        .onAppear {
            loadFiltersIfNeeded()
        }
    }

    // MARK: - Helper
    private func binding(for filter: EditableFilter) -> Binding<EditableFilter> {
        guard let index = editableFilters.firstIndex(where: { $0.id == filter.id }) else {
            fatalError("Filter not found in editableFilters")
        }
        return $editableFilters[index]
    }

    // MARK: - Actions
    private func loadFiltersIfNeeded() {
        guard !hasLoadedFilters else { return }
        editableFilters = persistedFilters.map { EditableFilter(from: $0) }
        hasLoadedFilters = true
    }

    private func addNewFilter() {
        // Créer un nouveau filtre avec priorité à la fin
        var newFilter = EditableFilter()
        newFilter.priority = editableFilters.count
        editableFilters.append(newFilter)
    }

    private func deleteFilter(at index: Int) {
        editableFilters.remove(at: index)
        // Réassigner les priorités
        for (idx, _) in editableFilters.enumerated() {
            editableFilters[idx].priority = idx
        }
    }

    private func moveFilter(at index: Int, direction: Int) {
        let newIndex = index + direction
        guard newIndex >= 0 && newIndex < editableFilters.count else { return }

        let movedFilter = editableFilters.remove(at: index)
        editableFilters.insert(movedFilter, at: newIndex)

        // Mettre à jour les priorités
        for (idx, _) in editableFilters.enumerated() {
            editableFilters[idx].priority = idx
        }
    }

    private func saveAndApply() async {
        isApplying = true

        do {
            // 1. Supprimer tous les filtres existants
            try domainService.deleteAllFilters()

            // 2. Créer et sauvegarder les nouveaux filtres
            for editableFilter in editableFilters {
                let contentFilter = editableFilter.toContentFilter()
                try domainService.saveFilter(contentFilter)
            }

            // 3. Appliquer les filtres
            try await domainService.applyFilters()

            // 4. Fermer la vue
            dismiss()
        } catch {
            print("❌ Erreur lors de la sauvegarde et application des filtres: \(error)")
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
            applyToLive: true,
            applyToMovies: false,
            applyToSeries: false
        ),
        ContentFilter(
            text: "4K",
            isActive: true,
            isInclusive: true,
            priority: 1,
            applyToLive: true,
            applyToMovies: true,
            applyToSeries: false
        ),
        ContentFilter(
            text: "XXX",
            isActive: true,
            isInclusive: false,
            priority: 2,
            applyToLive: true,
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
            text: "Inclusion Live",
            isActive: true,
            isInclusive: true,
            priority: 0,
            applyToLive: true,
            applyToMovies: false,
            applyToSeries: false
        ),
        ContentFilter(
            text: "Exclusion Live",
            isActive: true,
            isInclusive: false,
            priority: 1,
            applyToLive: true,
            applyToMovies: false,
            applyToSeries: false
        ),
        ContentFilter(
            text: "Films et Séries",
            isActive: true,
            isInclusive: true,
            priority: 2,
            applyToLive: false,
            applyToMovies: true,
            applyToSeries: true
        ),
        ContentFilter(
            text: "Désactivé",
            isActive: false,
            isInclusive: true,
            priority: 3,
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
