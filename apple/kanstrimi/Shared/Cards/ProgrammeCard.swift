import SwiftUI

/// A programme of the guide: its hours, title and summary, then « EN COURS » and its progress while on air. The player's
/// Programme strip and the Direct screen. Its hours and « EN COURS » follow the device's clock.
struct ProgrammeCard: View {
    @Environment(\.metrics) private var metrics
    let programme: Programme
    /// Defaults to the player panel's card width; the height follows.
    var width: CGFloat? = nil

    var body: some View {
        let width = width ?? metrics.panelCard
        let onAir = programme.start <= .now && programme.end > .now
        VStack(alignment: .leading, spacing: 6) {
            Text("\(Format.hour(programme.start)) – \(Format.hour(programme.end))").font(.caption2.weight(.semibold)).foregroundStyle(Theme.secondary)
            Text(programme.title).font(.headline).lineLimit(2)
            if let o = programme.overview { Text(o).font(.caption2).foregroundStyle(Theme.secondary).lineLimit(3) }
            Spacer(minLength: 0)
            if onAir {
                Text("EN COURS").font(.caption2.weight(.bold)).tracking(1).foregroundStyle(Theme.accent)
                ProgressBar(fraction: programme.fraction(), height: 4)
            }
        }
        // A fixed height: the EN COURS mark sits at the bottom of the card, not of the screen.
        .frame(width: width, height: width * 0.7, alignment: .topLeading)
        .padding(metrics.compact ? 14 : 20)
        .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: metrics.cardRadius))
    }
}

#if DEBUG
#Preview("Programme") {
    let now = Date.now
    HStack(alignment: .top, spacing: 20) {
        ProgrammeCard(programme: Programme(title: "Le Journal", start: now.addingTimeInterval(-1200), end: now.addingTimeInterval(2400),
                                           overview: "Les titres de l'actualité, puis la météo."))
        ProgrammeCard(programme: Programme(title: "Cinéma du dimanche", start: now.addingTimeInterval(2400), end: now.addingTimeInterval(9600), overview: nil))
    }
    .padding(40)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(Theme.background)
    .preferredColorScheme(.dark)
}
#endif
