import SwiftUI

struct HomeView: View {
    var body: some View {
        StatePanel(icon: "hammer", title: "HomeView", message: "Écran à venir.", actionTitle: nil)
            .overlay(alignment: .topTrailing) { SettingsButton().padding(40) }
    }
}
