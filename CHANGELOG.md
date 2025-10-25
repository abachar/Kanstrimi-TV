# Changelog

Tous les changements notables de ce projet seront documentés dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

---

## [0.2.0] - 2025-10-26

### Ajouté
- Système de gestion de compte avec persistance SwiftData
- Modèle Account (Settings/Models) avec propriétés name, serverURL, username, password
- Composant AccountFormView avec 4 champs de saisie et gestion du focus tvOS
- Vérification de l'existence d'un compte au démarrage dans WelcomeView
- Animation fluide de transition entre splash screen et formulaire d'inscription
- Flux conditionnel : splash screen (5s) si compte existe, sinon formulaire d'inscription
- Validation des champs du formulaire avec messages d'erreur
- Sauvegarde automatique du compte dans SwiftData après enregistrement

### Modifié
- WelcomeView : Ajout de @Query pour vérifier l'existence d'un compte
- WelcomeView : Intégration du formulaire d'inscription avec animation
- ContentView : Refactorisation pour gérer le callback de WelcomeView
- Account Model : Ajout de la propriété password (temporairement en clair)

## [0.1.0] - 2025-10-26

### Ajouté
- Navigation de base de l'application avec TabView
- Écran de bienvenue (WelcomeView) affiché pendant 5 secondes au démarrage
- Vue principale (MainView) avec navigation entre 5 sections
- Vue TV en direct (LiveTVView) avec placeholder
- Vue Films (MoviesView) avec placeholder
- Vue Séries (SeriesView) avec placeholder
- Vue Recherche (SearchView) avec placeholder
- Vue Paramètres (SettingsView) avec placeholder
- Flux de navigation automatique : WelcomeView → MainView
- Support complet de la palette de couleurs Kanstrimi
- Structure de dossiers Features organisée par fonctionnalité
