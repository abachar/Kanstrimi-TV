//
//  LiveTVView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftUI

struct LiveTVView: View {
    var body: some View {
        ZStack {
            Color.kanBackground
                .ignoresSafeArea()

            VStack(spacing: 40) {
                Text("TV en direct")
                    .font(.system(size: 60, weight: .bold))
                    .foregroundColor(.kanTextPrimary)

                Text("Liste des chaînes disponibles en streaming")
                    .font(.title3)
                    .foregroundColor(.kanTextSecondary)
            }
            .padding(60)
        }
    }
}

#Preview {
    LiveTVView()
}
