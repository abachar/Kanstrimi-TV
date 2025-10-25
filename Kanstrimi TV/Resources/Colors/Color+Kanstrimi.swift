//
//  Color+Kanstrimi.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 25/10/2025.
//

import SwiftUI

extension Color {
    // MARK: - Kanstrimi Core Palette
    
    static let kanBackground = Color(hex: "#111417")         // fond principal slate bleu-gris
    static let kanCardBackground = Color(hex: "#1B1F24")     // fond des cartes (chaînes, films)
    static let kanTextPrimary = Color(hex: "#E6E8EA")        // texte principal
    static let kanTextSecondary = Color(hex: "#A0A6AE")      // texte secondaire
    
    // MARK: - Navigation & Overlay
    static let kanTabSelected = Color(hex: "#4EA8DE")        // tab ou élément sélectionné
    static let kanTabInactive = Color(hex: "#6C757D")        // tab inactif
    static let kanOverlayBackground = Color(hex: "#111417", opacity: 0.75) // overlay semi-transparent
    static let kanOverlayText = Color(hex: "#F2F3F5")        // texte sur overlay
    static let kanHighlight = Color(hex: "#5CCFE6")          // surbrillance (focus/hover)
    
    // MARK: - Status & Feedback
    static let kanError = Color(hex: "#FF5C5C")              // message d’erreur
    static let kanSuccess = Color(hex: "#4CAF50")            // confirmation d’action
    
    // MARK: - Utility Initializer
    init(hex: String, opacity: Double = 1.0) {
        var hexNormalized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        hexNormalized = hexNormalized.replacingOccurrences(of: "#", with: "")
        
        var rgb: UInt64 = 0
        Scanner(string: hexNormalized).scanHexInt64(&rgb)
        
        let r = Double((rgb & 0xFF0000) >> 16) / 255.0
        let g = Double((rgb & 0x00FF00) >> 8) / 255.0
        let b = Double(rgb & 0x0000FF) / 255.0
        
        self.init(.sRGB, red: r, green: g, blue: b, opacity: opacity)
    }
}
