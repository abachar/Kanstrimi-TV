import SwiftUI

/// ⚙ from any tab. Lecture · Appareil · À propos, plus a Démo section that drives the mock.
struct SettingsView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var confirmUnpair = false

    var body: some View {
        @Bindable var prefs = env.preferences
        @Bindable var scenario = env.scenario
        NavigationStack {
            Form {
                Section {
                    HStack {
                        Text("Apple TV « \(prefs.deviceName.isEmpty ? "Salon" : prefs.deviceName) »").font(.title3.weight(.semibold))
                        Spacer()
                        Text(env.session?.serverHost ?? URL(string: prefs.serverURL)?.host() ?? "").foregroundStyle(Theme.secondary)
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
                    LabeledContent("Ordre utilisé par Lecture", value: "Un choix fait dans le sélecteur de versions est mémorisé pour le titre et prime sur ces réglages.")
                        .font(.callout)
                }

                Section("Appareil") {
                    LabeledContent("Nom de cet Apple TV", value: prefs.deviceName.isEmpty ? "Salon" : prefs.deviceName)
                    LabeledContent("Serveur", value: prefs.serverURL)
                    Button(role: .destructive) { confirmUnpair = true } label: {
                        Label("Dissocier cet Apple TV", systemImage: "xmark.circle")
                    }
                    .confirmationDialog("Dissocier cet Apple TV ?", isPresented: $confirmUnpair, titleVisibility: .visible) {
                        Button("Dissocier", role: .destructive) { unpair() }
                        Button("Annuler", role: .cancel) { }
                    } message: {
                        Text("Le jeton est révoqué sur le serveur, effacé du trousseau, et le cache est vidé. Vos favoris et vos reprises restent côté serveur.")
                    }
                }

                Section("À propos") {
                    LabeledContent("Application", value: appVersion)
                    LabeledContent("Serveur", value: env.session.map { "\($0.serverHost) · \($0.serverVersion)" } ?? "—")
                    LabeledContent("Catalogue", value: env.session.map {
                        "\(Format.count($0.counts.movies)) films · \(Format.count($0.counts.series)) séries · \(Format.count($0.counts.channels)) chaînes"
                    } ?? "—")
                    LabeledContent("Dernier import", value: env.session.map { s in
                        var parts: [String] = []
                        if let d = s.lastImport { parts.append(Calendar.current.isDateInToday(d) ? "Aujourd'hui, \(Format.hour(d))" : Format.dayHour(d)) }
                        if let r = s.tmdbRate { parts.append("TMDB à \(Int(r * 100)) %") }
                        return parts.joined(separator: " · ")
                    } ?? "—")
                    LabeledContent("Langues du catalogue", value: env.session?.catalogLanguages.map(\.rawValue).joined(separator: " · ") ?? "—")
                }

                Section {
                    Toggle("Hors ligne (serveur injoignable)", isOn: $scenario.offline)
                    Toggle("Jeton révoqué (401 partout)", isOn: $scenario.unauthorized)
                    Toggle("Code d'appairage qui expire", isOn: $scenario.pairingExpires)
                    Picker("Saison en erreur", selection: $scenario.failingSeason) {
                        Text("Aucune").tag(0)
                        ForEach(1...4, id: \.self) { Text("Saison \($0)").tag($0) }
                    }
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
            .navigationTitle("Réglages")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Fermer") { dismiss() } }
            }
        }
        .background(Theme.background)
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

    private func unpair() {
        Task {
            try? await env.client.revokeDevice()
            env.homeCache.clear()
            env.device.forget(reason: nil)
            env.session = nil
            dismiss()
        }
    }
}
