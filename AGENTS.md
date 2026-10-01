# Consignes pour les agents

La documentation du projet tient en trois fichiers, à lire dans cet ordre avant de coder :

1. `README.md` (racine) — ce que fait le système, ses deux composants et les conventions communes.
2. `server/README.md` — si l'on touche au serveur.
3. `apple/README.md` — si l'on touche à l'app Apple (tvOS, iOS).

Chaque README est la seule doc de son dossier : le mettre à jour quand une décision ou une
structure change, ne pas créer d'autre fichier de documentation sans demande.

Règles de travail :

- Vérifier un constat dans le code avant de le corriger.
- Après toute modification du serveur : `npm run format`, `npm run typecheck`, `npm test`, `npm run build` dans `server/`.
- Après toute modification de l'app Apple : compiler et lancer les tests sur les deux destinations, Apple TV et iPhone (outils MCP Xcode `BuildProject`, `RunAllTests`, `XcodeSwitchRunDestination`) ; dire explicitement ce qui n'a pas pu être vérifié.
- Ne rien committer sans demande explicite.
