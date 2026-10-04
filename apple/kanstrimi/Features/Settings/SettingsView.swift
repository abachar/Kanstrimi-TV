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
                // A focused row grows past the half-screen column: let it spill instead of clipping it at the sides.
                form.scrollClipDisabled().toggleStyle(RowToggleStyle()).frame(maxWidth: .infinity)
            }
            .background(Theme.background)
        } else {
            form
                .navigationTitle("Réglages")
                .background(Theme.background)
                // The app tint is white: an interrupter on would read as off. Amber, like the accent.
                .toggleStyle(.switch).tint(Theme.accent)
        }
    }

    /// tvOS: the name, then the facts that are read and never changed, so the list keeps only what can be set.
    private var brand: some View {
        VStack(spacing: 64) {
            VStack(spacing: 18) {
                Text("Kanstrimi").font(.system(size: 64, weight: .bold)).tracking(6).foregroundStyle(Theme.accent)
                Text("Réglages").font(.title2.weight(.semibold))
                Text("Version \(appVersion)").font(.callout).foregroundStyle(Theme.secondary)
            }
            Grid(alignment: .leadingFirstTextBaseline, horizontalSpacing: 28, verticalSpacing: 12) {
                fact("Appareil", deviceTitle)
                fact("Code", env.device.code ?? "—")
                fact("Serveur", serverHost)
                fact("Version", env.info?.serverVersion ?? "—")
                Color.clear.frame(height: 16).gridCellUnsizedAxes(.horizontal)
                fact("Films", env.info.map { Format.count($0.counts.movies) } ?? "—")
                fact("Séries", env.info.map { Format.count($0.counts.series) } ?? "—")
                fact("Chaînes", env.info.map { Format.count($0.counts.channels) } ?? "—")
                fact("Langues", languagesLine)
                fact("Dernier import", importLine)
            }
            .font(.callout)
        }
        .padding(.horizontal, 60)
    }

    private func fact(_ label: String, _ value: String) -> some View {
        GridRow {
            Text(label).foregroundStyle(Theme.secondary).gridColumnAlignment(.trailing)
            Text(value)
        }
    }

    private var deviceName: String { env.preferences.deviceName.isEmpty ? "Salon" : env.preferences.deviceName }
    private var deviceTitle: String { "\(Platform.deviceKind) « \(deviceName) »" }
    private var serverHost: String { URL(string: env.preferences.serverURL)?.host() ?? "" }
    private var serverLine: String { env.info.map { "\(serverHost) · \($0.serverVersion)" } ?? serverHost }
    private var catalogLine: String {
        env.info.map {
            "\(Format.count($0.counts.movies)) films · \(Format.count($0.counts.series)) séries · \(Format.count($0.counts.channels)) chaînes"
        } ?? "—"
    }
    private var importLine: String {
        env.info.map { s in
            var parts: [String] = []
            if let d = s.lastImport { parts.append(Calendar.current.isDateInToday(d) ? "Aujourd'hui, \(Format.hour(d))" : Format.dayHour(d)) }
            if let r = s.tmdbRate { parts.append("TMDB à \(Int(r * 100)) %") }
            return parts.joined(separator: " · ")
        } ?? "—"
    }
    private var languagesLine: String { env.info?.catalogLanguages.map(\.short).joined(separator: " · ") ?? "—" }

    @ViewBuilder private var form: some View {
        @Bindable var prefs = env.preferences
        @Bindable var scenario = env.scenario
        Form {
            // tvOS: the device, the server and À propos sit in the left column (`brand`).
            if !Platform.isTV {
            Section {
                // iPhone: who this device is and which server it talks to, like the account card atop the iOS Réglages.
                HStack(spacing: 14) {
                    Image(systemName: "iphone")
                        .font(.title2.weight(.semibold)).foregroundStyle(.black)
                        .frame(width: 52, height: 52)
                        .background(Theme.accent, in: RoundedRectangle(cornerRadius: 12))
                    VStack(alignment: .leading, spacing: 3) {
                        Text(deviceName).font(.headline)
                        Text("\(serverHost) · \(env.info?.serverVersion ?? "—")").font(.subheadline).foregroundStyle(Theme.secondary)
                    }
                }
                .padding(.vertical, 4)
            }
            }

            Section("Lecture") {
                ChoiceRow("Langue audio", selection: languageBinding(prefs), options: languageOrders) {
                    $0.map(\.short).joined(separator: " › ")
                }
                ChoiceRow("Qualité maximale", selection: $prefs.maxQuality, options: Quality.allCases.reversed()) { $0.label }
                Toggle("Lecture automatique de la suite · 15 s", isOn: $prefs.autoPlayNext)
                Toggle("Mémoriser la version par titre", isOn: $prefs.rememberVersionPerTitle)
                Toggle("Changer de source en cas de panne", isOn: $prefs.switchSourceOnFailure)
                InfoRow("Ordre utilisé par Lecture", value: "Un choix fait dans le sélecteur de versions est mémorisé pour le titre et prime sur ces réglages.")
                    .font(.callout)
            }

            Section("Appareil") {
                if !Platform.isTV {
                    InfoRow("Nom de cet appareil", value: deviceName)
                    InfoRow("Serveur", value: prefs.serverURL)
                }
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

            if !Platform.isTV {
            Section("À propos") {
                InfoRow("Application", value: appVersion)
                InfoRow("Serveur", value: env.info != nil ? serverLine : "—")
                InfoRow("Catalogue", value: catalogLine)
                InfoRow("Dernier import", value: importLine)
                InfoRow("Langues du catalogue", value: languagesLine)
                InfoRow("Code de l'appareil", value: env.device.code ?? "—")
            }
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
                ChoiceRow("Latence simulée", selection: $scenario.latency, options: [0.0, 0.6, 2.0, 5.0]) {
                    [0.6: "0,6 s", 2.0: "2 s", 5.0: "5 s"][$0] ?? "Aucune"
                }
                InfoRow("Sources en échec mémorisées", value: "\(env.failedSources.count)")
                InfoRow("Progressions en attente", value: "\(env.progressQueue.pending.count)")
                Button("Réinitialiser les préférences") { env.preferences.resetAll() }
                Button("Vider les chaînes récentes") { env.recentChannels.clear() }
            } header: {
                Text("Démo · pilote le client mock")
            } footer: {
                Text("Ces interrupteurs n'existent que dans la maquette : ils déclenchent les états hors ligne, erreur et vide.")
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
        Task { if let ctx = try? await env.playbackContext(for: id) { env.player.play(ctx) } }
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

/// tvOS: the system toggle leaves its title light on the white focused row, where it vanishes. A row the app
/// draws itself instead (`FocusRow`), flipped on select.
private struct RowToggleStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        FocusRow(title: configuration.label, value: configuration.isOn ? "Oui" : "Non") { configuration.isOn.toggle() }
    }
}

/// A read-only line. On tvOS it is a focusable row that does nothing: the focus only reaches, and so only
/// scrolls to, focusable rows, and À propos would otherwise stay out of sight at the bottom of the list.
private struct InfoRow: View {
    let title: String
    let value: String

    init(_ title: String, value: String) {
        self.title = title
        self.value = value
    }

    var body: some View {
        if Platform.isTV {
            FocusRow(title: Text(title), value: value) { }
        } else {
            LabeledContent(title, value: value)
        }
    }
}

/// A setting picked among a few values. iOS: a Picker. tvOS: a menu on a row drawn like the others (`FocusRow`):
/// under tvOS 27 (Xcode 27A266a) the list a default Picker pushes opens black, even alone in a bare
/// NavigationStack + Form, on the simulator as on a real Apple TV.
private struct ChoiceRow<Value: Hashable>: View {
    let title: String
    @Binding var selection: Value
    let options: [Value]
    let label: (Value) -> String

    init(_ title: String, selection: Binding<Value>, options: [Value], label: @escaping (Value) -> String) {
        self.title = title
        self._selection = selection
        self.options = options
        self.label = label
    }

    var body: some View {
        if Platform.isTV {
            Menu {
                Picker(title, selection: $selection) {
                    ForEach(options, id: \.self) { Text(label($0)).tag($0) }
                }
                .pickerStyle(.inline)
            } label: {
                RowContent(title: Text(title), value: label(selection), chevron: true)
            }
            .rowPlatter()
        } else {
            Picker(title, selection: $selection) {
                ForEach(options, id: \.self) { Text(label($0)).tag($0) }
            }
        }
    }
}

/// tvOS: title on the left, value on the right, on a platter the app draws in place of the Form's. The system
/// platter turns white on focus a beat apart from the text colour; here platter and text change in one animation.
private struct FocusRow<Title: View>: View {
    let title: Title
    let value: String
    let action: () -> Void

    var body: some View {
        Button(action: action) { RowContent(title: title, value: value, chevron: false) }.rowPlatter()
    }
}

private struct RowContent<Title: View>: View {
    let title: Title
    let value: String
    let chevron: Bool

    var body: some View {
        HStack(spacing: 24) {
            title
            Spacer(minLength: 0)
            Text(value).multilineTextAlignment(.trailing).opacity(0.6)
            if chevron { Image(systemName: "chevron.up.chevron.down").font(.callout.weight(.semibold)).opacity(0.4) }
        }
    }
}

private extension View {
    /// The row's own platter, in place of the Form's.
    func rowPlatter() -> some View {
        buttonStyle(RowButtonStyle()).listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
    }
}

private struct RowButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View { Row(configuration: configuration) }

    private struct Row: View {
        let configuration: Configuration
        @Environment(\.isFocused) private var isFocused

        var body: some View {
            configuration.label
                .foregroundStyle(isFocused ? Color.black : Theme.text)
                .padding(.horizontal, 20)
                .padding(.vertical, 14)
                .frame(maxWidth: .infinity, minHeight: 66, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 30, style: .continuous).fill(isFocused ? Color.white : Color.white.opacity(0.1)))
                .scaleEffect(isFocused ? (configuration.isPressed ? 1 : 1.03) : 1)
                .shadow(color: .black.opacity(isFocused ? 0.4 : 0), radius: 16, y: 8)
                .animation(.easeOut(duration: 0.15), value: isFocused)
                .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
        }
    }
}
