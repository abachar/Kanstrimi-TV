//
//  InfoPanel.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 28/10/2025.
//

import SwiftData
import SwiftUI
import NukeUI

/// Panel affichant les métadonnées du contenu en cours de lecture
struct InfoPanel: View {
    let content: PlaybackContent
    let onDismiss: () -> Void

    @Query private var movieDetails: [MovieDetail]
    @Query private var seriesDetails: [SeriesDetail]

    private var movieDetail: MovieDetail? {
        movieDetails.first
    }

    private var seriesDetail: SeriesDetail? {
        seriesDetails.first
    }

    init(content: PlaybackContent, onDismiss: @escaping () -> Void) {
        self.content = content
        self.onDismiss = onDismiss

        // Filtrer MovieDetail ou SeriesDetail selon le type de contenu
        switch content {
        case .movie(let movie):
            let streamId = movie.streamId
            _movieDetails = Query(
                filter: #Predicate<MovieDetail> { $0.streamId == streamId }
            )
            _seriesDetails = Query(filter: #Predicate { _ in false })

        case .episode(let episode, _, _, _):
            let seriesId = episode.seriesId
            _seriesDetails = Query(
                filter: #Predicate<SeriesDetail> { $0.seriesId == seriesId }
            )
            _movieDetails = Query(filter: #Predicate { _ in false })

        case .liveChannel:
            _movieDetails = Query(filter: #Predicate { _ in false })
            _seriesDetails = Query(filter: #Predicate { _ in false })
        }
    }

    var body: some View {
        ZStack {
            // Background semi-transparent
            Color.black.opacity(0.85)
                .ignoresSafeArea()
                .onTapGesture {
                    onDismiss()
                }

            VStack(spacing: 30) {
                // Header
                headerSection

                // Content
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 30) {
                        // Synopsis
                        if let plot = getPlot(), !plot.isEmpty {
                            synopsisSection(plot: plot)
                        }

                        // Réalisateur
                        if let director = getDirector(), !director.isEmpty {
                            directorSection(director: director)
                        }

                        // Cast
                        if let castImages = getCastImages(), !castImages.isEmpty {
                            castSection(castImages: castImages)
                        }
                    }
                    .padding(.horizontal, 60)
                }
                .frame(maxHeight: 600)

                // Bouton Fermer
                Button("Fermer") {
                    onDismiss()
                }
                .buttonStyle(.bordered)
            }
            .padding(60)
            .background(Color.gray.opacity(0.2))
            .cornerRadius(20)
            .frame(width: 1200)
        }
    }

    // MARK: - Header
    private var headerSection: some View {
        VStack(spacing: 8) {
            Text(content.title)
                .font(.title)
                .fontWeight(.bold)
                .foregroundColor(.primary)

            if let subtitle = content.subtitle {
                Text(subtitle)
                    .font(.body)
                    .foregroundColor(.secondary)
            }
        }
    }

    // MARK: - Synopsis Section
    private func synopsisSection(plot: String) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Synopsis")
                .font(.system(size: 24, weight: .bold))
                .foregroundColor(.primary)

            Text(plot)
                .font(.system(size: 18))
                .foregroundColor(.secondary)
                .lineSpacing(6)
        }
    }

    // MARK: - Director Section
    private func directorSection(director: String) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Réalisateur")
                .font(.system(size: 24, weight: .bold))
                .foregroundColor(.primary)

            Text(director)
                .font(.system(size: 18))
                .foregroundColor(.secondary)
        }
    }

    // MARK: - Cast Section
    private func castSection(castImages: [String]) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Casting")
                .font(.system(size: 24, weight: .bold))
                .foregroundColor(.primary)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 20) {
                    ForEach(Array(castImages.enumerated()), id: \.offset) { index, imageURL in
                        LazyImage(url: URL(string: imageURL)) { state in
                            if let image = state.image {
                                image
                                    .resizable()
                                    .aspectRatio(contentMode: .fill)
                                    .frame(width: 120, height: 180)
                                    .cornerRadius(12)
                            } else if state.isLoading {
                                Color.gray.opacity(0.3)
                                    .frame(width: 120, height: 180)
                                    .cornerRadius(12)
                                    .overlay { ProgressView() }
                            } else {
                                Color.gray.opacity(0.3)
                                    .frame(width: 120, height: 180)
                                    .cornerRadius(12)
                                    .overlay {
                                        Image(systemName: "person.fill")
                                            .foregroundColor(.secondary)
                                    }
                            }
                        }
                        .hoverEffect(.lift)
                    }
                }
            }
        }
    }

    // MARK: - Helpers
    private func getPlot() -> String? {
        switch content {
        case .movie:
            return movieDetail?.plot
        case .episode:
            return seriesDetail?.plot
        case .liveChannel:
            return nil
        }
    }

    private func getDirector() -> String? {
        switch content {
        case .movie:
            return movieDetail?.director
        case .episode:
            return nil  // Pas de réalisateur pour les séries dans ce contexte
        case .liveChannel:
            return nil
        }
    }

    private func getCastImages() -> [String]? {
        switch content {
        case .movie:
            return movieDetail?.castImages
        case .episode:
            return seriesDetail?.castImages
        case .liveChannel:
            return nil
        }
    }
}
