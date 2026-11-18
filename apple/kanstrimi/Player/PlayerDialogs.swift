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
                VStack(alignment: .leading, spacing: 14) {
                    // Réessayer is the answer most of the time: first, the one filled button on a phone.
                    if metrics.compact {
                        Button { player.retryFromServer() } label: {
                            Label("Réessayer", systemImage: "arrow.clockwise").font(.headline).phoneFullWidth(metrics, height: 40)
                        }
                        .prominentButtonStyle()
                        .focused($focused)
                    } else if let v = player.variant {
                        Button { player.retryFromServer() } label: { Label("Réessayer · \(v.name)", systemImage: "arrow.clockwise").lineLimit(1) }
                            .focused($focused)
                    }
                    let others = player.alternativeVariants
                    if !others.isEmpty {
                        Text("ou essayer une autre variante").font(.callout).foregroundStyle(Theme.secondary).padding(.top, 8)
                        ScrollView {
                            VariantList(variants: others, marks: { VariantMarks(failed: env.failedVariants.isFailed($0.id)) }, inline: true,
                                        severalLanguages: (player.context?.variants.languages.count ?? 0) > 1) {
                                player.playInstead($0)
                            }
                            // tvOS enlarges the focused row: room for it inside the scroll view, which clips.
                            .padding(.vertical, Platform.isTV ? 16 : 0)
                            .padding(.horizontal, Platform.isTV ? 40 : 0)
                        }
                        .padding(.horizontal, Platform.isTV ? -40 : 0)
                        .frame(maxHeight: Platform.isTV ? 380 : 240)
                    }
                    if !metrics.compact {
                        Button("Quitter", role: .cancel) { player.stop() }
                    } else {
                        Button("Quitter", role: .cancel) { player.stop() }.frame(maxWidth: .infinity).padding(.top, 2)
                    }
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

/// « Passer le récap », « Passer l'intro », at the bottom right while one plays; its name comes from the server.
/// Touch: a button to tap. tvOS: drawn as a focused button and not one, the video keeps the remote and its click
/// is this one (`PlayerScreen.select`).
struct SkipButton: View {
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
                if !Platform.isTV {
                    Button(action: action) { title.font(.subheadline.weight(.semibold)).padding(.horizontal, 6).padding(.vertical, 4) }
                        .prominentButtonStyle()
                } else {
                    // The size of a focused button of the bar (`BarButtonStyle`), without its growth.
                    title.font(.callout.weight(.semibold)).foregroundStyle(.black)
                        .padding(.horizontal, 28).frame(height: 72)
                        .background(.white, in: Capsule())
                        .shadow(color: .black.opacity(0.4), radius: 16, y: 6)
                }
            }
            .padding(metrics.dialogMargin)
            // Touch: above the bottom controls of the touch player; tvOS: above the bar and its times.
            .padding(.bottom, barShown ? (Platform.isTV ? metrics.dialogMargin * 2 : 120) : 0)
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
            if Platform.isTV { tvPlacement(card(upNext)) } else { compactPlacement(card(upNext)) }
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

    /// Touch: at the top right, above the video upright and clear of the controls at the bottom.
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
        guard let current = player.variant?.language, let alternative = next.languages.first, !next.languages.contains(current) else { return nil }
        return VariantChooser.languageWarning(episode: next.number, alternative: alternative, current: current, returnsAt: nil)
    }
}
