import SwiftUI

/// After 10 s without an image and the automatic attempts [20].
struct StreamFailureDialog: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics
    @FocusState private var focused: Bool
    private var player: PlayerService { env.player }

    var body: some View {
        ZStack {
            Color.black.opacity(0.75).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 22) {
                Text(player.context?.content.title ?? "").font(.title3).foregroundStyle(Theme.secondary)
                Text("Le flux ne démarre pas").font(.system(size: metrics.dialogTitle, weight: .bold))
                if let f = player.failure {
                    Text("La vidéo n'a pas démarré après \(f.attempts) tentative\(f.attempts > 1 ? "s" : "").")
                        .font(.body).foregroundStyle(Theme.secondary)
                }
                // One button per row, like a tvOS alert: the version label can be long and the dialog is narrow.
                VStack(alignment: .leading, spacing: 14) {
                    if Platform.isTV {
                        // The current version retries; every other one, on a single line, plays instead.
                        if let v = player.version {
                            Button { player.retryFromServer() } label: { Label("Réessayer · \(v.label)", systemImage: "arrow.clockwise") }
                                .focused($focused)
                        }
                        let others = player.alternativeVersions
                        if !others.isEmpty {
                            Text("ou essayer une autre version").font(.callout).foregroundStyle(Theme.secondary).padding(.top, 8)
                            ScrollView(.horizontal) {
                                HStack(spacing: 14) {
                                    ForEach(others) { v in
                                        Button(v.label) { player.playInstead(v) }
                                    }
                                }
                                .padding(.vertical, 12)
                            }
                            .scrollClipDisabled()
                        }
                    } else {
                        // Réessayer is the answer most of the time: the one filled button, as wide as the dialog.
                        Button { player.retryFromServer() } label: {
                            Label("Réessayer", systemImage: "arrow.clockwise").font(.headline).phoneFullWidth(metrics, height: 40)
                        }
                        .prominentButtonStyle()
                        .focused($focused)
                        if let alt = player.alternativeVersion {
                            Button { player.playAlternative() } label: {
                                Label("Autre version · \(alt.label)", systemImage: "rectangle.stack.badge.play").phoneFullWidth(metrics, height: 40)
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                    if Platform.isTV {
                        Button("Quitter", role: .cancel) { player.stop() }
                    } else {
                        Button("Quitter", role: .cancel) { player.stop() }.frame(maxWidth: .infinity).padding(.top, 2)
                    }
                }
                if !Platform.isTV {
                    Text("Réessayer suffit souvent : la source change d'une tentative à l'autre.")
                        .font(.footnote).foregroundStyle(Theme.secondary)
                }
            }
            .padding(metrics.panelPadding)
            .frame(maxWidth: metrics.dialogWidth, alignment: .leading)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 32))
            .padding(.horizontal, metrics.compact ? 16 : 0)
        }
        // Takes the focus on arrival: nothing else on screen is focusable, so the remote would be dead.
        .onAppear { focused = true }
        .onBackCommand { player.stop() }
    }
}

/// Thirty seconds before the end, a 10 s countdown to the next episode [14].
struct NextEpisodeCard: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics
    @FocusState private var focused: Bool
    private var player: PlayerService { env.player }

    var body: some View {
        if metrics.compact { compactCard } else { tvCard }
    }

    /// iPhone: a small card at the top right, above the video upright and clear of the controls sideways:
    /// the countdown, the episode, Lire maintenant and Annuler.
    private var compactCard: some View {
        VStack {
            HStack {
                Spacer()
                if let next = player.context?.next {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("ÉPISODE SUIVANT · \(player.nextCountdown ?? 0) s").font(.caption2.weight(.bold)).tracking(1.2).foregroundStyle(Theme.accent)
                        Text("\(next.ref.code) · \(next.title ?? "")").font(.subheadline.weight(.semibold)).lineLimit(1)
                        if let warning = languageWarning(next) {
                            Text(warning).font(.caption).foregroundStyle(Theme.accent).lineLimit(2)
                        }
                        HStack(spacing: 10) {
                            Button { player.playNextNow() } label: { Label("Lire maintenant", systemImage: "play.fill").font(.footnote.weight(.semibold)) }
                                .prominentButtonStyle()
                            Button("Annuler", role: .cancel) { player.cancelNext() }.font(.footnote)
                        }
                    }
                    .padding(14)
                    .frame(width: 280, alignment: .leading)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20))
                }
            }
            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.top, 56)
        .transition(.move(edge: .trailing).combined(with: .opacity))
    }

    private var tvCard: some View {
        VStack {
            Spacer()
            HStack {
                Spacer()
                if let next = player.context?.next {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("ÉPISODE SUIVANT · \(player.nextCountdown ?? 0) s").font(.caption.weight(.bold)).tracking(1.5).foregroundStyle(Theme.accent)
                        Text("\(player.context?.content.subtitle ?? "") · \(next.ref.code)").font(.callout).foregroundStyle(Theme.secondary)
                        Text(next.title ?? "").font(.title2.weight(.bold))
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
                    .padding(metrics.panelPadding * 0.6)
                    .frame(width: metrics.nextCard, alignment: .leading)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 26))
                }
            }
            // Above the progress bar and its times, which stay visible under the card.
            .padding(metrics.dialogMargin)
            .padding(.bottom, metrics.dialogMargin * 2)
        }
        .onAppear { focused = true }
        .transition(.move(edge: .trailing).combined(with: .opacity))
    }

    private func languageWarning(_ next: NextEpisode) -> String? {
        guard let current = player.version, !next.languages.contains(current.language), let alt = next.languages.first else { return nil }
        return "Pas de \(current.language.rawValue) pour cet épisode : lecture en \(alt.rawValue), retour en \(current.language.rawValue) ensuite."
    }
}
