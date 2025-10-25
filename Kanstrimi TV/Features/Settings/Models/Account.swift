//
//  Account.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import Foundation
import SwiftData

/// Modèle représentant un compte de streaming
@Model
final class Account: Equatable {
    /// Identifiant unique du compte
    var id: UUID
    
    /// Nom personnalisé du compte (pour différencier plusieurs comptes)
    var name: String

    /// URL du serveur Xtream (ex: http://example.com:8080)
    var serverURL: String

    /// Nom d'utilisateur
    var username: String

    /// Mot de passe (temporairement en clair, migration Keychain à venir)
    var password: String

    /// Mot de passe (sera stocké de manière sécurisée dans le Keychain)
    var passwordKeychainKey: String
    
    /// Date de la dernière synchronisation complète
    var lastSyncDate: Date?
    
    /// Initialisation d'un nouveau compte Xtream
    /// - Parameters:
    ///   - name: Nom du compte
    ///   - serverURL: URL du serveur
    ///   - username: Nom d'utilisateur
    ///   - password: Mot de passe
    ///   - passwordKeychainKey: Clé du Keychain pour le mot de passe
    init(
        id: UUID = UUID(),
        name: String,
        serverURL: String,
        username: String,
        password: String,
        passwordKeychainKey: String = ""
    ) {
        self.id = id
        self.name = name
        self.serverURL = serverURL
        self.username = username
        self.password = password
        self.passwordKeychainKey = passwordKeychainKey
    }
}
