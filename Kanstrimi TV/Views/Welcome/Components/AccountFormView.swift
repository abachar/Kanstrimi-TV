//
//  AccountFormView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftUI

struct AccountFormView: View {
    // MARK: - Form Fields
    @State private var name: String = ""
    @State private var serverURL: String = ""
    @State private var username: String = ""
    @State private var password: String = ""

    // MARK: - Validation
    @State private var showError: Bool = false
    @State private var errorMessage: String = ""

    // MARK: - Callback
    let onSubmit: (String, String, String, String) -> Void

    init(
        onSubmit: @escaping (String, String, String, String) -> Void
    ) {
        self.name = Bundle.main.infoDictionary?["IPTV_NAME"] as? String ?? ""
        self.serverURL = Bundle.main.infoDictionary?["IPTV_SERVER_URL"] as? String ?? ""
        self.username = Bundle.main.infoDictionary?["IPTV_USERNAME"] as? String ?? ""
        self.password = Bundle.main.infoDictionary?["IPTV_PASSWORD"] as? String ?? ""
        self.onSubmit = onSubmit
    }

    // MARK: - Body
    var body: some View {
        VStack(alignment: .leading, spacing: 30) {
            Text("Compte Xtream")
                .font(.system(size: 50, weight: .semibold))
                .foregroundColor(.primary)
                .padding(.bottom, 20)
            
            VStack {
                // Champ Nom
                VStack(alignment: .leading, spacing: 10) {
                    Text("Nom du compte")
                    TextField("Ex: Mon IPTV", text: $name)
                }

                // Champ URL du serveur
                VStack(alignment: .leading, spacing: 10) {
                    Text("URL du serveur")
                        .font(.system(size: 28))
                        .foregroundColor(.secondary)

                    TextField("http://example.com:8080", text: $serverURL)
                        .keyboardType(.URL)
                        .textContentType(.URL)
                }

                // Champ Nom d'utilisateur
                VStack(alignment: .leading, spacing: 10) {
                    Text("Nom d'utilisateur")
                        .font(.system(size: 28))
                        .foregroundColor(.secondary)

                    TextField("username", text: $username)
                        .textContentType(.username)
                }

                // Champ Mot de passe
                VStack(alignment: .leading, spacing: 10) {
                    Text("Mot de passe")
                        .font(.system(size: 28))
                        .foregroundColor(.secondary)

                    SecureField("password", text: $password)
                        .textContentType(.password)
                }
            }
            .frame(maxWidth: 600)
            .padding(.vertical, 50)
            .padding(.horizontal, 40)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.appSecondaryBackground)
            )

            // Message d'erreur
            if showError {
                Text(errorMessage)
                    .font(.system(size: 24))
                    .foregroundColor(.red)
                    .padding(.top, 10)
            }

            // Bouton Enregistrer
            Button("Enregistrer", action: handleSubmit)
        }
        .padding(60)
    }

    // MARK: - Validation & Submit
    private func handleSubmit() {
        // Validation des champs
        guard !name.trimmingCharacters(in: .whitespaces).isEmpty else {
            showError(message: "Le nom du compte est requis")
            return
        }

        guard !serverURL.trimmingCharacters(in: .whitespaces).isEmpty else {
            showError(message: "L'URL du serveur est requise")
            return
        }

        guard !username.trimmingCharacters(in: .whitespaces).isEmpty else {
            showError(message: "Le nom d'utilisateur est requis")
            return
        }

        guard !password.trimmingCharacters(in: .whitespaces).isEmpty else {
            showError(message: "Le mot de passe est requis")
            return
        }

        // Tous les champs sont valides, appeler le callback
        onSubmit(
            name.trimmingCharacters(in: .whitespaces),
            serverURL.trimmingCharacters(in: .whitespaces),
            username.trimmingCharacters(in: .whitespaces),
            password.trimmingCharacters(in: .whitespaces)
        )
    }

    private func showError(message: String) {
        errorMessage = message
        showError = true

        // Masquer l'erreur après 3 secondes
        Task {
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            withAnimation {
                showError = false
            }
        }
    }

    // MARK: - Field Enum
    enum Field: Hashable {
        case name
        case serverURL
        case username
        case password
        case saveButton
    }
}
