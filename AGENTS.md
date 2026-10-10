# Consignes pour les agents

La documentation du projet tient en quatre fichiers, à lire dans cet ordre avant de coder :

1. `README.md` (racine) — ce que fait le système, ses deux composants et les conventions communes.
2. `server/README.md` — si l'on touche au serveur.
3. `apple/README.md` — si l'on touche à l'app Apple (tvOS, iOS).
4. `android/README.md` — si l'on touche à l'app Android.

Chaque README est la seule doc de son dossier : le mettre à jour quand une décision ou une
structure change, ne pas créer d'autre fichier de documentation sans demande.

Règles de travail :

- Vérifier un constat dans le code avant de le corriger.
- Après toute modification du serveur : `npm run format`, `npm run typecheck`, `npm test`, `npm run build` dans `server/`.
- Après toute modification de l'app Apple : compiler et lancer les tests sur les trois destinations, Apple TV, iPhone et iPad (outils MCP Xcode `BuildProject`, `RunAllTests`, `XcodeSwitchRunDestination`) ; dire explicitement ce qui n'a pas pu être vérifié.
- Après toute modification de l'app Android : `./gradlew testDebugUnitTest lintDebug assembleDebug` dans `android/` (JDK 21), puis `scripts/shot.sh <écran>` pour l'écran modifié.
- Ne rien committer sans demande explicite.
