import SwiftUI

/// Card that takes the place of a page that failed to load, in a grid or a row.
struct RetryCard: View {
    let message: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            VStack(spacing: 12) {
                Image(systemName: "arrow.clockwise").font(.system(size: 40))
                Text("Suite non chargée").font(.headline)
                Text(message).font(.caption).foregroundStyle(Theme.secondary).multilineTextAlignment(.center).lineLimit(3)
                Text("Réessayer").font(.callout.weight(.semibold)).foregroundStyle(Theme.accent)
            }
            .padding(20)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .cardButtonStyle()
    }
}

#if DEBUG
private struct RetryCardPreview: View {
    @Environment(\.metrics) private var metrics
    var body: some View {
        RetryCard(message: "Le serveur ne répond pas.") {}
            .frame(width: metrics.posterSize.width, height: metrics.posterSize.height)
            .padding(40)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(Theme.background)
            .preferredColorScheme(.dark)
    }
}

#Preview("Réessayer") { RetryCardPreview() }
#endif
