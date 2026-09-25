import Foundation
import Observation

/// Knobs that drive the mock's failure cases, exposed in Réglages › Démo.
@Observable
final class MockScenario {
    /// Every call fails with `.offline`.
    var offline = false
    /// Every call fails with `.unauthorized` (revoked token).
    var unauthorized = false
    /// The pairing code expires at once instead of being approved.
    var pairingExpires = false
    /// Loading this season number fails (0 = none).
    var failingSeason = 0
    /// The search returns nothing.
    var emptySearch = false
    /// The second page of every list fails.
    var failingSecondPage = false
    /// The EPG answers empty.
    var emptyEPG = false
    /// Simulated latency, in seconds.
    var latency: Double = 0.6
    /// Seconds before the mock approves the pairing (0 = never, wait for the button).
    var pairingApprovalDelay: Double = 0
}
