# Étude préparatoire — application tvOS

Ce que le catalogue réel et le fournisseur amont imposent à l'application Apple TV, avant
d'en écrire la première ligne.

Mesures relevées le **1ᵉʳ septembre 2026** sur `tv_channels_plus.m3u` (210 Mo, 612 289
entrées) et sur le fournisseur amont. Cible : **tvOS 26, Apple TV 4K**.

Ce document distingue trois statuts, parce que les mélanger le rendrait inutilisable dans
six mois :

| Marqueur | Sens |
|---|---|
| **Mesure** | Fait établi par une commande, sur les données ou sur le fournisseur. Reproductible. |
| **Décision** | Arbitrage arrêté pendant l'étude. Réversible, mais ce n'est plus une question ouverte. |
| **Risque** | Hypothèse non vérifiée qui peut coûter cher. À lever tôt, sur du vrai matériel. |

Le cahier des charges fonctionnel reste `tvOS/README.md`. Ce document ne le remplace pas :
il dit ce que la réalité mesurée impose à sa mise en œuvre — et signale deux endroits où
il est en décalage.

---

## Les quatre conclusions

1. **AVPlayer est écarté, VLCKit fait 100 % de la lecture.** Aucun HLS chez le fournisseur,
   ni en VOD ni en direct. AVFoundation ne sait lire ni le MKV ni le MPEG-TS progressif.
   Un seul moteur, une seule interface de lecture.
2. **Le contrat REST a deux niveaux : contenu et variante.** Le contenu porte une identité
   stable dérivée de TMDB, seul objet que l'application persiste. La variante est le flux
   jouable, volatile, jamais mise en cache.
3. **Pas de catalogue sur l'Apple TV.** Le serveur pagine et cherche. L'application ne garde
   qu'une file d'écritures en attente et un instantané de l'accueil. SwiftData n'a plus de
   raison d'être.
4. **Risque n° 1 : HDR et audio sur VLCKit.** Sans repli AVPlayer, le rendu Dolby Vision des
   3 604 films 4K et le passthrough AC3/E-AC3 deviennent critiques.

---

## 1. Ce que contient réellement le catalogue

612 289 entrées, 175 groupes. Les volumes ne se lisent pas naïvement : les séries
apparaissent au niveau **épisode** dans le M3U, alors que l'API Xtream ne les expose qu'au
niveau série. Ce que l'application verra est bien plus petit.

| Type | Entrées | Dont FR | Ce que voit l'app |
|---|---:|---:|---|
| Chaînes en direct | 10 069 | 722 | 722 chaînes |
| Films | 70 263 | 39 845 | 35 219 titres distincts |
| Épisodes de séries | 531 956 | 329 619 | ≈ 22 174 séries |
| **Total** | **612 289** | **370 186** | — |

> **Mesure** — Sur les 39 845 films francophones, on ne compte que **35 219 titres
> distincts** une fois les suffixes de qualité et de piste retirés : environ **12 % du
> catalogue est du doublon de variante**.

### La grammaire des noms

Le fournisseur est mécanique dans son étiquetage, ce qui rend le groupement automatique
réaliste :

```
live   |FR| TF1 FHD                       |LANG| NOM QUALITÉ
film   |FR| Backdraft (4K)                |LANG| Titre (QUALITÉ)
film   |FR| Jackdaw | 2024                |LANG| Titre | ANNÉE
série  |FR| Vincenzo (MULTI) S01          |LANG| Titre (PISTE) SXX
épis.  |FR| Vincenzo 01x16 - Episode 16   |LANG| Titre NNxMM - Titre
```

Trois axes s'y superposent, souvent confondus : le **marché** (`|FR|`, `|IT|`, `|AR|`…), la
**qualité** (`SD HD FHD 4K UHD` en direct, `(4K) (UHD) (BLURAY) (HEVC)` en film) et la
**piste audio** (`(VOST) (VOSTFR) (MULTI)`).

| Qualité déclarée — films FR | Titres | Part |
|---|---:|---:|
| Standard (SD / HD / FHD) | 36 183 | 90,8 % |
| 4K / UHD | 3 604 | 9,0 % |
| HEVC | 58 | 0,1 % |

### Trois clés d'identité, deux mauvaises

- **`tvg-id` est inutilisable.** Vide pour 3 349 des 10 069 chaînes, et incohérent : TF1
  FHD, HD et SD portent `TF1.fr` quand TF1 4K porte `tf1-4k.fr`. C'est une ancre EPG, pas
  une identité.
- **Le titre seul est trompeur.** Le catalogue contient 15 « Pinocchio », 14 « The Killer »,
  11 « Joker », 10 « Superman » — des œuvres différentes, pas des variantes.
- **L'année est presque toujours absente.** Seuls 1 705 films FR sur 39 845 la portent, soit
  **4,3 %**. Le rapprochement TMDB par titre seul est la règle, pas l'exception.

> **Décision** — La seule clé d'identité fiable pour films et séries est le **`tmdb_id`**,
> que le serveur calcule déjà. Pour le direct, où TMDB ne s'applique pas, c'est le nom
> normalisé. Les contenus sans correspondance TMDB reçoivent une **identité de repli
> dérivée** de `(kind, clean_title, year)`, pour que favoris et reprise fonctionnent partout
> de la même façon.

### Les catégories du fournisseur ne survivent pas au groupement

Les 35 catégories francophones de films mélangent quatre axes incompatibles :

| Axe | Exemples | Entrées |
|---|---|---:|
| Genre | `THRILLER` · `ROMANCE` · `WESTERN` | ≈ 27 700 |
| Qualité ou piste | `FILMS 4K UHD` · `4K LIGHT` · `4K DV` · `HEVC` · `VOST` | 7 704 |
| Époque, éditorial | `FILMS 90's` · `80's` · `NOUVEAUTES` · `BOX OFFICE 2025` | ≈ 4 400 |
| Franchise | `MARVEL ET DC COMICS` · `ANIMATION DISNEY` | ≈ 560 |

Le problème est structurel : une fois les variantes groupées, *Tenet* rangé dans
`FILMS 4K UHD` fusionne avec *Tenet* rangé dans `ACTION ET AVENTURE`. Aucune des deux
catégories ne peut porter le contenu résultant, parce que **19,3 % du catalogue est classé
par qualité, pas par sujet**.

> **Décision** — L'application navigue par **genre TMDB**, axe unique et cohérent, déjà en
> cache dans `tmdb_cache`. La catégorie fournisseur ne subsiste que comme repli pour les
> contenus non rapprochés. Les axes éditoriaux (années 80, Noël, box-office) remontent d'un
> cran, de la navigation vers l'accueil : ce sont des **collections**, le bloc 6 du backlog.

---

## 2. Le fournisseur amont, tel qu'il est vraiment

`900900.eu` n'est pas le serveur de flux. C'est un proxy qui émet un jeton anti-leech et
redirige vers un pool de backends nginx. La chaîne réelle compte trois sauts :

```
Lecteur → Kanstrimi (302) → 900900.eu (302 + ?token=) → backend nginx (206)
          jamais de relais    Server: PremiumProxy       video/x-matroska
```

### Le pool explique l'intermittence

Huit requêtes ont atterri sur **six adresses distinctes**, réparties sur plusieurs plages
d'adressage : `185.188.31.96`, `185.188.31.115`, `169.150.223.36`, `185.93.2.36`,
`79.127.196.13`, `89.187.191.83`.

Il suffit qu'un nœud soit en mauvaise santé pour qu'une lecture sur deux échoue sans motif
visible, et le serveur n'y peut rien : il ne fait qu'un `302`.

> **Décision** — En cas d'échec de lecture, **réessayer depuis le haut** : redemander l'URL
> à Kanstrimi pour obtenir un jeton frais et, avec un peu de chance, un autre backend.
> Rejouer l'URL finale ne fait que retaper sur le nœud défaillant avec un jeton qui
> vieillit. Corollaire : **ne jamais mettre en cache l'URL de flux résolue**.

### Formats acceptés — relevé complet

| Forme d'URL | Réponse | Type |
|---|---|---|
| `/<user>/<pass>/<id>` | 200 | `video/mp2t` |
| `/live/<user>/<pass>/<id>.ts` | 200 | `video/mp2t` |
| `/live/<user>/<pass>/<id>` | 401 | — |
| `/live/<user>/<pass>/<id>.m3u8` | 405 | — |
| `/<user>/<pass>/<id>.m3u8` | 404 | — |
| `/movie/<user>/<pass>/<id>.mkv` | 206 | `video/x-matroska` |
| `/movie/<user>/<pass>/<id>.m3u8` | 404 | — |

Deux enseignements :

- **Kanstrimi génère la bonne URL.** `/live/<user>/<pass>/<id>.ts` répond `200`. Le panel
  accepte les deux conventions mais exige l'extension dès qu'on passe par le préfixe
  `/live/`.
- **Il n'y a de HLS nulle part.** Le proxy signe volontiers un jeton pour `.m3u8` ; c'est le
  backend qui tranche par un `404`. On ne peut donc rien déduire de la réponse du proxy
  seul.

### Deux anomalies relevées au passage

- **`Accept-Ranges: 0-3993004984`** — la norme attend `bytes` ou `none`, pas une plage. VLC
  tolère cet écart, AVPlayer est nettement plus strict sur la conformité HTTP.
- **Le `HEAD` reste pendu.** Le fournisseur ignore la méthode et commence à streamer : un
  `curl -I` ne rend jamais la main. Un lecteur qui sonde en `HEAD` avant de lire rencontrera
  le même mur — piste sérieuse pour les échecs intermittents observés.

> **Risque** — `server/src/routes/xtream.ts:150` recopie la query string du client sur l'URL
> amont sans condition : `streamUrl(…) + new URL(c.req.url).search`. Si un lecteur réessaie
> en propageant le `?token=` du tour précédent, on renvoie un jeton périmé au proxy au lieu
> de lui en faire émettre un frais. À filtrer sur liste blanche, ou à supprimer.

---

## 3. Le lecteur : un seul moteur

C'est la décision la plus structurante de l'étude, et les mesures l'ont retournée deux fois.

| Type | MKV | MP4 | AVI | MPEG-TS |
|---|---:|---:|---:|---:|
| Films | 69 821 *(99,4 %)* | 361 | 81 | — |
| Épisodes | 523 511 *(98,4 %)* | 8 346 | 100 | — |
| Direct | — | — | — | 10 069 |

AVFoundation ne lit pas le MKV, et ne lit le MPEG-TS *qu'à l'intérieur d'un flux HLS* —
jamais en téléchargement progressif. Or il n'existe aucun HLS chez ce fournisseur. Ne
restent à AVPlayer que 361 films et 8 346 épisodes en MP4, **moins de 1,5 % du catalogue** :
très loin de justifier un second moteur avec sa propre couche de contrôles.

> **Décision** — **VLCKit porte 100 % de la lecture.** Un moteur, une interface. Le
> protocole `PlayerEngine` de l'ancienne application (71 lignes) est conservé — non comme
> abstraction utile aujourd'hui, mais comme assurance si le fournisseur change un jour.

### Ce que ça coûte, et où

Dans `_Old/_Kanstrimi TV`, le lecteur pèse **3 319 lignes sur 15 124** — 22 % de
l'application. Le détail est instructif : l'abstraction à deux moteurs ne coûtait presque
rien (`PlayerEngine` 71 lignes, `AVPlayerEngine` 223, `VLCPlayerEngine` 197). La dépense
était ailleurs, dans **trois vues de contrôles quasi identiques** — film, série, direct —
parce que le lecteur avait été rangé par fonctionnalité au lieu d'être un service
transverse.

Une couche de contrôles unique et paramétrée — direct sans barre de progression mais avec
zapping, VOD avec reprise, série avec « épisode suivant » — supprime environ 700 lignes
redondantes. C'est la vraie leçon de l'ancienne application : **l'organisation par
fonctionnalité convient au catalogue, pas au lecteur**.

### Les risques que ce choix concentre

> **Risque** — **HDR et Dolby Vision sur 3 604 films 4K.** C'est exactement le contenu pour
> lequel on achète un Apple TV 4K, et le terrain où AVPlayer est le plus solide. Si le tone
> mapping de VLCKit est mauvais, le 4K rendra moins bien que le 1080p — le pire résultat
> possible. Il n'y a plus de repli.

> **Risque** — **Passthrough audio AC3 et E-AC3.** Les flux IPTV en sont pleins et tvOS
> encadre étroitement ces API. Un repli en stéréo downmixée s'entend immédiatement dans un
> salon équipé.

> **Risque** — **Le MKV n'est pas un format de streaming.** Son index `Cues` est fréquemment
> placé en fin de fichier ; sur un film de 4,0 Go, le démuxeur doit alors lire la fin avant
> de démarrer. Cela menace l'objectif de *démarrage en moins de 3 secondes* du cahier des
> charges, et surtout la fluidité du seek pendant toute la lecture.

Ces trois points se mesurent ensemble, tôt, sur un vrai Apple TV 4K et un vrai fichier du
catalogue. Aucune finition d'interface ne rattrapera un seek poussif.

> **Mesure** — VLCKit 4 dispose d'un support Swift Package Manager officiel depuis juillet
> 2026, ce qui élimine CocoaPods. Mais la bibliothèque reste en **alpha** (4.0.0a21) : c'est
> une dépendance alpha sur le chemin de lecture principal, à assumer consciemment.

---

## 4. Le contrat `/api/v1`

L'application ne parlera jamais à Xtream. Elle consomme une API REST maison, que le serveur
n'expose pas encore (bloc 3 du backlog).

### Deux pièges du schéma actuel

> **Risque** — **`items.id` n'est pas stable.** `runSync` supprime tout ce qui n'a pas été
> revu (`delete … where seen_at < started`) puis réinsère avec un nouveau `serial`. Un
> hoquet du fournisseur — un timeout sur `get_vod_streams` — et tous les favoris et
> positions de lecture pointant sur ces identifiants tombent dans le vide, silencieusement.
> `xtream_id` ne vaut pas mieux : c'est du texte opaque que le fournisseur renumérote à sa
> guise.

> **Risque** — **`items.position` n'est pas un ordre.** Il vaut l'index dans le tableau
> renvoyé par le fournisseur et change à chaque synchronisation. Paginer dessus fait glisser
> les éléments entre deux pages pendant que l'utilisateur défile.

### La colonne vertébrale : deux niveaux

| Niveau | Ce que c'est | Identité | Persisté ? |
|---|---|---|---|
| **content** | L'œuvre : ce qu'on voit, met en favori, reprend | `tmdb:movie:603`, `tmdb:tv:1396`, `live:tf1` | Oui |
| **variant** | Le flux jouable : une langue, une qualité, un conteneur | volatile | Jamais |

Tout ce que l'application écrit ou envoie — favoris, progression — vit au niveau `content`.
Tout ce qui est jetable vit au niveau `variant`. L'identité `content` ne venant pas du
fournisseur, elle survit à une renumérotation, à une suppression-réinsertion, et même à un
changement de fournisseur.

Les épisodes suivent la même règle : `tmdb:tv:1396:s01e05` pour l'identité, le `stream_id`
amont restant dans la variante.

### Les règles de forme

- **Les listes ne portent que la carte** — identifiant, type, titre, année, affiche, note.
  Sur 35 219 films, chaque champ superflu se paie en bande passante et en temps de décodage
  JSON. Synopsis, distribution, bande-annonce et *variantes* n'arrivent qu'avec
  `GET /api/v1/content/{id}`.
- **Pagination par curseur**, triée sur une clé stable (`added_at desc, id`). L'offset
  profond est à la fois instable et coûteux pour Postgres.
- **Chargement paresseux des saisons.** `get_series_info` est un appel *par série* chez le
  fournisseur, pour ≈ 22 000 séries francophones. Le contrat ne doit jamais imposer de
  charger toutes les saisons pour afficher une fiche ; `info_cache` et son TTL de 12 h
  amortissent le reste.
- **L'accueil est composé par le serveur.** Une requête, des sections ordonnées avec leurs
  cartes. L'alternative — six allers-retours au démarrage — donne un écran qui se remplit
  par morceaux et zéro contrôle éditorial : changer l'ordre des rangées imposerait une mise
  à jour de l'application.
- **L'EPG existe dès le départ, vide.** `GET /api/v1/live/{id}/epg` répond du vide tant que
  le bloc 2 du backlog n'est pas fait, et se remplit sans nouvelle version de l'application.
- **Schéma typé, jamais de `raw`.** `lib/api/catalog.ts` aplatit TMDB dans le dictionnaire
  Xtream avec ses doublons imposés par les players du marché — `releasedate` *et*
  `release_date`, `tmdb` *et* `tmdb_id`. Le REST n'hérite pas de cette dette.

### Authentification et coffre

Le déverrouillage du serveur repose aujourd'hui sur une propriété du protocole Xtream :
chaque requête porte le mot de passe, donc la première venue dérive la clé AES et
déverrouille le coffre. C'est ce qui relance le cron après un redémarrage.

> **Risque** — Un jeton d'authentification ne dérive pas la clé : `deriveKey(password, salt)`
> a besoin du mot de passe. Avec un client à jetons, le serveur resterait verrouillé après
> chaque redémarrage, cron en pause et API en 401, **jusqu'à une ouverture manuelle de
> `/admin`**. Sur une Apple TV allumée seule dans un salon, c'est un défaut de
> disponibilité.

> **Décision** — L'application garde **le mot de passe** en Keychain et l'envoie en
> `Authorization: Basic`. Cela préserve le déverrouillage automatique, sort le secret des URL
> et des journaux, et évite une table de jetons pour un système mono-utilisateur.

> **Décision** — L'URL de flux est renvoyée **au format Xtream actuel**, en JSON.
> L'application la traite comme opaque : elle la reçoit, la passe au lecteur, ne la lit ni
> ne la journalise jamais. Basculer plus tard vers une URL signée HMAC sera donc un
> changement purement serveur.

### L'API Xtream a une date de péremption

Une fois le client maison en service, disparaissent : `player_api.php`, `get.php`,
`xmltv.php`, les redirections au format Xtream, `splitFile`, tout `lib/api/catalog.ts` et le
réglage `proxy_username`.

Survivent : `/img/`, le client Xtream **amont**, le coffre, les règles de filtrage et les
trois étapes de traitement.

Mais pas tout de suite : tant que l'application tvOS n'existe pas, TiviMate reste le seul
moyen de regarder quoi que ce soit. Les deux API coexistent pendant toute la construction.
Ce n'est pas une suppression, c'est une **dépréciation** — à inscrire dans
`server/BACKLOG.md`, faute de quoi personne ne saura dans six mois si les champs dupliqués
sont voulus ou hérités.

---

## 5. Ce que l'Apple TV garde vraiment

Posée franchement — qu'est-ce qui doit survivre à la fermeture de l'application ? — la liste
est très courte.

| Donnée | Pourquoi elle est locale | Support |
|---|---|---|
| **File d'écritures en attente** | Une coupure Wi-Fi ne doit pas faire perdre « j'en suis à 47 minutes ». Durable, ordonnée, rejouée au retour du réseau. | fichier `Codable` |
| **Instantané de l'accueil** | tvOS tue les applications agressivement ; afficher le dernier accueil connu pendant le rafraîchissement change la perception de vitesse. | blob JSON |
| **Préférences** | Langue préférée, taille des sous-titres, lecture auto de l'épisode suivant. | `AppStorage` |
| **Mot de passe** | Secret. | Keychain |

> **Décision** — **Pas de SwiftData.** C'est l'écart le plus net avec l'ancienne
> application, où SwiftData miroitait le catalogue entier — l'erreur d'origine. L'état local
> pesant quelques kilo-octets, SwiftData n'apporterait qu'un `ModelContainer` à gérer, des
> macros `@Model` et des migrations de schéma pour stocker l'équivalent d'un petit fichier.
> Un acteur de persistance avec des fichiers `Codable` suffit.

### En mémoire : une fenêtre, pas un catalogue

Chaque liste est portée par un paginateur qui tient les pages chargées, le curseur, et
précharge en avance de la position du focus — le moteur de focus tvOS déplaçant la sélection
case par case, il suffit de charger la page suivante quand le focus entre dans le dernier
tiers.

Le poids réel n'est pas dans les modèles : 35 000 cartes font une dizaine de méga-octets. Il
est dans **les images**. C'est le cache d'`AsyncImage` qu'il faut borner. Avec le nouveau
comportement de cache HTTP de SwiftUI et le `max-age=31536000, immutable` que le serveur
envoie déjà sur `/img/`, il n'y a rien à écrire — juste une limite à fixer. Kingfisher n'a
plus de raison d'être.

### Un point de discipline

Les types de l'application calquent **le contrat REST, pas la base** : `ContentCard`,
`ContentDetail`, `Variant`, `Season`, `Episode`, `Channel`, `Programme`. Aucun `Item`, aucun
`kind`, aucun `xtreamId`, aucun `stream_id`. L'ancienne application avait laissé fuiter le
vocabulaire Xtream jusque dans les vues ; écrite ainsi, la nouvelle n'aura rien à renommer
le jour où l'API Xtream disparaîtra du serveur.

---

## 6. Les écrans

Le cahier des charges fixe cinq onglets — Accueil, Live TV, Films, Séries, Recherche — et il
n'y a pas lieu d'en discuter la liste. Ce qui compte est derrière.

> **Mesure** — Les écrans coûtent peu. L'ancienne application en comptait neuf pour 15 124
> lignes, dont 3 319 pour le seul lecteur. **Le budget d'une application tvOS part dans le
> moteur de focus et la lecture**, pas dans le nombre de vues.

L'accueil est la seule vue composée par le serveur. Films et Séries sont deux instances du
même composant de grille paginée, avec le même paginateur. La fiche de contenu est partagée,
la partie saisons et épisodes n'apparaissant que pour les séries.

### Le sélecteur de variante est une préférence, pas une question

Le piège serait d'en faire une feuille de dialogue à chaque lecture : demander « FR ou
VOST ? 4K ou HD ? » avant chaque film devient insupportable au troisième soir.

> **Décision** — Une **préférence persistante** — langue préférée, qualité maximale —
> sélectionne automatiquement la meilleure variante disponible. Le changement reste possible
> *pendant* la lecture, dans le menu du lecteur, là où se choisissent déjà pistes audio et
> sous-titres. La fiche affiche ce qui existe sans rien demander.

### La grille EPG est l'écran le plus difficile de l'application

Une grille chaînes × temps, en défilement bidirectionnel, avec un moteur de focus qui doit
rester prévisible dans les deux axes — très loin devant tout le reste en difficulté. Et elle
dépend d'un serveur qui ne sait pas encore répondre : le bloc 2 du backlog n'existe pas,
`xmltv.php` n'est qu'un relais.

> **Décision** — La V1 livre une **liste chaîne + programme en cours + suivant**. Elle couvre
> l'usage réel d'un salon pour une fraction du coût, et la grille arrive ensuite sans rien
> casser puisque le contrat REST est le même.

### Points mineurs

- **La recherche vocale est presque gratuite.** `.searchable` dans un `NavigationStack`
  récupère la dictée de la Siri Remote sans code spécifique. Tout le travail est côté
  serveur : le `tsvector` Postgres du bloc 3, sur titre, distribution et réalisation.
- **Les listes personnalisées nommées** du cahier des charges (« À regarder ce week-end »)
  ne sont pas couvertes par le bloc 4 du backlog, qui ne prévoit que des favoris à plat. Une
  table et quelques endpoints à ajouter.

> **Décision** — **Apple TV 4K uniquement.** On cible le matériel qui décode le HEVC en
> matériel et sort en 4K HDR. L'Apple TV HD de 2015 ne peut de toute façon pas exploiter les
> 3 604 films 4K, et l'exclure évite d'optimiser VLCKit pour un A8 avec 2 Go de RAM.

> **Risque** — `tvOS/README.md` est en décalage sur deux points : il annonce le « support des
> formats **HLS** et MPEG-TS » — il n'y a pas de HLS — et « tvOS **17.0+**, Apple TV HD ».
> Les deux sont à corriger, sans quoi ils induiront en erreur comme le fait déjà le
> `README.md` racine.

---

## 7. Dans quel ordre

Le contrat REST suppose des choses qui n'existent pas encore côté serveur. Cet ordre est
celui des dépendances réelles, pas des préférences.

1. **Lever les trois risques de lecture.** HDR et Dolby Vision, passthrough AC3/E-AC3,
   comportement du seek sur un MKV de 4 Go. Sur un vrai Apple TV 4K, avec un vrai fichier du
   catalogue. Ces mesures peuvent invalider le choix du moteur : elles passent avant tout le
   reste.
2. **Groupement des variantes** — backlog bloc 1. Sans lui, `content` n'a pas de sens et
   l'application affiche 39 845 films là où elle devrait en montrer 35 219. Inclut l'identité
   de repli pour les contenus non rapprochés par TMDB.
3. **Progression et favoris** — backlog bloc 4. Tables `watch_progress` et `favorites`, plus
   les listes nommées du cahier des charges. Sans elles, ni reprise ni accueil éditorialisé.
4. **API REST `/api/v1`** — backlog bloc 3. Sérialiseur distinct de `catalog.ts`, pagination
   par curseur, recherche `tsvector`. Coexiste avec l'API Xtream pendant toute la
   construction.
5. **L'application tvOS.** Lecteur d'abord — c'est 22 % du travail et le seul poste où
   l'échec est structurel. Puis Films et Séries, qui partagent un composant. Puis l'accueil.
   Le direct en dernier, faute d'EPG.
6. **EPG en base** — backlog bloc 2. Arrive après, précisément parce que le contrat prévoit
   l'endpoint vide. Débloque « en cours / suivant », puis la grille.

---

*Étude préparatoire — aucune ligne de code écrite. Les décisions consignées ici sont
réversibles ; les mesures, reproductibles.*
