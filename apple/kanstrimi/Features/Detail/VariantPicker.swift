import SwiftUI

/// The sheet behind "Variantes" and the long press on Lecture [8]: the title's variants in the server's order, one
/// button each, which plays it at once; a series' own variants play nothing (« Variante de la série »): the one
/// picked is remembered for every episode.
struct VariantPicker: View {
    let title: String
    let variants: [Variant]
    let recommendedID: String?
    var isSeries = false
    let onPick: (_ variant: Variant) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.metrics) private var metrics

    var body: some View {
        ZStack(alignment: .topTrailing) {
            // A floating panel over the dimmed screen on TV; the sheet is the panel on iOS.
            if Platform.isTV { Color.black.opacity(0.6).ignoresSafeArea() }
            VStack(alignment: .leading, spacing: 26) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(isSeries ? "Variante de la série" : "Choisir une variante").font(.title2.weight(.bold))
                    Text(title).font(.callout).foregroundStyle(Theme.secondary)
                }
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        ForEach(variants) { variant in
                            Button {
                                dismiss()
                                // Let the sheet finish dismissing before what the pick presents (the player cover).
                                Task {
                                    try? await Task.sleep(for: .milliseconds(400))
                                    onPick(variant)
                                }
                            } label: {
                                label(variant).frame(maxWidth: .infinity, alignment: .leading)
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

    /// The line of a variant: what it is, where it comes from; the one Lecture would play badged.
    @ViewBuilder private func label(_ variant: Variant) -> some View {
        HStack(spacing: 18) {
            VStack(alignment: .leading, spacing: 2) {
                Text(variant.title(withLanguage: variants.languages.count > 1)).font(.headline)
                Text(variant.origin).font(.caption).foregroundStyle(Theme.secondary).lineLimit(1)
            }
            Spacer(minLength: 0)
            if variant.id == recommendedID { AccentTag("RECOMMANDÉ", style: metrics.compact ? .standard : .spaced).fixedSize() }
        }
        .padding(.horizontal, metrics.compact ? 0 : 10)
        .multilineTextAlignment(.leading)
    }
}
