import SwiftUI

/// The Réglages tab: Lecture · Appareil · À propos, plus a Démo section that drives the mock.
struct SettingsView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var confirmUnpair = false

    var body: some View {
        if Platform.isTV {
            // Like the Réglages of the Apple TV: the app's name centred on the left, the list on the right half.
            HStack(spacing: 0) {
                brand.frame(maxWidth: .infinity)
                form.frame(maxWidth: .infinity)
            }
            .background(Theme.background)
        } else {
            form
                .navigationTitle("Réglages")
                .background(Theme.background)
        }
    }

    private var brand: some View {
        VStack(spacing: 18) {
            Text("Kanstrimi").font(.system(size: 64, weight: .bold)).tracking(6).foregroundStyle(Theme.accent)
            Text("Réglages").font(.title2.weight(.semibold))
            Text("Version \(appVersion)").font(.callout).foregroundStyle(Theme.secondary)
        }
    }

    @ViewBuilder private var form: some View {
        @Bindable var prefs = env.preferences
        @Bindable var scenario = env.scenario
        Form {
            Section {
                HStack {
                    Text("\(Platform.deviceKind) « \(prefs.deviceName.isEmpty ? "Salon" : prefs.deviceName) »").font(.title3.weight(.semibold))
                    Spacer()
                    Text(URL(string: prefs.serverURL)?.host() ?? "").foregroundStyle(Theme.secondary)
                }
            }

            Section("Lecture") {
                Picker("Langue audio", selection: languageBinding(prefs)) {
                    ForEach(languageOrders, id: \.self) { order in
                        Text(order.map(\.rawValue).joined(separator: " › ")).tag(order)
                    }
                }
                Picker("Qualité maximale", selection: $prefs.maxQuality) {
                    ForEach(Quality.allCases.reversed(), id: \.self) { Text($0.label).tag($0) }
                }
                Toggle("Épisode suivant automatique · 10 s", isOn: $prefs.autoPlayNext)
                Toggle("Mémoriser la version par titre", isOn: $prefs.rememberVersionPerTitle)
                Toggle("Changer de source en cas de panne", isOn: $prefs.switchSourceOnFailure)
                Picker("Tampon du direct", selection: $prefs.liveBufferMs) {
                    ForEach(Preferences.liveBufferChoices, id: \.self) { Text(Format.seconds(ms: $0)).tag($0) }
                }
                Picker("Tampon des films et séries", selection: $prefs.vodBufferMs) {
                    ForEach(Preferences.vodBufferChoices, id: \.self) { Text(Format.seconds(ms: $0)).tag($0) }
                }
                LabeledContent("Ordre utilisé par Lecture", value: "Un choix fait dans le sélecteur de versions est mémorisé pour le titre et prime sur ces réglages.")
                    .font(.callout)
            }

            Section("Appareil") {
                LabeledContent("Nom de cet appareil", value: prefs.deviceName.isEmpty ? "Salon" : prefs.deviceName)
                LabeledContent("Serveur", value: prefs.serverURL)
                Toggle("Client de démonstration (données embarquées)", isOn: $prefs.useMockClient)
                Button(role: .destructive) { confirmUnpair = true } label: {
                    Label("Dissocier cet appareil", systemImage: "xmark.circle")
                }
                .confirmationDialog("Dissocier cet appareil ?", isPresented: $confirmUnpair, titleVisibility: .visible) {
                    Button("Dissocier", role: .destructive) { unpair() }
                    Button("Annuler", role: .cancel) { }
                } message: {
                    Text("Le jeton est révoqué sur le serveur, effacé du trousseau, et le cache est vidé. Vos favoris et vos reprises restent côté serveur.")
                }
            }

            Section("À propos") {
                LabeledContent("Application", value: appVersion)
                LabeledContent("Serveur", value: env.info.map { "\(URL(string: prefs.serverURL)?.host() ?? "") · \($0.serverVersion)" } ?? "—")
                LabeledContent("Catalogue", value: env.info.map {
                    "\(Format.count($0.counts.movies)) films · \(Format.count($0.counts.series)) séries · \(Format.count($0.counts.channels)) chaînes"
                } ?? "—")
                LabeledContent("Dernier import", value: env.info.map { s in
                    var parts: [String] = []
                    if let d = s.lastImport { parts.append(Calendar.current.isDateInToday(d) ? "Aujourd'hui, \(Format.hour(d))" : Format.dayHour(d)) }
                    if let r = s.tmdbRate { parts.append("TMDB à \(Int(r * 100)) %") }
                    return parts.joined(separator: " · ")
                } ?? "—")
                LabeledContent("Langues du catalogue", value: env.info?.catalogLanguages.map(\.rawValue).joined(separator: " · ") ?? "—")
                LabeledContent("Code de l'appareil", value: env.device.code ?? "—")
            }

            if prefs.useMockClient {
            Section("Lecteur · flux de démo") {
                Button { play(ContentID("tmdb:movie:535544")) } label: { Label("Film · Downton Abbey", systemImage: "film") }
                Button { play(ContentID("tmdb:tv:300388:s01e01")) } label: { Label("Épisode · S1 É1 (épisode suivant)", systemImage: "rectangle.stack") }
                Button { playLive() } label: { Label("Direct · première chaîne", systemImage: "tv") }
            }

            Section {
                Toggle("Hors ligne (serveur injoignable)", isOn: $scenario.offline)
                Toggle("Jeton révoqué (401 partout)", isOn: $scenario.unauthorized)
                Toggle("Code d'appairage qui expire", isOn: $scenario.pairingExpires)
                Toggle("Fiche en erreur (fournisseur muet)", isOn: $scenario.failingDetail)
                Toggle("Deuxième page en erreur", isOn: $scenario.failingSecondPage)
                Toggle("Recherche sans résultat", isOn: $scenario.emptySearch)
                Toggle("EPG vide", isOn: $scenario.emptyEPG)
                Picker("Latence simulée", selection: $scenario.latency) {
                    Text("Aucune").tag(0.0)
                    Text("0,6 s").tag(0.6)
                    Text("2 s").tag(2.0)
                    Text("5 s").tag(5.0)
                }
                LabeledContent("Sources en échec mémorisées", value: "\(env.failedSources.count)")
                LabeledContent("Progressions en attente", value: "\(env.progressQueue.pending.count)")
                Button("Réinitialiser les préférences") { env.preferences.resetAll() }
                Button("Vider les chaînes récentes") { env.recentChannels.clear() }
            } header: {
                Text("Démo · pilote le client mock")
            } footer: {
                Text("Ces interrupteurs n'existent que dans la maquette : ils déclenchent les états hors ligne, erreur et vide de FLOW.md §3.")
            }
            }
        }
    }

    private var languageOrders: [[Language]] {
        [[.vf, .vostfr, .vo], [.vostfr, .vf, .vo], [.vo, .vostfr, .vf], [.vf, .vo, .vostfr]]
    }

    private func languageBinding(_ prefs: Preferences) -> Binding<[Language]> {
        Binding(get: { languageOrders.contains(prefs.languageOrder) ? prefs.languageOrder : languageOrders[0] },
                set: { prefs.languageOrder = $0 })
    }

    private var appVersion: String {
        let v = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
        let b = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"
        return "\(v) (\(b))"
    }

    private func play(_ id: ContentID) {
        Task {
            guard let card = try? await env.client.detail(id: id.seriesID ?? id) else { return }
            let ctx: PlaybackContext?
            if id.seriesID != nil, let ep = card.allEpisodes.first(where: { $0.id == id }) {
                ctx = try? await env.playbackContext(for: ep, of: card)
            } else {
                ctx = try? await env.playbackContext(for: card)
            }
            if let ctx { env.player.play(ctx) }
        }
    }

    private func playLive() {
        Task {
            guard let groups = try? await env.client.channels() else { return }
            let all = groups.flatMap(\.channels)
            guard let first = all.first else { return }
            env.player.play(channel: first, in: all)
            env.recentChannels.record(first.id)
        }
    }

    private func unpair() {
        Task {
            if let code = env.device.code { try? await env.client.deleteDevice(code: code) }
            env.homeCache.clear()
            env.device.forget(reason: nil)
            env.info = nil
        }
    }
}
