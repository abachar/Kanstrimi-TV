import Foundation
import Testing
@testable import kanstrimi

@MainActor
struct AppEnvironmentTests {
    /// A mutable clock the environment reads instead of `Date.now`.
    final class Clock { var date = Date(timeIntervalSince1970: 1_800_000_000) }

    let clock = Clock()
    let env: AppEnvironment

    init() {
        let defaults = UserDefaults(suiteName: "env-tests-\(UUID().uuidString)")!
        let clock = clock
        env = AppEnvironment(forceMock: true, defaults: defaults, secrets: MemorySecrets(), now: { clock.date })
    }

    @Test("Une action qui échoue hors de la vue le dit : « <action> impossible · <raison> », et rend nil")
    func attemptReportsAFailure() async {
        let result: Int? = await env.attempt("Lecture") { throw CatalogError.server("Le fournisseur n'a pas répondu") }
        #expect(result == nil)
        #expect(env.notice == "Lecture impossible · Le fournisseur n'a pas répondu")
        let ok = await env.attempt("Ma liste") { 42 }
        #expect(ok == 42)
    }

    @Test("Un appareil dissocié ou une action annulée ne disent rien")
    func attemptIsSilentOnRevocationAndCancellation() async {
        let revoked: Int? = await env.attempt("Lecture") { throw CatalogError.unauthorized }
        let cancelled: Int? = await env.attempt("Lecture") { throw CancellationError() }
        #expect(revoked == nil && cancelled == nil)
        #expect(env.notice == nil)
    }

    @Test("Retour après plus de 10 min d'absence : l'accueil et le Direct se rechargent")
    func longAbsenceBumpsResumeRevision() {
        env.sceneBecame(active: false)
        clock.date.addTimeInterval(11 * 60)
        env.sceneBecame(active: true)
        #expect(env.resumeRevision == 1)
    }

    @Test("Retour après 5 min : rien ne se recharge")
    func shortAbsenceKeepsTheScreens() {
        env.sceneBecame(active: false)
        clock.date.addTimeInterval(5 * 60)
        env.sceneBecame(active: true)
        #expect(env.resumeRevision == 0)
    }

    @Test("L'absence se compte depuis le premier passage en arrière-plan")
    func absenceCountsFromTheFirstInactive() {
        env.sceneBecame(active: false)
        clock.date.addTimeInterval(6 * 60)
        env.sceneBecame(active: false)
        clock.date.addTimeInterval(6 * 60)
        env.sceneBecame(active: true)
        #expect(env.resumeRevision == 1)
    }
}
