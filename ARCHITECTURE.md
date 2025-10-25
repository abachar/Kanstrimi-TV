# Architecture Kanstrimi TV

## Vue d'ensemble

Kanstrimi TV utilise une **architecture Feature-Based** pour organiser le code de manière modulaire et scalable. Cette approche favorise la cohésion forte au sein des features et un couplage faible entre elles.

## 📁 Structure du projet
```
ProjectName/
├── Features/
│   ├── Movies/
│   │   ├── Views/
│   │   │   ├── MoviesListView.swift
│   │   │   └── MovieDetailView.swift
│   │   ├── Models/
│   │   │   └── Movie.swift
│   │   └── Components/
│   │       ├── MovieCard.swift
│   │       └── MoviePoster.swift
│   └── Settings/
│       ├── Views/
│       ├── Models/
│       └── Components/
├── Shared/
│   ├── Players/         # AVPlayer / VLCPlayer
│   ├── Services/        # Services singletons
│   ├── Extensions/      # Extensions Swift
│   └── Xtream/          # Encapsulation complète de la logique du protocole Xtream Codes
├── Resources/
│   ├── Assets.xcassets
│   └── Localizable.strings
├── README.md
├── ARCHITECTURE.md
└── CHANGELOG.md
```