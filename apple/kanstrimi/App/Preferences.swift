import Foundation
import Observation

/// Playback and device preferences (`AppStorage`), plus the per-title memory of chosen versions.
@Observable
final class Preferences {
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        languageOrder = Self.decode([Language].self, defaults.string(forKey: Keys.languageOrder)) ?? [.vf, .vostfr, .vo]
        maxQuality = Quality(rawValue: defaults.string(forKey: Keys.maxQuality) ?? "") ?? .uhd
        autoPlayNext = defaults.object(forKey: Keys.autoPlayNext) as? Bool ?? true
        rememberVersionPerTitle = defaults.object(forKey: Keys.rememberVersion) as? Bool ?? true
        switchSourceOnFailure = defaults.object(forKey: Keys.switchSource) as? Bool ?? true
        serverURL = defaults.string(forKey: Keys.serverURL) ?? Self.compiledServerURL
        useMockClient = defaults.object(forKey: Keys.useMock) as? Bool ?? false
        deviceName = defaults.string(forKey: Keys.deviceName) ?? ""
        rememberedVersions = Self.decode([String: String].self, defaults.string(forKey: Keys.rememberedVersions)) ?? [:]
        seriesLanguages = Self.decode([String: String].self, defaults.string(forKey: Keys.seriesLanguages)) ?? [:]
        catalogSortMovies = CatalogSort(rawValue: defaults.string(forKey: Keys.sortMovies) ?? "") ?? .recent
        catalogSortSeries = CatalogSort(rawValue: defaults.string(forKey: Keys.sortSeries) ?? "") ?? .latestEpisodes
    }

    private enum Keys {
        static let languageOrder = "pref.languageOrder"
        static let maxQuality = "pref.maxQuality"
        static let autoPlayNext = "pref.autoPlayNext"
        static let rememberVersion = "pref.rememberVersion"
        static let switchSource = "pref.switchSource"
        static let serverURL = "pref.serverURL"
        static let useMock = "pref.useMock"
        static let deviceName = "pref.deviceName"
        static let rememberedVersions = "pref.rememberedVersions"
        static let seriesLanguages = "pref.seriesLanguages"
        static let sortMovies = "pref.sortMovies"
        static let sortSeries = "pref.sortSeries"
    }

    /// Build setting: the app is personal, the URL ships with it.
    static let compiledServerURL = "https://kanstrimi.crafters.dev"

    var languageOrder: [Language] { didSet { defaults.set(Self.encode(languageOrder), forKey: Keys.languageOrder) } }
    var maxQuality: Quality { didSet { defaults.set(maxQuality.rawValue, forKey: Keys.maxQuality) } }
    var autoPlayNext: Bool { didSet { defaults.set(autoPlayNext, forKey: Keys.autoPlayNext) } }
    var rememberVersionPerTitle: Bool { didSet { defaults.set(rememberVersionPerTitle, forKey: Keys.rememberVersion) } }
    var switchSourceOnFailure: Bool { didSet { defaults.set(switchSourceOnFailure, forKey: Keys.switchSource) } }
    var serverURL: String { didSet { defaults.set(serverURL, forKey: Keys.serverURL) } }
    /// Réglages › Démo: the embedded fixtures instead of the server. Off by default; previews force it.
    var useMockClient: Bool { didSet { defaults.set(useMockClient, forKey: Keys.useMock) } }
    var deviceName: String { didSet { defaults.set(deviceName, forKey: Keys.deviceName) } }
    var catalogSortMovies: CatalogSort { didSet { defaults.set(catalogSortMovies.rawValue, forKey: Keys.sortMovies) } }
    var catalogSortSeries: CatalogSort { didSet { defaults.set(catalogSortSeries.rawValue, forKey: Keys.sortSeries) } }

    /// Version id remembered per content id (movies), set from the version picker.
    private(set) var rememberedVersions: [String: String] { didSet { defaults.set(Self.encode(rememberedVersions), forKey: Keys.rememberedVersions) } }
    /// "language/quality/dr" key remembered per series id, applied to every episode.
    private(set) var seriesLanguages: [String: String] { didSet { defaults.set(Self.encode(seriesLanguages), forKey: Keys.seriesLanguages) } }

    var preferredLanguage: Language { languageOrder.first ?? .vf }

    func rememberedVersion(for id: ContentID) -> String? { rememberedVersions[id.rawValue] }
    func remember(versionID: String?, for id: ContentID) {
        if let versionID { rememberedVersions[id.rawValue] = versionID } else { rememberedVersions.removeValue(forKey: id.rawValue) }
    }

    func seriesChoice(for id: ContentID) -> VersionChoiceKey? {
        seriesLanguages[id.rawValue].flatMap(VersionChoiceKey.init(rawValue:))
    }
    func setSeriesChoice(_ key: VersionChoiceKey?, for id: ContentID) {
        if let key { seriesLanguages[id.rawValue] = key.rawValue } else { seriesLanguages.removeValue(forKey: id.rawValue) }
    }

    func resetAll() {
        languageOrder = [.vf, .vostfr, .vo]
        maxQuality = .uhd
        autoPlayNext = true
        rememberVersionPerTitle = true
        switchSourceOnFailure = true
        serverURL = Self.compiledServerURL
        deviceName = ""
        rememberedVersions = [:]
        seriesLanguages = [:]
    }

    private static func encode<T: Encodable>(_ value: T) -> String? {
        (try? JSONEncoder().encode(value)).flatMap { String(data: $0, encoding: .utf8) }
    }
    private static func decode<T: Decodable>(_ type: T.Type, _ string: String?) -> T? {
        guard let data = string?.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }
}

/// A language × quality choice that survives across episodes of a series ("VF · 4K HDR").
nonisolated struct VersionChoiceKey: Hashable, Codable, RawRepresentable, Sendable {
    let language: Language
    let quality: Quality
    let dynamicRange: DynamicRange?

    init(language: Language, quality: Quality, dynamicRange: DynamicRange?) {
        self.language = language; self.quality = quality; self.dynamicRange = dynamicRange
    }
    init(_ version: Version) { self.init(language: version.language, quality: version.quality, dynamicRange: version.dynamicRange) }

    var rawValue: String { "\(language.rawValue)/\(quality.rawValue)/\(dynamicRange?.rawValue ?? "")" }
    init?(rawValue: String) {
        let parts = rawValue.split(separator: "/", omittingEmptySubsequences: false)
        guard parts.count == 3, let q = Quality(rawValue: String(parts[1])) else { return nil }
        language = Language(String(parts[0])); quality = q
        dynamicRange = parts[2].isEmpty ? nil : DynamicRange(rawValue: String(parts[2]))
    }
    var label: String {
        let dr = dynamicRange.map { $0 == .sdr ? "" : " \($0.label)" } ?? ""
        return "\(language.rawValue) · \(quality.label)\(dr)"
    }
}
