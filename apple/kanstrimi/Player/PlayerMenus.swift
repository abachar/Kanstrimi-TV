import SwiftUI

// What the tvOS bar and the touch controls share: their panels, their menus, the live caption.

extension PlayerService {
    /// The panels the bar offers: live, an episode, a film. Similaires once the server answered with some.
    var panels: [PlayerScreen.BarPanel] {
        if isLive { return [.programme, .recents, .infos] }
        let related: [PlayerScreen.BarPanel] = suggestions?.related.isEmpty == false ? [.related] : []
        if context?.content.kind == .episode { return [.episodes] + related + [.infos] }
        return related + [.infos]
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

/// The Versions menu: by language, the one playing checked.
struct VersionMenuItems: View {
    @Environment(AppEnvironment.self) private var env
    var body: some View {
        let player = env.player
        let versions = player.context?.versions ?? []
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

/// Under the live progress: when the programme on air started, then what follows (or when it ends).
struct LiveProgressCaption: View {
    @Environment(AppEnvironment.self) private var env
    var body: some View {
        let epg = env.player.epg
        HStack {
            if let now = epg.now {
                Text(Format.hour(now.start))
                Spacer()
                Text(epg.next.map { "Ensuite : \($0.title) · \(Format.hour($0.start))" } ?? Format.hour(now.end)).lineLimit(1)
            } else {
                Text("Programme inconnu")
                Spacer()
            }
        }
    }
}
