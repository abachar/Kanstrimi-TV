import SwiftUI
import CoreImage.CIFilterBuiltins

/// First launch: nothing is typed on the device. A QR code, a short code as a fallback,
/// and polling until the admin approves. The mock approves on a button.
struct PairingView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics
    @State private var model = PairingModel()

    var body: some View {
        // Two columns on TV; on a phone everything stacks and scrolls.
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .center, spacing: 120) {
                explanation.frame(maxWidth: 900, alignment: .leading)
                codeColumn.frame(width: metrics.pairingColumn)
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 30) {
                    explanation
                    codeColumn.frame(maxWidth: .infinity)
                }
                .padding(.vertical, 30)
            }
        }
        .padding(.horizontal, metrics.inset)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .ignoresSafeArea(edges: .horizontal)
        .background(Theme.background)
        .task { await model.run(env) }
    }

    private var explanation: some View {
            VStack(alignment: .leading, spacing: 28) {
                Text("Kanstrimi").font(.system(size: 30, weight: .bold)).tracking(4).foregroundStyle(Theme.accent)
                Text(metrics.showsQR ? "Connectez-vous avec votre téléphone" : "Ajoutez cet appareil depuis l'admin")
                    .font(.system(size: metrics.pairingTitle, weight: .bold)).lineLimit(3).fixedSize(horizontal: false, vertical: true)
                step(1, metrics.showsQR ? "Scannez le QR code avec l'appareil photo" : "Ouvrez l'admin avec le bouton ci-dessous")
                step(2, "Connectez-vous à l'admin et nommez cet appareil")
                step(3, "L'appareil est ajouté, sans rien saisir ici")

                if let message = env.device.lastRevocationMessage {
                    revokedNotice(message)
                }

                Spacer().frame(height: 10)
                Button("Nouveau code") { Task { await model.newCode(env) } }
                    .disabled(model.isBusy)
                if !env.client.isMock {
                    Text("Serveur : \(model.host)").font(.callout).foregroundStyle(Theme.secondary)
                }
            }
    }

    private var codeColumn: some View {
        VStack(spacing: 26) {
            if metrics.showsQR {
                qrPanel
            } else if let url = model.code?.url, model.status != .expired {
                // The phone is the device that validates: the admin opens in Safari, the app keeps polling.
                Link(destination: url) { Label("Ouvrir l'admin pour valider", systemImage: "safari") }
                    .prominentButtonStyle()
            }
            codePanel
            statusLine
        }
    }

    private func step(_ n: Int, _ text: String) -> some View {
        HStack(spacing: 18) {
            Text("\(n)").font(.title3.weight(.bold))
                .frame(width: 44, height: 44)
                .background(Circle().fill(.white.opacity(0.12)))
            Text(text).font(.title3).fixedSize(horizontal: false, vertical: true)
        }
    }

    private func revokedNotice(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Cet appareil a été dissocié", systemImage: "exclamationmark.triangle").font(.headline).foregroundStyle(Theme.accent)
            Text(message).font(.callout).foregroundStyle(Theme.secondary).fixedSize(horizontal: false, vertical: true)
            Text("Réponse 401 du serveur · jeton effacé du trousseau, cache de l'accueil vidé").font(.caption).foregroundStyle(Theme.secondary)
        }
        .padding(22)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18))
    }

    @ViewBuilder private var qrPanel: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 28).fill(.white)
            if let image = model.qrImage, model.status != .expired {
                Image(image, scale: 1.0, label: Text("QR Code")).interpolation(.none).resizable().scaledToFit().padding(28)
            } else {
                ProgressView().tint(.black)
            }
            if model.status == .expired {
                RoundedRectangle(cornerRadius: 28).fill(.white.opacity(0.85))
                VStack(spacing: 10) {
                    Text("CODE EXPIRÉ · RENOUVELÉ SEUL").font(.caption.weight(.bold)).tracking(1.5).foregroundStyle(.black.opacity(0.6))
                    Text("Nouveau code en cours").font(.title3.weight(.bold)).foregroundStyle(.black)
                    Text("Le code précédent a expiré après 10 minutes sans validation. Un nouveau QR code s'affiche dans un instant, rien à faire.")
                        .font(.footnote).foregroundStyle(.black.opacity(0.7)).multilineTextAlignment(.center).padding(.horizontal, 30)
                }
            }
        }
        .frame(width: 400, height: 400)
        Text("Scannez pour vous connecter").font(.headline).foregroundStyle(Theme.secondary)
    }

    private var codePanel: some View {
        VStack(spacing: 12) {
            VStack(spacing: 2) {
                Text("Ou ouvrez \(Text(model.host + "/admin/pair/…").foregroundStyle(Theme.accent))").foregroundStyle(Theme.secondary)
                Text("en remplaçant les points par ce code :").foregroundStyle(Theme.secondary)
            }
            .font(.callout)
            HStack(spacing: 10) {
                ForEach(Array((model.code?.code ?? "······").enumerated()), id: \.offset) { _, ch in
                    Text(String(ch)).font(.system(size: metrics.codeCell * 0.73, weight: .bold, design: .rounded))
                        .frame(width: metrics.codeCell, height: metrics.codeCell * 1.27)
                        .background(RoundedRectangle(cornerRadius: 14).fill(.white.opacity(model.status == .expired ? 0.05 : 0.12)))
                        .foregroundStyle(model.status == .expired ? Theme.secondary : Theme.text)
                }
            }
        }
    }

    private var statusLine: some View {
        HStack(spacing: 10) {
            switch model.status {
            case .creating: ProgressView(); Text("Demande d'un code au serveur…")
            case .waiting: ProgressView(); Text("En attente de la confirmation dans l'admin")
            case .expired: Image(systemName: "clock.arrow.circlepath"); Text("Expiré · renouvellement…")
            case .approved: Image(systemName: "checkmark.circle.fill").foregroundStyle(.green); Text("Appareil ajouté")
            case .offline: Image(systemName: "wifi.exclamationmark").foregroundStyle(Theme.accent); Text("Serveur injoignable · nouvel essai dans quelques secondes")
            }
        }
        .font(.callout).foregroundStyle(Theme.secondary)
        .lineLimit(2).multilineTextAlignment(.center)
        .frame(maxWidth: .infinity, minHeight: 60)
    }
}

@Observable
final class PairingModel {
    enum Status: Equatable { case creating, waiting, expired, approved, offline }
    var status: Status = .creating
    var code: PairingCode?
    var qrImage: CGImage?
    var isBusy = false
    var host: String { URL(string: Preferences.compiledServerURL)?.host() ?? "votre-serveur" }
    /// The pairing URL of the server, shown when the QR cannot be scanned.
    var pairingURL: String { code?.url.absoluteString ?? "" }
    private var loop: Task<Void, Never>?

    func run(_ env: AppEnvironment) async {
        await newCode(env)
    }

    func newCode(_ env: AppEnvironment) async {
        loop?.cancel()
        isBusy = true
        status = .creating
        defer { isBusy = false }
        do {
            let created = try await env.client.createDevice()
            code = created
            qrImage = Self.qr(for: created.url.absoluteString)
            status = .waiting
            loop = Task { [weak self] in await self?.poll(env, code: created) }
        } catch {
            status = .offline
            loop = Task { [weak self] in
                try? await Task.sleep(for: .seconds(5))
                if !Task.isCancelled { await self?.newCode(env) }
            }
        }
    }

    private func poll(_ env: AppEnvironment, code: PairingCode) async {
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(2))
            if Task.isCancelled { return }
            if Date.now >= code.expiresAt {
                await expireAndRenew(env)
                return
            }
            do {
                switch try await env.client.pollDevice(code: code.code) {
                case .pending:
                    if status == .offline { status = .waiting }
                case .expired:
                    await expireAndRenew(env)
                    return
                case .approved(let token, let deviceName):
                    status = .approved
                    env.preferences.deviceName = deviceName
                    try? await Task.sleep(for: .milliseconds(600))
                    env.device.store(token: token, code: code.code)
                    return
                }
            } catch {
                status = .offline
            }
        }
    }

    /// Expired: a new code is generated alone, no intervention.
    private func expireAndRenew(_ env: AppEnvironment) async {
        status = .expired
        try? await Task.sleep(for: .seconds(3))
        await newCode(env)
    }

    private static func qr(for string: String) -> CGImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return nil }
        let scaled = output.transformed(by: CGAffineTransform(scaleX: 12, y: 12))
        guard let cg = CIContext().createCGImage(scaled, from: scaled.extent) else { return nil }
        return cg
    }
}
