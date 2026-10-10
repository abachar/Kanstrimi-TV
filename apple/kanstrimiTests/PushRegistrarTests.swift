#if os(iOS)
import Foundation
import Testing
@testable import kanstrimi

struct PushRegistrarTests {
    @Test func tokenIsLowercaseHex() {
        #expect(PushRegistrar.hex(Data([0x00, 0xab, 0xff, 0x10])) == "00abff10")
    }

    @Test func environmentComesFromTheEmbeddedProfile() {
        let dev = "<dict><key>Entitlements</key><dict><key>aps-environment</key><string>development</string></dict></dict>"
        let prod = "<dict><key>Entitlements</key><dict><key>aps-environment</key><string>production</string></dict></dict>"
        #expect(PushRegistrar.apnsEnvironment(profile: dev) == "sandbox")
        #expect(PushRegistrar.apnsEnvironment(profile: prod) == "production")
        #expect(PushRegistrar.apnsEnvironment(profile: nil) == "sandbox")
        #expect(PushRegistrar.apnsEnvironment(profile: "<dict></dict>") == "sandbox")
    }
}
#endif
