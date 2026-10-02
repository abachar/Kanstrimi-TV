import SwiftUI

/// Film and series sheet [7] [9] [18]: one screen, seasons and episodes inside it for a series.
struct DetailView: View {
    let id: ContentID
    @Environment(AppEnvironment.self) private var env
    @State private var model: DetailModel?
    @State private var showPicker = false
    @State private var saga: SagaRef?
    @State private var person: PersonRef?

    var body: some View {
        Group {
            if let model {
                DetailContent(model: model, showPicker: $showPicker, openSaga: openSaga, openPerson: openPerson)
            } else {
                Color.clear
            }
        }
        .background(Theme.background)
        .task {
            if model == nil {
                let m = DetailModel(id: id, env: env)
                model = m
                await m.load()
            }
        }
        .onChange(of: env.player.progressRevision) { Task { await model?.refresh() } }
        .platformSheet(isPresented: $showPicker) {
            if let model, let d = model.detail {
                VersionPicker(title: d.title, versions: d.versions, recommendedID: model.choice?.version.id, isSeries: model.isSeries) { v, s in
                    // Let the picker finish dismissing before the player cover presents.
                    Task {
                        try? await Task.sleep(for: .milliseconds(400))
                        model.chose(version: v, source: s)
                    }
                }
                .environment(env)
            }
        }
        .fullScreenCover(item: $saga) { ref in
            // On tvOS the saga covers this sheet: close it before the chosen movie replaces the sheet.
            SagaView(ref: ref, onSelect: { id in saga = nil; env.open(id) }).environment(env)
        }
        .fullScreenCover(item: $person) { ref in
            // Same as the saga: on tvOS the actor's screen covers this sheet, so it closes before the chosen title replaces the sheet.
            PersonView(ref: ref, onSelect: { id in person = nil; env.open(id) }).environment(env)
        }
    }

    private func openSaga(_ ref: SagaRef) {
        if Platform.isTV { saga = ref } else { env.navigate(.saga(ref)) }
    }

    private func openPerson(_ ref: PersonRef) {
        if Platform.isTV { person = ref } else { env.navigate(.person(ref)) }
    }
}

private struct DetailContent: View {
    @Bindable var model: DetailModel
    @Binding var showPicker: Bool
    let openSaga: (SagaRef) -> Void
    let openPerson: (PersonRef) -> Void
    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics
    @Environment(\.openURL) private var openURL
    @FocusState private var focused: Focus?
    /// iPhone: the overview shows in full after a tap.
    @State private var overviewExpanded = false
    private enum Focus: Hashable { case play, restart, watched, versions, trailer, favorite, language, season(Int), episode(ContentID) }

    var body: some View {
        if let error = model.error, model.detail == nil {
            StatePanel(icon: "exclamationmark.triangle", title: "Fiche indisponible", message: error.localizedDescription) {
                Task { await model.load() }
            }
        } else if let d = model.detail, metrics.compact {
            phoneBody(d)
        } else if let d = model.detail {
            ZStack(alignment: .topLeading) {
                backdrop(d)
                ScrollView {
                    VStack(alignment: .leading, spacing: 34) {
                        header(d).padding(.top, metrics.detailTop)
                        buttons(d)
                        if d.kind != .series { castRow(d) }
                        if d.kind == .series { seasons(d); castRow(d) }
                        relatedRow(d)
                        Spacer(minLength: 80)
                    }
                    .padding(.horizontal, metrics.inset)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .ignoresSafeArea(edges: .horizontal)
            }
            .onAppear { focused = .play }
        } else {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    /// iPhone: the backdrop as a banner at the top that scrolls with the page, the title over its faded end.
    private func phoneBody(_ d: Card) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if d.isMatched {
                    ArtView(id: d.id, url: d.backdrop)
                        .frame(maxWidth: .infinity).frame(height: 320)
                        .overlay {
                            LinearGradient(stops: [.init(color: Theme.background.opacity(0.5), location: 0),
                                                   .init(color: .clear, location: 0.3),
                                                   .init(color: Theme.background.opacity(0.7), location: 0.75),
                                                   .init(color: Theme.background, location: 1)],
                                           startPoint: .top, endPoint: .bottom)
                        }
                } else {
                    Color.clear.frame(height: 110)
                }
                VStack(alignment: .leading, spacing: 24) {
                    header(d)
                    buttons(d)
                    if d.kind != .series { castRow(d) }
                    if d.kind == .series { seasons(d); castRow(d) }
                    relatedRow(d)
                }
                .padding(.horizontal, metrics.inset)
                .padding(.top, d.isMatched ? -90 : 0)
                Spacer(minLength: 60)
            }
        }
        .ignoresSafeArea(edges: .top)
    }

    private func backdrop(_ d: Card) -> some View {
        ZStack {
            if d.isMatched {
                ArtView(id: d.id, url: d.backdrop).ignoresSafeArea()
                LinearGradient(colors: [Theme.background.opacity(0.92), Theme.background.opacity(0.2)], startPoint: .leading, endPoint: .trailing)
                LinearGradient(colors: [.clear, Theme.background.opacity(0.9), Theme.background], startPoint: .top, endPoint: .bottom)
            } else {
                Theme.background
            }
        }
        .ignoresSafeArea()
    }

    /// The version Lecture plays, filled: its quality and its language; the other languages outlined.
    /// Without a choice yet, the best quality and every language, all outlined.
    private func versionTags(_ d: Card) -> some View {
        let chosen = model.choice?.version
        let quality = chosen.map(Self.qualityTag) ?? d.versions.maxQuality.map { q in
            d.versions.maxDynamicRange.map { $0 == .sdr ? q.rawValue : "\(q.rawValue) \($0.label)" } ?? q.rawValue
        }
        return HStack(spacing: 6) {
            if let quality { Badge(quality, filled: chosen != nil) }
            ForEach(d.versions.languages, id: \.self) { l in Badge(l.rawValue, filled: l == chosen?.language) }
        }
    }

    private static func qualityTag(_ v: Version) -> String {
        guard let dr = v.dynamicRange, dr != .sdr else { return v.quality.rawValue }
        return "\(v.quality.rawValue) \(dr.label)"
    }

    private func header(_ d: Card) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(tagline(d)).font(.caption.weight(.bold)).tracking(2).foregroundStyle(Theme.accent)
            TitleLogo(title: d.title, logo: d.logo)
            if metrics.compact {
                // Phone: the facts on their own line, the certification and the rating with the tags,
                // so that none of them breaks a line in the middle.
                Text(meta(d)).font(.subheadline).foregroundStyle(Theme.secondary)
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 10) { ratingAndCertification(d); versionTags(d) }
                    VStack(alignment: .leading, spacing: 10) { HStack(spacing: 10) { ratingAndCertification(d) }; versionTags(d) }
                }
            } else {
                HStack(spacing: 14) {
                    Text(meta(d)).foregroundStyle(Theme.secondary)
                    if let c = d.certification { Badge(c) }
                    if let r = d.rating { Text(String(format: "★ %.1f", r)).foregroundStyle(Theme.accent) }
                }
                .font(.title3)
                versionTags(d)
            }
            if let s = d.saga {
                Button { openSaga(s) } label: {
                    Label("\(s.name) · \(s.count) films", systemImage: "square.stack")
                }
                .buttonStyle(.bordered)
            }
            if d.isMatched {
                if let o = d.overview {
                    if metrics.compact {
                        Text(o).font(.subheadline).foregroundStyle(Theme.text.opacity(0.9)).lineLimit(overviewExpanded ? nil : 3)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                            .onTapGesture { withAnimation(.easeInOut(duration: 0.2)) { overviewExpanded.toggle() } }
                            .accessibilityHint(overviewExpanded ? "" : "Afficher le résumé complet")
                    } else {
                        Text(o).font(.body).foregroundStyle(Theme.text.opacity(0.9)).frame(maxWidth: metrics.textWidth, alignment: .leading).lineLimit(4)
                    }
                }
                if let director = d.director {
                    Text("Réalisation \(director)")
                        .font(metrics.compact ? .footnote : .callout).foregroundStyle(Theme.secondary).frame(maxWidth: metrics.textWidth, alignment: .leading)
                        .lineLimit(metrics.compact ? 2 : nil)
                }
            } else {
                noTMDB(d)
            }
        }
    }

    /// The cast with photos, for a matched title that has one.
    @ViewBuilder private func castRow(_ d: Card) -> some View {
        if d.isMatched, !d.cast.isEmpty { CastRow(cast: d.cast, onSelect: openPerson) }
    }

    /// « Titres similaires », when the server found some in the catalogue.
    @ViewBuilder private func relatedRow(_ d: Card) -> some View {
        if !d.related.isEmpty { RelatedRow(cards: d.related) { env.open($0) } }
    }

    @ViewBuilder private func ratingAndCertification(_ d: Card) -> some View {
        if let c = d.certification { Badge(c) }
        if let r = d.rating { Text(String(format: "★ %.1f", r)).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.accent) }
    }

    private func tagline(_ d: Card) -> String {
        if d.kind == .series { return "SÉRIE · \(d.seasons?.count ?? 0) SAISON\((d.seasons?.count ?? 0) > 1 ? "S" : "")" }
        return "FILM"
    }

    private func meta(_ d: Card) -> String {
        var parts: [String] = []
        if let y = d.year { parts.append(d.endYear.map { "\(y) – \($0)" } ?? String(y)) }
        if !d.genres.isEmpty { parts.append(d.genres.prefix(2).joined(separator: ", ")) }
        if let r = d.runtime { parts.append(Format.runtime(minutes: r)) }
        return parts.joined(separator: " · ")
    }

    private func noTMDB(_ d: Card) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Pas encore de fiche détaillée pour ce titre : ni résumé, ni distribution.", systemImage: "info.circle").font(.headline)
            Text("La lecture, la reprise et Ma liste fonctionnent normalement.").font(.callout).foregroundStyle(Theme.secondary)
        }
        .padding(20)
        .frame(maxWidth: metrics.textWidth, alignment: .leading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }

    /// One row on TV; on a phone Lecture takes the width and the others share the line below it.
    @ViewBuilder private func buttons(_ d: Card) -> some View {
        if metrics.compact {
            VStack(spacing: 18) {
                buttonSet(d, primaryOnly: true)
                HStack(alignment: .top, spacing: 4) { buttonSet(d, secondaryOnly: true) }
            }
        } else {
            tvButtons(d)
        }
    }

    private func tvButtons(_ d: Card) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .top, spacing: 20) { buttonSet(d) }.fixedSize()
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 12) { buttonSet(d, primaryOnly: true) }.fixedSize()
                ScrollView(.horizontal) {
                    HStack(spacing: 12) { buttonSet(d, secondaryOnly: true) }.fixedSize()
                }
                .scrollClipDisabled()
            }
        }
        .buttonStyle(.bordered)
    }

    @ViewBuilder private func buttonSet(_ d: Card, primaryOnly: Bool = false, secondaryOnly: Bool = false) -> some View {
        if !secondaryOnly {
            Button { Task { await model.playPrimary() } } label: {
                Label(model.primaryLabel, systemImage: "play.fill").font(.headline).phoneFullWidth(metrics)
            }
            .prominentButtonStyle()
            .focused($focused, equals: .play)
            .onLongPressGesture(minimumDuration: 0.5) { if hasChoice(d) { showPicker = true } }
            .disabled(d.versions.isEmpty)
        }
        if !primaryOnly {
            if model.canRestart {
                IconAction(title: "Depuis le début", systemImage: "arrow.counterclockwise", focused: focused == .restart) {
                    Task { await model.playPrimary(fromStart: true) }
                }
                .focused($focused, equals: .restart)
                .disabled(d.versions.isEmpty)
            }
            if d.kind == .series, hasChoice(d) {
                IconAction(title: "Langue · \(model.seriesChoice?.label ?? "—")", systemImage: "waveform", focused: focused == .language) { showPicker = true }
                    .focused($focused, equals: .language)
                    .disabled(d.versions.isEmpty)
            } else if d.kind != .series {
                if hasChoice(d) {
                    IconAction(title: "Versions (\(d.versions.count))", systemImage: "rectangle.stack.badge.play", focused: focused == .versions) { showPicker = true }
                        .focused($focused, equals: .versions)
                }
                let watched = d.progress?.isWatched == true
                IconAction(title: watched ? "Vu" : "Marquer comme vu", systemImage: "checkmark", focused: focused == .watched) {
                    Task { await model.setWatched(!watched) }
                }
                .focused($focused, equals: .watched)
            }
            if let trailer = d.trailer.flatMap(Platform.trailerURL) {
                IconAction(title: "Bande-annonce", systemImage: "film", focused: focused == .trailer) { openURL(trailer) }
                    .focused($focused, equals: .trailer)
            }
            let favorite = d.isFavorite == true
            IconAction(title: favorite ? "Dans ma liste" : "Ma liste", systemImage: favorite ? "heart.fill" : "heart", focused: focused == .favorite) {
                Task { await model.toggleFavorite() }
            }
            .focused($focused, equals: .favorite)
        }
    }

    /// The version picker would show more than one line.
    private func hasChoice(_ d: Card) -> Bool { VersionPicker.lineCount(d.versions) > 1 }

    // MARK: - Series

    private func seasonButtons(_ d: Card) -> some View {
        HStack(spacing: 12) {
            ForEach(d.seasons ?? []) { s in
                Button("Saison \(s.number)") { model.selectedSeason = s.number }
                .buttonStyle(.bordered)
                .tint(model.selectedSeason == s.number ? Theme.accent : nil)
                .focused($focused, equals: .season(s.number))
                .contextMenu {
                    Button { Task { await model.setWatched(true, season: s.number) } } label: {
                        Label("Marquer la saison comme vue", systemImage: "checkmark.circle")
                    }
                    Button { Task { await model.setWatched(false, season: s.number) } } label: {
                        Label("Marquer la saison comme non vue", systemImage: "circle")
                    }
                }
            }
        }
    }

    private func seasons(_ d: Card) -> some View {
        VStack(alignment: .leading, spacing: 22) {
            // A long series scrolls its seasons sideways on a phone.
            if metrics.compact {
                ScrollView(.horizontal) { seasonButtons(d) }.scrollClipDisabled()
            } else {
                seasonButtons(d)
            }
            if let n = model.selectedSeason {
                if let gap = model.languageGaps(in: n).first, let lang = model.seriesChoice?.language, let alt = gap.languages.first {
                    let back = model.episodes(in: n).first { $0.number > gap.number && $0.languages.contains(lang) }
                    Label("É\(gap.number) n'existe qu'en \(alt.rawValue). L'enchaînement le lira en \(alt.rawValue) \(gap.versions.maxQuality?.rawValue ?? "")\(back.map { ", puis reviendra en \(lang.rawValue) à l'épisode \($0.number)" } ?? ".")",
                          systemImage: "info.circle")
                        .font(.callout).foregroundStyle(Theme.accent)
                }
                LazyVStack(spacing: metrics.compact ? 6 : 14) {
                    ForEach(model.episodes(in: n)) { e in
                        EpisodeRow(episode: e, seriesLanguage: model.seriesChoice?.language) { Task { await model.play(episode: e) } }
                            .focused($focused, equals: .episode(e.id))
                            .contextMenu {
                                let watched = e.progress?.isWatched == true
                                Button { Task { await model.setWatched(!watched, episode: e) } } label: {
                                    Label(watched ? "Marquer comme non vu" : "Marquer comme vu", systemImage: watched ? "circle" : "checkmark.circle")
                                }
                            }
                    }
                }
            }
        }
    }
}

/// One episode inside the sheet: thumbnail, number, title, duration, languages, seen or progress.
struct EpisodeRow: View {
    @Environment(\.metrics) private var metrics
    let episode: Episode
    let seriesLanguage: Language?
    let action: () -> Void

    var body: some View {
        if metrics.compact { phoneRow } else { tvRow }
    }

    /// iPhone: the still and the title side by side, the summary under both at full width; no version
    /// tags, the sheet already shows them, except the one-language warning.
    private var phoneRow: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 14) {
                    still
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(episode.number). \(episode.title)").font(.subheadline.weight(.semibold)).lineLimit(2)
                        Text(facts).font(.caption).foregroundStyle(Theme.secondary).lineLimit(1)
                        if let warning = languageWarning {
                            Text(warning).font(.caption2.weight(.bold)).padding(.horizontal, 6).padding(.vertical, 2)
                                .background(Theme.accent, in: Capsule()).foregroundStyle(.black)
                        }
                    }
                    Spacer(minLength: 0)
                }
                if let o = episode.overview {
                    Text(o).font(.caption).foregroundStyle(Theme.secondary).lineLimit(3).multilineTextAlignment(.leading)
                }
            }
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .cardButtonStyle()
        .disabled(episode.versions.isEmpty)
    }

    private var still: some View {
        ZStack(alignment: .bottomLeading) {
            ArtView(id: episode.id, url: episode.still).frame(width: metrics.stillWidth, height: metrics.stillWidth * 9 / 16)
            if let p = episode.progress, p.isResumable {
                ProgressBar(fraction: p.fraction, height: 3).padding(.horizontal, 8).padding(.bottom, 6)
            }
            if episode.progress?.isWatched == true {
                Image(systemName: "checkmark.circle.fill").font(.callout).padding(6).foregroundStyle(.white)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
            }
        }
        .frame(width: metrics.stillWidth, height: metrics.stillWidth * 9 / 16)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    /// "45 min · 12 min restantes".
    private var facts: String {
        var parts: [String] = []
        if let r = episode.runtime { parts.append("\(r) min") }
        if let p = episode.progress, p.isResumable { parts.append(Format.remaining(p.remaining)) }
        else if episode.progress?.isWatched == true { parts.append("Vu") }
        return parts.joined(separator: " · ")
    }

    private var languageWarning: String? {
        guard let l = seriesLanguage, !episode.languages.contains(l), let only = episode.languages.first else { return nil }
        return "\(only.rawValue) SEUL"
    }

    private var tvRow: some View {
        Button(action: action) {
            HStack(spacing: 24) {
                ZStack(alignment: .bottomLeading) {
                    ArtView(id: episode.id, url: episode.still).frame(width: metrics.stillWidth, height: metrics.stillWidth * 9 / 16)
                    if let p = episode.progress, p.isResumable {
                        ProgressBar(fraction: p.fraction, height: 5).padding(.horizontal, 10).padding(.bottom, 8)
                    }
                    if episode.progress?.isWatched == true {
                        Image(systemName: "checkmark.circle.fill").font(.title2).padding(10).foregroundStyle(.white)
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                    }
                }
                .frame(width: metrics.stillWidth, height: metrics.stillWidth * 9 / 16)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text("\(episode.number)").font(.headline).foregroundStyle(Theme.secondary)
                        Text(episode.title).font(.headline).lineLimit(2)
                    }
                    if let o = episode.overview { Text(o).font(.callout).foregroundStyle(Theme.secondary).lineLimit(2) }
                    // Badges and times on one line that scrolls when the row is narrow.
                    ScrollView(.horizontal) { HStack(spacing: 8) {
                        if let r = episode.runtime { Text("\(r) min").font(.caption).foregroundStyle(Theme.secondary) }
                        VersionBadges(quality: episode.versions.maxQuality.map { q in episode.versions.maxDynamicRange.map { $0 == .sdr ? q.rawValue : "\(q.rawValue) \($0.shortLabel)" } ?? q.rawValue },
                                      languages: episode.languages)
                        if let l = seriesLanguage, !episode.languages.contains(l), let only = episode.languages.first {
                            Text("\(only.rawValue) SEUL").font(.caption2.weight(.bold)).padding(.horizontal, 8).padding(.vertical, 3)
                                .background(Theme.accent, in: Capsule()).foregroundStyle(.black)
                        }
                        if let p = episode.progress, p.isResumable {
                            Text(Format.remaining(p.remaining)).font(.caption).foregroundStyle(Theme.secondary)
                        }
                    } .fixedSize() }
                    .scrollClipDisabled()
                }
                Spacer()
            }
            .padding(14)
        }
        .cardButtonStyle()
        .disabled(episode.versions.isEmpty)
    }
}

/// A secondary action of the sheet: a round icon, its label under it. On tvOS the label shows
/// only on the focused one, so the row stays light; touch and pointer screens always show it.
struct IconAction: View {
    @Environment(\.metrics) private var metrics
    let title: String
    let systemImage: String
    let focused: Bool
    let action: () -> Void

    var body: some View {
        if Platform.isTV {
            // An overlay: the label of the focused one must not push its neighbours apart.
            button
                .padding(.bottom, 44)
                .overlay(alignment: .bottom) { label.opacity(focused ? 1 : 0) }
        } else {
            // The actions share the width of the line; a long label takes two lines instead of being cut.
            VStack(spacing: 6) {
                button
                Text(title).font(.caption2).foregroundStyle(Theme.secondary).lineLimit(2).multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity, alignment: .top)
        }
    }

    private var button: some View {
        Button(action: action) { Image(systemName: systemImage) }
            .buttonStyle(RoundIconStyle(diameter: metrics.iconButton))
            .accessibilityLabel(title)
    }

    private var label: some View {
        Text(title).font(.caption).foregroundStyle(Theme.secondary).lineLimit(1).fixedSize()
    }
}

/// A round icon button drawn by hand: `.bordered` is shaped for text and makes an uneven capsule
/// around a glyph. Focused on tvOS it turns white and grows, without the system's focus halo.
struct RoundIconStyle: ButtonStyle {
    let diameter: CGFloat

    func makeBody(configuration: Configuration) -> some View {
        RoundIcon(configuration: configuration, diameter: diameter)
    }

    private struct RoundIcon: View {
        let configuration: Configuration
        let diameter: CGFloat
        @Environment(\.isFocused) private var focused
        @Environment(\.isEnabled) private var enabled

        var body: some View {
            configuration.label
                .font(.system(size: diameter * 0.4, weight: .semibold))
                .foregroundStyle(focused ? Color.black : Theme.text)
                .frame(width: diameter, height: diameter)
                .background(Circle().fill(focused ? Color.white : Color.white.opacity(0.16)))
                .contentShape(Circle())
                .scaleEffect(focused ? 1.12 : configuration.isPressed ? 0.92 : 1)
                .shadow(color: .black.opacity(focused ? 0.45 : 0), radius: 14, y: 8)
                .opacity(enabled ? 1 : 0.4)
                .animation(.easeOut(duration: 0.15), value: focused)
                .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
        }
    }
}

/// The title's logo when TMDB has one, else the title as text; the text also stands in while the
/// logo loads and when it fails, so the header never stays empty.
struct TitleLogo: View {
    @Environment(\.metrics) private var metrics
    let title: String
    let logo: URL?
    /// Home hero on a phone: centred, the text shrinking a little rather than being cut.
    var centered = false
    /// The logo's box; the sheet's by default.
    var maxSize: CGSize?

    var body: some View {
        if let logo {
            AsyncImage(url: logo) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFit()
                        .frame(maxWidth: (maxSize ?? metrics.detailLogo).width, maxHeight: (maxSize ?? metrics.detailLogo).height,
                               alignment: centered ? .center : .leading)
                        .shadow(color: .black.opacity(0.5), radius: 12)
                        .accessibilityLabel(title)
                } else {
                    text
                }
            }
        } else {
            text
        }
    }

    @ViewBuilder private var text: some View {
        if centered {
            Text(title).font(.system(size: metrics.detailTitle, weight: .heavy)).lineLimit(3).minimumScaleFactor(0.6)
                .multilineTextAlignment(.center).frame(maxWidth: .infinity)
        } else {
            Text(title).font(.system(size: metrics.detailTitle, weight: .heavy)).lineLimit(2).frame(maxWidth: metrics.textWidth, alignment: .leading)
        }
    }
}
