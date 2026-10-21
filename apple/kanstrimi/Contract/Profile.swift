import Foundation

/// A person of the household (`GET /profiles`). Every request names the one it is for (`X-Profile`); none means
/// the default profile. The avatar is a square image whose URL changes with the picture.
nonisolated struct Profile: Codable, Hashable, Identifiable, Sendable {
    let id: Int
    let name: String
    let isDefault: Bool
    let avatar: URL
    /// Its playback settings, the same on every device it watches on.
    var settings: ProfileSettings = .standard

    enum CodingKeys: String, CodingKey {
        case id, name, avatar, settings
        case isDefault = "is_default"
    }

    init(id: Int, name: String, isDefault: Bool, avatar: URL, settings: ProfileSettings = .standard) {
        self.id = id; self.name = name; self.isDefault = isDefault; self.avatar = avatar; self.settings = settings
    }

    /// A fixture without settings (the demo's) reads with the standard ones.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(Int.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        isDefault = try c.decodeIfPresent(Bool.self, forKey: .isDefault) ?? false
        avatar = try c.decode(URL.self, forKey: .avatar)
        settings = try c.decodeIfPresent(ProfileSettings.self, forKey: .settings) ?? .standard
    }

    /// The letter drawn while the picture loads, or when it never comes.
    var initial: String { name.trimmingCharacters(in: .whitespaces).prefix(1).uppercased() }
}

/// `GET /profiles`
nonisolated struct Profiles: Codable, Hashable, Sendable {
    let profiles: [Profile]
}

/// The playback settings of a profile, kept by the server (Réglages › Lecture, admin › Profils): the quality played by
/// default (this device still caps it), the next episode starting by itself, the version chosen in the picker kept for
/// the title, another source tried when one fails.
nonisolated struct ProfileSettings: Codable, Hashable, Sendable {
    var maxQuality: Quality
    var autoPlayNext: Bool
    var rememberVersions: Bool
    var switchSourceOnFailure: Bool

    enum CodingKeys: String, CodingKey {
        case maxQuality = "max_quality"
        case autoPlayNext = "auto_play_next"
        case rememberVersions = "remember_versions"
        case switchSourceOnFailure = "switch_source_on_failure"
    }

    static let standard = ProfileSettings(maxQuality: .uhd, autoPlayNext: true, rememberVersions: true, switchSourceOnFailure: true)
}

/// `PUT /profiles/me/settings`: the settings to change, each optional.
nonisolated struct ProfileSettingsPatch: Codable, Hashable, Sendable {
    var maxQuality: Quality? = nil
    var autoPlayNext: Bool? = nil
    var rememberVersions: Bool? = nil
    var switchSourceOnFailure: Bool? = nil

    enum CodingKeys: String, CodingKey {
        case maxQuality = "max_quality"
        case autoPlayNext = "auto_play_next"
        case rememberVersions = "remember_versions"
        case switchSourceOnFailure = "switch_source_on_failure"
    }

    /// Everything of `settings`: what the apps send, so a stale cache cannot keep an old value.
    init(_ settings: ProfileSettings) {
        maxQuality = settings.maxQuality; autoPlayNext = settings.autoPlayNext
        rememberVersions = settings.rememberVersions; switchSourceOnFailure = settings.switchSourceOnFailure
    }
}
