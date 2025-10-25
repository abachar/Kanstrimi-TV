//
//  SearchView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftUI

struct SearchView: View {
    var body: some View {
        ZStack {
            Color.kanBackground
                .ignoresSafeArea()

            VStack(spacing: 40) {
                Text("Recherche")
                    .font(.system(size: 60, weight: .bold))
                    .foregroundColor(.kanTextPrimary)

                Text("Rechercher dans tout le contenu disponible")
                    .font(.title3)
                    .foregroundColor(.kanTextSecondary)
            }
            .padding(60)
        }
    }
}

#Preview {
    SearchView()
}
