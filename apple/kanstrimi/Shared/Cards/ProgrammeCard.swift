import SwiftUI

/// A programme of the guide: its hours, title and summary, then « EN COURS » and its progress while on air. The player's
/// Programme strip and the Direct screen. Its hours and « EN COURS » follow the device's clock. As large as its parent
/// makes it: given a height, « EN COURS » sits at the bottom of the card; else the card is as tall as its text.
struct ProgrammeCard: View {
    @Environment(\.metrics) private var metrics
    let programme: Programme

    var body: some View {
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
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(metrics.compact ? 14 : 20)
        .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: metrics.cardRadius))
    }
}

#if DEBUG
#Preview("Programme") {
    let now = Date.now
    let card = Metrics.current.programmeCard
    HStack(alignment: .top, spacing: 20) {
        ProgrammeCard(programme: Programme(title: "Le Journal", start: now.addingTimeInterval(-1200), end: now.addingTimeInterval(2400),
                                           overview: "Les titres de l'actualité, puis la météo."))
            .frame(width: card.width, height: card.height)
        ProgrammeCard(programme: Programme(title: "Cinéma du dimanche", start: now.addingTimeInterval(2400), end: now.addingTimeInterval(9600), overview: nil))
            .frame(width: card.width, height: card.height)
    }
    .padding(40)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(Theme.background)
    .preferredColorScheme(.dark)
}
#endif
