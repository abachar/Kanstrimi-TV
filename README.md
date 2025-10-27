# Kanstrimi TV

Application tvOS native pour Apple TV permettant de gérer et lire du contenu IPTV provenant de serveurs Xtream Codes.

---

## 📱 Contexte du projet

**Kanstrimi TV** est une application propriétaire (non open-source) développée en Swift pour tvOS. Elle permet aux utilisateurs de diffuser du contenu IPTV (chaînes en direct, films VOD, séries) provenant de serveurs compatibles Xtream Codes.

L'application se distingue par :
- **Architecture MV (Model-View)** : Organisation claire par features avec DomainService pour la logique métier et StorageService pour la persistance
- **SwiftData pour la persistance** : Réactivité automatique avec @Query
- **Architecture mono-compte** : Une source Xtream active à la fois pour une gestion simplifiée
- **Filtrage avancé par regex** : Recherche puissante sur tous les types de contenu
- **Synchronisation complète** : Toutes les données chargées au démarrage pour une navigation fluide
- **Interface native tvOS** : Focus natif avec `.hoverEffect()`, pas de code focus custom
- **Cache d'images** : CachedImage avec cache mémoire + disque pour performances optimales

## ✨ Fonctionnalités

TODO 

## 📖 Scénarios d'utilisation

TODO 

---

## 🛠 Commandes et workflow

### Installation et configuration

TODO

### Développement

```bash
# Build pour simulateur tvOS
xcodebuild -scheme "Kanstrimi TV" -sdk appletvsimulator build

# Build pour device tvOS
xcodebuild -scheme "Kanstrimi TV" -sdk appletvos build

# Lancer dans le simulateur (après build)
xcrun simctl launch booted com.yourteam.kanstrimitv

# Clean build folder
xcodebuild clean -scheme "Kanstrimi TV"

# Tests unitaires
xcodebuild test -scheme "Kanstrimi TV" \
  -destination 'platform=tvOS Simulator,name=Apple TV 4K (3rd generation)'

# Lister les simulateurs disponibles
xcrun simctl list devices tvOS
```

### Commandes Claude Code

L'application utilise une commande personnalisée `/specify` pour la spécification et l'implémentation de nouvelles fonctionnalités :

```bash
# Utiliser la commande /specify
/develop [description de la fonctionnalité en langage naturel]

# Exemple
/develop Ajouter un système de recommandations basé sur l'historique de visionnage
```

### Workflow Git recommandé

```bash
# Créer une branche pour une nouvelle feature
git checkout -b feature/advanced-search

# Faire des commits atomiques par tâche
git add .
git commit -m "feat(search): add fuzzy matching algorithm"
git commit -m "feat(search): add search history persistence"

# Pousser et créer une Pull Request
git push origin feature/advanced-search

# Créer une PR via GitHub CLI (optionnel)
gh pr create --title "Add advanced search with fuzzy matching" \
  --body "Implements advanced search functionality with fuzzy matching and search history"
```

## 📝 Conventions de commit

Format :
```
<type>(<feature>): <description courte>

[corps optionnel détaillé]
```

**Types** :
- `feat`: Nouvelle fonctionnalité
- `fix`: Correction de bug
- `refactor`: Refactoring sans changement fonctionnel
- `docs`: Modification de documentation
- `perf`: Amélioration des performances
- `style`: Formatting, naming
- `chore`: Maintenance, configuration

**Scope** : Nom de la feature (`movies`, `player`, `settings`, `shared`)

**Exemples** :
```
feat(movies): ajout de la vue liste avec filtres

- Implémentation de MoviesListView avec @Query
- Création des composants MovieCard et MoviePoster
- Gestion du focus et navigation tvOS
```
```
refactor(player): décomposition du PlayerView en composants

- Extraction de PlayerControls
- Création de ProgressBar component
- Amélioration de la gestion du focus
```

### Conventions de changelog

#### Types de changements
- **Ajouté** : nouvelles fonctionnalités
- **Modifié** : changements dans les fonctionnalités existantes
- **Déprécié** : fonctionnalités bientôt supprimées
- **Supprimé** : fonctionnalités supprimées
- **Corrigé** : corrections de bugs
- **Sécurité** : corrections de vulnérabilités

#### Format des versions
`[MAJOR.MINOR.PATCH] - YYYY-MM-DD`
- **MAJOR** : changements incompatibles avec les versions précédentes
- **MINOR** : nouvelles fonctionnalités compatibles avec les versions précédentes
- **PATCH** : corrections de bugs compatibles

---

## 📚 Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Architecture détaillée, patterns, flux de données
- **[CHANGELOG.md](./CHANGELOG.md)** - Historique des versions et changements

---

## 🔒 Sécurité et légalité

### Sécurité

- ✅ Chiffrement des credentials via Keychain
- ✅ Validation des URLs pour éviter les injections
- ✅ Nettoyage des données sensibles en mémoire

### Légalité

- L'application est un **lecteur neutre** (pas de contenu inclus)
- **Disclaimer clair** : L'utilisateur est responsable du contenu qu'il diffuse
- Pas de contournement de DRM
- Respect des ToS des fournisseurs IPTV