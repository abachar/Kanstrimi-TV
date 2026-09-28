import SwiftUI

/// The sheet behind "Versions" and the long press on Lecture [8]: language tabs, a row per quality,
/// sources unfolded when there are several, and the two memory options.
struct VersionPicker: View {
    let title: String
    let versions: [Version]
    let recommendedID: String?
    var isSeries = false
    let onPick: (_ version: Version, _ source: Source?, _ remember: Bool, _ asDefault: Bool) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var language: Language?
    @State private var selectedVersion: Version?
    @State private var selectedSource: Source?
    @State private var remember = true
    @State private var asDefault = false
    @State private var expanded: String?

    private var languages: [Language] { versions.languages }
    private var rows: [Version] {
        versions.filter { $0.language == language }.sorted { a, b in
            a.quality != b.quality ? a.quality > b.quality : (a.dynamicRange ?? .sdr) > (b.dynamicRange ?? .sdr)
        }
    }

    var body: some View {
        ZStack {
            Color.black.opacity(0.6).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 26) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(isSeries ? "Langue de la série" : "Choisir une version").font(.title2.weight(.bold))
                    Text("\(title) · \(versions.sourceCount) flux · \(languages.count) langue\(languages.count > 1 ? "s" : "") · \(versions.qualities.count) qualité\(versions.qualities.count > 1 ? "s" : "")")
                        .font(.callout).foregroundStyle(Theme.secondary)
                }

                HStack(spacing: 12) {
                    ForEach(languages, id: \.self) { l in
                        let n = versions.filter { $0.language == l }.count
                        Button("\(l.rawValue) · \(n)") { language = l }
                            .buttonStyle(.bordered)
                            .tint(language == l ? Theme.accent : nil)
                    }
                }

                ScrollView {
                    VStack(spacing: 12) {
                        ForEach(rows) { v in
                            versionRow(v)
                            if expanded == v.id, v.sources.count > 1 {
                                ForEach(Array(v.sources.enumerated()), id: \.element.id) { i, s in
                                    sourceRow(v, s, index: i)
                                }
                            }
                        }
                    }
                    .padding(.vertical, 8)
                }
                .frame(maxHeight: 420)

                HStack(spacing: 24) {
                    if !isSeries {
                        Toggle("Mémoriser pour ce film", isOn: $remember).frame(width: 420)
                    }
                    Toggle("Par défaut pour tous", isOn: $asDefault).frame(width: 380)
                    Spacer()
                    Button {
                        if let v = selectedVersion { onPick(v, selectedSource, remember, asDefault); dismiss() }
                    } label: {
                        Label(playLabel, systemImage: "play.fill")
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(selectedVersion == nil)
                }
            }
            .padding(48)
            .frame(width: 1200)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 32))
        }
        .onAppear {
            let rec = versions.first { $0.id == recommendedID } ?? versions.first
            language = rec?.language ?? languages.first
            selectedVersion = rec
            selectedSource = rec?.sources.first
        }
        .onExitCommand { dismiss() }
    }

    private var playLabel: String {
        guard let v = selectedVersion else { return "Lire" }
        var s = isSeries ? "Appliquer · \(v.label)" : "Lire · \(v.label)"
        if let src = selectedSource, v.sources.count > 1, let i = v.sources.firstIndex(of: src) { s += " · Source \(Character(UnicodeScalar(65 + i)!))" }
        return s
    }

    private func versionRow(_ v: Version) -> some View {
        Button {
            selectedVersion = v
            selectedSource = v.sources.first
            expanded = v.sources.count > 1 ? (expanded == v.id ? nil : v.id) : nil
        } label: {
            HStack(spacing: 18) {
                Image(systemName: selectedVersion?.id == v.id ? "largecircle.fill.circle" : "circle").foregroundStyle(Theme.accent)
                Text(v.qualityLabel).font(.headline).lineLimit(1).frame(width: 280, alignment: .leading)
                Text("\(v.sources.count) source\(v.sources.count > 1 ? "s" : "") · \(v.sources.first?.container ?? "")").foregroundStyle(Theme.secondary)
                Spacer()
                if v.id == recommendedID {
                    Text("RECOMMANDÉ").font(.caption2.weight(.bold)).tracking(1).padding(.horizontal, 8).padding(.vertical, 4)
                        .background(Theme.accent, in: Capsule()).foregroundStyle(.black)
                }
                if v.sources.count > 1 { Image(systemName: expanded == v.id ? "chevron.up" : "chevron.down").foregroundStyle(Theme.secondary) }
            }
            .padding(.horizontal, 10)
        }
    }

    private func sourceRow(_ v: Version, _ s: Source, index: Int) -> some View {
        Button {
            selectedVersion = v
            selectedSource = s
        } label: {
            HStack(spacing: 18) {
                Image(systemName: selectedSource?.id == s.id && selectedVersion?.id == v.id ? "largecircle.fill.circle" : "circle").foregroundStyle(Theme.secondary)
                Text("Source \(String(Character(UnicodeScalar(65 + index)!)))").font(.callout.weight(.semibold)).frame(width: 280, alignment: .leading)
                Text("\(s.label) · \(s.container)").font(.callout).foregroundStyle(Theme.secondary)
                Spacer()
                if index == 0 {
                    Text("PAR DÉFAUT").font(.caption2.weight(.bold)).tracking(1).foregroundStyle(Theme.secondary)
                }
            }
            .padding(.horizontal, 10).padding(.leading, 50)
        }
        .buttonStyle(.plain)
    }
}
