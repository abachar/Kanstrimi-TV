# Flow de l'application tvOS

*Ce que l'utilisateur fait, écran par écran, et ce que chaque écran a besoin de recevoir.
C'est ce document qui dicte le contrat `/api/v1`, pas l'inverse. Rédigé le 2026-09-25,
réaligné le 2026-09-26 sur le canvas UX (23 artboards, numérotés ici entre crochets ;
sources exportées dans `tvOS/ux/`).
`README.md` reste le cahier des charges fonctionnel, `ETUDE.md` les contraintes mesurées ;
`docs/conception-groupement-et-api-rest.md` est à réviser sur ce flow.
Les anciennes apps de `_Old/` et les décisions d'`ETUDE.md` sont des sources
d'inspiration, pas des contraintes : ce document tranche là où il diverge.*

---

## 1. Le cadre

Un seul utilisateur, un seul foyer, une télécommande. L'application ne gère ni comptes ni
profils. Elle affiche ce que le serveur a préparé, joue ce que le serveur lui indique, et
remonte trois choses : où il en est, ce qu'il aime, ce qu'il cherche.

Quatre règles d'expérience qui découlent du salon :

1. **Un clic pour regarder.** La version est choisie avant l'appui, selon les préférences
   et le choix mémorisé pour ce titre. Aucun dialogue entre *Lecture* et l'image. Le
   choix reste accessible par appui long et pendant la lecture.
2. **Des versions, pas des fichiers.** L'utilisateur voit des versions (langue × qualité),
   jamais des entrées fournisseur. Deux fichiers identiques sont deux *sources* d'une même
   version, fusionnées en une ligne.
3. **Pannes invisibles.** Une source qui tombe est remplacée par une source équivalente
   sans quitter la lecture. L'utilisateur n'agit que quand il n'y a plus rien d'équivalent.
4. **Ce qui est chargé reste.** Hors ligne ou en erreur, l'écran garde ce qu'il a ; seule
   la partie en échec propose *Réessayer*.

### Trois niveaux, un vocabulaire

| Niveau | Ce que c'est | Exemple | Qui le choisit |
|---|---|---|---|
| **Contenu** | L'œuvre : ce qu'on voit, favorise, reprend | *Les Heures Claires* | l'utilisateur |
| **Version** | Une langue × une qualité | VF · 4K Dolby Vision | les préférences, ou l'utilisateur |
| **Source** | Un flux jouable chez le fournisseur | Source A (catégorie « Films 4K UHD ») | l'app, jamais l'utilisateur sauf à la main |

La langue vaut `VF`, `VOSTFR`, `VO` (ou un code de langue) ; la qualité vaut `SD`, `HD`,
`FHD`, `4K`, suivie de la dynamique quand le nom la donne (`HDR`, `Dolby Vision`). Le
codec audio n'est connu qu'à la lecture : il n'apparaît nulle part avant.

---

## 2. Carte des écrans

```
Premier lancement
  └─ Appairage [1] : QR code, scan au téléphone, confirmation dans l'admin ──────┐
                                                                                 ▼
Barre d'onglets : Accueil · Direct · Films · Séries · Recherche      ⚙ Réglages [13]
     [3]          [10]      [4]      [5]       [6]
      │            │         │        │          │
      │  hero +    │  liste  │ grille │ grille   │  meilleur résultat + rangées
      │  rangées   │  + EPG  │        │          │
      ▼            │         ▼        ▼          ▼
  Fiche film [7] ◄─┼────────────────────────── Fiche film / série
      │            │
      ├─ Lecture ──┼──► Moteur de choix ──► Lecteur [15]
      ├─ appui long│    (mémorisé › préférences › capacités TV › source en échec écartée)
      │  Versions [8] ─► version + source ─► Lecteur
      ├─ Bande-annonce                       ├─ glisser ↓ : Infos · Versions · Audio · Sous-titres [11]
      └─ + Ma liste                          ├─ bascule auto de source [12]
  Fiche série [9]                            ├─ flux en échec après 10 s [20]
      ├─ Reprendre S2 É4                     └─ épisode suivant dans 10 s [14]
      ├─ Langue de la série
      └─ Saison N ──► épisodes (dans la fiche) ──► Lecteur
  Direct [10] ──► Lecteur direct [16] ─── ▲▼ zapping · ◀ chaînes récentes [22]
```

Cinq onglets et un bouton Réglages. Les artboards [17] à [21] sont des états : hors
ligne, sans TMDB, vide et erreurs, flux en échec, appairage expiré ou révoqué.

---

## 3. Écran par écran

Pour chaque écran : ce qu'on voit, ce qu'on peut faire, ce qu'il faut recevoir, et ce qui
se passe quand ça ne marche pas. Les **besoins** sont ce qui dicte l'API.

### 3.1 Appairage [1] [21]

On ne tape **rien** sur l'Apple TV. Ni identifiant, ni mot de passe : un clavier à la
télécommande est le pire écran d'une app tvOS, et le mot de passe n'a aucune raison de
quitter le téléphone. L'app est personnelle : l'URL du serveur est **compilée dans
l'app** (réglage de build), modifiable dans Réglages.

```
Apple TV                              Serveur                          Téléphone
   │  POST /pair  (sans auth)            │                                  │
   │ ◄── { code: "K7Q-4MZ", 10 min }     │                                  │
   │  affiche le QR code                 │                                  │
   │  + le code en clair, en secours     │                                  │
   │                                     │ ◄── scan → /admin/pair/K7Q4MZ ───┤
   │                                     │     login admin si besoin        │
   │                                     │     « Ajouter cet Apple TV ? »   │
   │                                     │     nom : « Salon » · Confirmer  │
   │  GET /pair/K7Q4MZ  (toutes les 2 s) │                                  │
   │ ◄── { status: "approved", token }   │                                  │
   │  jeton en Keychain, écran suivant   │                                  │
```

- **Ce que le jeton est :** un secret aléatoire propre à cet appareil, révocable dans
  l'admin. Il authentifie **toutes** les requêtes REST (`Authorization: Bearer …`). Il ne
  donne pas accès à l'admin.
- **Et le coffre ?** Le serveur est verrouillé après un redémarrage jusqu'à recevoir le
  mot de passe. Un jeton ne le dérive pas. Solution côté serveur, sans que l'app le
  sache : à l'appairage, l'admin est connecté, donc le coffre est ouvert ; le serveur
  **enveloppe la clé du coffre avec le jeton** et stocke ce paquet chiffré à côté de
  l'appareil. Au premier appel de la TV après un redémarrage, il la désenveloppe. Le mot
  de passe ne circule jamais, et l'Apple TV seule dans le salon relance le cron. Révoquer
  l'appareil détruit le paquet.
- **Besoin :** création d'un code sans authentification (limité, 10 min), page admin de
  confirmation, sondage du code, puis un appel de **session** authentifié : nom de
  l'appareil, version du serveur, langue TMDB, langues présentes dans le catalogue, ordre
  de langues par défaut, compteurs et date du dernier import.
- **Persisté :** jeton en Keychain, URL en `AppStorage` si elle diffère de celle compilée.
- **États [21] :** code expiré → nouveau QR généré seul, sans intervention ; jeton
  révoqué (401 sur n'importe quel appel) → jeton effacé, cache vidé, retour au QR avec un
  mot d'explication ; favoris et reprises restent côté serveur.

### 3.2 Accueil [3] [17]

L'écran le plus vu. Un **hero** en haut : un contenu mis en avant (la nouveauté la plus
récente, fixe, pas de bannière rotative), avec sa version choisie en clair (« 4K Dolby
Vision · VF — choisi pour vous »), *Lecture*, *Versions · 7*, *+*. Puis des rangées
horizontales. Le focus revient à la dernière position connue quand on revient de la fiche.

| Rangée | Contenu | Quand elle apparaît |
|---|---|---|
| Reprendre | films et épisodes entre 5 % et 90 %, les plus récents d'abord ; badge de version sur la carte, barre de progression, « S2 · É4 · 32 min restantes » | s'il y a au moins un élément |
| Films récents | derniers films ajoutés | toujours |
| Séries récentes | derniers épisodes ajoutés ou séries mises à jour | toujours |
| Ma liste | favoris | s'il y en a |
| Collections | une rangée par collection (bloc 6), plus tard | plus tard |

- **Besoin :** **un seul appel** qui renvoie le hero et les rangées ordonnées avec leurs
  cartes, y compris « Reprendre » avec position et durée. Le serveur décide de l'ordre et
  de la présence des rangées ; ajouter une rangée ne doit pas demander une mise à jour de
  l'app.
- **Carte :** identifiant, type, titre, année, affiche, note, **qualité max et langues
  disponibles** (badges) ; pour la reprise, position, durée, et pour un épisode, saison,
  numéro et titre de l'épisode.
- **Reprendre sans passer par la fiche :** la carte lance directement le lecteur. L'app
  demande le **contexte de lecture** du contenu ou de l'épisode (versions avec sources,
  position, épisode suivant) en un appel.
- **Persisté :** le dernier accueil reçu, en cache disque.
- **Hors ligne [17] :** bandeau « Serveur injoignable · accueil du 25 sept. à 21:14
  affiché » avec *Réessayer* ; le cache reste navigable et *Lecture* reste possible si le
  flux répond ; sans cache, état vide avec *Réessayer*.

### 3.3 Films et Séries [4] [5] [19]

Le même composant, une grille de cartes, six par ligne. Une barre de filtres au-dessus,
accessible en remontant le focus au-dessus de la première ligne. Chaque carte porte son
badge de qualité max et ses langues (« 4K DV · VF · VOSTFR »), et une pastille
« VOSTFR seul » ou « VF le 12/10 » quand c'est utile.

Filtres, au même niveau que les genres : **genre** (liste TMDB), **langue**, **4K**,
**Dolby Vision**, **VF disponible** ; pour les séries, **Nouveaux épisodes** et **Saison
complète en VF**. Tri : ajout récent (défaut), titre, année, note ; séries : derniers
épisodes (défaut). Les filtres actifs sont des pastilles qu'un clic retire. La page
suivante se charge quand le focus entre dans le dernier tiers des cartes chargées.

- **Besoin :** liste paginée par curseur, avec tri et filtres serveur ; la liste des
  genres disponibles, avec un compte. Les filtres de version supposent des agrégats par
  contenu : langues présentes, qualité max, et pour les séries la couverture par saison
  et par langue.
- **Volume :** 35 000 films ; l'app ne garde que les pages chargées.
- **Persisté :** le dernier tri (`AppStorage`).
- **Erreur [19] :** la page en échec est remplacée par une carte *Réessayer* ; les pages
  déjà chargées restent.

### 3.4 Fiche film [7] [18]

Backdrop plein écran, titre, année, genre, durée, certification, badges de qualité et de
langues, synopsis, casting. Les boutons dans cet ordre de focus :

1. **Lecture** (ou **Reprendre à 47 min**, ou **Revoir** si terminé). Un encart sous les
   boutons dit la version qui sera jouée : « 4K Dolby Vision · Français · MKV · choisie
   selon vos préférences · appui long pour changer ».
2. **Versions (7)** : ouvre le sélecteur [8]. Le même sélecteur s'ouvre par **appui long
   sur Lecture**.
3. **Bande-annonce** si disponible (lecteur standard).
4. **+** / **✓ Dans ma liste** (bascule).

En bas à droite, la **matrice des versions** : qualités en lignes, langues en colonnes ;
une pastille par version existante, « ×2 » quand deux sources sont fusionnées, « AUTO »
sur celle que *Lecture* jouera.

- **Besoin :** la fiche complète en un appel : métadonnées, matrice des versions avec
  leurs sources, chaque source avec son URL de flux prête à jouer ; la progression connue
  (position, durée, terminé) ; l'état favori.
- **Choix de la version (moteur) :** dans l'ordre, le choix mémorisé pour ce titre, les
  préférences (langue, qualité max), les capacités du téléviseur (4K, HDR), puis l'ordre
  serveur ; une source en échec récent est écartée au profit de la suivante. Si aucune
  version ne correspond à la langue préférée, prendre la première de l'ordre serveur et
  le dire dans l'encart.
- **Sans TMDB [18] :** pas d'affiche, pas de synopsis ; titre nettoyé, année si connue,
  catégorie fournisseur en repli, et une ligne « pas de fiche TMDB, l'association se
  corrige depuis l'admin ». Favoris et reprise fonctionnent quand même.

### 3.5 Sélecteur de versions [8]

Une feuille sur la fiche : onglets de **langue** (VF · 4, VOSTFR · 2, VO · 1), puis une
ligne par **qualité** avec le nombre de sources et le conteneur ; « Recommandé » sur la
version du moteur. Une ligne à plusieurs sources se déplie : Source A, Source B,
distinguées par leur catégorie fournisseur, « Par défaut » sur la première de l'ordre
serveur. En bas : **Mémoriser pour ce film** (activé par défaut), **Par défaut pour
tous** (met à jour les préférences), et **Lire · 4K HDR · VF · Source A**.

- **Besoin :** rien de plus que la fiche. Le choix mémorisé par titre est local
  (`AppStorage`, clé = identifiant de contenu).

### 3.6 Fiche série [9] [14]

Même écran que le film, avec trois différences :

- Le bouton principal est **Reprendre · S2 É4** si une progression existe, sinon **Lire
  S1 É1**. À côté, **Langue de la série : VF · 4K HDR**, un choix mémorisé par série et
  appliqué à tous les épisodes ; pas de sélecteur par épisode, le changement se fait dans
  le lecteur.
- Sous les boutons, les **saisons** en onglets, et **les épisodes de la saison dans la
  fiche même** : vignette, numéro, titre, durée, langues disponibles, coche « vu » ou
  barre de progression. Pas d'écran séparé.
- Un épisode absent dans la langue choisie porte « VOSTFR seul » et la fiche prévient :
  « É5 n'existe qu'en VOSTFR. L'enchaînement le lira en VOSTFR 4K, puis reviendra en VF
  à l'épisode 6. »

**Épisode suivant [14] :** trente secondes avant la fin, un encart avec compte à rebours
de 10 s, vignette, titre, badges, l'avertissement de langue s'il y a lieu, *Lire
maintenant* et *Annuler*. Le contexte du suivant est préparé dès le début de l'épisode
courant, saison suivante comprise. Désactivable dans Réglages.

- **Besoin :** fiche série avec la liste des saisons **sans** les épisodes (TMDB, sans
  appel au fournisseur) ; puis, par saison, les épisodes avec leurs versions et sources,
  et la progression de chacun ; l'épisode « en cours » de la série pour le bouton
  principal ; pour un épisode donné, le suivant, saison suivante comprise.
- **Erreur [19] :** une saison qui ne charge pas affiche *Réessayer* à la place des
  épisodes ; les autres saisons restent accessibles.

### 3.7 Direct [10] [16] [22]

Une liste, pas une grille. À gauche les chaînes, avec des filtres de catégorie en tête et
« 4K uniquement » ; la chaîne focalisée se déplie : programme en cours avec barre
d'avancement, et ses **versions** en pastilles (« 4K · FR · 2 sources », « 4K · EN »,
« HD · FR »). À droite, un **aperçu vidéo** de la chaîne focalisée, puis le programme en
cours, ses horaires, le suivant, et *Regarder* / *Guide TV*. L'aperçu ferme le flux
précédent et ouvre le nouveau : ce n'est pas instantané, environ deux secondes, et c'est
accepté.

Les catégories affichées sont celles du fournisseur, tant qu'il n'y a pas de collections
de chaînes côté admin.

**Lecteur direct [16] :** plein écran, bandeau « EN DIRECT · 4K · FR · Source A ». **▲▼**
change de chaîne dans l'ordre de la liste telle qu'affichée, avec un bandeau
précédente / courante / suivante. **▼ long** ouvre la liste. *Options* donne qualité,
audio, sous-titres.

**Chaînes récentes [22] :** **◀** ouvre une rangée des 8 dernières chaînes regardées, la
plus récente d'abord, chacune avec son logo, sa qualité, « il y a 2 min », le programme
en cours et sa barre. La précédente est focalisée : **un clic revient dessus** sans
ouvrir la liste. Historique local à l'Apple TV, aussi en première section de l'onglet
Direct.

- **Besoin :** toutes les chaînes visibles d'un coup, groupées par catégorie, chacune
  avec logo, versions et sources ; en cours / suivant pour une chaîne (appel léger au
  focus, cache d'une minute côté app), et plus tard pour toutes les chaînes en un appel.
  La grille EPG complète n'est pas en V1 (`ETUDE.md` §6).
- **Persisté :** l'historique des 8 dernières chaînes (`AppStorage`).
- **Échec :** liste vide avec *Réessayer* ; EPG en erreur → pas de programme affiché,
  sans message.

### 3.8 Recherche [6] [19]

Le champ système en haut (`.searchable`, dictée Siri gratuite, saisie possible depuis
l'iPhone). Sous le champ, des filtres : **Tout · Films · 3 · Séries · 1 · En direct · 1**,
puis **4K · VF · VOSTFR**. À gauche le **meilleur résultat** en grand, avec badges et un
bouton *Lecture · 4K DV · VF* qui lance directement ; à droite des rangées par type,
les rangées vides masquées. Le direct en cours dont le titre correspond apparaît aussi.

- **Besoin :** recherche plein texte mixte, résultats typés avec les mêmes cartes que les
  listes, plus un premier résultat détaillé ; déclenchée après 300 ms sans frappe, la
  précédente annulée. Sur titre, acteurs, réalisateur. Le direct par titre de programme
  n'arrivera qu'avec l'EPG en base.
- **Vide [19] :** « Aucun résultat pour “…” · essayez un autre titre, un acteur ou un
  réalisateur ». Pas de suggestions en V1.

### 3.9 Réglages [13]

Un bouton ⚙ en haut à droite de chaque onglet, pas un onglet. Trois sections :

- **Lecture** : langue audio (ordre : VF › VOSTFR › VO), qualité maximale, épisode
  suivant automatique (activé · 10 s), mémoriser la version par titre, changer de source
  en cas de panne.
- **Appareil** : nom de cet Apple TV, serveur, **Dissocier cet Apple TV** (révoque le
  jeton, efface le Keychain et le cache, retour au QR).
- **À propos** : version de l'app, version du serveur, catalogue (films, séries, chaînes),
  dernier import et taux TMDB.

L'artboard [2] « Préférences de lecture » est absorbé par cette section Lecture.

- **Besoin :** l'appel de session de 3.1 ; un appel de révocation de son propre jeton.
- **Persisté :** tout en `AppStorage`, sauf le jeton.

---

## 4. Le lecteur [15] [11] [12] [20]

Un seul lecteur VLCKit, une seule vue de contrôles, paramétrée par le type de contenu.
C'est la leçon de l'ancienne application (`ETUDE.md` §3).

### 4.1 Ce qu'il reçoit

Un **contexte de lecture**, jamais moins :

```
PlaybackContext
  content     : identifiant, titre, type (film · épisode · direct)
  versions    : [Version { lang, quality, sources: [Source { id, container, stream_url, origin }] }]
  selected    : la version et la source choisies par le moteur, ou à la main
  resumeAt    : secondes, ou nil
  next        : pour un épisode, le contexte du suivant (ou un moyen de l'obtenir)
  channels    : pour le direct, la liste ordonnée pour zapper
```

### 4.2 Au repos [15]

Une pastille en haut à gauche : état (Pause), titre, version, conteneur, audio et
sous-titres actifs. Le bouton lecture au centre. En bas, la barre avec bulle de temps,
le temps restant et l'heure de fin, puis les rappels de gestes. Rien d'autre.

| Geste | VOD | Direct |
|---|---|---|
| Clic / Play-Pause | pause / lecture | pause (buffer) / lecture |
| ◀ ▶ | ±10 s, maintien = défilement | ◀ : chaînes récentes [22] |
| ▲ ▼ | ▼ : panneau [11] | chaîne précédente / suivante ; ▼ long : liste |
| Retour (‹, « Menu » sur les anciennes télécommandes) | quitter, position sauvegardée | quitter |

### 4.3 Le panneau [11]

Glisser vers le bas ouvre un panneau à onglets **Infos · Versions · Audio · Sous-titres**.
*Versions* montre les mêmes versions que la fiche, en cartes, « En cours » sur l'actuelle
et « Reprise au même instant » sur la cible. Audio et sous-titres viennent de VLCKit, pas
de l'API. Changer de version reprend à la même position.

### 4.4 Démarrage, bascule, échec

1. Ouvrir `selected.stream_url` dans VLCKit. Ni `HEAD`, ni sonde préalable : le
   fournisseur ne rend pas la main sur `HEAD` (`ETUDE.md` §2).
2. Si `resumeAt` existe, chercher à cette position dès que la durée est connue.
3. **Bascule automatique [12] :** sur erreur de flux, passer à une autre source de la
   **même version** ; toast 4 s « Source changée automatiquement · Source A → Source B »,
   aucune action requise ; la source A sera réessayée à la prochaine lecture. Sans source
   équivalente, rejouer la même URL (le serveur répond 302 avec un jeton amont frais,
   souvent sur un autre backend) : deux tentatives silencieuses.
4. **Flux en échec [20] :** au-delà de **10 s** sans image et après les tentatives, un
   dialogue : *Réessayer* (nouvelle URL demandée au serveur), *Autre version · 4K HDR ·
   VF* (la suivante du moteur), *Quitter*. Jamais de cache de l'URL finale résolue.

### 4.5 Progression

- Envoyée au serveur **toutes les 30 s** pendant la lecture, à la pause, à la sortie, et
  au changement de version. Contenu : identifiant du contenu (pour un épisode, celui de
  l'épisode), position, durée.
- **Au-dessus de 90 %**, le serveur marque « vu » ; le bouton devient *Revoir*.
- **Hors ligne** : les envois échoués vont dans une file durable, rejouée au prochain
  démarrage ou au retour du réseau, dans l'ordre, le dernier gagnant.

---

## 5. Cinq parcours qui doivent être fluides

À tester sur un vrai Apple TV avant tout le reste. Le nombre d'appels réseau est celui
que l'API doit permettre, pas plus.

| Parcours | Écrans | Appels réseau | Objectif |
|---|---|---|---|
| **Reprendre la série d'hier** | Accueil → carte Reprendre → lecteur | accueil (1) · contexte de l'épisode (1) · progression (périodique) | < 3 s entre le clic et l'image |
| **Un film ce soir** | Films → filtre genre + VF → fiche → Lecture | genres (1) · liste (1 par page) · fiche (1) | pas de dialogue avant l'image |
| **« Dis Siri, Interstellar »** | Recherche → Lecture depuis le meilleur résultat | recherche (1) · contexte (1) | résultats sous la seconde |
| **Zapper et revenir** | Direct → chaîne → ▲▼ → ◀ → clic | chaînes (1) · EPG au focus (n, cache 1 min) | changement de chaîne ≈ 2 s |
| **Reprendre une série depuis la fiche** | Séries → fiche → Reprendre S2 É4 | liste (1) · fiche (1) · saison 2 (1) | pas besoin de rouvrir la liste des saisons |

---

## 6. Ce que l'app persiste et envoie

| Donnée | Direction | Support | Quand |
|---|---|---|---|
| URL du serveur (si différente de celle compilée) | local | `AppStorage` | réglages |
| Jeton d'appareil | local | Keychain | appairage |
| Préférences (langue, qualité max, auto-play, source de secours, tri) | local | `AppStorage` | réglages |
| Version mémorisée par titre, langue par série | local | `AppStorage` | sélecteur de versions |
| Sources en échec récent | local | mémoire, 24 h | erreur de flux |
| Historique des 8 dernières chaînes | local | `AppStorage` | lecture directe |
| Dernier accueil reçu | local | fichier JSON | à chaque accueil reçu |
| File d'écritures en attente | local → serveur | fichier `Codable` | échec d'envoi |
| Progression de lecture | → serveur | — | 30 s, pause, sortie |
| Favori (bascule) | → serveur | — | clic |

Aucun catalogue local. Aucun identifiant fournisseur (`stream_id`) n'est manipulé par
l'app : elle ne connaît que les identifiants de contenu et les identifiants opaques de
source.

---

## 7. Ce que ce flow impose à l'API

*Le contrat arrêté écran par écran le 2026-09-26 est dans `docs/api-v1-tvos.md` ; il fait
foi sur ce tableau, qui garde la trace des besoins.*

Ce tableau est la sortie de ce document : il remplace la liste du bloc 3 du backlog et
sert de base pour réviser `docs/conception-groupement-et-api-rest.md`.

| Besoin | Écran | Forme attendue |
|---|---|---|
| **Appairage** : créer un code sans auth (limité, 10 min), l'approuver depuis l'admin avec un nom, le sonder jusqu'au jeton | [1] [21] | `POST /pair` · `GET /pair/{code}` · page `/admin/pair/{code}` · admin « Appareils » (liste, renommer, révoquer) |
| **Session** : nom de l'appareil, versions, langue, langues du catalogue, ordre par défaut, compteurs, dernier import ; révoquer son jeton | [1] [13] | un `GET` authentifié ; un `DELETE` |
| **Accueil composé** : hero, rangées ordonnées, cartes avec progression | [3] | un `GET`, une réponse |
| **Cartes** : identifiant, type, titre, année, affiche, note, **langues présentes, qualité max**, progression | partout | même forme dans toutes les listes |
| **Listes paginées** films et séries : curseur ; tri ajout / titre / année / note / derniers épisodes ; filtres genre, année, note, **langue, qualité min, dynamique, VF disponible, saison complète en VF, nouveaux épisodes** | [4] [5] | `GET` avec `cursor`, `next_cursor` |
| **Genres disponibles** avec compte, par type | [4] [5] | `GET` |
| **Fiche** : métadonnées, **versions → sources** avec `stream_url`, conteneur et origine ; saisons sans épisodes (série) ; progression ; favori | [7] [9] [18] | un `GET` |
| **Saison** : épisodes avec versions et sources, progression par épisode, langues disponibles par épisode | [9] | `GET` par saison |
| **Contexte de lecture** d'un contenu ou d'un épisode : versions et sources, position, épisode suivant (saison suivante comprise) | [3] → [15], [6] → [15], [14] | un `GET` dédié, léger |
| **Chaînes** : toutes, groupées par catégorie, logo, versions et sources | [10] [16] [22] | un `GET` |
| **EPG** en cours / suivant pour une chaîne ; plus tard pour toutes | [10] [16] | `GET`, vide tant que le bloc 2 n'existe pas |
| **Recherche** plein texte mixte, premier résultat détaillé | [6] | `GET ?q=` |
| **Progression** : position, durée, par contenu ou épisode | lecteur | `POST`, idempotent, dernier gagnant |
| **Favori** : bascule | [7] [9] [18] | `POST` / `DELETE` |
| **Marqué vu** dérivé côté serveur à 90 % | — | pas d'appel |

Ce que l'app n'a **pas** besoin de recevoir : les catégories fournisseur des films et
séries (sauf en repli sur une fiche sans TMDB), les identifiants `stream_id`, les champs
bruts, tout débit ou mesure de santé (le serveur ne voit jamais la vidéo), tout codec
audio (connu seulement à la lecture).

Ce que le canvas ajoute par rapport au backlog :

- **Trois niveaux** contenu → version → source, au lieu de contenu → variante. Le
  groupement serveur doit produire les versions (langue × qualité) et y ranger les
  sources, ordonnées.
- **Agrégats par contenu** pour les cartes et les filtres : langues présentes, qualité
  max, dynamique ; pour les séries, couverture par saison et par langue, et date du
  dernier épisode (`last_modified` du fournisseur) pour le tri « derniers épisodes ».
- L'**appairage par QR code** et une table d'appareils avec jetons révocables ; la clé du
  coffre enveloppée par jeton pour conserver le déverrouillage automatique.
- Un endpoint de **session**, un **contexte de lecture** sans passer par la fiche, et
  l'**épisode suivant** servi par l'API.
- Les **listes nommées** du README ne sont pas dans ce flow : une seule liste « Ma liste »
  en V1, comme le bloc 4.

---

## 8. Ordre de construction de l'app

1. Appairage + Réglages + client HTTP typé sur le contrat : rien à voir, mais tout le
   reste s'y branche. Côté serveur, c'est aussi la première brique : appareils, jetons,
   clé du coffre enveloppée.
2. **Lecteur** avec un `stream_url` codé en dur : lever les trois risques de l'étude (HDR,
   passthrough, seek MKV) avant d'investir dans le catalogue. Puis le panneau, la bascule
   de source et le dialogue d'échec.
3. Films (grille + fiche + moteur de choix + sélecteur) : le composant de grille, la fiche
   et le sélecteur servent ensuite aux séries.
4. Séries (saisons dans la fiche, langue de la série, épisode suivant).
5. Accueil avec reprise directe et Ma liste.
6. Recherche.
7. Direct, zapping, chaînes récentes.
