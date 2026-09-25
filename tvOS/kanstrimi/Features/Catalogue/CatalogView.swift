import SwiftUI

struct CatalogView: View {
    let kind: ContentKind
    var body: some View {
        StatePanel(icon: "hammer", title: kind == .movie ? "Films" : "Séries", message: "Écran à venir.", actionTitle: nil)
            .overlay(alignment: .topTrailing) { SettingsButton().padding(40) }
    }
}
