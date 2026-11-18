import SwiftUI

/// What a list knows of a variant besides itself: the one playing, one that failed on this device a moment ago,
/// the one Lecture would play.
struct VariantMarks: Hashable {
    var playing = false
    var failed = false
    var recommended = false
}

/// The variants of a title as a list, in the order given (the server's): one row each, its quality, the provider's
/// own name of the stream, then its provider and category. A title in several languages has a heading per
/// language, or names the language on each row (`inline`, for a short list). `severalLanguages`: said by the
/// caller that lists a part of the title's variants only, a lone VOSTF among them still being one of two languages.
/// `stacked`: for a narrow list, each row's texts one under the other. `focused`: the row that has the focus
/// (tvOS), by its variant's id, for the caller that puts it on the variant playing.
struct VariantList: View {
    @Environment(\.metrics) private var metrics
    let variants: [Variant]
    var marks: (Variant) -> VariantMarks = { _ in VariantMarks() }
    var inline = false
    var severalLanguages: Bool? = nil
    var stacked = false
    var focused: FocusState<String?>.Binding? = nil
    let onPick: (Variant) -> Void

    var body: some View {
        let severalLanguages = severalLanguages ?? (variants.languages.count > 1)
        VStack(alignment: .leading, spacing: metrics.compact ? 8 : 14) {
            ForEach(sections, id: \.language) { section in
                if severalLanguages, !inline {
                    Text(section.language.label).font(.headline).foregroundStyle(Theme.secondary).padding(.top, 6)
                }
                ForEach(section.variants) { v in
                    let row = VariantRow(variant: v, marks: marks(v), showsLanguage: severalLanguages && inline, stacked: stacked) { onPick(v) }
                    if let focused { row.focused(focused, equals: v.id) } else { row }
                }
            }
        }
    }

    /// The variants under their language, in the order given.
    private var sections: [(language: Language, variants: [Variant])] {
        variants.languages.map { language in (language, variants.filter { $0.language == language }) }
    }
}

/// One row of `VariantList`: its quality in a column beside its texts, or above them in a narrow list (`stacked`).
struct VariantRow: View {
    @Environment(\.metrics) private var metrics
    let variant: Variant
    var marks = VariantMarks()
    var showsLanguage = false
    var stacked = false
    let action: () -> Void

    var body: some View {
        if Platform.isTV {
            // tvOS: the button draws the platter and its focus.
            Button(action: action) { texts.padding(.horizontal, stacked ? 0 : 10).padding(.vertical, 6) }
        } else {
            Button(action: action) {
                texts.padding(.horizontal, 14).padding(.vertical, 9)
                    .background(marks.playing ? Theme.surfaceRaised : Theme.surface, in: RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
        }
    }

    @ViewBuilder private var texts: some View {
        if stacked { stackedContent } else { content }
    }

    private var origin: String { [variant.edition, variant.provider.name, variant.category].compactMap(\.self).joined(separator: " · ") }

    /// The quality and the marks on a line, then the name and where it comes from, each on two lines at most.
    private var stackedContent: some View {
        VStack(alignment: .leading, spacing: metrics.compact ? 4 : 8) {
            HStack(spacing: 8) {
                if showsLanguage { Badge(variant.language.short, small: metrics.compact) }
                Badge(variant.badge, small: metrics.compact)
                Spacer(minLength: 0)
                tags
                if marks.playing { Image(systemName: "checkmark").font(.headline).accessibilityLabel("En cours") }
            }
            Text(variant.name).font(metrics.compact ? .subheadline : .callout).lineLimit(2)
            Text(origin).font(.caption).foregroundStyle(Theme.secondary).lineLimit(2)
        }
        .multilineTextAlignment(.leading)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var content: some View {
        HStack(spacing: metrics.compact ? 10 : 18) {
            Text(showsLanguage ? "\(variant.language.short) · \(variant.badge)" : variant.badge)
                .font(metrics.compact ? .subheadline.weight(.bold) : .headline)
                .fixedSize()
                .frame(minWidth: metrics.compact ? (showsLanguage ? 100 : 64) : (showsLanguage ? 200 : 150), alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                // A phone shows less of a line: the name takes two, what tells two variants apart being at its end.
                Text(variant.name).font(metrics.compact ? .subheadline : .callout).lineLimit(metrics.compact ? 2 : 1)
                Text(origin)
                    .font(.caption).foregroundStyle(Theme.secondary).lineLimit(metrics.compact ? 2 : 1)
                if metrics.compact, marks.failed || marks.recommended { tags.padding(.top, 2) }
            }
            Spacer(minLength: 0)
            if !metrics.compact { tags }
            if marks.playing { Image(systemName: "checkmark").font(.headline).accessibilityLabel("En cours") }
        }
        .multilineTextAlignment(.leading)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// « EN ÉCHEC », « RECOMMANDÉ »: beside the texts where there is room, under them on a phone.
    private var tags: some View {
        HStack(spacing: 8) {
            if marks.failed { FailedLabel().fixedSize() }
            if marks.recommended { AccentTag("RECOMMANDÉ", style: metrics.compact ? .standard : .spaced).fixedSize() }
        }
    }
}

#if DEBUG
private enum VariantSamples {
    static let a = Provider(id: "xtream-a", name: "Fournisseur A", kind: "xtream", rank: 1)
    static let b = Provider(id: "xtream-b", name: "Fournisseur B", kind: "xtream", rank: 2)
    static func variant(_ id: String, _ language: Language, _ quality: Quality, _ dynamicRange: DynamicRange? = nil, edition: String? = nil,
                        by provider: Provider = a, name: String, category: String) -> Variant {
        Variant(id: id, language: language, quality: quality, dynamicRange: dynamicRange, edition: edition, provider: provider, name: name,
                category: category, streamURL: URL(string: "demo://movie"))
    }
    static let film: [Variant] = [
        variant("1", .vf, .uhd, .dolbyVision, name: "Dune : Deuxième partie (2024) 4K DV", category: "FILMS 4K | DOLBY VISION"),
        variant("2", .vf, .uhd, .dolbyVision, by: b, name: "FR - Dune Part Two 2024 MULTI 2160p DV", category: "VOD | 4K UHD"),
        variant("3", .vf, .fhd, name: "Dune : Deuxième partie (2024) LIGHT", category: "FILMS RÉCENTS"),
        variant("4", .vf, .fhd, edition: "Version longue", by: b, name: "FR - Dune Deuxième Partie 2024 EXTENDED", category: "FR | SCIENCE-FICTION"),
        variant("5", .vostfr, .uhd, .hdr, by: b, name: "Dune Part Two (2024) VOSTFR 4K HDR", category: "VOSTFR | 4K"),
        variant("6", .vo, .fhd, by: b, name: "EN - Dune: Part Two (2024)", category: "EN | MOVIES"),
    ]
    static let channel: [Variant] = [
        variant("1", .vf, .uhd, name: "FR| TF1 4K", category: "FR | TNT 4K"),
        variant("2", .vf, .fhd, name: "FR| TF1 FHD", category: "FR | TNT"),
        variant("3", .vf, .fhd, name: "FR| TF1 FHD (H265)", category: "FR | HEVC"),
        variant("4", .vf, .fhd, by: b, name: "FR: TF1 FHD BACKUP", category: "FRANCE BACKUP"),
        variant("5", .vf, .hd, by: b, name: "FR: TF1 HD", category: "FRANCE HD"),
    ]
    static func marks(_ v: Variant) -> VariantMarks { VariantMarks(playing: v.id == "1", failed: v.id == "2", recommended: v.id == "1") }
}

#Preview("Variantes · liste") {
    ScrollView { VariantList(variants: VariantSamples.film, marks: VariantSamples.marks) { _ in }.padding(24) }
        .preferredColorScheme(.dark)
}

#Preview("Variantes · liste, la langue sur la ligne") {
    ScrollView { VariantList(variants: VariantSamples.film, marks: VariantSamples.marks, inline: true) { _ in }.padding(24) }
        .preferredColorScheme(.dark)
}
#endif
