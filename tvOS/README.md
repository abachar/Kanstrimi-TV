# Kanstrimi — app Apple TV

`kanstrimi.xcodeproj` : SwiftUI, Swift 6 (isolation `MainActor` par défaut), tvOS 27,
Apple TV 4K uniquement, Swift Testing, **VLCKit 4 en SPM** (miroir GitHub `videolan/vlckit`,
révision figée dans le projet). Le fournisseur ne sert pas de HLS : VLCKit lit tout
(TS en direct, MKV et MP4 en VOD), AVPlayer est écarté.

## Structure

| Dossier | Rôle |
|---|---|
| `Contract/` | Types calqués sur `/api/v1` (`server/src/app/api/types.ts`) : `Card` unique, `Version`, `Source`, `Season`, `Episode`, `Channel`, `Playback`… `nonisolated`, jamais sur la base. |
| `Client/` | Protocole `CatalogClient` ; `HTTPCatalogClient` (le serveur, URL compilée dans `Preferences.compiledServerURL`, jeton d'appareil en Keychain, erreurs mappées sur `CatalogError`) ; `MockCatalogClient` sur les fixtures JSON de `Client/Fixtures/` et ses `MockScenario` (hors ligne, 401, saison en erreur…) ; `SwitchingCatalogClient` bascule entre les deux. |
| `Player/` | Le lecteur, service transverse unique : `PlayerService` (VLCKit, bascule de source, échec après 10 s, épisode suivant, zapping), `VersionChooser` (choix de la version langue × qualité), écran et panneaux. |
| `Features/` | Un dossier par écran : Appairage, Accueil, Catalogue, Fiche, Direct, Recherche, Réglages. |
| `Shared/` | Thème, badges, cartes, formats, stores locaux (chaînes récentes, sources en échec, file de progression, caches accueil et EPG). |
| `../kanstrimiTests/` | Swift Testing : client HTTP (serveur simulé), moteur de choix, curseur et file de progression. |

## Fonctionnement

- **Appairage** : l'app demande un code à `POST /devices`, affiche un QR vers
  `/admin/pair/{code}`, sonde `GET /devices/{code}` jusqu'à l'approbation, garde le jeton en
  Keychain. Un `401` n'importe où dissocie l'appareil et ramène à l'appairage.
- **Lecture** : `stream_url` est un lien signé vers le serveur, relu à chaque lecture ; le
  serveur répond `302` vers le fournisseur. Le choix de la version suit l'ordre de langues
  des Réglages, les préférences par titre, et bascule de source après échec.
- Réglages › Appareil › « Client de démonstration » passe sur le mock sans relancer ; les
  `#Preview` et les scénarios de démo forcent le mock.

## Vérifier

Pas de `Simulator.app` sur cette installation Xcode 27, donc pas de télécommande à piloter.

- Écrans : `#Preview` de `Features/ScreenPreviews.swift` et `Player/PlayerPreviews.swift`
  (outil MCP Xcode `RenderPreview` ; les index et noms de previews sont parfois décalés).
- Tests : `RunAllTests` (ou `BuildProject` pour la compilation seule).
- Lecteur sans télécommande : `xcrun simctl spawn <udid> defaults write dev.crafters.kanstrimi debug.autoplay live`
  (ou un identifiant de contenu, plus `debug.resumeAt` en secondes), lancer, puis
  `xcrun simctl io <udid> screenshot`.
- Les trois URL de démo vivent dans `kanstrimi/Client/DemoStreams.local.json`, hors dépôt
  (identifiants fournisseur).

## Contraintes mesurées

- Fournisseur : proxy à jetons devant un pool de backends, MKV sans HLS, pas de plage
  d'octets fiable ; d'où VLCKit seul et une bascule de source plutôt qu'un retry aveugle.
- Reprise profonde dans un MKV sur simulateur (1140 s sur 4520 s) : son sans image, alors que
  120 s fonctionne. À mesurer sur Apple TV réel avant de conclure.
