import Foundation
import Testing
@testable import kanstrimi

@MainActor
struct VersionChooserTests {
    let versions = Fixtures.canvasVersions

    @Test("Préférences : VF puis meilleure qualité qui tient dans le plafond")
    func preferencesPickBestVF() {
        let chooser = VersionChooser(languageOrder: [.vf, .vostfr, .vo], maxQuality: .uhd)
        let choice = chooser.choose(from: versions)
        #expect(choice?.version.id == "vf-4k-dv")
        #expect(choice?.reason == .preferences)
        #expect(choice?.source.id == "vf-4k-dv-s0")
    }

    @Test("Sans ordre de langues, celui du serveur : les versions arrivent dans l'ordre du profil")
    func serverOrderWhenNoPreference() {
        let chooser = VersionChooser(languageOrder: [], maxQuality: .uhd)
        let vostFirst = versions.filter { $0.language == .vostfr } + versions.filter { $0.language != .vostfr }
        #expect(chooser.choose(from: vostFirst)?.version.id == "vostfr-4k-hdr")
        #expect(chooser.choose(from: versions)?.version.id == "vf-4k-dv")
        #expect(vostFirst.languages == [.vostfr, .vf, .vo])
        #expect(chooser.alternatives(to: vostFirst[0], in: vostFirst).first?.id == "vostfr-fhd")
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

    @Test("Une chaîne passée en FHD repart en FHD (lecture, aperçu, guide) ; la première fois, la meilleure")
    func channelStartsInRememberedQuality() {
        let chooser = VersionChooser(languageOrder: [.vf], maxQuality: .uhd)
        let versions = [Fixtures.version("vf-4k", .vf, .uhd), Fixtures.version("vf-fhd", .vf, .fhd), Fixtures.version("vf-hd", .vf, .hd)]
        #expect(chooser.start(versions: versions, remembered: nil)?.version.id == "vf-4k")
        let fhd = RememberedVersion(id: "vf-fhd", language: .vf, quality: .fhd, label: "FR · HD 1080p")
        #expect(chooser.start(versions: versions, remembered: fhd)?.version.id == "vf-fhd")
        // The version chosen is gone from the list: the same language at the best quality.
        let gone = RememberedVersion(id: "vf-sd", language: .vf, quality: .sd, label: "FR · SD")
        #expect(chooser.start(versions: versions, remembered: gone)?.version.id == "vf-4k")
        #expect(chooser.start(versions: versions, remembered: gone)?.reason == .seriesLanguage)
    }

    @Test("Le choix fait ici prime sur ce que le serveur a servi, jusqu'à l'oubli")
    @MainActor func localChoiceComesFirst() {
        let env = AppEnvironment(forceMock: true, defaults: UserDefaults(suiteName: "tests-\(UUID().uuidString)")!, secrets: MemorySecrets())
        let tf1 = ContentID("live:fr-tf1")
        let served = RememberedVersion(id: "vf-4k", language: .vf, quality: .uhd, label: "FR · 4K")
        #expect(env.player.remembered(served, for: tf1)?.id == "vf-4k")
        env.player.remember(Fixtures.version("vf-fhd", .vf, .fhd), for: tf1)
        #expect(env.player.remembered(served, for: tf1)?.id == "vf-fhd")
        env.player.forgetVersion(for: tf1)
        #expect(env.player.remembered(served, for: tf1) == nil)
        // The setting off: nothing kept.
        env.preferences.profileSettings.rememberVersions = false
        env.player.remember(Fixtures.version("vf-hd", .vf, .hd), for: ContentID("live:fr-m6"))
        #expect(env.player.remembered(nil, for: ContentID("live:fr-m6")) == nil)
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

    @Test("Une édition n'est jamais le choix automatique tant que le montage habituel existe")
    func editionNotAutomatic() {
        let chooser = VersionChooser(languageOrder: [.vf], maxQuality: .uhd)
        let versions = [
            Fixtures.version("vf-hd", .vf, .hd),
            Fixtures.version("vf-4k-version-longue", .vf, .uhd, edition: "Version longue"),
        ]
        #expect(chooser.choose(from: versions)?.version.id == "vf-hd")
        #expect(chooser.choose(from: versions, remembered: "vf-4k-version-longue")?.version.id == "vf-4k-version-longue")
        #expect(chooser.alternatives(to: versions[1], in: versions).map(\.id) == ["vf-hd"])
        // Nothing but an edition in the language: it plays.
        let only = [Fixtures.version("vf-hd-noir-et-blanc", .vf, .hd, edition: "Noir et blanc"), Fixtures.version("vo-hd", .vo, .hd)]
        #expect(chooser.choose(from: only)?.version.id == "vf-hd-noir-et-blanc")
    }

    @Test("La série regardée dans une édition y reste, d'un épisode à l'autre")
    func seriesEditionKept() {
        let chooser = VersionChooser(languageOrder: [.vf], maxQuality: .uhd)
        let edition = Fixtures.version("vf-hd-noir-et-blanc", .vf, .hd, edition: "Noir et blanc")
        let key = VersionChoiceKey(edition)
        // What the server keeps of the choice comes back as the same key, edition included.
        #expect(RememberedVersion(edition).key == key)
        #expect(key.label == "FR · HD · Noir et blanc")
        let episode = [Fixtures.version("vf-4k", .vf, .uhd), Fixtures.version("vf-fhd-noir-et-blanc", .vf, .fhd, edition: "Noir et blanc")]
        #expect(chooser.choose(from: episode, seriesChoice: key)?.version.id == "vf-fhd-noir-et-blanc")
        #expect(edition.label == "HD · FR · Noir et blanc")
    }

    @Test("Sans versions ou sans sources : rien à jouer")
    func nothingPlayable() {
        let chooser = VersionChooser(languageOrder: [.vf], maxQuality: .uhd)
        #expect(chooser.choose(from: []) == nil)
        let empty = Version(id: "x", language: .vf, quality: .hd, dynamicRange: nil, sources: [])
        #expect(chooser.choose(from: [empty]) == nil)
    }

    @Test("Avertissement de langue : une seule phrase, avec le retour seulement s'il existe")
    func languageWarning() {
        let back = VersionChooser.languageWarning(episode: 3, alternative: .vo, current: .vf, returnsAt: 5)
        #expect(back.contains("É3"))
        #expect(back.contains("VO"))
        #expect(back.contains("retour en FR à l'épisode 5"))
        let none = VersionChooser.languageWarning(episode: 3, alternative: .vo, current: .vf, returnsAt: nil)
        #expect(!none.contains("retour"))
        let quality = VersionChooser.languageWarning(episode: 3, alternative: .vo, current: .vf, returnsAt: nil, quality: .fhd)
        #expect(quality.contains(Quality.fhd.rawValue))
    }

    @Test("Versions classées : recommandée, langue préférée, montage habituel avant édition, meilleure qualité")
    func orderedVersions() {
        let list = [
            Fixtures.version("vf-long", .vf, .uhd, edition: "Version longue"),
            Fixtures.version("vf-fhd", .vf, .fhd),
            Fixtures.version("vo-fhd", .vo, .fhd),
            Fixtures.version("vf-4k", .vf, .uhd),
            Fixtures.version("vf-4k-dv", .vf, .uhd, dr: .dolbyVision),
        ]
        let order = Array(list.languages)
        #expect(order.first == .vf)
        let plain = VersionChooser.ordered(list, recommended: nil).map(\.id)
        #expect(plain == ["vf-4k-dv", "vf-4k", "vf-fhd", "vf-long", "vo-fhd"])
        let withRecommended = VersionChooser.ordered(list, recommended: "vo-fhd").map(\.id)
        #expect(withRecommended == ["vo-fhd", "vf-4k-dv", "vf-4k", "vf-fhd", "vf-long"])
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
