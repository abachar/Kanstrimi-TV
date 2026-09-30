import SwiftUI

/// Swipe down: Infos · Versions · Audio · Sous-titres [11]; in live, Programme replaces Infos.
/// Opens on Versions, or on the tab asked for (the live programme).
struct PlayerPanel: View {
    enum Tab: String, CaseIterable { case programme = "Programme", infos = "Infos", versions = "Versions", audio = "Audio", subtitles = "Sous-titres" }

    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics
    @State private var tab: Tab = .versions
    @FocusState private var focusedTab: Tab?
    @FocusState private var focusedItem: String?
    /// The channel's programmes until 6:00, fetched when the panel opens; nil while loading.
    @State private var programmes: [Programme]?
    var opening: Tab? = nil
    let onClose: () -> Void
    var onActivity: () -> Void = { }
    private var player: PlayerService { env.player }
    private var tabs: [Tab] { player.isLive ? [.programme, .versions, .audio, .subtitles] : [.infos, .versions, .audio, .subtitles] }

    var body: some View {
        VStack(spacing: 0) {
            Spacer()
            VStack(alignment: .leading, spacing: 26) {
                HStack(spacing: 12) {
                    ForEach(tabs, id: \.self) { t in
                        Button(t.rawValue) { tab = t; onActivity() }
                            .buttonStyle(.bordered)
                            .opacity(tab == t ? 1 : 0.6)
                            .focused($focusedTab, equals: t)
                    }
                    Spacer()
                }
                .onChange(of: focusedTab) { _, f in
                    if let f { tab = f }
                    onActivity()
                }
                .onChange(of: focusedItem) { _, _ in onActivity() }

                Group {
                    switch tab {
                    case .programme: programme
                    case .infos: infos
                    case .versions: versions
                    case .audio: audio
                    case .subtitles: subtitles
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
            .padding(metrics.panelPadding)
            .frame(maxWidth: .infinity, alignment: .leading)
            // The panel keeps the same height whatever the tab shows.
            .frame(height: metrics.panelHeight)
            .background(.thinMaterial.opacity(0.9))
        }
        .ignoresSafeArea()
        .touchActivity(onActivity)
        .onAppear {
            if let opening, tabs.contains(opening) { tab = opening }
            focusedTab = tab
        }
        .task(id: player.channel?.id) { await loadProgrammes() }
    }

    private func loadProgrammes() async {
        guard player.isLive, let id = player.channel?.id else { return }
        programmes = nil
        // An unreliable guide is no reason for an error screen: a failure reads as an unknown programme.
        programmes = (try? await env.call { try await env.client.programmes(channel: id) }) ?? []
    }

    /// From the programme on air until 6:00, one card each; the current one marked.
    @ViewBuilder private var programme: some View {
        if let programmes {
            if programmes.isEmpty {
                Text("Programme inconnu pour cette chaîne").foregroundStyle(Theme.secondary)
            } else {
                ScrollView(.horizontal) {
                    HStack(spacing: 20) {
                        ForEach(programmes, id: \.start) { p in
                            // Focusable so the remote can scroll the day; nothing to do on select.
                            Button { onActivity() } label: { programmeCard(p) }
                                .cardButtonStyle()
                                .focused($focusedItem, equals: "programme-\(p.start.timeIntervalSince1970)")
                        }
                    }
                    .padding(.vertical, 20)
                }
            }
        } else {
            ProgressView()
        }
    }

    private func programmeCard(_ p: Programme) -> some View {
        let onAir = p.start <= .now && p.end > .now
        return VStack(alignment: .leading, spacing: 8) {
            Text("\(Format.hour(p.start)) – \(Format.hour(p.end))").font(.caption.weight(.semibold)).foregroundStyle(Theme.secondary)
            Text(p.title).font(.title3.weight(.bold)).lineLimit(2)
            if let o = p.overview { Text(o).font(.caption).foregroundStyle(Theme.secondary).lineLimit(3) }
            Spacer(minLength: 0)
            if onAir {
                Text("EN COURS").font(.caption.weight(.bold)).tracking(1).foregroundStyle(Theme.accent)
                ProgressBar(fraction: p.fraction(), height: 4)
            }
        }
        .frame(width: metrics.panelCard * 1.2, alignment: .leading)
        .frame(minHeight: metrics.panelCard * 0.6, alignment: .topLeading)
        .padding(20)
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
                            Text((v.sources.first?.container ?? "") + (v.sources.count > 1 ? " · ×\(v.sources.count)" : "")).font(.caption).foregroundStyle(Theme.secondary)
                            if v.id == player.version?.id {
                                Text("EN COURS").font(.caption.weight(.bold)).tracking(1).foregroundStyle(Theme.accent)
                            }
                        }
                        .frame(width: metrics.panelCard, alignment: .leading)
                        .padding(20)
                    }
                    .cardButtonStyle()
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
