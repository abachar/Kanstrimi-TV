//
//  LiveChannelService.swift
//  Kanstrimi TV
//
//  Created on 2025-10-31.
//  Service gérant les chaînes Live TV
//

import Foundation
import SwiftData

/// Service gérant la logique métier des chaînes Live TV
@MainActor
final class LiveChannelService {
    private let storageService: StorageService

    init(storageService: StorageService) {
        self.storageService = storageService
    }

    // MARK: - Insert

    /// Insère une liste de chaînes Live dans la base de données
    /// - Parameter channels: Liste des chaînes à insérer
    /// - Throws: Erreur si l'insertion échoue
    func insertChannels(_ channels: [LiveChannel]) throws {
        try storageService.insertAll(channels)
    }

    // MARK: - Delete

    /// Supprime toutes les chaînes Live
    /// - Throws: Erreur si la suppression échoue
    func deleteAllChannels() throws {
        try storageService.deleteAll(LiveChannel.self)
    }
}
