import Foundation
import Testing
@testable import kanstrimi

@MainActor
struct VersionChooserTests {
    let versions = Fixtures.sevenVersions

    @Test("Préférences : VF puis meilleure qualité qui tient dans le plafond")
    func preferencesPickBestVF() {
        let chooser = VersionChooser(languageOrder: [.vf, .vostfr, .vo], maxQuality: .uhd)
        let choice = chooser.choose(from: versions)
        #expect(choice?.version.id == "vf-4k-dv")
        #expect(choice?.reason == .preferences)
        #expect(choice?.source.id == "vf-4k-dv-s0")
    }

    @Test("Le plafond de qualité écarte le 4K")
    func maxQualityCaps() {
        let chooser = VersionChooser(languageOrder: [.vf], maxQuality: .fhd)
        #expect(chooser.choose(from: versions)?.version.id == "vf-fhd")
    }

    @Test("Une TV sans Dolby Vision prend le 4K HDR")
    func capabilitiesMatter() {
        var chooser = VersionChooser(languageOrder: [.vf], maxQuality: .uhd)
        chooser.capabilities = .init(maxQuality: .uhd, supportsHDR: true, supportsDolbyVision: false)
        #expect(chooser.choose(from: versions)?.version.id == "vf-4k-hdr")
    }

    @Test("Un iPhone plafonne à la Full HD même si les réglages demandent le 4K")
    func iPhoneCapsAtFullHD() {
        var chooser = VersionChooser(languageOrder: [.vf], maxQuality: .uhd)
        chooser.capabilities = .iPhone
        #expect(chooser.choose(from: versions)?.version.id == "vf-fhd")
        #expect(VersionChooser.Capabilities.current.maxQuality == (Platform.isTV ? .uhd : .fhd))
    }

    @Test("Le choix mémorisé pour le titre prime sur tout")
    func rememberedWins() {
        let chooser = VersionChooser(languageOrder: [.vf], maxQuality: .uhd)
        let choice = chooser.choose(from: versions, remembered: "vo-fhd")
        #expect(choice?.version.id == "vo-fhd")
        #expect(choice?.reason == .remembered)
    }

    @Test("La langue de la série s'applique même si la qualité exacte manque")
    func seriesLanguageFallsBackWithinLanguage() {
        let chooser = VersionChooser(languageOrder: [.vf], maxQuality: .uhd)
        let key = VersionChoiceKey(language: .vostfr, quality: .hd, dynamicRange: nil)
        let choice = chooser.choose(from: versions, seriesChoice: key)
        #expect(choice?.version.language == .vostfr)
        #expect(choice?.version.id == "vostfr-4k-hdr")
        #expect(choice?.reason == .seriesLanguage)
    }

    @Test("Aucune version dans la langue préférée : première de l'ordre serveur, et on le dit")
    func fallbackLanguage() {
        let chooser = VersionChooser(languageOrder: [Language("DE")], maxQuality: .uhd)
        let choice = chooser.choose(from: versions)
        #expect(choice?.version.id == "vf-4k-dv")
        #expect(choice?.reason == .fallbackLanguage)
    }

    @Test("Une source en échec récent est écartée au profit de la suivante")
    func failedSourceSkipped() {
        var chooser = VersionChooser(languageOrder: [.vf], maxQuality: .uhd)
        chooser.isSourceFailed = { $0 == "vf-4k-hdr-s0" }
        let choice = chooser.choose(from: versions, remembered: "vf-4k-hdr")
        #expect(choice?.source.id == "vf-4k-hdr-s1")
    }

    @Test("Toutes les sources en échec : on rejoue quand même la première")
    func allFailedStillPlays() {
        var chooser = VersionChooser(languageOrder: [.vf], maxQuality: .uhd)
        chooser.isSourceFailed = { _ in true }
        #expect(chooser.choose(from: versions)?.source.id == "vf-4k-dv-s0")
    }

    @Test("Source suivante pour la bascule automatique, puis plus rien")
    func nextSourceRotation() {
        let chooser = VersionChooser(languageOrder: [.vf], maxQuality: .uhd)
        let v = versions[1]
        #expect(chooser.nextSource(after: v.sources[0], in: v)?.id == "vf-4k-hdr-s1")
        #expect(chooser.nextSource(after: v.sources[1], in: v)?.id == "vf-4k-hdr-s0")
        #expect(chooser.nextSource(after: versions[0].sources[0], in: versions[0]) == nil)
    }

    @Test("Les alternatives suivent la langue préférée puis la qualité")
    func alternativesOrder() {
        let chooser = VersionChooser(languageOrder: [.vf, .vostfr, .vo], maxQuality: .uhd)
        let alts = chooser.alternatives(to: versions[0], in: versions).map(\.id)
        #expect(alts == ["vf-4k-hdr", "vf-fhd", "vostfr-4k-hdr", "vostfr-fhd", "vo-fhd"])
    }

    @Test("Une seule version : elle est jouée quelle que soit la langue")
    func singleVersion() {
        let chooser = VersionChooser(languageOrder: [.vf], maxQuality: .uhd)
        let only = [Fixtures.version("vostfr-fhd", .vostfr, .fhd)]
        #expect(chooser.choose(from: only)?.reason == .onlyOne)
    }

    @Test("Sans versions ou sans sources : rien à jouer")
    func nothingPlayable() {
        let chooser = VersionChooser(languageOrder: [.vf], maxQuality: .uhd)
        #expect(chooser.choose(from: []) == nil)
        let empty = Version(id: "x", language: .vf, quality: .hd, dynamicRange: nil, sources: [])
        #expect(chooser.choose(from: [empty]) == nil)
    }
}

@MainActor
struct FailedSourcesStoreTests {
    @Test("Une source en échec l'est pendant 24 h, puis plus")
    func expiresAfterADay() {
        var now = Date(timeIntervalSince1970: 1_000_000)
        let store = FailedSourcesStore(now: { now })
        store.markFailed("a")
        #expect(store.isFailed("a"))
        now = now.addingTimeInterval(23 * 3600)
        #expect(store.isFailed("a"))
        now = now.addingTimeInterval(2 * 3600)
        #expect(!store.isFailed("a"))
    }

    @Test("Un démarrage réussi efface la marque")
    func clearOnSuccess() {
        let store = FailedSourcesStore()
        store.markFailed("a")
        store.clear("a")
        #expect(!store.isFailed("a"))
    }
}
