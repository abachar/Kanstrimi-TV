//
//  WelcomeView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftUI

struct WelcomeView: View {
    var body: some View {
        ZStack {
            Color.kanBackground
                .ignoresSafeArea()

            VStack(spacing: 20) {
                Text("Kanstrimi TV")
                    .font(.system(size: 80, weight: .bold))
                    .foregroundColor(.kanTextPrimary)
            }
        }
    }
}

#Preview {
    WelcomeView()
}
