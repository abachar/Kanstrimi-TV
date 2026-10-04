import SwiftUI

/// The sheet behind "Versions" and the long press on Lecture [8]: one button per source of every
/// version, which plays it at once. No language tabs, no memory options, no play button: nothing is
/// remembered, the best version stays the automatic choice.
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
            if !metrics.compact { Color.black.opacity(0.6).ignoresSafeArea() }
            VStack(alignment: .leading, spacing: 26) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(isSeries ? "Langue de la série" : "Choisir une version").font(.title2.weight(.bold))
                    Text(title).font(.callout).foregroundStyle(Theme.secondary)
                }
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        ForEach(rows, id: \.source.id) { row in
                            Button {
                                dismiss()
                                // Let the sheet finish dismissing before what the pick presents (the player cover).
                                Task {
                                    try? await Task.sleep(for: .milliseconds(400))
                                    onPick(row.version, row.source)
                                }
                            } label: {
                                label(row).frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                    }
                    // tvOS enlarges the focused button: room for it inside the scroll view, which clips.
                    .padding(.vertical, Platform.isTV ? 20 : 8)
                    .padding(.horizontal, Platform.isTV ? 40 : 0)
                }
                .padding(.horizontal, Platform.isTV ? -40 : 0)
                .frame(maxHeight: metrics.compact ? .infinity : 560)
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

    /// The version and its source side by side on TV; stacked on a phone, where they do not fit.
    @ViewBuilder private func label(_ row: Row) -> some View {
        let recommended = row.version.id == recommendedID && row.index == 0
        if !metrics.compact {
            HStack(spacing: 18) {
                Text(row.title).font(.headline)
                Text(row.source.label).foregroundStyle(Theme.secondary)
                Spacer()
                if recommended { recommendedBadge }
            }
            .padding(.horizontal, 10)
        } else {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(row.title).font(.headline)
                    Text(row.source.label).font(.footnote).foregroundStyle(Theme.secondary)
                }
                Spacer(minLength: 0)
                if recommended { recommendedBadge }
            }
            .multilineTextAlignment(.leading)
        }
    }

    private var recommendedBadge: some View {
        AccentTag("RECOMMANDÉ", style: .spaced)
    }

    private struct Row {
        let version: Version
        let source: Source
        let index: Int
        let title: String
    }

    /// One row per source: the recommended version first, then by language, the usual cut before the
    /// editions, and descending quality.
    /// How many lines the picker shows for these versions (one per source): with one, there is nothing
    /// to choose and the buttons that open it hide.
    static func lineCount(_ versions: [Version]) -> Int { versions.reduce(0) { $0 + $1.sources.count } }

    private var rows: [Row] {
        let sorted = VersionChooser.ordered(versions, recommended: recommendedID)
        return sorted.flatMap { v in
            v.sources.enumerated().map { i, src in
                Row(version: v, source: src, index: i,
                    title: v.sources.count > 1 ? "\(v.label) · \(Version.sourceName(i))" : v.label)
            }
        }
    }
}
