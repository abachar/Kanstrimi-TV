import SwiftUI

struct LiveView: View {
    var body: some View {
        StatePanel(icon: "hammer", title: "LiveView", message: "Écran à venir.", actionTitle: nil)
            .overlay(alignment: .topTrailing) { SettingsButton().padding(40) }
    }
}
