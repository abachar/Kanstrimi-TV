import Foundation
import Testing
@testable import kanstrimi

@MainActor
struct VariantChooserTests {
    let variants = Fixtures.canvasVariants
    /// A choice kept for a variant that is not among those served: only what it was is left.
    private func gone(_ language: Language, _ quality: Quality, dr: DynamicRange? = nil, edition: String? = nil) -> RememberedVariant {
        RememberedVariant(id: "gone", language: language, quality: quality, dynamicRange: dr, edition: edition, label: "")
    }

    @Test("Préférences : VF puis meilleure qualité qui tient dans le plafond")
    func preferencesPickBestVF() {
        let chooser = VariantChooser(languageOrder: [.vf, .vostfr, .vo], maxQuality: .uhd)
        let choice = chooser.choose(from: variants)
        #expect(choice?.variant.id == "vf-4k-dv")
        #expect(choice?.reason == .preferences)
    }

    @Test("Sans ordre de langues, celui du serveur : les variantes arrivent dans l'ordre du profil")
    func serverOrderWhenNoPreference() {
        let chooser = VariantChooser(languageOrder: [], maxQuality: .uhd)
        let vostFirst = variants.filter { $0.language == .vostfr } + variants.filter { $0.language != .vostfr }
        #expect(chooser.choose(from: vostFirst)?.variant.id == "vostfr-4k-hdr")
        #expect(chooser.choose(from: variants)?.variant.id == "vf-4k-dv")
        #expect(vostFirst.languages == [.vostfr, .vf, .vo])
        #expect(chooser.alternatives(to: vostFirst[0], in: vostFirst).first?.id == "vostfr-fhd")
    }

    @Test("Le plafond de qualité écarte le 4K")
    func maxQualityCaps() {
        let chooser = VariantChooser(languageOrder: [.vf], maxQuality: .fhd)
        #expect(chooser.choose(from: variants)?.variant.id == "vf-fhd")
    }

    @Test("Une TV sans Dolby Vision prend le 4K HDR, chez le fournisseur préféré")
    func capabilitiesMatter() {
        var chooser = VariantChooser(languageOrder: [.vf], maxQuality: .uhd)
        chooser.capabilities = .init(maxQuality: .uhd, supportsHDR: true, supportsDolbyVision: false)
        #expect(chooser.choose(from: variants)?.variant.id == "vf-4k-hdr")
    }

    @Test("Un iPhone plafonne à la Full HD même si les réglages demandent le 4K")
    func iPhoneCapsAtFullHD() {
        var chooser = VariantChooser(languageOrder: [.vf], maxQuality: .uhd)
        chooser.capabilities = .iPhone
        #expect(chooser.choose(from: variants)?.variant.id == "vf-fhd")
        #expect(VariantChooser.Capabilities.current.maxQuality == (Platform.isTV ? .uhd : .fhd))
    }

    @Test("Le choix mémorisé pour le titre prime sur tout")
    func rememberedWins() {
        let chooser = VariantChooser(languageOrder: [.vf], maxQuality: .uhd)
        let choice = chooser.choose(from: variants, remembered: RememberedVariant(variants[6]))
        #expect(choice?.variant.id == "vo-fhd")
        #expect(choice?.reason == .remembered)
    }

    @Test("Une chaîne passée en FHD repart en FHD (lecture, aperçu, guide) ; la première fois, la meilleure")
    func channelStartsInRememberedQuality() {
        let chooser = VariantChooser(languageOrder: [.vf], maxQuality: .uhd)
        let variants = [Fixtures.variant("vf-4k", .vf, .uhd), Fixtures.variant("vf-fhd", .vf, .fhd), Fixtures.variant("vf-hd", .vf, .hd)]
        #expect(chooser.choose(from: variants)?.variant.id == "vf-4k")
        #expect(chooser.choose(from: variants, remembered: RememberedVariant(variants[1]))?.variant.id == "vf-fhd")
        // The variant chosen is gone from the list, and nothing is what it was: the same language at the best quality.
        let choice = chooser.choose(from: variants, remembered: gone(.vf, .sd))
        #expect(choice?.variant.id == "vf-4k")
        #expect(choice?.reason == .closest)
    }

    @Test("Le choix fait ici prime sur ce que le serveur a servi, jusqu'à l'oubli")
    @MainActor func localChoiceComesFirst() {
        let env = AppEnvironment(forceMock: true, defaults: UserDefaults(suiteName: "tests-\(UUID().uuidString)")!, secrets: MemorySecrets())
        let tf1 = ContentID("live:fr-tf1")
        let served = RememberedVariant(id: "vf-4k", language: .vf, quality: .uhd, label: "FR · 4K")
        #expect(env.player.remembered(served, for: tf1)?.id == "vf-4k")
        env.player.remember(Fixtures.variant("vf-fhd", .vf, .fhd), for: tf1)
        #expect(env.player.remembered(served, for: tf1)?.id == "vf-fhd")
        #expect(env.player.remembered(served, for: tf1)?.label == "FR · FHD")
        env.player.forgetVariant(for: tf1)
        #expect(env.player.remembered(served, for: tf1) == nil)
        // The setting off: nothing kept.
        env.preferences.profileSettings.rememberVariants = false
        env.player.remember(Fixtures.variant("vf-hd", .vf, .hd), for: ContentID("live:fr-m6"))
        #expect(env.player.remembered(nil, for: ContentID("live:fr-m6")) == nil)
    }

    @Test("Le flux choisi pour la série manque à l'épisode : la même chose par un autre flux, sinon la même langue")
    func seriesChoiceFallsBack() {
        let chooser = VariantChooser(languageOrder: [.vf], maxQuality: .uhd)
        // The same language, quality and dynamic range, by whoever has it.
        let same = chooser.choose(from: variants, remembered: gone(.vf, .uhd, dr: .hdr))
        #expect(same?.variant.id == "vf-4k-hdr")
        #expect(same?.reason == .closest)
        // The exact quality is missing: the language is kept, at its best.
        let language = chooser.choose(from: variants, remembered: gone(.vostfr, .hd))
        #expect(language?.variant.id == "vostfr-4k-hdr")
        #expect(language?.reason == .closest)
    }

    @Test("Aucune variante dans la langue préférée : première de l'ordre serveur, et on le dit")
    func fallbackLanguage() {
        let chooser = VariantChooser(languageOrder: [Language("DE")], maxQuality: .uhd)
        let choice = chooser.choose(from: variants)
        #expect(choice?.variant.id == "vf-4k-dv")
        #expect(choice?.reason == .fallbackLanguage)
    }

    @Test("Une variante en échec récent est écartée au profit de son équivalente chez un autre fournisseur")
    func failedVariantSkipped() {
        var chooser = VariantChooser(languageOrder: [.vf], maxQuality: .uhd)
        chooser.isFailed = { $0 == "vf-4k-hdr" }
        let choice = chooser.choose(from: variants, remembered: RememberedVariant(variants[1]))
        #expect(choice?.variant.id == "vf-4k-hdr-b")
        #expect(choice?.reason == .closest)
        // Without a choice kept, the same: the best quality, by the first provider that has not just failed.
        chooser.capabilities = .init(maxQuality: .uhd, supportsHDR: true, supportsDolbyVision: false)
        #expect(chooser.choose(from: variants)?.variant.id == "vf-4k-hdr-b")
    }

    @Test("Toutes les variantes en échec : on rejoue quand même la première")
    func allFailedStillPlays() {
        var chooser = VariantChooser(languageOrder: [.vf], maxQuality: .uhd)
        chooser.isFailed = { _ in true }
        #expect(chooser.choose(from: variants)?.variant.id == "vf-4k-dv")
    }

    @Test("Bascule automatique : l'équivalente suivante, puis plus rien")
    func nextEquivalent() {
        var chooser = VariantChooser(languageOrder: [.vf], maxQuality: .uhd)
        #expect(chooser.equivalents(of: variants[1], in: variants).map(\.id) == ["vf-4k-hdr", "vf-4k-hdr-b"])
        #expect(chooser.next(after: variants[1], in: variants)?.id == "vf-4k-hdr-b")
        #expect(chooser.next(after: variants[2], in: variants)?.id == "vf-4k-hdr")
        // Alone in what it is: nothing to switch to, whatever else the title has.
        #expect(chooser.next(after: variants[0], in: variants) == nil)
        chooser.isFailed = { $0 == "vf-4k-hdr-b" }
        #expect(chooser.next(after: variants[1], in: variants) == nil)
    }

    @Test("Réessayer : la même variante, ou son équivalente quand elle vient d'échouer")
    func retry() {
        var chooser = VariantChooser(languageOrder: [.vf], maxQuality: .uhd)
        #expect(chooser.retry(of: variants[2], in: variants)?.id == "vf-4k-hdr-b")
        chooser.isFailed = { $0 == "vf-4k-hdr-b" }
        #expect(chooser.retry(of: variants[2], in: variants)?.id == "vf-4k-hdr")
        chooser.isFailed = { _ in true }
        #expect(chooser.retry(of: variants[2], in: variants)?.id == "vf-4k-hdr-b")
    }

    @Test("Les alternatives : toutes les autres, dans l'ordre du serveur")
    func alternativesOrder() {
        let chooser = VariantChooser(languageOrder: [.vf, .vostfr, .vo], maxQuality: .uhd)
        let alts = chooser.alternatives(to: variants[0], in: variants).map(\.id)
        #expect(alts == ["vf-4k-hdr", "vf-4k-hdr-b", "vf-fhd", "vostfr-4k-hdr", "vostfr-fhd", "vo-fhd"])
    }

    @Test("Une seule variante : elle est jouée quelle que soit la langue")
    func singleVariant() {
        let chooser = VariantChooser(languageOrder: [.vf], maxQuality: .uhd)
        let only = [Fixtures.variant("vostfr-fhd", .vostfr, .fhd)]
        #expect(chooser.choose(from: only)?.reason == .onlyOne)
    }

    @Test("Une édition n'est jamais le choix automatique tant que le montage habituel existe")
    func editionNotAutomatic() {
        let chooser = VariantChooser(languageOrder: [.vf], maxQuality: .uhd)
        let variants = [
            Fixtures.variant("vf-hd", .vf, .hd),
            Fixtures.variant("vf-4k-version-longue", .vf, .uhd, edition: "Version longue"),
        ]
        #expect(chooser.choose(from: variants)?.variant.id == "vf-hd")
        #expect(chooser.choose(from: variants, remembered: RememberedVariant(variants[1]))?.variant.id == "vf-4k-version-longue")
        #expect(chooser.alternatives(to: variants[1], in: variants).map(\.id) == ["vf-hd"])
        // Nothing but an edition in the language: it plays.
        let only = [Fixtures.variant("vf-hd-noir-et-blanc", .vf, .hd, edition: "Noir et blanc"), Fixtures.variant("vo-hd", .vo, .hd)]
        #expect(chooser.choose(from: only)?.variant.id == "vf-hd-noir-et-blanc")
    }

    @Test("La série regardée dans une édition y reste, d'un épisode à l'autre")
    func seriesEditionKept() {
        let chooser = VariantChooser(languageOrder: [.vf], maxQuality: .uhd)
        let edition = Fixtures.variant("vf-hd-noir-et-blanc", .vf, .hd, edition: "Noir et blanc")
        // What the server keeps of the choice comes back as the same thing, edition included.
        #expect(RememberedVariant(edition).key == edition.key)
        #expect(RememberedVariant(edition).label == "FR · HD · Noir et blanc")
        let episode = [Fixtures.variant("vf-4k", .vf, .uhd), Fixtures.variant("vf-fhd-noir-et-blanc", .vf, .fhd, edition: "Noir et blanc")]
        #expect(chooser.choose(from: episode, remembered: RememberedVariant(edition))?.variant.id == "vf-fhd-noir-et-blanc")
    }

    @Test("Sans variantes, ou avec les seules variantes d'une série : rien à jouer")
    func nothingPlayable() {
        let chooser = VariantChooser(languageOrder: [.vf], maxQuality: .uhd)
        #expect(chooser.choose(from: []) == nil)
        #expect(chooser.choose(from: [Fixtures.variant("series", .vf, .hd, playable: false)]) == nil)
    }

    @Test("Une variante dit ce qu'elle est et d'où elle vient")
    func texts() {
        let v = Fixtures.variant("a", .vf, .uhd, dr: .dolbyVision, edition: "Version longue", by: Fixtures.backup)
        #expect(v.badge == "4K DV")
        #expect(v.label == "FR · 4K DV · Version longue")
        #expect(v.title(withLanguage: true) == "FR · 4K DV · Version longue")
        #expect(v.title(withLanguage: false) == "4K DV · Version longue")
        #expect(v.origin == "Secours · a")
    }

    @Test("Avertissement de langue : une seule phrase, avec le retour seulement s'il existe")
    func languageWarning() {
        let back = VariantChooser.languageWarning(episode: 3, alternative: .vo, current: .vf, returnsAt: 5)
        #expect(back.contains("É3"))
        #expect(back.contains("VO"))
        #expect(back.contains("retour en FR à l'épisode 5"))
        let none = VariantChooser.languageWarning(episode: 3, alternative: .vo, current: .vf, returnsAt: nil)
        #expect(!none.contains("retour"))
        let quality = VariantChooser.languageWarning(episode: 3, alternative: .vo, current: .vf, returnsAt: nil, quality: .fhd)
        #expect(quality.contains(Quality.fhd.rawValue))
    }
}

@MainActor
struct FailedVariantsStoreTests {
    @Test("Une variante en échec l'est pendant 24 h, puis plus")
    func expiresAfterADay() {
        var now = Date(timeIntervalSince1970: 1_000_000)
        let store = FailedVariantsStore(now: { now })
        store.markFailed("a")
        #expect(store.isFailed("a"))
        now = now.addingTimeInterval(23 * 3600)
        #expect(store.isFailed("a"))
        now = now.addingTimeInterval(2 * 3600)
        #expect(!store.isFailed("a"))
    }

    @Test("Un démarrage réussi efface la marque")
    func clearOnSuccess() {
        let store = FailedVariantsStore()
        store.markFailed("a")
        store.clear("a")
        #expect(!store.isFailed("a"))
    }
}
