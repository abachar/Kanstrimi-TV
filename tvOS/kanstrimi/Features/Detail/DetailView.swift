import SwiftUI

/// Film and series sheet [7] [9] [18]: one screen, seasons and episodes inside it for a series.
struct DetailView: View {
    let id: ContentID
    @Environment(AppEnvironment.self) private var env
    @State private var model: DetailModel?
    @State private var showPicker = false

    var body: some View {
        Group {
            if let model {
                DetailContent(model: model, showPicker: $showPicker)
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
        .fullScreenCover(isPresented: $showPicker) {
            if let model, let d = model.detail {
                VersionPicker(title: d.title, versions: d.versions, recommendedID: model.choice?.version.id, isSeries: model.isSeries) { v, s, remember, asDefault in
                    // Let the picker finish dismissing before the player cover presents.
                    Task {
                        try? await Task.sleep(for: .milliseconds(400))
                        model.chose(version: v, source: s, remember: remember, asDefault: asDefault)
                    }
                }
                .environment(env)
            }
        }
    }
}

private struct DetailContent: View {
    @Bindable var model: DetailModel
    @Binding var showPicker: Bool
    @Environment(AppEnvironment.self) private var env
    @FocusState private var focused: Focus?
    private enum Focus: Hashable { case play, versions, trailer, favorite, language, season(Int), episode(ContentID) }

    var body: some View {
        if let error = model.error, model.detail == nil {
            StatePanel(icon: "exclamationmark.triangle", title: "Fiche indisponible", message: error.localizedDescription) {
                Task { await model.load() }
            }
        } else if let d = model.detail {
            ZStack(alignment: .topLeading) {
                backdrop(d)
                ScrollView {
                    VStack(alignment: .leading, spacing: 34) {
                        header(d).padding(.top, 160)
                        buttons(d)
                        HStack(alignment: .top, spacing: 40) {
                            chosenVersionNote(d)
                            Spacer()
                            if d.kind == .movie, !d.versions.isEmpty {
                                VersionMatrix(versions: d.versions, autoID: model.choice?.version.id)
                            }
                        }
                        if d.kind == .series { seasons(d) }
                        Spacer(minLength: 80)
                    }
                    .padding(.horizontal, Theme.inset)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .ignoresSafeArea(edges: .horizontal)
            }
            .onAppear { focused = .play }
        } else {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        }
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

    private func header(_ d: Card) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(tagline(d)).font(.caption.weight(.bold)).tracking(2).foregroundStyle(Theme.accent)
            Text(d.title).font(.system(size: 76, weight: .heavy)).lineLimit(2).frame(maxWidth: 1100, alignment: .leading)
            HStack(spacing: 14) {
                Text(meta(d)).foregroundStyle(Theme.secondary)
                if let c = d.certification { Badge(c) }
                if let r = d.rating { Text(String(format: "★ %.1f", r)).foregroundStyle(Theme.accent) }
            }
            .font(.title3)
            VersionBadges(quality: d.versions.maxQuality.map { q in d.versions.maxDynamicRange.map { $0 == .sdr ? q.rawValue : "\(q.rawValue) \($0.label)" } ?? q.rawValue },
                          languages: d.versions.languages)
            if d.isMatched {
                if let o = d.overview { Text(o).font(.body).foregroundStyle(Theme.text.opacity(0.9)).frame(maxWidth: 1000, alignment: .leading).lineLimit(4) }
                if !d.cast.isEmpty || d.director != nil {
                    Text([d.director.map { "Réalisation \($0)" }, d.cast.isEmpty ? nil : "Avec " + d.cast.map(\.name).joined(separator: ", ")].compactMap { $0 }.joined(separator: " · "))
                        .font(.callout).foregroundStyle(Theme.secondary).frame(maxWidth: 1000, alignment: .leading)
                }
            } else {
                noTMDB(d)
            }
        }
    }

    private func tagline(_ d: Card) -> String {
        if d.kind == .series { return "SÉRIE · \(d.seasons?.count ?? 0) SAISON\((d.seasons?.count ?? 0) > 1 ? "S" : "")" }
        return d.isMatched ? "FILM" : "FILM · SANS FICHE TMDB"
    }

    private func meta(_ d: Card) -> String {
        var parts: [String] = []
        if let y = d.year { parts.append(d.endYear.map { "\(y) – \($0)" } ?? String(y)) }
        if !d.genres.isEmpty { parts.append(d.genres.prefix(2).joined(separator: ", ")) }
        else if let c = d.providerCategory { parts.append(c) }
        if let r = d.runtime { parts.append(Format.runtime(minutes: r)) }
        return parts.joined(separator: " · ")
    }

    private func noTMDB(_ d: Card) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Pas de fiche TMDB pour ce titre : ni synopsis, ni casting, ni bande-annonce.", systemImage: "questionmark.square.dashed").font(.headline)
            Text("Titre nettoyé depuis « \(d.rawTitle ?? "") » · catégorie fournisseur « \(d.providerCategory ?? "—") ». L'association se corrige depuis l'admin du serveur.")
                .font(.callout).foregroundStyle(Theme.secondary)
            Text("Favoris et reprise fonctionnent sans TMDB : l'identité vient du titre nettoyé et de l'année.").font(.caption).foregroundStyle(Theme.secondary)
        }
        .padding(20)
        .frame(maxWidth: 1000, alignment: .leading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }

    private func buttons(_ d: Card) -> some View {
        HStack(spacing: 20) {
            Button { Task { await model.playPrimary() } } label: {
                Label(model.primaryLabel, systemImage: "play.fill").font(.title3.weight(.bold))
            }
            .buttonStyle(.borderedProminent)
            .focused($focused, equals: .play)
            .onLongPressGesture(minimumDuration: 0.5) { showPicker = true }
            .disabled(d.versions.isEmpty)

            if d.kind == .series {
                Button { showPicker = true } label: {
                    HStack(spacing: 8) {
                        Text("Langue de la série :").foregroundStyle(Theme.secondary)
                        Text(model.seriesChoice?.label ?? "—").fontWeight(.semibold)
                    }
                }
                .focused($focused, equals: .language)
                .disabled(d.versions.isEmpty)
            } else {
                Button("Versions (\(d.versions.count))") { showPicker = true }.focused($focused, equals: .versions).disabled(d.versions.isEmpty)
            }
            if d.trailer != nil {
                Button { model.playTrailer() } label: { Label("Bande-annonce", systemImage: "film") }.focused($focused, equals: .trailer)
            }
            Button { Task { await model.toggleFavorite() } } label: {
                Label(d.isFavorite == true ? "Dans ma liste" : "Ma liste", systemImage: d.isFavorite == true ? "checkmark" : "plus")
            }
            .focused($focused, equals: .favorite)
        }
        .buttonStyle(.bordered)
    }

    @ViewBuilder private func chosenVersionNote(_ d: Card) -> some View {
        if let c = model.choice {
            HStack(spacing: 12) {
                Image(systemName: "sparkles").foregroundStyle(Theme.accent)
                VStack(alignment: .leading, spacing: 2) {
                    if d.kind == .series {
                        Text("\(c.version.longLabel) · \(c.reasonLabel) · appliquée à tous les épisodes").font(.callout.weight(.semibold))
                        if let p = d.progress, p.isResumable, let e = d.currentEpisode {
                            Text("« \(e.title ?? "") » · \(Format.remaining(p.remaining))").font(.caption).foregroundStyle(Theme.secondary)
                        }
                    } else {
                        Text(c.version.longLabel).font(.callout.weight(.semibold))
                        Text("\(c.reasonLabel.prefix(1).uppercased() + c.reasonLabel.dropFirst()) · appui long sur Lecture pour changer").font(.caption).foregroundStyle(Theme.secondary)
                    }
                    if let p = d.progress, p.isWatched, d.kind == .movie {
                        Text("Vu en entier").font(.caption).foregroundStyle(Theme.secondary)
                    }
                }
            }
            .padding(.horizontal, 20).padding(.vertical, 12)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
        } else if d.versions.isEmpty {
            Label("Aucune version jouable pour ce titre.", systemImage: "exclamationmark.triangle").foregroundStyle(Theme.accent)
        }
    }

    // MARK: - Series

    private func seasons(_ d: Card) -> some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack(spacing: 12) {
                ForEach(d.seasons ?? []) { s in
                    Button("Saison \(s.number)") { model.selectedSeason = s.number }
                    .buttonStyle(.bordered)
                    .tint(model.selectedSeason == s.number ? Theme.accent : nil)
                    .focused($focused, equals: .season(s.number))
                }
            }
            if let n = model.selectedSeason {
                if let gap = model.languageGaps(in: n).first, let lang = model.seriesChoice?.language, let alt = gap.languages.first {
                    let back = model.episodes(in: n).first { $0.number > gap.number && $0.languages.contains(lang) }
                    Label("É\(gap.number) n'existe qu'en \(alt.rawValue). L'enchaînement le lira en \(alt.rawValue) \(gap.versions.maxQuality?.rawValue ?? "")\(back.map { ", puis reviendra en \(lang.rawValue) à l'épisode \($0.number)" } ?? ".")",
                          systemImage: "info.circle")
                        .font(.callout).foregroundStyle(Theme.accent)
                }
                LazyVStack(spacing: 14) {
                    ForEach(model.episodes(in: n)) { e in
                        EpisodeRow(episode: e, seriesLanguage: model.seriesChoice?.language) { Task { await model.play(episode: e) } }
                            .focused($focused, equals: .episode(e.id))
                    }
                }
            }
        }
    }
}

/// One episode inside the sheet: thumbnail, number, title, duration, languages, seen or progress.
struct EpisodeRow: View {
    let episode: Episode
    let seriesLanguage: Language?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 24) {
                ZStack(alignment: .bottomLeading) {
                    ArtView(id: episode.id, url: episode.still).frame(width: 260, height: 146)
                    if let p = episode.progress, p.isResumable {
                        ProgressBar(fraction: p.fraction, height: 5).padding(.horizontal, 10).padding(.bottom, 8)
                    }
                    if episode.progress?.isWatched == true {
                        Image(systemName: "checkmark.circle.fill").font(.title2).padding(10).foregroundStyle(.white)
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                    }
                }
                .frame(width: 260, height: 146)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 12) {
                        Text("\(episode.number)").font(.title3.weight(.bold)).foregroundStyle(Theme.secondary)
                        Text(episode.title).font(.title3.weight(.semibold))
                        if let r = episode.runtime { Text("\(r) min").font(.callout).foregroundStyle(Theme.secondary) }
                    }
                    if let o = episode.overview { Text(o).font(.callout).foregroundStyle(Theme.secondary).lineLimit(2) }
                    HStack(spacing: 8) {
                        VersionBadges(quality: episode.versions.maxQuality.map { q in episode.versions.maxDynamicRange.map { $0 == .sdr ? q.rawValue : "\(q.rawValue) \($0.shortLabel)" } ?? q.rawValue },
                                      languages: episode.languages)
                        if let l = seriesLanguage, !episode.languages.contains(l), let only = episode.languages.first {
                            Text("\(only.rawValue) SEUL").font(.caption2.weight(.bold)).padding(.horizontal, 8).padding(.vertical, 3)
                                .background(Theme.accent, in: Capsule()).foregroundStyle(.black)
                        }
                        if let p = episode.progress, p.isResumable {
                            Text(Format.remaining(p.remaining)).font(.caption).foregroundStyle(Theme.secondary)
                        }
                    }
                }
                Spacer()
            }
            .padding(14)
        }
        .buttonStyle(.card)
        .disabled(episode.versions.isEmpty)
    }
}
