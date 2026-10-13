import Foundation

/// A person of the household (`GET /profiles`). Every request names the one it is for (`X-Profile`); none means
/// the default profile. The avatar is a square image whose URL changes with the picture.
nonisolated struct Profile: Codable, Hashable, Identifiable, Sendable {
    let id: Int
    let name: String
    let isDefault: Bool
    let avatar: URL

    enum CodingKeys: String, CodingKey {
        case id, name, avatar
        case isDefault = "is_default"
    }

    /// The letter drawn while the picture loads, or when it never comes.
    var initial: String { name.trimmingCharacters(in: .whitespaces).prefix(1).uppercased() }
}

/// `GET /profiles`
nonisolated struct Profiles: Codable, Hashable, Sendable {
    let profiles: [Profile]
}
