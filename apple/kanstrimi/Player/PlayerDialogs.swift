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

/// The last 15 s of the file count down to what follows [14]: the next episode, or the title the server
/// suggests after a movie or the last episode of a series.
struct NextEpisodeCard: View {
    /// tvOS: the bar and its progress show under the card; hidden, the card comes down in their place.
    var barShown = true
    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics
    @FocusState private var focused: Bool
    private var player: PlayerService { env.player }

    var body: some View {
        if let upNext = player.upNext {
            if metrics.compact { compactCard(upNext) } else { tvCard(upNext) }
        }
    }

    /// iPhone: a small card at the top right, above the video upright and clear of the controls sideways.
    private func compactCard(_ upNext: PlayerService.UpNext) -> some View {
        VStack {
            HStack {
                Spacer()
                VStack(alignment: .leading, spacing: 8) {
                    Text(heading(upNext)).font(.caption2.weight(.bold)).tracking(1.2).foregroundStyle(Theme.accent)
                    switch upNext {
                    case .episode(let next):
                        Text("\(next.ref.code) · \(next.title ?? "")").font(.subheadline.weight(.semibold)).lineLimit(1)
                        if let warning = languageWarning(next) {
                            Text(warning).font(.caption).foregroundStyle(Theme.accent).lineLimit(2)
                        }
                    case .title(let s):
                        HStack(spacing: 10) {
                            ArtView(id: s.card.id, url: s.card.backdrop ?? s.card.poster).frame(width: 96, height: 54)
                                .clipShape(RoundedRectangle(cornerRadius: 6))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(s.card.title).font(.subheadline.weight(.semibold)).lineLimit(2)
                                Text(facts(s.card)).font(.caption).foregroundStyle(Theme.secondary).lineLimit(1)
                            }
                        }
                    }
                    HStack(spacing: 10) {
                        Button { playNow(upNext) } label: { Label("Lire maintenant", systemImage: "play.fill").font(.footnote.weight(.semibold)) }
                            .prominentButtonStyle()
                        Button("Annuler", role: .cancel) { player.cancelNext() }.font(.footnote)
                    }
                }
                .padding(14)
                .frame(width: 300, alignment: .leading)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20))
            }
            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.top, 56)
        .transition(.move(edge: .trailing).combined(with: .opacity))
    }

    private func tvCard(_ upNext: PlayerService.UpNext) -> some View {
        VStack {
            Spacer()
            HStack {
                Spacer()
                VStack(alignment: .leading, spacing: 14) {
                    Text(heading(upNext)).font(.caption.weight(.bold)).tracking(1.5).foregroundStyle(Theme.accent)
                    switch upNext {
                    case .episode(let next):
                        Text("\(player.context?.content.subtitle ?? "") · \(next.ref.code)").font(.callout).foregroundStyle(Theme.secondary)
                        Text(next.title ?? "").font(.title2.weight(.bold))
                        HStack(spacing: 10) {
                            if let r = next.runtime { Text("\(r) min").foregroundStyle(Theme.secondary) }
                            VersionBadges(quality: next.maxQuality.map { q in next.dynamicRange.map { "\(q.rawValue) \($0.shortLabel)" } ?? q.rawValue }, languages: next.languages)
                        }
                        if let warning = languageWarning(next) {
                            Text(warning).font(.callout).foregroundStyle(Theme.accent)
                        }
                    case .title(let s):
                        ArtView(id: s.card.id, url: s.card.backdrop ?? s.card.poster)
                            .frame(width: metrics.nextCard - metrics.panelPadding * 1.2, height: (metrics.nextCard - metrics.panelPadding * 1.2) * 9 / 16)
                            .overlay(alignment: .bottomLeading) {
                                TitleLogo(title: s.card.title, logo: s.card.logo, maxSize: CGSize(width: 300, height: 90))
                                    .padding(18)
                            }
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                        HStack(spacing: 10) {
                            Text(facts(s.card)).foregroundStyle(Theme.secondary)
                            VersionBadges(quality: s.card.qualityBadge, languages: s.card.languages)
                        }
                        .font(.callout)
                        if let o = s.card.overview { Text(o).font(.callout).foregroundStyle(Theme.text.opacity(0.85)).lineLimit(3) }
                    }
                    HStack(spacing: 16) {
                        Button("Lire maintenant") { playNow(upNext) }.focused($focused)
                        Button("Annuler", role: .cancel) { player.cancelNext() }
                    }
                }
                .padding(metrics.panelPadding * 0.6)
                .frame(width: metrics.nextCard, alignment: .leading)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 26))
            }
            // Above the progress bar and its times while they show; down in their place once they hide.
            .padding(metrics.dialogMargin)
            .padding(.bottom, barShown ? metrics.dialogMargin * 2 : 0)
        }
        .onAppear { focused = true }
        .transition(.move(edge: .trailing).combined(with: .opacity))
    }

    /// « ÉPISODE SUIVANT · 7 s », « À SUIVRE · SAGA · 7 s ».
    private func heading(_ upNext: PlayerService.UpNext) -> String {
        let seconds = "\(player.nextCountdown ?? 0) s"
        switch upNext {
        case .episode: return "ÉPISODE SUIVANT · \(seconds)"
        case .title(let s) where s.reason == .saga: return "À SUIVRE · SUITE DE LA SAGA · \(seconds)"
        case .title(let s) where s.card.kind == .series: return "À SUIVRE · NOUVELLE SÉRIE · \(seconds)"
        case .title: return "À SUIVRE · \(seconds)"
        }
    }

    /// « 2003 · Action · 2 h 18 », « Série · 2018 · Drame ».
    private func facts(_ c: Card) -> String {
        var parts: [String] = c.kind == .series ? ["Série"] : []
        if let y = c.year { parts.append(String(y)) }
        if let g = c.genres.first { parts.append(g) }
        if c.kind != .series, let r = c.runtime { parts.append(Format.runtime(minutes: r)) }
        return parts.joined(separator: " · ")
    }

    private func playNow(_ upNext: PlayerService.UpNext) {
        switch upNext {
        case .episode: player.playNextNow()
        case .title where player.nextContext != nil: player.playNextNow()
        case .title(let s):
            // Its playback not fetched yet: asked now.
            Task {
                guard let ctx = try? await env.playbackContext(suggested: s.card) else { return }
                player.play(ctx)
            }
        }
    }

    private func languageWarning(_ next: NextEpisode) -> String? {
        guard let current = player.version, !next.languages.contains(current.language), let alt = next.languages.first else { return nil }
        return "Pas de \(current.language.rawValue) pour cet épisode : lecture en \(alt.rawValue), retour en \(current.language.rawValue) ensuite."
    }
}
