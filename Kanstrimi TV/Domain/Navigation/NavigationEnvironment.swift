//
//  NavigationEnvironment.swift
//  Kanstrimi TV
//
//  Created by Claude on 02/11/2025.
//

import SwiftUI

/// Environment key pour exposer le NavigationPath global
private struct NavigationPathKey: EnvironmentKey {
    static let defaultValue: Binding<NavigationPath> = .constant(NavigationPath())
}

extension EnvironmentValues {
    /// NavigationPath global accessible dans toutes les vues
    ///
    /// Permet de naviguer programmatiquement dans l'app :
    /// ```swift
    /// @Environment(\.navigationPath) private var navigationPath
    ///
    /// // Navigation vers un film
    /// navigationPath.wrappedValue.append(movie)
    ///
    /// // Navigation vers une série
    /// navigationPath.wrappedValue.append(series)
    ///
    /// // Navigation vers la recherche
    /// navigationPath.wrappedValue.append(SearchDestination.movies)
    /// ```
    var navigationPath: Binding<NavigationPath> {
        get { self[NavigationPathKey.self] }
        set { self[NavigationPathKey.self] = newValue }
    }
}
