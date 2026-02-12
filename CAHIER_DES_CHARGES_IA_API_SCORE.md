# Cahier des charges detaille - Implementation par IA de codage

Version: 1.0
Date: 2026-02-12
Reference principale: `DOCUMENT_FONCTIONNEL_API_SCORE.md`
Projet cible: NestJS TypeScript `api-score`

## 1. Objectif du cahier des charges

Fournir une specification actionnable pour une IA de codage afin de livrer un backend complet de signaux/recommandations paris live football base sur API-FOOTBALL v3.

Ce document est ecrit pour execution technique, avec exigences testables.

## 2. Contraintes de realisation

- Langage: TypeScript
- Framework: NestJS 10+
- Runtime: Node.js 20+
- Base de donnees: PostgreSQL 15+
- ORM recommande: Prisma (ou TypeORM si impose)
- Validation: class-validator + class-transformer
- HTTP provider: Axios via HttpModule Nest
- Tests: Jest (unit + integration + e2e)
- Lint/format: ESLint + Prettier

Contraintes obligatoires:
- Aucune cle API en dur.
- Configuration via env + schema de validation.
- Logs structures JSON.
- Code modulaire, testable, sans logique metier en controller.

## 3. Perimetre fonctionnel a coder

Inclus:
- Ingestion live fixtures/statistics/events/odds/predictions/injuries (selon coverage).
- Moteur de signaux v1 et recommandations.
- API interne `/v1/live/*`, `/v1/audit/*`, `/v1/metrics/*`.
- Persistance snapshots + audit + outcomes.
- Monitoring quota/latence/provider errors.

Exclus (v1):
- UI front.
- ML complexe.
- multi-provider federation.

## 4. Architecture cible a implementer

Arborescence cible:
- `src/modules/config`
- `src/modules/provider-api-football`
- `src/modules/coverage`
- `src/modules/fixtures`
- `src/modules/statistics`
- `src/modules/odds`
- `src/modules/predictions`
- `src/modules/signals`
- `src/modules/recommendations`
- `src/modules/audit`
- `src/modules/monitoring`
- `src/common` (errors, dto base, utils, interceptors)

Patterns:
- Services metier purs.
- Repository/data access couchee.
- DTO explicites input/output.
- Mappers provider -> domaine interne.

## 5. Modeles de donnees (minimum a creer)

Tables minimales:
- `countries`
- `leagues`
- `seasons`
- `teams`
- `venues`
- `fixtures`
- `scores`
- `events`
- `team_stats_snapshots`
- `odds_snapshots`
- `prediction_snapshots`
- `injury_reports`
- `signal_snapshots`
- `bet_recommendations`
- `api_usage_logs`

Exigences DB:
- index sur `fixtures.status`, `fixtures.date_utc`, `signal_snapshots.confidence_score`, `odds_snapshots.snapshot_at`.
- contraintes d unicite sur couples metier (ex: fixture_id + snapshot_at + team_id + half).
- colonnes `created_at`, `updated_at` sur tables principales.

## 6. Endpoints internes a livrer

## 6.1 Health/metrics
- `GET /v1/health`
- `GET /v1/metrics/usage`
- `GET /v1/metrics/pipeline`

## 6.2 Live fixtures
- `GET /v1/live/fixtures`
  - query: `leagueId?`, `country?`, `minConfidence?`, `marketType?`, `page?`, `limit?`

- `GET /v1/live/fixtures/:fixtureId`

## 6.3 Recommendations
- `GET /v1/live/recommendations`
  - query: `marketType?`, `minConfidence?`, `sort?`, `page?`, `limit?`

- `GET /v1/live/recommendations/:id`

## 6.4 Audit
- `GET /v1/audit/recommendations`
- `GET /v1/audit/recommendations/:id/outcome`

API contract:
- reponses JSON versionnees.
- format erreur unique: `{ code, message, details, traceId }`.

## 7. Connecteur API-FOOTBALL - exigences detaillees

A coder dans `provider-api-football`:
- client HTTP centralise avec:
  - timeout configurable,
  - retry exponentiel pour 429/5xx,
  - gestion rate-limit headers,
  - logs request/response sanitizes.

Fonctions minimales:
- `fetchLiveFixtures()`
- `fetchFixturesByIds(ids: number[])`
- `fetchFixtureEvents(fixtureId)`
- `fetchFixtureStatistics(fixtureId, half?)`
- `fetchFixtureLineups(fixtureId)`
- `fetchFixturePlayers(fixtureId)`
- `fetchOddsLive(fixtureId?)`
- `fetchOddsPrematch(fixtureId/date/league)`
- `fetchPredictions(fixtureId)`
- `fetchInjuries(teamId/league/season)`
- `fetchLeaguesCoverage()`

## 8. Moteur de signaux - specifications calcul

Variables obligatoires:
- `danger_ratio`
- `shot_pressure`
- `on_target_ratio`
- `corner_pressure_10m`
- `price_drift`

Scores obligatoires:
- `goal_likelihood_score` (0..100)
- `market_alignment_score` (0..100)
- `confidence_score` (0..100)

Politique de decision v1:
- publier recommandation si `confidence_score >= 70`.
- bloquer si `risk_flags` contient `LOW_DATA_QUALITY` ou `RED_CARD_AGAINST_SIGNAL`.

Sortie recommandation obligatoire:
- `market_type`
- `selection`
- `current_odd`
- `min_acceptable_odd`
- `value_edge_pct`
- `reasons[]`
- `risk_flags[]`

## 9. Scheduler et frequence

A implementer via `@nestjs/schedule`:
- job `live-fixtures` toutes 15-30 sec (selon plan).
- job `live-stats` toutes 60 sec.
- job `odds-live` toutes 30-60 sec.
- job `coverage-refresh` 1 fois/jour.
- job `settlement` post-match toutes 10 min.

Le scheduler doit s auto-throttler selon quota restant.

## 10. Securite et configuration

Variables env minimales:
- `PORT`
- `NODE_ENV`
- `DB_URL`
- `API_FOOTBALL_BASE_URL`
- `API_FOOTBALL_KEY`
- `API_FOOTBALL_HOST`
- `REQUEST_TIMEOUT_MS`
- `RETRY_MAX`
- `RATE_LIMIT_PER_MIN`

A coder:
- module config avec validation Joi/Zod.
- bootstrap qui echoue si env invalide.

## 11. Observabilite

A fournir:
- correlation id middleware.
- logs JSON (niveau info/warn/error).
- metriques: calls provider, latence p95, erreurs 4xx/5xx, recommendations/min.
- endpoint interne metrics agreges.

## 12. Tests obligatoires

## 12.1 Unit tests
- calcul `danger_ratio`, `shot_pressure`, `price_drift`.
- scoring et decision publication.
- mapping provider payload -> entites internes.

## 12.2 Integration tests
- provider client avec mocks HTTP (success, timeout, 429, 500).
- persistence snapshots et idempotence.

## 12.3 E2E tests
- `GET /v1/live/recommendations` retourne contrat valide.
- filtres query fonctionnent.
- gestion erreurs standardisee.

Seuil de qualite:
- coverage tests >= 80% sur modules `signals` et `recommendations`.

## 13. Plan de livraison par lots

Lot 1 - Fondations techniques:
- config/env, db, logging, error handling, health.

Lot 2 - Provider + fixtures:
- client API-FOOTBALL, ingestion fixtures/events/stats, persistence.

Lot 3 - Signals v1:
- feature engineering, scoring, raisons/risques.

Lot 4 - Recommendations + API:
- endpoints live/audit + pagination/filtres.

Lot 5 - Odds/predictions/injuries:
- enrichissements et price alignment.

Lot 6 - Monitoring + hardening:
- metrics, quota guard, tests complets, documentation technique.

## 14. Definition of Done (DoD)

Une livraison est acceptee si:
- tous endpoints du lot repondent au contrat,
- tests unit/integration/e2e passent en CI,
- aucune cle secrete en code,
- logs et metriques disponibles,
- documentation de module mise a jour,
- changelog lot fourni.

## 15. Prompt de production pour IA de codage (copiable)

"Tu implementes le projet NestJS selon `DOCUMENT_FONCTIONNEL_API_SCORE.md` et ce cahier des charges.
Respecte strictement:
1) architecture modulaire,
2) zero secret hardcode,
3) contrats API definis,
4) tests obligatoires,
5) logs/metrics.
Travaille par lots numerotes (Lot 1 -> Lot 6).
A la fin de chaque lot, fournis:
- fichiers modifies,
- migrations DB,
- tests ajoutes,
- commandes de verification,
- limites connues.
N implemente pas de fonctionnalite hors perimetre sans section explicite `Out of Scope`.
"

## 16. Risques projet et mitigation

Risque 1: quotas insuffisants
- Mitigation: coverage gate + cache + polling adaptatif.

Risque 2: heterogeneite des ligues
- Mitigation: seuils par ligue et fallback no-bet.

Risque 3: sur-optimisme des regles
- Mitigation: backtest, calibration, suivi CLV.

Risque 4: dette technique rapide
- Mitigation: lots courts, tests stricts, revues de schema.

## 17. Livrables attendus finaux

- Code backend NestJS modulaire.
- Schema DB + migrations.
- Tests automatiques.
- Documentation API interne (OpenAPI).
- Runbook exploitation (quota, incidents provider, reprocessing).
