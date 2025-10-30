//
//  LiveTVNavigationViewModel.swift
//  Kanstrimi TV
//
//  Created by Claude on 30/10/2025.
//

import Foundation
import Observation

/// ViewModel gérant la navigation dans la feature LiveTV
///
/// Gère une pile de navigation explicite permettant :
/// - Navigation forward (push)
/// - Navigation backward (pop)
/// - Retour à la racine
@Observable
class LiveTVNavigationViewModel {
    // MARK: - Properties

    /// Pile de navigation
    /// La dernière valeur représente l'écran actuellement affiché
    /// Si la pile est vide, l'écran principal (liste des catégories) est affiché
    var navigationStack: [LiveTVNavigationState] = []

    /// État de navigation actuel (nil si on affiche l'écran principal)
    var currentState: LiveTVNavigationState? {
        navigationStack.last
    }

    /// Chaîne sélectionnée (utilisé pour charger les détails avant de naviguer)
    var selectedChannel: LiveChannel?

    // MARK: - Navigation Methods

    /// Navigue vers l'écran de recherche
    func navigateToSearch() {
        navigationStack.append(.search)
    }

    /// Navigue vers le lecteur vidéo
    /// - Parameter content: Contenu à lire
    func navigateToPlayer(content: PlaybackContent) {
        navigationStack.append(.player(content: content))
    }

    /// Sélectionne une chaîne (déclenche le chargement des détails dans la vue)
    /// - Parameter channel: La chaîne à sélectionner
    func selectChannel(_ channel: LiveChannel) {
        selectedChannel = channel
    }

    /// Revient à l'écran précédent
    func goBack() {
        guard !navigationStack.isEmpty else { return }
        navigationStack.removeLast()
    }

    /// Revient à la racine (liste des chaînes)
    func popToRoot() {
        navigationStack = []
    }
}
