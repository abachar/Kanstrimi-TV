//
//  SeriesNavigationViewModel.swift
//  Kanstrimi TV
//
//  Created by Claude on 30/10/2025.
//

import Foundation
import Observation

/// ViewModel gérant la navigation dans la feature Series
///
/// Gère une pile de navigation explicite permettant :
/// - Navigation forward (push)
/// - Navigation backward (pop)
/// - Retour à la racine
@Observable
class SeriesNavigationViewModel {
    // MARK: - Properties

    /// Pile de navigation
    /// La dernière valeur représente l'écran actuellement affiché
    /// Si la pile est vide, l'écran principal (liste des catégories) est affiché
    var navigationStack: [SeriesNavigationState] = []

    /// État de navigation actuel (nil si on affiche l'écran principal)
    var currentState: SeriesNavigationState? {
        navigationStack.last
    }

    // MARK: - Navigation Methods

    /// Navigue vers l'écran de recherche
    func navigateToSearch() {
        navigationStack.append(.search)
    }

    /// Navigue vers les détails d'une série
    /// - Parameters:
    ///   - seriesId: ID de la série
    ///   - from: Destination de retour
    func navigateToDetail(seriesId: Int, from: SeriesNavigationState.ReturnDestination) {
        navigationStack.append(.seriesDetail(seriesId: seriesId, returnTo: from))
    }

    /// Navigue vers le lecteur vidéo
    /// - Parameters:
    ///   - content: Contenu à lire
    ///   - from: Destination de retour
    func navigateToPlayer(content: PlaybackContent, from: SeriesNavigationState.ReturnDestination) {
        navigationStack.append(.player(content: content, returnTo: from))
    }

    /// Revient à l'écran précédent
    func goBack() {
        guard !navigationStack.isEmpty else { return }
        navigationStack.removeLast()
    }

    /// Revient à la racine (liste des séries)
    func popToRoot() {
        navigationStack = []
    }
}
