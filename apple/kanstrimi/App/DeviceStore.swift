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

    init() {
        token = Keychain.read(account: "device-token")
        code = Keychain.read(account: "device-code")
    }

    var isPaired: Bool { token != nil }

    func store(token: String, code: String) {
        Keychain.write(token, account: "device-token")
        Keychain.write(code, account: "device-code")
        self.token = token
        self.code = code
        lastRevocationMessage = nil
    }

    /// The server address, for the Top Shelf extension: it has no access to the app's preferences.
    func share(serverURL: String) {
        if Keychain.read(account: "server-url") != serverURL { Keychain.write(serverURL, account: "server-url") }
    }

    /// Token revoked or user unpaired: forget everything local.
    func forget(reason: String?) {
        Keychain.delete(account: "device-token")
        Keychain.delete(account: "device-code")
        token = nil
        code = nil
        lastRevocationMessage = reason
    }
}

private enum Keychain {
    private static let service = "dev.crafters.kanstrimi"

    private static func query(_ account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
    }
    static func read(account: String) -> String? {
        var q = query(account)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    static func write(_ value: String, account: String) {
        delete(account: account)
        var q = query(account)
        q[kSecValueData as String] = Data(value.utf8)
        SecItemAdd(q as CFDictionary, nil)
    }
    static func delete(account: String) { SecItemDelete(query(account) as CFDictionary) }
}
