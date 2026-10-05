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
                    if !metrics.compact {
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
                                // Room for the focus enlargement, now that the scroll is clipped to the panel.
                                .padding(.vertical, 12)
                                .padding(.horizontal, 12)
                            }
                            // The same room taken back outside: the chips stay aligned with the text above.
                            .padding(.horizontal, -12)
                        }
                    } else {
                        // Réessayer is the answer most of the time: the one filled button, as wide as the dialog.
                        Button { player.retryFromServer() } label: {
                            Label("Réessayer", systemImage: "arrow.clockwise").font(.headline).phoneFullWidth(metrics, height: 40)
                        }
                        .prominentButtonStyle()
                        .focused($focused)
                        if let alt = player.alternativeVersions.first {
                            Button { player.playInstead(alt) } label: {
                                Label("Autre version · \(alt.label)", systemImage: "rectangle.stack.badge.play").phoneFullWidth(metrics, height: 40)
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                    if !metrics.compact {
                        Button("Quitter", role: .cancel) { player.stop() }
                    } else {
                        Button("Quitter", role: .cancel) { player.stop() }.frame(maxWidth: .infinity).padding(.top, 2)
                    }
                }
                if metrics.compact {
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

/// « Passer l'intro », at the bottom right while the intro plays; its name comes from the server. iPhone: a button
/// to tap. tvOS: drawn as a focused button and not one, the video keeps the remote and its click is this one
/// (`PlayerScreen.select`).
struct SkipIntroButton: View {
    let label: String
    /// The bar and its progress show under it; hidden, it comes down in their place.
    var barShown = true
    let action: () -> Void
    @Environment(\.metrics) private var metrics

    var body: some View {
        VStack {
            Spacer()
            HStack {
                Spacer()
                if metrics.compact {
                    Button(action: action) { title.font(.subheadline.weight(.semibold)).padding(.horizontal, 6).padding(.vertical, 4) }
                        .prominentButtonStyle()
                } else {
                    title.font(.headline).foregroundStyle(.black)
                        .padding(.horizontal, 32).padding(.vertical, 18)
                        .background(.white, in: Capsule())
                        .shadow(color: .black.opacity(0.4), radius: 16, y: 6)
                }
            }
            .padding(metrics.dialogMargin)
            .padding(.bottom, barShown ? (metrics.compact ? 120 : metrics.dialogMargin * 2) : 0)
        }
    }

    private var title: some View { Label(label, systemImage: "forward.end.fill") }
}

/// What follows counts down [14], from the start of the end credits when the server knows it, else in the last
/// 15 s of the file: the next episode, or the title the server suggests after a movie or the last episode of a
/// series. Places `UpNextCard` and gives it the countdown, the language warning and the focus.
struct NextEpisodeCard: View {
    /// tvOS: the bar and its progress show under the card; hidden, the card comes down in their place.
    var barShown = true
    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics
    @FocusState private var focused: Bool
    private var player: PlayerService { env.player }

    var body: some View {
        if let upNext = player.upNext {
            if metrics.compact { compactPlacement(card(upNext)) } else { tvPlacement(card(upNext)) }
        }
    }

    private func card(_ upNext: PlayerService.UpNext) -> some View {
        let (label, item, warning): (String, ContentItem, String?) = switch upNext {
        case .episode(let next):
            (next.heading, next.item, languageWarning(next))
        case .title(let s): (s.heading, s.item, nil)
        }
        return UpNextCard(heading: "\(label) · \(player.nextCountdown ?? 0) s", item: item, warning: warning, playFocus: $focused,
                          onPlay: { playNow(upNext) }, onCancel: { player.cancelNext() })
            .frame(width: metrics.upNextWidth)
    }

    /// iPhone: at the top right, above the video upright and clear of the controls sideways.
    private func compactPlacement(_ card: some View) -> some View {
        VStack {
            HStack {
                Spacer()
                card
            }
            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.top, 56)
        .transition(.move(edge: .trailing).combined(with: .opacity))
    }

    private func tvPlacement(_ card: some View) -> some View {
        VStack {
            Spacer()
            HStack {
                Spacer()
                card
            }
            // Above the progress bar and its times while they show; down in their place once they hide.
            .padding(metrics.dialogMargin)
            .padding(.bottom, barShown ? metrics.dialogMargin * 2 : 0)
        }
        .onAppear { focused = true }
        .transition(.move(edge: .trailing).combined(with: .opacity))
    }

    private func playNow(_ upNext: PlayerService.UpNext) {
        switch upNext {
        case .episode: player.playNextNow()
        case .title where player.nextContext != nil: player.playNextNow()
        case .title(let s):
            // Its playback not fetched yet: asked now.
            Task { _ = await player.playPicked({ await env.attempt("Lecture") { try await env.playbackContext(for: s.item) } }) }
        }
    }

    /// The chain's following episodes are not known here: no return announced.
    private func languageWarning(_ next: NextEpisode) -> String? {
        guard let current = player.version?.language, let alternative = next.languages.first, !next.languages.contains(current) else { return nil }
        return VersionChooser.languageWarning(episode: next.number, alternative: alternative, current: current, returnsAt: nil)
    }
}
