import Foundation
import Observation
import Security

/// The device token lives in the Keychain; everything else about pairing is derived from it.
@Observable
final class DeviceStore {
    private(set) var token: String?
    /// Why the user is back on the pairing screen, if the token was just lost.
    var lastRevocationMessage: String?

    init() { token = Keychain.read() }

    var isPaired: Bool { token != nil }

    func store(token: String) {
        Keychain.write(token)
        self.token = token
        lastRevocationMessage = nil
    }

    /// Token revoked or user unpaired: forget everything local.
    func forget(reason: String?) {
        Keychain.delete()
        token = nil
        lastRevocationMessage = reason
    }
}

private enum Keychain {
    private static let service = "dev.crafters.kanstrimi"
    private static let account = "device-token"

    private static var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
    }
    static func read() -> String? {
        var q = query
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    static func write(_ value: String) {
        delete()
        var q = query
        q[kSecValueData as String] = Data(value.utf8)
        SecItemAdd(q as CFDictionary, nil)
    }
    static func delete() { SecItemDelete(query as CFDictionary) }
}
