import SwiftUI

/// After 10 s without an image and the automatic attempts [20].
struct StreamFailureDialog: View {
    @Environment(AppEnvironment.self) private var env
    private var player: PlayerService { env.player }

    var body: some View {
        ZStack {
            Color.black.opacity(0.75).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 22) {
                Text(player.context?.content.title ?? "").font(.title3).foregroundStyle(Theme.secondary)
                Text("Le flux ne démarre pas").font(.system(size: 48, weight: .bold))
                if let f = player.failure {
                    Text("Aucune image après 10 s · \(f.attempts) tentative\(f.attempts > 1 ? "s" : "") sur \(f.sourceLabel)\(f.hadAlternativeSource ? "" : ", aucune autre source pour cette version")")
                        .font(.body).foregroundStyle(Theme.secondary)
                }
                HStack(spacing: 20) {
                    Button { player.retryFromServer() } label: { Label("Réessayer", systemImage: "arrow.clockwise") }
                    if let alt = player.alternativeVersion {
                        Button { player.playAlternative() } label: { Label("Autre version · \(alt.label)", systemImage: "square.stack.3d.up") }
                    }
                    Button("Quitter", role: .cancel) { player.stop() }
                }
                Text("Le serveur ne relaie pas la vidéo : réessayer redemande l'URL et obtient un jeton amont frais, souvent sur un autre backend.")
                    .font(.callout).foregroundStyle(Theme.secondary)
            }
            .padding(48)
            .frame(maxWidth: 1100, alignment: .leading)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 32))
        }
        .onExitCommand { player.stop() }
    }
}

/// Thirty seconds before the end, a 10 s countdown to the next episode [14].
struct NextEpisodeCard: View {
    @Environment(AppEnvironment.self) private var env
    @FocusState private var focused: Bool
    private var player: PlayerService { env.player }

    var body: some View {
        VStack {
            Spacer()
            HStack {
                Spacer()
                if let next = player.context?.next {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("ÉPISODE SUIVANT · \(player.nextCountdown ?? 0) s").font(.caption.weight(.bold)).tracking(1.5).foregroundStyle(Theme.accent)
                        Text("\(next.seriesTitle) · \(next.episode.code)").font(.callout).foregroundStyle(Theme.secondary)
                        Text(next.episode.title ?? "").font(.title2.weight(.bold))
                        HStack(spacing: 10) {
                            if let r = next.runtime { Text("\(r) min").foregroundStyle(Theme.secondary) }
                            VersionBadges(quality: next.maxQuality.map { q in next.dynamicRange.map { "\(q.rawValue) \($0.shortLabel)" } ?? q.rawValue }, languages: next.languages)
                        }
                        if let warning = languageWarning(next) {
                            Text(warning).font(.callout).foregroundStyle(Theme.accent)
                        }
                        HStack(spacing: 16) {
                            Button("Lire maintenant") { player.playNextNow() }.focused($focused)
                            Button("Annuler", role: .cancel) { player.cancelNext() }
                        }
                    }
                    .padding(30)
                    .frame(width: 620, alignment: .leading)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 26))
                }
            }
            .padding(70)
        }
        .onAppear { focused = true }
        .transition(.move(edge: .trailing).combined(with: .opacity))
    }

    private func languageWarning(_ next: NextEpisode) -> String? {
        guard let current = player.version, !next.languages.contains(current.language), let alt = next.languages.first else { return nil }
        return "Pas de \(current.language.rawValue) pour cet épisode : lecture en \(alt.rawValue), retour en \(current.language.rawValue) ensuite."
    }
}
