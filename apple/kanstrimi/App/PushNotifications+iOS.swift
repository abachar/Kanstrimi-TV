#if os(iOS)
import SwiftUI
import UserNotifications

/// iPhone only: the server's alerts (« Film attendu arrivé », « Traitement complet terminé »). Asked for once the
/// device is paired, APNs' token handed to the server at each launch (`PUT /devices/me/push`), an alert arriving
/// while the app is open shown as a banner, a tapped one opening the sheet its `link` names. The tablet gets none
/// for now: the server is told of phones only.
@MainActor @Observable
final class PushRegistrar: NSObject, UNUserNotificationCenterDelegate {
    static let shared = PushRegistrar()

    /// What the system allows, for Réglages.
    private(set) var authorization: UNAuthorizationStatus = .notDetermined
    /// Set by the environment at start; a link received before that waits for it.
    weak var environment: AppEnvironment? {
        didSet { if let link = pendingLink, environment != nil { pendingLink = nil; open(link) } }
    }
    @ObservationIgnored private var pendingLink: DeepLink?

    /// With the device paired: the system's permission the first time, then the registration; APNs answers through the delegate.
    func register() async {
        guard !Platform.isPad else { return }
        let center = UNUserNotificationCenter.current()
        var status = await center.notificationSettings().authorizationStatus
        if status == .notDetermined {
            _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
            status = await center.notificationSettings().authorizationStatus
        }
        authorization = status
        guard status == .authorized || status == .provisional else { return }
        UIApplication.shared.registerForRemoteNotifications()
    }

    func refreshStatus() async {
        authorization = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
    }

    /// The token APNs issued, from the app delegate: to the server, with the gateway it belongs to. Silent when it fails:
    /// the next launch sends it again.
    func didReceive(deviceToken: Data) {
        guard let env = environment, env.device.isPaired else { return }
        let registration = PushRegistration(platform: "ios", token: Self.hex(deviceToken), environment: Self.apnsEnvironment())
        Task { try? await env.client.registerPush(registration) }
    }

    nonisolated static func hex(_ data: Data) -> String { data.map { String(format: "%02x", $0) }.joined() }

    /// `sandbox` or `production`: which APNs gateway the token belongs to, read from the `aps-environment` entitlement
    /// of the embedded provisioning profile (`development` from Xcode, `production` from TestFlight). No profile
    /// (the simulator): the sandbox.
    nonisolated static func apnsEnvironment(profile: String? = embeddedProfile()) -> String {
        guard let profile, let key = profile.range(of: "<key>aps-environment</key>"),
              let open = profile.range(of: "<string>", range: key.upperBound..<profile.endIndex),
              let close = profile.range(of: "</string>", range: open.upperBound..<profile.endIndex) else { return "sandbox" }
        return profile[open.upperBound..<close.lowerBound].trimmingCharacters(in: .whitespacesAndNewlines) == "production" ? "production" : "sandbox"
    }

    /// The text of `embedded.mobileprovision`: a signed blob holding its plist in clear.
    nonisolated private static func embeddedProfile() -> String? {
        guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"), let data = try? Data(contentsOf: url) else { return nil }
        return String(decoding: data, as: UTF8.self)
    }

    // MARK: - UNUserNotificationCenterDelegate

    /// An alert arriving while the app is open: shown as the system would.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }

    /// The alert tapped: its `link` (`kanstrimi://open/<id>`) goes through the same door as any deep link.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let raw = response.notification.request.content.userInfo["link"] as? String
        guard let raw, let url = URL(string: raw), let link = DeepLink(url: url) else { return }
        await MainActor.run { self.open(link) }
    }

    private func open(_ link: DeepLink) {
        guard let env = environment else { pendingLink = link; return }
        Task { await env.handle(link) }
    }
}

extension AppDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        // Before launch ends, so that the alert that opened the app reaches the delegate.
        UNUserNotificationCenter.current().delegate = PushRegistrar.shared
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        PushRegistrar.shared.didReceive(deviceToken: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NSLog("APNs : %@", error.localizedDescription)
    }
}
#endif
