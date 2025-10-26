//
//  AccountService.swift
//  Kanstrimi TV
//
//  Created on 2025-10-26.
//  Service gérant la logique métier des comptes (création, mise à jour, synchronisation)
//

import Foundation
import SwiftData

/// Service singleton gérant la logique métier des comptes Xtream
final class AccountService {
    /// Instance partagée (singleton)
    static let shared = AccountService()

    /// Initialisation privée (singleton)
    private init() {}

    // MARK: - Create Account

    /// Crée et synchronise un nouveau compte
    /// - Parameters:
    ///   - name: Nom du compte
    ///   - serverURL: URL du serveur
    ///   - username: Nom d'utilisateur
    ///   - password: Mot de passe
    ///   - modelContext: Contexte SwiftData
    ///   - onStepChange: Callback appelé à chaque changement d'étape
    /// - Returns: Le compte créé et validé
    /// - Throws: XtreamError si la validation échoue
    func createAccount(
        name: String,
        serverURL: String,
        username: String,
        password: String,
        modelContext: ModelContext,
        onStepChange: @escaping (SyncStep) -> Void
    ) async throws -> Account {

        // 1. Créer l'objet Account (sans insert dans le contexte)
        let account = Account(
            name: name,
            serverURL: serverURL,
            username: username,
            password: password
        )

        // 2. Valider les credentials via XtreamService
        let accountInfo = try await XtreamService.shared.getAccountInfo(account: account)

        // Vérifier que l'authentification est valide
        guard accountInfo.userInfo?.auth == 1 else {
            throw XtreamError.invalidCredentials
        }

        // 3. Synchroniser les données (appels API et sauvegarde dans SwiftData)
        await syncAccount(account: account, modelContext: modelContext, onStepChange: onStepChange)

        // 4. Mettre à jour la date de dernière synchronisation
        account.lastSyncDate = Date()

        // 5. Sauvegarder dans SwiftData
        modelContext.insert(account)
        try modelContext.save()

        return account
    }

    // MARK: - Sync Account

    /// Synchronise les données d'un compte (appels API et sauvegarde dans SwiftData)
    /// - Parameters:
    ///   - account: Compte à synchroniser
    ///   - modelContext: Contexte SwiftData pour persister les données
    ///   - onStepChange: Callback appelé à chaque changement d'étape
    private func syncAccount(
        account: Account,
        modelContext: ModelContext,
        onStepChange: @escaping (SyncStep) -> Void
    ) async {

        // Étape 1 : Synchronisation des chaînes live
        onStepChange(.liveChannels)

        do {
            // Récupérer les catégories Live TV
            let categoryResponses = try await XtreamService.shared.getLiveCategories(account: account)

            // Mapper vers Category et insérer dans SwiftData
            for (index, response) in categoryResponses.enumerated() {
                let category = Category(
                    categoryId: response.categoryId,
                    name: response.categoryName,
                    sortOrder: index
                )
                modelContext.insert(category)
            }

            // Récupérer les chaînes Live TV
            let channelResponses = try await XtreamService.shared.getLiveStreams(account: account)

            // Mapper vers LiveChannel et insérer dans SwiftData
            for (index, response) in channelResponses.enumerated() {
                let streamURL = XtreamURLBuilder.buildLiveStreamURL(account: account, streamId: response.streamId)

                let channel = LiveChannel(
                    streamId: response.streamId,
                    name: response.name,
                    streamURL: streamURL,
                    categoryId: response.categoryId,
                    sortOrder: index,
                    streamIcon: response.streamIcon,
                    epgChannelId: response.epgChannelId,
                    added: response.added
                )
                modelContext.insert(channel)
            }

            // Sauvegarder les données Live TV
            try modelContext.save()
        } catch {
            // Log l'erreur mais continue la synchronisation
            print("⚠️ Erreur lors de la synchronisation Live TV: \(error)")
        }

        try? await Task.sleep(nanoseconds: 500_000_000)  // 0.5s pour UX

        // Étape 2 : Synchronisation des films
        onStepChange(.movies)
        try? await XtreamService.shared.getVODStreams(account: account)
        try? await Task.sleep(nanoseconds: 500_000_000)

        // Étape 3 : Synchronisation des séries
        onStepChange(.series)
        try? await XtreamService.shared.getSeries(account: account)
        try? await Task.sleep(nanoseconds: 500_000_000)

        // Étape 4 : Finalisation
        onStepChange(.finalization)
        try? await Task.sleep(nanoseconds: 500_000_000)

        // Étape 5 : Terminé
        onStepChange(.completed)
        try? await Task.sleep(nanoseconds: 1_000_000_000)  // 1s pour afficher le message de succès
    }

    // MARK: - Refresh Account

    /// Rafraîchit les données d'un compte existant
    /// - Parameters:
    ///   - account: Compte à rafraîchir
    ///   - modelContext: Contexte SwiftData
    ///   - onStepChange: Callback appelé à chaque changement d'étape
    /// - Throws: XtreamError si la synchronisation échoue
    func refreshAccount(
        account: Account,
        modelContext: ModelContext,
        onStepChange: @escaping (SyncStep) -> Void
    ) async throws {
        // TODO: Implémenter la logique de rafraîchissement
        // Pour le moment, corps vide
    }

    // MARK: - Future Methods (TODO)

    // func updateAccount(...) async throws -> Account
    // func deleteAccount(...) async throws
}
