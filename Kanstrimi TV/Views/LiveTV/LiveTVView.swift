//
//  LiveTVView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftData
import SwiftUI

struct LiveTVView: View {
    // MARK: - SwiftData Queries
    @Query private var liveCategories: [Category]
    @Query private var channels: [LiveChannel]

    // MARK: - Navigation ViewModel
    @State private var navigationViewModel = LiveTVNavigationViewModel()

    init() {
        let liveType = Category.ContentType.live
        let predicate = #Predicate<Category> { category in
            category.contentType == liveType
        }
        let descriptor = FetchDescriptor<Category>(
            predicate: predicate,
            sortBy: [SortDescriptor(\.sortOrder)]
        )
        _liveCategories = Query(descriptor)
    }

    // MARK: - Body
    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            if liveCategories.isEmpty {
                // État vide
                ContentUnavailableView {
                    Label("TV en direct", systemImage: "tv.slash")
                } description: {
                    Text("Aucune chaîne disponible")
                }
            } else {
                // Liste des catégories avec chaînes
                LazyVStack(spacing: 30) {
                    ForEach(liveCategories) { category in
                        LiveCategoryRow(liveCategory: category)
                    }
                }
                .padding(.top, 40)
                .padding(.bottom, 60)
            }
        }
        .ignoresSafeArea(.container, edges: [.horizontal])
        .environment(navigationViewModel)
        .onPlayPauseDoubleTap {
            navigationViewModel.navigateToSearch()
        }
        .fullScreenCover(item: Binding(
            get: {
                // Retourner l'état courant (nil = écran principal)
                navigationViewModel.currentState
            },
            set: { newValue in
                if newValue == nil {
                    navigationViewModel.goBack()
                }
            }
        )) { state in
            navigationDestination(for: state)
        }
        .onChange(of: navigationViewModel.selectedChannel) { _, newChannel in
            if let channel = newChannel {
                navigationViewModel.navigateToPlayer(content: .liveChannel(channel))
                navigationViewModel.selectedChannel = nil  // Reset selection
            }
        }
    }

    // MARK: - Navigation Destination
    @ViewBuilder
    private func navigationDestination(for state: LiveTVNavigationState) -> some View {
        switch state {
        case .search:
            SearchLiveTV()
                .environment(navigationViewModel)

        case .player(let content):
            MediaPlayerView(content: content)
        }
    }
}

/*
#Preview {
    let container = try! ModelContainer(
        for: Category.self, LiveChannel.self,
        configurations: ModelConfiguration(isStoredInMemoryOnly: true)
    )

    let context = container.mainContext

    // Insérer les catégories de preview
    for category in Category.previewLiveCategories {
        context.insert(category)
    }

    // Insérer les chaînes de preview
    for channel in LiveChannel.previewChannels {
        context.insert(channel)
    }

    // Créer le MockDomainService
    let mockDomainService = MockDomainService(container: container)

    return LiveTVView()
        .modelContainer(container)
        .environment(\.domainService, mockDomainService)
}
*/
