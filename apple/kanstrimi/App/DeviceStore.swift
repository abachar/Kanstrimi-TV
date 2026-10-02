import Foundation
import Observation
import Security

/// The device token lives in the Keychain; everything else about pairing is derived from it. The Keychain group is
/// shared with the Top Shelf extension (`Entitlements/`), which reads the token and the server address from it.
@Observable
final class DeviceStore {
    private(set) var token: String?
    /// The pairing code doubles as the device identifier (`DELETE /devices/{code}`).
    private(set) var code: String?
    /// Why the user is back on the pairing screen, if the token was just lost.
    var lastRevocationMessage: String?

    private let secrets: SecretStore

    /// Tests pass a store in memory: the app's Keychain stays untouched.
    init(secrets: SecretStore = KeychainStore()) {
        self.secrets = secrets
        token = secrets.read(account: "device-token")
        code = secrets.read(account: "device-code")
    }

    var isPaired: Bool { token != nil }

    func store(token: String, code: String) {
        secrets.write(token, account: "device-token")
        secrets.write(code, account: "device-code")
        self.token = token
        self.code = code
        lastRevocationMessage = nil
    }

    /// The server address, for the Top Shelf extension: it has no access to the app's preferences.
    func share(serverURL: String) {
        if secrets.read(account: "server-url") != serverURL { secrets.write(serverURL, account: "server-url") }
    }

    /// Token revoked or user unpaired: forget everything local.
    func forget(reason: String?) {
        secrets.delete(account: "device-token")
        secrets.delete(account: "device-code")
        token = nil
        code = nil
        lastRevocationMessage = reason
    }
}

/// Where the device's secrets are kept.
protocol SecretStore {
    func read(account: String) -> String?
    func write(_ value: String, account: String)
    func delete(account: String)
}

/// The Keychain, readable after the first unlock (the Top Shelf extension runs in the background) and never
/// carried to another device by a backup.
struct KeychainStore: SecretStore {
    private static let service = "dev.crafters.kanstrimi"

    private func query(_ account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: Self.service, kSecAttrAccount as String: account]
    }
    func read(account: String) -> String? {
        var q = query(account)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    /// Updated in place, added when missing: a failed add never loses the value already there.
    func write(_ value: String, account: String) {
        let attributes: [String: Any] = [kSecValueData as String: Data(value.utf8),
                                         kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let status = SecItemUpdate(query(account) as CFDictionary, attributes as CFDictionary)
        guard status == errSecItemNotFound else { return }
        SecItemAdd(query(account).merging(attributes) { $1 } as CFDictionary, nil)
    }
    func delete(account: String) { SecItemDelete(query(account) as CFDictionary) }
}
