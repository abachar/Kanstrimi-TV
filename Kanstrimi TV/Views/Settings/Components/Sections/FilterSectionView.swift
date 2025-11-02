//
//  FilterSectionView.swift
//  Kanstrimi TV
//
//  Created on 2025-10-31.
//  Section de filtrage dans les paramètres avec statistiques
//

import SwiftUI

struct FilterSectionView: View {
    // MARK: - Environment
    @Environment(\.domainService) private var domainService

    // MARK: - State
    @State private var stats: FilterStats?
    @State private var showFilterManagement = false

    // MARK: - Body
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            // Titre
            SettingsSectionHeader(icon: "line.3.horizontal.decrease.circle.fill", title: "Filtres")

            // Statistiques
            if let stats = stats {
                HStack(spacing: 12) {
                    StatRow(
                        icon: "play.tv.fill",
                        title: "Live TV",
                        active: stats.liveActive,
                        total: stats.liveTotal
                    )
                    .padding(.vertical ,16)
                    .frame(maxWidth: .infinity)
                    .background(                  RoundedRectangle(cornerRadius: 16)
                        .fill(Color.appSecondaryBackground)
                    )

                    StatRow(
                        icon: "film.fill",
                        title: "Films",
                        active: stats.moviesActive,
                        total: stats.moviesTotal
                    )
                    .padding(.vertical ,16)
                    .frame(maxWidth: .infinity)
                    .background(                  RoundedRectangle(cornerRadius: 16)
                        .fill(Color.appSecondaryBackground)
                    )

                    StatRow(
                        icon: "film.stack.fill",
                        title: "Séries",
                        active: stats.seriesActive,
                        total: stats.seriesTotal
                    )
                    .padding(.vertical ,16)
                    .frame(maxWidth: .infinity)
                    .background(                  RoundedRectangle(cornerRadius: 16)
                        .fill(Color.appSecondaryBackground)
                    )
                }
                .padding(.bottom, 8)
            } else {
                ProgressView()
                    .padding(.bottom, 8)
            }

            // Bouton Gérer les filtres
            Button("Gérer les filtres", systemImage: "slider.horizontal.3") {
                showFilterManagement = true
            }
        }
        .task {
            await loadStats()
        }
        .fullScreenCover(isPresented: $showFilterManagement) {
            FilterManagementView()
                .onDisappear {
                    // Recharger les stats quand on revient
                    Task {
                        await loadStats()
                    }
                }
        }
    }

    // MARK: - Helper Methods
    private func loadStats() async {
        do {
            stats = try await domainService.getFilterStats()
        } catch {
            print("❌ Erreur lors du chargement des statistiques: \(error)")
        }
    }
}

// MARK: - Stat Row
struct StatRow: View {
    let icon: String
    let title: String
    let active: Int
    let total: Int

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: icon)
                .foregroundStyle(Color.blue)

            Text(title)
                .foregroundStyle(Color.primary)

            Text("\(active) / \(total)")
                .foregroundStyle(Color.secondary)
                .fontWeight(.medium)
        }
    }
}
