# Fonctionnalites du projet api-score

## Fonctionnalites existantes

- API NestJS demarree sur le port `3010` via `src/main.ts`.
- Endpoint `GET /` expose dans `src/app.controller.ts` qui retourne les matchs live via `AppService.getLives()`.
- Endpoint `GET /match/live` expose dans `src/match/match.controller.ts` qui:
  - recupere les matchs live depuis API-Football,
  - filtre les matchs selon des criteres statistiques par phase de jeu,
  - genere une liste de coupons avec un resume exploitable.
- Endpoint `POST /match` present (stub) dans `src/match/match.controller.ts`.
- Recuperation des matchs live avec timeout (30s) dans `MatchService.fetchLiveMatches()`.
- Filtrage des matchs non termines + verification de statistiques disponibles.
- Moteur de regles metier dans `MatchService.filterMatches()` base sur:
  - minute de jeu,
  - attaques / attaques dangereuses,
  - tirs cadres et non cadres,
  - seuils progressifs selon la periode du match,
  - cas speciaux (mi-temps, termine).
- Generation de coupons dans `MatchService.generateCoupons()` avec:
  - id match,
  - statut,
  - pays / ligue,
  - equipes,
  - score,
  - prediction (`But en premiere mi-temps`),
  - statistiques globales et 1re mi-temps.
- Base de tests initiale presente (unitaires + e2e), mais majoritairement minimale.

## Fonctionnalites a venir (prioritaires)

- Finaliser le CRUD `match`:
  - `GET /match/:id`,
  - `PATCH /match/:id`,
  - `DELETE /match/:id`,
  - persistance (DB) au lieu de retours statiques.
- Remplir `CreateMatchDto`, `UpdateMatchDto` et `Match` entity avec validation (`class-validator`).
- Externaliser les cles API en variables d'environnement (`.env`) et supprimer les secrets en dur du code.
- Normaliser les appels HTTP (choisir `fetch` ou `axios` de maniere coherente) et centraliser la couche API.
- Renforcer la robustesse:
  - gestion d'erreurs metier claire,
  - gestion de reponse vide ou schema inattendu,
  - logs structures.
- Aligner les tests avec le code actuel:
  - `AppController` ne retourne plus `Hello World`.
  - couvrir `GET /match/live` (mock API externe + cas limites du filtrage).
- Nettoyer le code non utilise / brouillon (`bus.txt`, imports inutilises, methodes non reliees si obsolete).
- Documenter l'API (README metier + exemples de reponse).

## Incoherences detectees pendant l'analyse

- `src/app.controller.ts` contient un double decorateur `@Get()` consecutif.
- Les tests `src/app.controller.spec.ts` et `test/app.e2e-spec.ts` attendent `Hello World!`, mais l'endpoint `/` a ete remplace par `getLives()`.
- Plusieurs elements sont des stubs (`create` retourne une chaine statique, DTO vides).

## Proposition de roadmap courte

1. Stabiliser l'existant (tests + correction endpoint `/`).
2. Securiser la configuration (cles API + env).
3. Completer CRUD et validation de donnees.
4. Ajouter documentation API et couverture de tests metier.
