//
//  AccountFormView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftUI

struct AccountFormView: View {
    // MARK: - Focus Management
    @FocusState private var focusedField: Field?

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

    // MARK: - Body
    var body: some View {
        VStack(spacing: 40) {
            Text("Compte Xtream")
                .font(.system(size: 50, weight: .semibold))
                .foregroundColor(.primary)
                .padding(.bottom, 20)

            VStack(spacing: 30) {
                // Champ Nom
                VStack(alignment: .leading, spacing: 10) {
                    Text("Nom du compte")
                        .font(.system(size: 28))
                        .foregroundColor(.secondary)

                    TextField("Ex: Mon IPTV", text: $name)
                        .textFieldStyle(.plain)
                        .font(.system(size: 32))
                        .foregroundColor(.primary)
                        .padding(.vertical, 10)

                        .focused($focusedField, equals: .name)
                }

                // Champ URL du serveur
                VStack(alignment: .leading, spacing: 10) {
                    Text("URL du serveur")
                        .font(.system(size: 28))
                        .foregroundColor(.secondary)

                    TextField("http://example.com:8080", text: $serverURL)
                        .textFieldStyle(.plain)
                        .font(.system(size: 32))
                        .foregroundColor(.primary)
                        .padding(.vertical, 10)
                        .focused($focusedField, equals: .serverURL)
                        .keyboardType(.URL)
                        .textContentType(.URL)
                }

                // Champ Nom d'utilisateur
                VStack(alignment: .leading, spacing: 10) {
                    Text("Nom d'utilisateur")
                        .font(.system(size: 28))
                        .foregroundColor(.secondary)

                    TextField("username", text: $username)
                        .textFieldStyle(.plain)
                        .font(.system(size: 32))
                        .foregroundColor(.primary)
                        .padding(.vertical, 10)
                        .focused($focusedField, equals: .username)
                        .textContentType(.username)
                }

                // Champ Mot de passe
                VStack(alignment: .leading, spacing: 10) {
                    Text("Mot de passe")
                        .font(.system(size: 28))
                        .foregroundColor(.secondary)

                    SecureField("password", text: $password)
                        .textFieldStyle(.plain)
                        .font(.system(size: 32))
                        .foregroundColor(.primary)
                        .padding(.vertical, 10)
                        .focused($focusedField, equals: .password)
                        .textContentType(.password)
                }
            }
            .frame(maxWidth: 600)

            // Message d'erreur
            if showError {
                Text(errorMessage)
                    .font(.system(size: 24))
                    .foregroundColor(.red)
                    .padding(.top, 10)
            }

            // Bouton Enregistrer
            Button(action: handleSubmit) {
                Text("Enregistrer")
                    .font(.system(size: 36, weight: .semibold))
                    .foregroundColor(.primary)
                    .frame(maxWidth: 500)
                    .padding(.vertical, 20)
                    .background(Color.blue)
                    .cornerRadius(15)
            }
            .focused($focusedField, equals: .saveButton)
            .buttonStyle(.plain)
            .padding(.top, 20)
        }
        .padding(60)
        .onAppear {
            // Focus sur le premier champ au démarrage
            focusedField = .name
        }
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
