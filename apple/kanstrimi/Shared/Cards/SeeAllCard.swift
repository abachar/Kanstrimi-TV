import SwiftUI

/// The last card of a shelf that has more: « Voir tout » and the total.
struct SeeAllCard: View {
    @Environment(\.metrics) private var metrics
    let total: Int
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 12) {
                Image(systemName: "square.grid.3x3").font(.system(size: metrics.stateIcon * 0.7))
                Text("Voir tout").font(.headline)
                Text(Format.count(total)).font(.caption).foregroundStyle(Theme.secondary)
            }
            .frame(width: metrics.posterSize.width, height: metrics.posterSize.height)
        }
        .cardButtonStyle()
    }
}

#if DEBUG
#Preview("Voir tout") {
    SeeAllCard(total: 42) {}
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Theme.background)
        .preferredColorScheme(.dark)
}
#endif
