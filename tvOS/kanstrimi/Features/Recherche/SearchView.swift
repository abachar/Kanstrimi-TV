import SwiftUI

struct SearchView: View {
    var body: some View {
        StatePanel(icon: "hammer", title: "SearchView", message: "Écran à venir.", actionTitle: nil)
            .overlay(alignment: .topTrailing) { SettingsButton().padding(40) }
    }
}
