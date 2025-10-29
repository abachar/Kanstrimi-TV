//
//  ImageCache.swift
//  Kanstrimi TV
//
//  Created on 2025-10-27.
//  Cache mémoire et disque pour les images
//

import UIKit

/// Gère le cache mémoire et disque des images
final class ImageCache {
    static let shared = ImageCache()

    private let memoryCache = NSCache<NSString, UIImage>()
    private let fileManager = FileManager.default
    private let cacheDirectory: URL

    private init() {
        // Créer le dossier de cache
        let cachesDir = fileManager.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        cacheDirectory = cachesDir.appendingPathComponent("ImageCache")
        try? fileManager.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)

        // Configurer NSCache
        memoryCache.countLimit = 100  // Max 100 images en mémoire
        memoryCache.totalCostLimit = 200 * 1024 * 1024  // Max 200 MB
    }

    // MARK: - Memory Cache

    /// Récupère une image depuis le cache mémoire
    func get(url: URL) -> UIImage? {
        memoryCache.object(forKey: url.absoluteString as NSString)
    }

    /// Sauvegarde une image dans le cache mémoire
    func set(url: URL, image: UIImage) {
        memoryCache.setObject(image, forKey: url.absoluteString as NSString)
    }

    // MARK: - Disk Cache

    /// Charge une image depuis le cache disque
    func loadFromDisk(url: URL) async throws -> UIImage? {
        let encoded = url.absoluteString.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? UUID().uuidString
        let filename = String(encoded.prefix(200))
        let fileURL = cacheDirectory.appendingPathComponent(filename)

        guard fileManager.fileExists(atPath: fileURL.path) else { return nil }

        let data = try Data(contentsOf: fileURL)
        return UIImage(data: data)
    }

    /// Sauvegarde une image sur le disque
    func saveToDisk(url: URL, image: UIImage) async throws {
        let encoded = url.absoluteString.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? UUID().uuidString
        let filename = String(encoded.prefix(200))
        let fileURL = cacheDirectory.appendingPathComponent(filename)

        guard let data = image.pngData() else { return }
        try data.write(to: fileURL)
    }

    /// Nettoie le cache disque
    func clearDiskCache() {
        try? fileManager.removeItem(at: cacheDirectory)
        try? fileManager.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }

    /// Nettoie le cache mémoire
    func clearMemoryCache() {
        memoryCache.removeAllObjects()
    }
}
