import SwiftUI

/// The sheet behind "Versions" and the long press on Lecture [8]: the copies grouped by provider in the order of
/// preference (`SourceLine.grouped`), one button each (« FR · 4K · LIGHT »), which plays it at once; a series'
/// versions carry no sources (« Version de la série »), one button per version then, remembered for every episode.
struct VersionPicker: View {
    let title: String
    let versions: [Version]
    let recommendedID: String?
    var isSeries = false
    let onPick: (_ version: Version, _ source: Source?) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.metrics) private var metrics

    var body: some View {
        ZStack(alignment: .topTrailing) {
            // A floating panel over the dimmed screen on TV; the sheet is the panel on iOS.
            if Platform.isTV { Color.black.opacity(0.6).ignoresSafeArea() }
            VStack(alignment: .leading, spacing: 26) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(isSeries ? "Version de la série" : "Choisir une version").font(.title2.weight(.bold))
                    Text(title).font(.callout).foregroundStyle(Theme.secondary)
                }
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        ForEach(Array(groups.enumerated()), id: \.offset) { _, group in
                            if let provider = group.provider {
                                Text(provider).font(.headline).foregroundStyle(Theme.secondary).padding(.top, 6)
                            }
                            ForEach(group.lines) { line in
                                Button {
                                    dismiss()
                                    // Let the sheet finish dismissing before what the pick presents (the player cover).
                                    Task {
                                        try? await Task.sleep(for: .milliseconds(400))
                                        onPick(line.version, line.source)
                                    }
                                } label: {
                                    label(line).frame(maxWidth: .infinity, alignment: .leading)
                                }
                            }
                        }
                    }
                    // tvOS enlarges the focused button: room for it inside the scroll view, which clips.
                    .padding(.vertical, Platform.isTV ? 20 : 8)
                    .padding(.horizontal, Platform.isTV ? 40 : 0)
                }
                .padding(.horizontal, Platform.isTV ? -40 : 0)
                .frame(maxHeight: Platform.isTV ? 560 : .infinity)
            }
            .padding(metrics.panelPadding)
            .frame(maxWidth: metrics.pickerWidth ?? .infinity, alignment: .leading)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 32))
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            if !Platform.isTV {
                Button { dismiss() } label: { Image(systemName: "xmark.circle.fill").font(.title2) }
                    .buttonStyle(.plain).foregroundStyle(Theme.secondary).padding(16)
                    .accessibilityLabel("Fermer")
            }
        }
        .onBackCommand { dismiss() }
    }

    /// The line of a copy, the recommended version's first copy badged.
    @ViewBuilder private func label(_ line: SourceLine) -> some View {
        let recommended = line.version.id == recommendedID && line.source == (line.version.sources.first)
        HStack(spacing: 18) {
            Text(line.text).font(.headline)
            Spacer(minLength: 0)
            if recommended { recommendedBadge }
        }
        .padding(.horizontal, metrics.compact ? 0 : 10)
        .multilineTextAlignment(.leading)
    }

    private var recommendedBadge: some View {
        AccentTag("RECOMMANDÉ", style: .spaced)
    }

    /// How many lines the picker shows for these versions (one per copy, one per version without sources): with
    /// one, there is nothing to choose and the buttons that open it hide.
    static func lineCount(_ versions: [Version]) -> Int { versions.reduce(0) { $0 + max(1, $1.sources.count) } }

    private var groups: [(provider: String?, lines: [SourceLine])] { SourceLine.grouped(versions) }
}
