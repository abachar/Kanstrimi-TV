//
//  AppStore.swift
//  Kanstrimi TV
//
//  Created on 2025-11-02.
//  Store racine de l'application, contenant tous les sous-stores
//

import Foundation
import SwiftData

/// Store racine de l'application avec architecture @Observable
///
/// Remplace progressivement l'approche @Query par des stores observables
/// pour résoudre les problèmes de réactivité et de performance.
@Observable
@MainActor
final class AppStore {
    // MARK: - Services (injectés une seule fois)

    let storageService: StorageService
    private let movieService: MovieService
    private let seriesService: SeriesService
    private let categoryService: CategoryService
    private let liveChannelService: LiveChannelService
    private let accountService: AccountService

    // MARK: - Sous-stores (features)

    /// Store gérant l'état des films
    let moviesStore: MoviesStore

    // TODO: Ajouter les autres stores au fur et à mesure de la migration
    // let seriesStore: SeriesStore
    // let liveTVStore: LiveTVStore
    // let filtersStore: FiltersStore
    // let accountStore: AccountStore

    // MARK: - État global partagé

    var isAppReady: Bool = false
    var currentAccount: Account?

    // MARK: - Initialisation

    init() {
        // 1. Créer le StorageService (SwiftData)
        self.storageService = StorageService()

        // 2. Créer les services métier
        self.movieService = MovieService(storageService: storageService)
        self.seriesService = SeriesService(storageService: storageService)
        self.categoryService = CategoryService(storageService: storageService)
        self.liveChannelService = LiveChannelService(storageService: storageService)

        self.accountService = AccountService(
            storageService: storageService,
            categoryService: categoryService,
            liveChannelService: liveChannelService,
            movieService: movieService,
            seriesService: seriesService
        )

        // 3. Créer les stores features
        self.moviesStore = MoviesStore(
            storageService: storageService,
            movieService: movieService
        )

        // TODO: Initialiser les autres stores
        // self.seriesStore = SeriesStore(...)
        // self.liveTVStore = LiveTVStore(...)
        // self.filtersStore = FiltersStore(...)
        // self.accountStore = AccountStore(...)
    }

    /// Initialisation avec un StorageService personnalisé (pour les tests/previews)
    init(storageService: StorageService) {
        // 1. Utiliser le StorageService fourni
        self.storageService = storageService

        // 2. Créer les services métier avec ce StorageService
        self.movieService = MovieService(storageService: storageService)
        self.seriesService = SeriesService(storageService: storageService)
        self.categoryService = CategoryService(storageService: storageService)
        self.liveChannelService = LiveChannelService(storageService: storageService)

        self.accountService = AccountService(
            storageService: storageService,
            categoryService: categoryService,
            liveChannelService: liveChannelService,
            movieService: movieService,
            seriesService: seriesService
        )

        // 3. Créer les stores features
        self.moviesStore = MoviesStore(
            storageService: storageService,
            movieService: movieService
        )
    }

    // MARK: - Actions globales

    /// Initialise l'application au démarrage
    func initialize() async {
        // Charger le compte
        let accountDescriptor = FetchDescriptor<Account>()
        currentAccount = try? storageService.fetchOne(accountDescriptor)

        // Si compte existe, charger les données
        if currentAccount != nil {
            await loadAllData()
        }

        isAppReady = true
    }

    /// Charge toutes les données de l'app
    private func loadAllData() async {
        // Pour l'instant, charger seulement les films
        await moviesStore.loadAll()

        // TODO: Charger les autres features au fur et à mesure
        // async let moviesLoad = moviesStore.loadAll()
        // async let seriesLoad = seriesStore.loadAll()
        // async let liveTVLoad = liveTVStore.loadAll()
        //
        // await moviesLoad
        // await seriesLoad
        // await liveTVLoad
    }

    /// Rafraîchit toutes les données depuis l'API
    func refreshAll() async {
        guard let account = currentAccount else { return }

        do {
            // Sync API
            try await accountService.refreshAccount(account: account) { step in
                print("Sync step: \(step)")
            }

            // Recharger en mémoire
            await loadAllData()
        } catch {
            print("❌ AppStore: Erreur lors du refresh - \(error)")
        }
    }
}
