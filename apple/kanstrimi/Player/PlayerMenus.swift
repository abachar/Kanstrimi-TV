import SwiftUI

// What the tvOS bar and the touch controls share: their panels, their menus, the live caption.

extension PlayerService {
    /// The panels the bar offers: live, an episode, a film. Similaires once the server answered with some,
    /// Distribution when the title has a cast.
    var panels: [PlayerScreen.BarPanel] {
        if isLive { return [.programme, .recents, .infos] }
        let related: [PlayerScreen.BarPanel] = suggestions?.related.isEmpty == false ? [.related] : []
        let cast: [PlayerScreen.BarPanel] = context?.cast.isEmpty == false ? [.cast] : []
        let episodes: [PlayerScreen.BarPanel] = context?.content.kind == .episode ? [.episodes] : []
        return episodes + related + cast + [.infos]
    }

    // Each menu only when it offers a choice; the tracks are known once the player has read the stream.
    var offersVersions: Bool { (context?.versions.count ?? 0) > 1 }
    var offersAudio: Bool { audioTracks.count > 1 }
    var offersSubtitles: Bool { !textTracks.isEmpty }

    /// "▶▶ ×30  " while a direction is held, before the time it reaches.
    var scanLabel: String {
        guard scanRate != 0 else { return "" }
        return "\(scanRate > 0 ? "▶▶" : "◀◀") ×\(Int(abs(scanRate)))  "
    }
}

/// The player's header, live or not: the channel and its programme, or the episode and the title.
struct PlayerHeader: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics
    private var player: PlayerService { env.player }
    private var text: Metrics.PlayerText { metrics.playerText }

    var body: some View {
        if player.isLive {
            VStack(alignment: .leading, spacing: text.liveSpacing) {
                HStack(spacing: text.tagSpacing) {
                    LiveTag("EN DIRECT", size: text.liveTag)
                    Text(player.channel?.name ?? "").font(text.name).lineLimit(text.lines)
                }
                if let now = player.epg.now { Text(now.title).font(text.programme).foregroundStyle(Theme.secondary).lineLimit(text.lines) }
            }
        } else if let c = player.context?.content {
            VStack(alignment: .leading, spacing: text.vodSpacing) {
                if let ep = c.episode, let s = c.subtitle {
                    Text("\(s) · \(ep.shortCode)").font(text.episode).foregroundStyle(Theme.secondary).lineLimit(text.lines)
                }
                Text(c.title).font(text.title).lineLimit(text.lines)
            }
        }
    }
}

/// The live bar: where the programme stands (full without a guide, a live is always at its end) and its caption.
struct PlayerLiveProgress: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics

    var body: some View {
        VStack(spacing: metrics.playerText.liveBarSpacing) {
            ProgressBar(fraction: env.player.epg.now?.fraction() ?? 1, height: metrics.playerText.liveBarHeight)
            LiveProgressCaption().font(metrics.playerText.time).foregroundStyle(Theme.secondary)
        }
    }
}

/// What has been played, then what remains and when it ends.
struct PlayerTimeLine: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics
    /// The elapsed time, as the bar shows it (with its scan label on the phone).
    let elapsed: String

    var body: some View {
        let player = env.player
        HStack {
            Text(elapsed).foregroundStyle(Theme.text)
            Spacer()
            Text("−\(Format.clock(player.remaining)) · fin à \(Format.hour(player.endDate))")
        }
        .font(metrics.playerText.time).foregroundStyle(Theme.secondary)
    }
}

/// The Versions menu: by language, the one playing checked.
struct VersionMenuItems: View {
    @Environment(AppEnvironment.self) private var env
    var body: some View {
        let player = env.player
        let versions = VersionChooser.ordered(player.context?.versions ?? [], recommended: nil)
        let languages = versions.map(\.language).reduce(into: [Language]()) { if !$0.contains($1) { $0.append($1) } }
        ForEach(languages, id: \.self) { language in
            Section(language.label) {
                ForEach(versions.filter { $0.language == language }) { v in
                    Button { player.switchVersion(v) } label: {
                        if v.id == player.version?.id { Label(v.qualityLabel, systemImage: "checkmark") } else { Text(v.qualityLabel) }
                    }
                }
            }
        }
    }
}

/// The Audio menu: the stream's tracks, the one playing checked.
struct AudioMenuItems: View {
    @Environment(AppEnvironment.self) private var env
    var body: some View {
        let player = env.player
        if player.audioTracks.isEmpty { Text("Pistes audio connues au démarrage de la lecture") }
        ForEach(player.audioTracks) { t in
            Button { player.select(audio: t) } label: { TrackLabel(track: t) }
        }
    }
}

/// The Sous-titres menu: off, then the stream's tracks, the one shown checked.
struct SubtitleMenuItems: View {
    @Environment(AppEnvironment.self) private var env
    var body: some View {
        let player = env.player
        Button { player.select(text: nil) } label: {
            if player.textTracks.contains(where: \.isSelected) { Text("Désactivés") } else { Label("Désactivés", systemImage: "checkmark") }
        }
        ForEach(player.textTracks) { t in
            Button { player.select(text: t) } label: { TrackLabel(track: t) }
        }
    }
}

private struct TrackLabel: View {
    let track: PlayerService.Track
    var body: some View {
        let name = track.name + (track.language.map { " · \($0)" } ?? "")
        if track.isSelected { Label(name, systemImage: "checkmark") } else { Text(name) }
    }
}

extension Programme {
    /// "Ensuite : Le Journal · 20:00": how the programme after the one on air is announced, everywhere.
    var nextLine: String { "Ensuite : \(title) · \(Format.hour(start))" }
}

/// Under the live progress: when the programme on air started, then what follows (or when it ends).
struct LiveProgressCaption: View {
    @Environment(AppEnvironment.self) private var env
    var body: some View {
        let epg = env.player.epg
        HStack {
            if let now = epg.now {
                Text(Format.hour(now.start))
                Spacer()
                Text(epg.next?.nextLine ?? Format.hour(now.end)).lineLimit(1)
            } else {
                Text("Programme inconnu")
                Spacer()
            }
        }
    }
}
