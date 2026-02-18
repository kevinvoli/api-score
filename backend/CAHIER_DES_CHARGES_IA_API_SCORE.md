# Cahier des charges detaille - API SCORE

Version: 2.0
Date: 2026-02-12
References: `DOCUMENT_FONCTIONNEL_API_SCORE.md`, `FONCTIONNALITES.md`, `Systeme_Prediction_Football_Production.md`
Projet cible: backend NestJS TypeScript `api-score` (MySQL + TypeORM)

## 1. Objectif

Definir un cadre d'implementation precis pour une IA de codage afin de livrer, par etapes, un moteur de donnees live et de recommandations de paris football exploitable en production.

## 2. Regle de suivi obligatoire

Toutes les fonctionnalites de ce document doivent garder un statut explicite:
- `[DEJA REALISE]`
- `[A REALISER]`

En cas d'implementation d'une nouvelle fonctionnalite:
- marquer `[DEJA REALISE]` dans ce fichier
- reporter le meme changement dans `DOCUMENT_FONCTIONNEL_API_SCORE.md` et `FONCTIONNALITES.md`

## 3. Contraintes techniques imposees

- Langage: TypeScript
- Framework: NestJS 10+
- Runtime: Node.js 20+
- Base de donnees: MySQL 8+
- ORM: TypeORM
- Validation: class-validator + class-transformer
- Tests: Jest (unit, integration, e2e)
- Qualite: ESLint + Prettier

Contraintes non negociables:
- aucun secret en dur
- configuration validee au demarrage (fail-fast)
- logs JSON structures + traceId
- erreurs homogenes `{ code, message, details, traceId }`
- logique metier hors controllers

## 4. Etat actuel du produit

### 4.1 Socle technique
- `[DEJA REALISE]` Config env stricte
- `[DEJA REALISE]` Connexion MySQL via `DB_URL`
- `[DEJA REALISE]` TypeORM + migrations
- `[DEJA REALISE]` Logging JSON + redaction des secrets
- `[DEJA REALISE]` Trace ID global
- `[DEJA REALISE]` Filtre global d'erreurs

### 4.2 Ingestion et API live
- `[DEJA REALISE]` Connecteur API-Football centralise
- `[DEJA REALISE]` Sync fixtures live
- `[DEJA REALISE]` Sync events/stats/lineups/players
- `[DEJA REALISE]` Scheduler live + garde-fou quota
- `[DEJA REALISE]` Endpoints live de consultation (fixtures/detail/summary/segments)

### 4.3 Observabilite
- `[DEJA REALISE]` `GET /v1/health`
- `[DEJA REALISE]` `GET /v1/metrics/usage`
- `[A REALISER]` `GET /v1/metrics/pipeline`

## 5. Fonctionnalites a realiser (priorisees)

## Etape 1 - Stabilisation production (priorite P0)

Objectif: rendre l'existant robuste et mesurable avant extension metier.

- `[A REALISER]` Finaliser runbook MySQL (creation user/db, droits minimaux, backup)
- `[A REALISER]` Ajouter checks de readiness DB/provider dans `/v1/health`
- `[A REALISER]` Ajouter test e2e de migration + bootstrap
- `[A REALISER]` Documenter politique de reprise sur erreur scheduler
- `[A REALISER]` Ajouter seuils d'alerte sur taux d'erreurs provider

Critere de sortie Etape 1:
- migrations executes sans intervention manuelle
- health reflète etat DB + provider
- zero erreur bloquante sur 24h de run

## Etape 2 - Module Odds (priorite P0)

Objectif: introduire la variable prix, indispensable pour detecter la value.

### 2.1 Donnees et schema
- `[A REALISER]` Creer `odds_snapshots`
- `[A REALISER]` Creer `odds_market_lines`
- `[A REALISER]` Indexer `(fixture_id, captured_at)` et `(fixture_id, market_type, selection_key)`
- `[A REALISER]` Implementer idempotence sur snapshots odds

### 2.2 Ingestion
- `[A REALISER]` Integrer endpoints API-Football odds pre-match/live
- `[A REALISER]` Gerer indisponibilite bookmaker via fallback no-bet
- `[A REALISER]` Stocker drift court terme (1, 3, 5 snapshots)

### 2.3 Exposition
- `[A REALISER]` Endpoint lecture latest odds par fixture
- `[A REALISER]` Endpoint evolution cote (timeline compacte)

Critere de sortie Etape 2:
- odds live disponibles pour les fixtures suivies
- derivees `price_drift` exploitables par moteur de decision

## Etape 3 - Module Signaux & Recommandations (priorite P0)

Objectif: transformer donnees live + odds en recommandations actionnables.

### 3.1 Features et scoring
- `[A REALISER]` Calcul `danger_ratio`
- `[A REALISER]` Calcul `shot_pressure`
- `[A REALISER]` Calcul `on_target_ratio`
- `[A REALISER]` Calcul `corner_pressure_10m`
- `[A REALISER]` Calcul `goal_likelihood_score` (0-100)
- `[A REALISER]` Calcul `market_alignment_score` (0-100)
- `[A REALISER]` Calcul `confidence_score` (0-100)

### 3.2 Regles de publication
- `[A REALISER]` Regle publication `confidence >= 70`
- `[A REALISER]` Blocage si flags critiques (qualite faible, contexte rouge)
- `[A REALISER]` Generer `reasons[]` et `risk_flags[]` auditable

### 3.3 Persistance et API
- `[A REALISER]` Creer `signal_snapshots`
- `[A REALISER]` Creer `bet_recommendations`
- `[A REALISER]` `GET /v1/live/recommendations`
- `[A REALISER]` `GET /v1/live/recommendations/:id`

Critere de sortie Etape 3:
- recommandations live produites de facon stable
- chaque recommandation est explicable (raisons + risques + score)

## Etape 4 - Audit, settlement et performance (priorite P1)

Objectif: mesurer la qualite reelle des recommandations.

- `[A REALISER]` Enregistrer issue finale des paris (won/lost/void)
- `[A REALISER]` Calculer KPIs: hit-rate, ROI, yield, drawdown, CLV simple
- `[A REALISER]` `GET /v1/audit/recommendations`
- `[A REALISER]` `GET /v1/audit/recommendations/:id/outcome`
- `[A REALISER]` Job de settlement post-match

Critere de sortie Etape 4:
- historique auditable complet
- KPIs fiables sur periodes glissantes (7j, 30j)

## Etape 5 - Bankroll & risk management (priorite P1)

Objectif: encadrer la prise de risque pour un usage professionnel.

- `[A REALISER]` Mode stake fixe
- `[A REALISER]` Mode Kelly fractionnel borne
- `[A REALISER]` Limite d'exposition par ligue/marche
- `[A REALISER]` Coupe-circuit drawdown journalier
- `[A REALISER]` Raison explicite de refus de bet

Critere de sortie Etape 5:
- aucune recommandation sans taille de mise et garde-fous

## Etape 6 - Prediction engine avance (priorite P2)

Objectif: evoluer de l'heuristique vers un modele calibre.

- `[A REALISER]` Service de prediction dedie (module separe)
- `[A REALISER]` Fusion API-Football + signaux historiques internes
- `[A REALISER]` Calibration probabiliste periodique
- `[A REALISER]` Versionnement des modeles et tracabilite des sorties

Critere de sortie Etape 6:
- gain mesure vs baseline heuristique
- rollback modele possible en 1 action

## 6. Entites, champs et relations (cible)

### 6.1 Entites existantes
- `[DEJA REALISE]` `fixtures`
- `[DEJA REALISE]` `fixture_events`
- `[DEJA REALISE]` `fixture_stats_snapshots`
- `[DEJA REALISE]` `fixture_lineups`
- `[DEJA REALISE]` `fixture_player_stats_snapshots`
- `[DEJA REALISE]` `api_usage_logs`
- `[DEJA REALISE]` `app_runtime_state`

### 6.2 Entites a ajouter
- `[A REALISER]` `odds_snapshots`
  Champs minimum: `id`, `fixture_id`, `captured_at`, `bookmaker`, `market_type`, `selection_key`, `odd`, `created_at`
- `[A REALISER]` `signal_snapshots`
  Champs minimum: `id`, `fixture_id`, `captured_at`, `danger_ratio`, `shot_pressure`, `price_drift`, `confidence_score`, `risk_flags_json`
- `[A REALISER]` `bet_recommendations`
  Champs minimum: `id`, `fixture_id`, `created_at`, `market_type`, `selection`, `current_odd`, `min_acceptable_odd`, `value_edge_pct`, `stake_pct`, `status`
- `[A REALISER]` `bet_outcomes`
  Champs minimum: `id`, `recommendation_id`, `settled_at`, `result`, `pnl_unit`, `closing_odd`

### 6.3 Relations
- `[A REALISER]` `fixtures` 1-N `odds_snapshots`
- `[A REALISER]` `fixtures` 1-N `signal_snapshots`
- `[A REALISER]` `fixtures` 1-N `bet_recommendations`
- `[A REALISER]` `bet_recommendations` 1-1 `bet_outcomes`

## 7. Exigences API (contrat)

- `[DEJA REALISE]` Reponse JSON normalisee
- `[DEJA REALISE]` Format erreur unifie
- `[A REALISER]` Pagination standard sur endpoints volumineux
- `[A REALISER]` Filtrage par `leagueId`, `marketType`, `minConfidence`, `status`
- `[A REALISER]` Tri standard (`createdAt`, `confidence`, `edge`)

## 8. Exigences tests

- `[A REALISER]` Unit tests: formules de features et scoring
- `[A REALISER]` Integration: provider client (timeouts, 429, 5xx)
- `[A REALISER]` Integration: idempotence de snapshots
- `[A REALISER]` E2E: flux recommendation complet
- `[A REALISER]` Coverage minimal 80% sur modules `signals` et `recommendations`

## 9. Definition of Done globale

Une fonctionnalite passe de `[A REALISER]` a `[DEJA REALISE]` seulement si:
- code merge
- migration appliquee (si schema touche)
- tests associes verts
- endpoints verifies manuellement (ou e2e)
- documentation des 3 fichiers mise a jour

## 10. Prompt standard pour IA de codage

"Implementer uniquement le prochain lot prioritaire marque `[A REALISER]` dans `CAHIER_DES_CHARGES_IA_API_SCORE.md`.
Contraintes strictes: MySQL + TypeORM, aucun secret hardcode, architecture NestJS modulaire, tests obligatoires, logs JSON, erreurs homogenes.
A la fin: fournir fichiers modifies, migrations, tests, commandes de verification, et mettre a jour `DOCUMENT_FONCTIONNEL_API_SCORE.md` + `FONCTIONNALITES.md` + `CAHIER_DES_CHARGES_IA_API_SCORE.md` avec statuts."
