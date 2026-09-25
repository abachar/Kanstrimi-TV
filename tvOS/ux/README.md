# Canvas UX tvOS

*Export des 23 artboards du canvas Claude Design « App TV multi-versions — UX tvOS »,
source d'inspiration pour l'application. La version vivante est sur
https://claude.ai/artifact/DR6XrphvdTxddEeZZNjTpg ; ce dossier en est une copie datée du
2026-09-26, à rafraîchir quand le canvas change. `tvOS/FLOW.md` est le document de
référence et cite ces numéros entre crochets.*

Chaque `*.dc.html` est le source d'un artboard 1920 × 1080 : HTML, CSS inline et un petit
script de données. Le `support.js` référencé en tête appartient à l'éditeur et n'est pas
copié ici : les fichiers se lisent comme du code (couleurs, tailles, espacements, textes),
pas comme des pages à ouvrir. `canvas.json` donne la disposition et les notes du canvas.

Les maquettes utilisent des données fictives (« Les Heures Claires », « Nord Profond ») et
un nom d'app provisoire (« Prisme ») : ni l'un ni l'autre ne sont à reprendre.

| # | Fichier | Artboard |
|---|---|---|
| 0 | `Flow.dc.html` | Flow principal |
| 1 | `Auth.dc.html` | Appairage par QR code |
| 2 | `Prefs.dc.html` | Préférences de lecture |
| 3 | `Main.dc.html` | Accueil |
| 4 | `Films.dc.html` | Films — catalogue |
| 5 | `Series.dc.html` | Séries — catalogue |
| 6 | `Search.dc.html` | Recherche |
| 7 | `Film.dc.html` | Fiche film + matrice des versions |
| 8 | `Versions.dc.html` | Sélecteur de versions (appui long) |
| 9 | `Serie.dc.html` | Fiche série — langue mémorisée |
| 10 | `Live.dc.html` | Direct — guide & flux par chaîne |
| 11 | `Player.dc.html` | Lecteur — changer de version |
| 12 | `Failover.dc.html` | Bascule automatique de source |
| 13 | `Settings.dc.html` | Réglages (appareil, lecture, à propos) |
| 14 | `NextEpisode.dc.html` | Épisode suivant dans 10 s |
| 15 | `PlayerVod.dc.html` | Lecteur VOD — contrôles au repos |
| 16 | `LiveZap.dc.html` | Lecteur direct — zapping |
| 17 | `StateOffline.dc.html` | Accueil hors ligne (cache) |
| 18 | `StateNoTmdb.dc.html` | Fiche sans TMDB · Revoir · Dans ma liste |
| 19 | `StateErrors.dc.html` | Vide et erreurs de chargement |
| 20 | `StateStreamError.dc.html` | Flux en échec après 10 s |
| 21 | `StatePairing.dc.html` | Appairage : code expiré · jeton révoqué |
| 22 | `LiveRecent.dc.html` | Direct — chaînes récentes (bascule rapide) |

## Notes du canvas

- Normaliser les libellés des sources : « UHD », « 2160p » et « 4K » deviennent un seul « 4K », suivi de la dynamique quand le nom la donne (Dolby Vision, HDR). Le codec audio n'est connu qu'à la lecture. L'utilisateur choisit une version (langue × qualité), jamais un fichier.
- Clic sur Lecture = meilleure version, sans question. Appui long (ou bouton Versions) = sélecteur. Les doublons (ex. 2 sources 4K VF) sont fusionnés en une ligne ; l'ordre des sources vient du serveur, une source en échec récent est écartée. Aucune mesure de débit : le serveur ne voit jamais la vidéo.
- Série : langue mémorisée par série, pas par épisode. Épisode absent dans cette langue : on prévient avant l'enchaînement, puis on revient à la langue choisie. Direct : droite sur une chaîne = ses flux ; haut/bas = zapping.
- Changer de version en lecture reprend au même instant. Erreur de flux : bascule sur une source équivalente (même langue, même qualité), sinon qualité inférieure temporaire. Toast 4 s, aucune action requise.
- Catalogues : les filtres de version (langue, 4K, Dolby Vision, saison complète en VF) sont au même niveau que les genres. Chaque vignette affiche qualité + langues. Recherche : inclut le direct en cours et lance la bonne version depuis le résultat.
- Appairage : QR code + code court de secours, valable 10 min et renouvelé automatiquement. La TV interroge le serveur jusqu'à validation dans l'admin, puis reçoit un jeton propre à l'appareil, révocable. Aucun compte, aucun profil : un seul utilisateur.
- Reprendre depuis l'accueil : la carte « Reprendre » lance le lecteur directement, sans passer par la fiche. L'app demande au serveur le contexte de lecture (versions, position, épisode suivant) en un seul appel. L'épisode suivant est servi par l'API, saison suivante comprise.
- Règle des états : ce qui est déjà chargé reste visible ; seule la partie en échec propose Réessayer. Hors ligne, l'accueil affiche son dernier instantané. Un 401 ramène à l'appairage, favoris et reprises restent côté serveur.
