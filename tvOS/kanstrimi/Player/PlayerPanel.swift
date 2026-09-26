import SwiftUI

/// Swipe down: Infos · Versions · Audio · Sous-titres [11].
struct PlayerPanel: View {
    enum Tab: String, CaseIterable { case infos = "Infos", versions = "Versions", audio = "Audio", subtitles = "Sous-titres" }

    @Environment(AppEnvironment.self) private var env
    @State private var tab: Tab = .versions
    @FocusState private var focusedTab: Tab?
    @FocusState private var focusedItem: String?
    let onClose: () -> Void
    var onActivity: () -> Void = { }
    private var player: PlayerService { env.player }
    /// The panel keeps the same height whatever the tab shows.
    static let height: CGFloat = 440

    var body: some View {
        VStack(spacing: 0) {
            Spacer()
            VStack(alignment: .leading, spacing: 26) {
                HStack(spacing: 12) {
                    ForEach(Tab.allCases, id: \.self) { t in
                        Button(t.rawValue) { tab = t }
                            .buttonStyle(.bordered)
                            .opacity(tab == t ? 1 : 0.6)
                            .focused($focusedTab, equals: t)
                    }
                    Spacer()
                    Text("Reprise au même instant · \(Format.clock(player.time))").font(.callout).foregroundStyle(Theme.secondary)
                }
                .onChange(of: focusedTab) { _, f in
                    if let f { tab = f }
                    onActivity()
                }
                .onChange(of: focusedItem) { _, _ in onActivity() }

                Group {
                    switch tab {
                    case .infos: infos
                    case .versions: versions
                    case .audio: audio
                    case .subtitles: subtitles
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                Text("‹ Retour pour fermer · se ferme seul après 10 s sans action").font(.caption).foregroundStyle(Theme.secondary)
            }
            .padding(48)
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(height: Self.height)
            .background(.thinMaterial.opacity(0.9))
        }
        .ignoresSafeArea()
        .onAppear { focusedTab = tab }
    }

    private var infos: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(player.context?.content.subtitle.map { "\($0) · " } ?? "" + (player.context?.content.title ?? "")).font(.title2.weight(.bold))
            if let ep = player.context?.content.episode { Text(ep.code).foregroundStyle(Theme.secondary) }
            if let v = player.version, let s = player.source {
                Text("\(v.longLabel) · \(player.sourceLabel(s, in: v)) · \(s.origin)").foregroundStyle(Theme.secondary)
            }
            HStack(spacing: 30) {
                LabeledContent("Durée", value: Format.clock(player.duration))
                LabeledContent("Reste", value: Format.clock(player.remaining))
                LabeledContent("Fin", value: Format.hour(player.endDate))
            }
            .font(.callout)
        }
    }

    private var versions: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 20) {
                ForEach(player.context?.versions ?? []) { v in
                    Button {
                        player.switchVersion(v)
                        onClose()
                    } label: {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(v.qualityLabel).font(.title3.weight(.bold)).lineLimit(1).minimumScaleFactor(0.7)
                            Text(v.language.label).font(.callout)
                            Text("\(v.sources.count) source\(v.sources.count > 1 ? "s" : "") · \(v.sources.first?.container ?? "")").font(.caption).foregroundStyle(Theme.secondary)
                            if v.id == player.version?.id {
                                Text("EN COURS").font(.caption.weight(.bold)).tracking(1).foregroundStyle(Theme.accent)
                            } else {
                                Text("Reprise au même instant").font(.caption).foregroundStyle(Theme.secondary)
                            }
                        }
                        .frame(width: 300, alignment: .leading)
                        .padding(20)
                    }
                    .buttonStyle(.card)
                    .focused($focusedItem, equals: "version-\(v.id)")
                }
            }
            .padding(.vertical, 20)
        }
    }

    private var audio: some View {
        trackList(player.audioTracks, empty: "Pistes audio connues au démarrage de la lecture") { player.select(audio: $0) }
    }

    private var subtitles: some View {
        VStack(alignment: .leading, spacing: 14) {
            Button { player.select(text: nil) } label: {
                Label("Désactivés", systemImage: player.textTracks.contains(where: \.isSelected) ? "circle" : "checkmark.circle.fill")
            }
            .focused($focusedItem, equals: "text-off")
            trackList(player.textTracks, empty: "Aucun sous-titre dans ce flux") { player.select(text: $0) }
        }
    }

    private func trackList(_ tracks: [PlayerService.Track], empty: String, select: @escaping (PlayerService.Track) -> Void) -> some View {
        Group {
            if tracks.isEmpty {
                Text(empty).foregroundStyle(Theme.secondary)
            } else {
                ScrollView(.horizontal) {
                    HStack(spacing: 16) {
                        ForEach(tracks) { t in
                            Button { select(t) } label: {
                                Label(t.name + (t.language.map { " · \($0)" } ?? ""), systemImage: t.isSelected ? "checkmark.circle.fill" : "circle")
                            }
                            .focused($focusedItem, equals: "track-\(t.id)")
                        }
                    }
                    .padding(.vertical, 12)
                }
            }
        }
    }
}
