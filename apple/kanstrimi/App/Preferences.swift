import Foundation
import Observation

/// What this device keeps for itself (`UserDefaults`): the server, its name, the demo switch, and a copy of the
/// profile's playback settings so the player has them before `/info` answers. Everything personal (the settings
/// themselves, the versions chosen, the recent channels) lives on the server, with the profile.
@Observable
final class Preferences {
    private let defaults: UserDefaults
    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        serverURL = defaults.string(forKey: Keys.serverURL) ?? Self.compiledServerURL
        useMockClient = defaults.object(forKey: Keys.useMock) as? Bool ?? false
        deviceName = defaults.string(forKey: Keys.deviceName) ?? ""
        profileSettings = Self.decode(ProfileSettings.self, defaults.string(forKey: Keys.profileSettings)) ?? .standard
    }

    private enum Keys {
        static let serverURL = "pref.serverURL"
        static let useMock = "pref.useMock"
        static let deviceName = "pref.deviceName"
        static let profileSettings = "pref.profileSettings"
    }

    /// Build setting: the app is personal, the URL ships with it.
    static let compiledServerURL = "https://kanstrimi.crafters.dev"

    var serverURL: String { didSet { defaults.set(serverURL, forKey: Keys.serverURL) } }
    /// Réglages › Démo: the embedded fixtures instead of the server. Off by default; previews force it.
    var useMockClient: Bool { didSet { defaults.set(useMockClient, forKey: Keys.useMock) } }
    var deviceName: String { didSet { defaults.set(deviceName, forKey: Keys.deviceName) } }

    /// The profile's playback settings as the server last said them (`/info`, `PUT /profiles/me/settings`): read by
    /// the player and Réglages › Lecture, kept here so a launch without network still plays as before.
    var profileSettings: ProfileSettings { didSet { defaults.set(Self.encode(profileSettings), forKey: Keys.profileSettings) } }

    func resetAll() {
        serverURL = Self.compiledServerURL
        deviceName = ""
        profileSettings = .standard
    }

    private static func encode<T: Encodable>(_ value: T) -> String? {
        (try? JSONEncoder().encode(value)).flatMap { String(data: $0, encoding: .utf8) }
    }
    private static func decode<T: Decodable>(_ type: T.Type, _ string: String?) -> T? {
        guard let data = string?.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }
}
