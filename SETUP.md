# Configuration du projet Kanstrimi TV

## Étape 1 : Configuration des API Keys

Le projet utilise des API keys sensibles qui ne doivent pas être commitées sur Git.

### 1.1 Créer le fichier de configuration

```bash
cp Config.xcconfig.template Config.xcconfig
```

### 1.2 Ajouter votre clé API TMDB

Éditez `Config.xcconfig` et remplacez `YOUR_TMDB_BEARER_TOKEN_HERE` par votre token TMDB.

Pour obtenir un token TMDB :
1. Créez un compte sur https://www.themoviedb.org
2. Allez dans Settings > API
3. Créez une nouvelle API key
4. Copiez le "Bearer Token" (pas la simple API key)

## Étape 2 : Configuration Xcode

### 2.1 Ajouter Config.xcconfig au projet

1. Ouvrez `Kanstrimi TV.xcodeproj` dans Xcode
2. Dans le Project Navigator (⌘1), faites un clic droit sur le dossier racine
3. Choisissez "Add Files to Kanstrimi TV..."
4. Sélectionnez `Config.xcconfig`
5. Assurez-vous que "Copy items if needed" est **décoché**
6. Cliquez sur "Add"

### 2.2 Lier Config.xcconfig au Target

1. Sélectionnez le projet dans le Project Navigator
2. Sélectionnez le target "Kanstrimi TV"
3. Allez dans l'onglet "Info"
4. Sous "Configurations", pour chaque configuration (Debug/Release) :
   - Cliquez sur la configuration
   - Dans la colonne "Based on Configuration File", sélectionnez `Config.xcconfig`

### 2.3 Vérifier Info.plist

Le fichier `Kanstrimi-TV-Info.plist` doit contenir :

```xml
<key>TMDB_API_KEY</key>
<string>$(TMDB_API_KEY)</string>
```

Cette ligne est déjà présente, rien à faire.

## Étape 3 : Tester

Compilez et lancez le projet. Si la configuration est correcte, l'application démarrera normalement.

Si vous voyez une erreur "TMDB_API_KEY manquant dans Info.plist", vérifiez que :
1. Le fichier `Config.xcconfig` existe et contient votre API key
2. Le fichier est bien lié au target dans Xcode (étape 2.2)
3. Xcode a été redémarré après l'ajout du fichier

## Important

- **Ne commitez JAMAIS** le fichier `Config.xcconfig` (il est dans .gitignore)
- Le fichier `Config.xcconfig.template` peut être commité (il ne contient pas de secrets)
- Partagez `Config.xcconfig.template` avec l'équipe, pas `Config.xcconfig`
