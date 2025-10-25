//
//  MoviesView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftUI

struct MoviesView: View {
    var body: some View {
        ZStack {
            Color.kanBackground
                .ignoresSafeArea()

            VStack(spacing: 40) {
                Text("Films")
                    .font(.system(size: 60, weight: .bold))
                    .foregroundColor(.kanTextPrimary)

                Text("Catalogue de films à la demande")
                    .font(.title3)
                    .foregroundColor(.kanTextSecondary)
            }
            .padding(60)
        }
    }
}

#Preview {
    MoviesView()
}
