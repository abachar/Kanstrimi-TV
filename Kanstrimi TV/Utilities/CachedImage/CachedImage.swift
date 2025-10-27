//
//  CachedImage.swift
//  Kanstrimi TV
//
//  Created on 2025-10-27.
//  Composant SwiftUI avec cache (même contrat qu'AsyncImage)
//

import SwiftUI

/// Composant d'image avec cache mémoire et disque (contrat identique à AsyncImage)
struct CachedImage<Content: View>: View {
    let url: URL?
    @ViewBuilder let content: (AsyncImagePhase) -> Content

    @State private var phase: AsyncImagePhase = .empty

    var body: some View {
        content(phase)
            .task(id: url) {
                await loadImage()
            }
    }

    private func loadImage() async {
        guard let url = url else {
            phase = .failure(URLError(.badURL))
            return
        }

        // Vérifier cache mémoire
        if let cached = ImageCache.shared.get(url: url) {
            phase = .success(Image(uiImage: cached))
            return
        }

        // Vérifier cache disque
        if let diskCached = try? await ImageCache.shared.loadFromDisk(url: url) {
            phase = .success(Image(uiImage: diskCached))
            ImageCache.shared.set(url: url, image: diskCached)
            return
        }

        // Télécharger
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            guard let uiImage = UIImage(data: data) else {
                phase = .failure(URLError(.cannotDecodeContentData))
                return
            }

            // Sauvegarder dans les caches
            ImageCache.shared.set(url: url, image: uiImage)
            try? await ImageCache.shared.saveToDisk(url: url, image: uiImage)

            phase = .success(Image(uiImage: uiImage))
        } catch {
            phase = .failure(error)
        }
    }
}
