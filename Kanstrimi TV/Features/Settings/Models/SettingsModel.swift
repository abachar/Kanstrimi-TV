//
//  SettingsModel.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import Foundation

/// Informations statiques sur l'application
struct AppInfo {
    /// Nom de l'application
    let appName: String

    /// Version de l'application (MARKETING_VERSION)
    let version: String

    /// Numéro de build (CURRENT_PROJECT_VERSION)
    let build: String

    /// Disclaimer légal
    let disclaimer: String

    /// Initialisation avec valeurs par défaut depuis Bundle
    init() {
        self.appName = "Kanstrimi TV"
        self.version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        self.build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        self.disclaimer = "Kanstrimi TV est un lecteur IPTV neutre. L'utilisateur est responsable du contenu accédé via ses propres abonnements. Aucune chaîne ou flux n'est fourni avec l'application."
    }

    /// Version complète formatée (ex: "1.0 (1)")
    var fullVersion: String {
        "\(version) (\(build))"
    }
}
