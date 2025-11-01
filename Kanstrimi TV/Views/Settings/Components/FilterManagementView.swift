//
//  FilterManagementView.swift
//  Kanstrimi TV
//
//  Created on 2025-10-31.
//  Vue de gestion des filtres avec réorganisation et édition inline
//

import SwiftUI
import SwiftData

/// État temporaire pour édition d'un filtre sans sauvegarde automatique
struct FilterEditState: Identifiable {
    let id: String
    var text: String
    var isActive: Bool
    var isInclusive: Bool
    var priority: Int
    var applyToCategories: Bool
    var applyToLive: Bool
    var applyToMovies: Bool
    var applyToSeries: Bool

    init(from filter: ContentFilter) {
        self.id = filter.id
        self.text = filter.text
        self.isActive = filter.isActive
        self.isInclusive = filter.isInclusive
        self.priority = filter.priority
        self.applyToCategories = filter.applyToCategories
        self.applyToLive = filter.applyToLive
        self.applyToMovies = filter.applyToMovies
        self.applyToSeries = filter.applyToSeries
    }

    func applyTo(_ filter: ContentFilter) {
        filter.text = text
        filter.isActive = isActive
        filter.isInclusive = isInclusive
        filter.priority = priority
        filter.applyToCategories = applyToCategories
        filter.applyToLive = applyToLive
        filter.applyToMovies = applyToMovies
        filter.applyToSeries = applyToSeries
    }
}

struct FilterManagementView: View {
    // MARK: - Environment
    @Environment(\.dismiss) private var dismiss
    @Environment(\.domainService) private var domainService
    @Environment(\.modelContext) private var modelContext

    // MARK: - Queries
    @Query(sort: \ContentFilter.priority) private var filters: [ContentFilter]

    // MARK: - State
    @State private var editStates: [FilterEditState] = []
    @State private var reorderModeFilterId: String?
    @State private var isApplying = false
    @State private var hasUnsavedChanges = false

    // MARK: - Body
    var body: some View {
        ZStack {
            Color.appBackground
                .ignoresSafeArea()

            VStack(alignment: .leading, spacing: 40) {
                // Header
                HStack {
                    Text("Gestion des filtres")
                        .font(.largeTitle)
                        .fontWeight(.bold)

                    if hasUnsavedChanges {
                        Text("(modifications non sauvegardées)")
                            .font(.caption)
                            .foregroundColor(.orange)
                    }
                }

                // Liste des filtres
                ScrollView(.vertical, showsIndicators: true) {
                    if editStates.isEmpty {
                        ContentUnavailableView {
                            Label("Aucun filtre", systemImage: "slider.horizontal.3")
                        } description: {
                            Text("Ajoutez un filtre pour commencer")
                        }
                        .frame(height: 400)
                    } else {
                        LazyVStack(spacing: 16) {
                            ForEach(Array(editStates.enumerated()), id: \.element.id) { index, _ in
                                FilterEditableRowView(
                                    editState: $editStates[index],
                                    isReorderMode: reorderModeFilterId == editStates[index].id,
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
                                    canMoveDown: index < editStates.count - 1,
                                    onChange: {
                                        hasUnsavedChanges = true
                                    }
                                )
                                .onLongPressGesture {
                                    // Activer le mode réorganisation pour ce filtre
                                    if reorderModeFilterId == editStates[index].id {
                                        reorderModeFilterId = nil
                                    } else {
                                        reorderModeFilterId = editStates[index].id
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
                    .disabled(!hasUnsavedChanges)
                }
                .disabled(isApplying)
            }
        }
        .onAppear {
            loadEditStates()
        }
    }

    // MARK: - Actions
    private func loadEditStates() {
        editStates = filters.map { FilterEditState(from: $0) }
    }

    private func addNewFilter() {
        let newEditState = FilterEditState(
            from: ContentFilter(
                text: "",
                isActive: true,
                isInclusive: true,
                priority: editStates.count,
                applyToCategories: false,
                applyToLive: false,
                applyToMovies: false,
                applyToSeries: false
            )
        )
        editStates.append(newEditState)
        hasUnsavedChanges = true
    }

    private func deleteFilter(at index: Int) {
        editStates.remove(at: index)
        // Réajuster les priorités
        for (idx, _) in editStates.enumerated() {
            editStates[idx].priority = idx
        }
        hasUnsavedChanges = true
    }

    private func moveFilter(at index: Int, direction: Int) {
        let newIndex = index + direction
        guard newIndex >= 0 && newIndex < editStates.count else { return }

        let movedState = editStates.remove(at: index)
        editStates.insert(movedState, at: newIndex)

        // Mettre à jour les priorités
        for (idx, _) in editStates.enumerated() {
            editStates[idx].priority = idx
        }
        hasUnsavedChanges = true
    }

    private func saveAndApply() async {
        isApplying = true

        do {
            // Synchroniser les états avec les filtres réels
            // 1. Supprimer les filtres qui n'existent plus
            let editStateIds = Set(editStates.map { $0.id })
            for filter in filters where !editStateIds.contains(filter.id) {
                try domainService.deleteFilter(filter)
            }

            // 2. Créer ou mettre à jour les filtres
            for editState in editStates {
                if let existingFilter = filters.first(where: { $0.id == editState.id }) {
                    // Mise à jour
                    editState.applyTo(existingFilter)
                } else {
                    // Création
                    let newFilter = ContentFilter(
                        text: editState.text,
                        isActive: editState.isActive,
                        isInclusive: editState.isInclusive,
                        priority: editState.priority,
                        applyToCategories: editState.applyToCategories,
                        applyToLive: editState.applyToLive,
                        applyToMovies: editState.applyToMovies,
                        applyToSeries: editState.applyToSeries
                    )
                    try domainService.saveFilter(newFilter)
                }
            }

            // 3. Appliquer tous les filtres
            try await domainService.applyFilters()

            hasUnsavedChanges = false

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
