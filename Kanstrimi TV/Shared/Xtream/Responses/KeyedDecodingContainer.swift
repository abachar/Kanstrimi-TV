//
//  KeyedDecodingContainer.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

// MARK: - Flexible Decoding Extensions

extension KeyedDecodingContainer {
    /// Décode un Int qui peut être représenté soit comme Int soit comme String dans le JSON
    func decodeFlexibleIntIfPresent(forKey key: K) -> Int? {
        if let intValue = try? decodeIfPresent(Int.self, forKey: key) {
            return intValue
        } else if let stringValue = try? decodeIfPresent(String.self, forKey: key),
                  let intValue = Int(stringValue) {
            return intValue
        }
        return nil
    }

    /// Décode un Double qui peut être représenté soit comme Double soit comme String dans le JSON
    func decodeFlexibleDoubleIfPresent(forKey key: K) -> Double? {
        if let doubleValue = try? decodeIfPresent(Double.self, forKey: key) {
            return doubleValue
        } else if let stringValue = try? decodeIfPresent(String.self, forKey: key),
                  let doubleValue = Double(stringValue) {
            return doubleValue
        }
        return nil
    }
}
