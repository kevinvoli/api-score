# Audit Technique — api-score

**Date :** 2026-06-10  
**Projet :** `api-score` — backend NestJS 10 + TypeORM + MySQL 8  
**Répertoire :** `backend/src/`

---

> **Mise à jour du 31/08/2026 — cet audit date d'avant trois lots de travail,
> ne le lire qu'avec ce correctif en tête.** Depuis le 10/06, les lots
> suivants du plan de finalisation ont été livrés et vérifiés dans le code :
> rétention des données configurable (LOT 0), import de l'historique par
> championnat (LOT 1), taux de base réels remplaçant la confiance inventée
> section 12 ci-dessous (LOT 2), qualité du signal — `pressureIndex`/tirs
> cadrés et modulation au score (LOT 3). L'authentification par clé API
> (section 9, « CRITIQUE — Aucune authentification ») est également en place
> depuis, et la couverture de tests (section 10, « 0 % ») est passée à plus
> de 170 tests répartis sur 16 fichiers de specs. Le reste de ce document
> (structure, entités, endpoints, dettes techniques, bugs P1–P3 non cités
> ci-dessus) reste globalement valable en l'absence de ré-audit complet.
>
> Pour l'état d'avancement détaillé et le plan restant, voir
> `Rapport_API_SCORE_2026-08-30.docx` et `PLAN_IMPLEMENTATION_2026-08-30.md`
> à la racine du dépôt.


## 1. Structure du projet

14 modules NestJS enregistrés dans `AppModule` :

| Module | Rôle |
|---|---|
| `AppConfigModule` | Config globale (isGlobal: true) |
| `CommonModule` | Logger JSON, middleware, exception filter |
| `DatabaseModule` | TypeORM root config |
| `FixturesModule` | Ingestion live, scheduler, CRUD fixtures |
| `MatchModule` | Module legacy (contourne l'architecture) |
| `MonitoringModule` | Health check, métriques |
| `RecommendationsModule` | Suggestions et coupons de paris |
| `SettingsModule` | Configuration des règles métier |
| `MaintenanceModule` | Cron de nettoyage |
| `ArchiveModule` | Consultation des payloads archivés |
| `AnalyticsModule` | Calcul de métriques par fixture |
| `TeamsModule` | Lecture des équipes |
| `ScheduleModule` | @nestjs/schedule (crons) |
| `ProviderApiFootballModule` | Client HTTP vers l'API externe |

Arborescence `src/` :

```
src/
  analytics/
  archive/
  common/            filters/, middleware/
  config/
  database/          entities/ (14), migrations/ (14)
  fixtures/          dto/ (2)
  maintenance/
  match/             dto/ (2), entities/
  monitoring/
  provider-api-football/  services/
  recommendations/   dto/ (1)
  schemat/           livedata.ts  ← données hardcodées (code mort)
  scripts/           check-db-connection.ts, replay-provider-payloads.ts
  settings/
  teams/
  types/
```

---

## 2. Entités TypeORM (14 tables)

| Entité | Table | Clé naturelle | Points notables |
|---|---|---|---|
| `Fixture` | `fixtures` | `providerFixtureId` (bigint unique) | raw JSON, OneToMany events+stats |
| `FixtureEvent` | `fixture_events` | — | ManyToOne Fixture (CASCADE) |
| `FixtureStatsSnapshot` | `fixture_stats_snapshots` | — | snapshot horodaté, jamais écrasé |
| `FixtureLineup` | `fixture_lineups` | — | remplacé à chaque sync (delete+insert) |
| `FixturePlayerStatsSnapshot` | `fixture_player_stats_snapshots` | — | snapshot horodaté |
| `FixtureAnalytics` | `fixture_analytics` | — | calculé à la demande |
| `BetRecommendation` | `bet_recommendations` | — | ManyToOne Fixture (CASCADE), decimal transformer |
| `SmartCoupon` | `smart_coupons` | — | statuts PENDING/WON/LOST, resolvedAt |
| `Match` | `matches` | `fixtureId` (int unique) | entité legacy, scores en varchar |
| `League` | `leagues` | `leagueId` (int unique) | — |
| `Country` | `countries` | `countryId` (int unique) | — |
| `Team` | `teams` | `teamKey` (int unique) | venueXxx fields, raw JSON |
| `Standing` | `standings` | (`leagueId`, `teamKey`) | home/away W/D/L/GF/GA/PTS |
| `ApiUsageLog` | `api_usage_logs` | — | log HTTP provider |
| `ApiFootballPayload` | `api_football_payloads` | — | archive brute des réponses provider |
| `AppRuntimeState` | `app_runtime_state` | `key` (unique) | KV store pour config dynamique |

---

## 3. Endpoints API (préfixe global `/v1`)

### FixturesController — `/live/fixtures`
- `POST /live/fixtures/sync` — déclenche sync live + évaluation suggestions
- `GET /live/fixtures` — liste paginée (filtres : leagueId, statusShort, minElapsed, maxElapsed, teamId, page, limit, sortBy, sortOrder)
- `GET /live/fixtures/history` — historique (limit)
- `GET /live/fixtures/:fixtureId/events`
- `GET /live/fixtures/:fixtureId/lineups`
- `GET /live/fixtures/:fixtureId/players`
- `GET /live/fixtures/:fixtureId/stats/latest`
- `GET /live/fixtures/:fixtureId/summary` — fixture + momentum + dataQuality + confidence
- `GET /live/fixtures/:fixtureId/detail` — fixture + events + stats + lineups + playerStats

### ProviderController — `/provider`
- `GET /provider/countries?refresh=true`
- `GET /provider/leagues?countryId=&refresh=true`
- `GET /provider/teams?leagueId=&refresh=true`
- `GET /provider/matches?leagueId=&from=&to=` — toujours fresh (pas de cache DB)
- `GET /provider/standings?leagueId=`

### RecommendationsController — `/live/recommendations`
- `GET /live/recommendations` — paginé (filtres : fixtureId, status, page, limit)
- `GET /live/recommendations/smart` — suggestions calculées en temps réel
- `POST /live/recommendations/coupons/resolve` — force résolution PENDING
- `GET /live/recommendations/coupons` — historique (limit, offset)
- `GET /live/recommendations/:id` — recommandation par UUID

### SmartRulesController — `/settings/smart-rules`
- `GET /settings/smart-rules` — config courante des règles
- `PUT /settings/smart-rules` — mise à jour (persistée en DB via AppRuntimeState)

### MonitoringController
- `GET /health`
- `GET /metrics/usage`
- `GET /metrics/pipeline`

### AnalyticsController — `/analytics`
- `GET /analytics/fixtures/latest?limit=`
- `GET /analytics/fixtures/:fixtureId`
- `POST /analytics/fixtures/:fixtureId/recompute`
- `POST /analytics/fixtures/recompute-latest?limit=`

### TeamsController — `/teams`
- `GET /teams?leagueId=&limit=`
- `GET /teams/:teamKey`
- `GET /teams/:teamKey/full`

### ArchiveController — `/archive`
- `GET /archive/payloads` — paginé (filtres : endpoint, matchId, leagueId, teamId, from, to)

### MatchController — `/match` (legacy)
- `GET /match/live` — appel direct apifootball + filtrage maison + génération coupons
- `POST /match` — retourne la string "This action adds a new match" (stub mort)

---

## 4. Services — logique métier

### FixturesIngestionService
- `syncLiveFixtures()` : upsert fixture, upsert teams par league, remplace events, insère stats snapshots, remplace lineups, insère player stats snapshots. Invalide le cache in-memory à chaque sync.
- Cache in-memory (Map) configurable via `LIVE_READ_CACHE_TTL_MS`. TTL ≤ 0 désactive le cache.
- `getFixtureSummary()` : calcule `pressureIndex` (formule pondérée : dangerousAttacks×1.4 + onTarget×2 + corners×1.2 + attacks×0.15 - offTarget×0.4) et un score de confiance 0-100.
- `normalizeFixturePayload()` : gère les deux formats provider (api-sports et apifootball).

### FixturesSyncScheduler
- Intervalle dynamique via `LIVE_FIXTURES_SYNC_INTERVAL_MS`.
- Guard `isSyncRunning` pour éviter les chevauchements.
- Circuit-breaker maison : après N échecs consécutifs (`SCHEDULER_MAX_CONSECUTIVE_FAILURES`, défaut 5), passe en état `paused` pour `SCHEDULER_PAUSE_DURATION_MS` (défaut 5 min).
- Vérifie le budget de rate-limit avant chaque sync (`hasRateBudget()` : compte les appels de la dernière minute dans `api_usage_logs`).

### SmartSuggestionsService
- Règles configurables (1ère MT et 2ème MT) basées sur le nombre de tirs et le temps de jeu.
- `evaluateAndSave()` : calcule les suggestions, supprime les anciennes BetRecommendation NEW, réinsère, sauvegarde les nouveaux SmartCoupon PENDING, puis appelle toujours `resolveSettledCoupons()` en `finally`.
- `resolveSettledCoupons()` : charge tous les PENDING, résout WON/LOST selon le statut de la fixture et le score. Logique distincte pour chaque type de marché (1H, match entier, 2H).
- Cron `0 */2 * * * *` (toutes les 2 minutes) pour la résolution indépendante.

### SmartRulesConfigService
- Lit/écrit la configuration dans `AppRuntimeState` (clé `smart-rules-config`).
- Config par défaut codée en dur dans `DEFAULT_CONFIG` : 5 règles 1ère MT progressives, 1 règle 2ème MT.

### ApiFootballClient
- Supporte deux providers via `API_FOOTBALL_VENDOR` : `apisports` (défaut) et `apifootball`.
- Retry automatique sur 429 et 5xx avec back-off linéaire (250ms × attempt).
- Log chaque appel dans `api_usage_logs` et archive le payload brut dans `api_football_payloads`.

### MonitoringService
- Health check avec timeout 1500ms sur `SELECT 1`.
- Pipeline metrics sur une fenêtre glissante de 5 min.
- `notifyAlerts()` : stub vide avec TODO Slack/Email (non implémenté).

### CleanupService
- Cron `EVERY_DAY_AT_3AM` : supprime les payloads et fixtures de plus de 90 jours.

### AnalyticsService
- `recomputeFixture()` : calcule ~15 métriques (pressureIndex, possession, shots, onTarget, offTarget, corners, fouls, offsides, attacks, dangerousAttacks, xG, passes, cards, goals).

### MatchService (legacy)
- Fait un `fetch()` natif directement sur apifootball (contourne totalement `ApiFootballClient`).
- `filterMatches()` : logique de filtrage monolithique (180 lignes) avec seuils hardcodés.

---

## 5. Migrations (14)

| Fichier | Contenu |
|---|---|
| `20260212173000-init-lot1-monitoring-tables` | `api_usage_logs`, `app_runtime_state` |
| `20260212174000-init-lot2-fixtures-ingestion` | `fixtures`, `fixture_events`, `fixture_stats_snapshots` |
| `20260212182000-init-lot2-lineups-players` | `fixture_lineups`, `fixture_player_stats_snapshots` |
| `20260220120000-create-bet-recommendations` | `bet_recommendations` |
| `20260220121000-create-api-football-payloads` | `api_football_payloads` |
| `20260220122000-create-fixture-analytics` | `fixture_analytics` |
| `20260220123000-add-fixture-names` | Ajout colonnes noms équipes/league sur `fixtures` |
| `20260220124000-create-teams` | `teams` |
| `20260220125000-add-fixture-badges` | Ajout colonnes badges sur `fixtures` |
| `20260220126000-add-team-fields` | Ajout colonnes venue + raw sur `teams` |
| `20260220127000-create-countries-leagues` | `countries`, `leagues` |
| `20260220128000-create-matches` | `matches` |
| `20260225130000-update-leagues-matches-add-standings` | Ajout colonnes `leagues`, `matches` + `standings` |
| `20260306100000-create-smart-coupons` | `smart_coupons` |

---

## 6. Jobs / Schedulers

| Composant | Type | Fréquence | Action |
|---|---|---|---|
| `FixturesSyncScheduler` | `setInterval` dynamique | `LIVE_FIXTURES_SYNC_INTERVAL_MS` (min 10s) | syncLiveFixtures + evaluateAndSave |
| `SmartSuggestionsService.scheduledResolveCoupons` | `@Cron` | `0 */2 * * * *` (toutes les 2 min) | resolveSettledCoupons |
| `CleanupService.cleanupOldData` | `@Cron` | `EVERY_DAY_AT_3AM` | suppression données > 90 jours |

---

## 7. Configuration

### Variables validées (`env.validation.ts`)

| Variable | Type | Contraintes |
|---|---|---|
| `PORT` | int | 1–65535 |
| `NODE_ENV` | string | development / test / production |
| `DB_URL` | string | non vide |
| `API_FOOTBALL_BASE_URL` | string | non vide |
| `API_FOOTBALL_KEY` | string | non vide |
| `API_FOOTBALL_HOST` | string | non vide |
| `REQUEST_TIMEOUT_MS` | int | 1000–120000 |
| `RETRY_MAX` | int | 0–10 |
| `RATE_LIMIT_PER_MIN` | int | 1–5000 |
| `CORS_ENABLED` | 'true'/'false' | — |
| `CORS_ORIGIN` | string | optionnel |
| `LIVE_FIXTURES_SYNC_ENABLED` | 'true'/'false' | — |
| `LIVE_FIXTURES_SYNC_INTERVAL_MS` | int | 10000–300000 |
| `SYNC_RATE_LIMIT_HEADROOM_PCT` | int | 10–100 |
| `LIVE_READ_CACHE_TTL_MS` | int | 0–300000 |

### Variables NON validées (silencieuses si absentes)

| Variable | Défaut | Usage |
|---|---|---|
| `API_FOOTBALL_VENDOR` | `apisports` | Sélection du provider |
| `API_FOOTBALL_TIMEZONE` | — | Timezone pour apifootball |
| `SCHEDULER_MAX_CONSECUTIVE_FAILURES` | `5` | Circuit-breaker |
| `SCHEDULER_PAUSE_DURATION_MS` | `300000` | Durée de pause après erreurs |
| `ALERT_ERROR_RATE_PCT` | `20` | Seuil d'alerte erreurs |
| `ALERT_TIMEOUT_RATE_PCT` | `20` | Seuil d'alerte timeouts |
| `ALERT_QUOTA_REMAINING_MIN_PCT` | `10` | Seuil d'alerte quota |

---

## 8. Qualité du code

### Points positifs
- `ValidationPipe` global avec `whitelist: true, forbidNonWhitelisted: true, transform: true`
- Logger JSON structuré avec redaction des secrets (apiKey, token, password, db_url, etc.)
- Trace-ID propagé via `AsyncLocalStorage`
- Circuit-breaker maison dans le scheduler
- Guard de rate-limit budgétaire avant chaque sync
- `synchronize: false` partout, migrations uniquement
- Retry avec back-off linéaire sur le client HTTP

### Dettes techniques

**MatchModule non intégré** — `MatchService` fait un `fetch()` natif directement sur apifootball, contournant totalement `ApiFootballClient`. Ce module est une copie partielle et désynchronisée de la logique de `FixturesIngestionService`.

**Code mort — `src/schemat/livedata.ts`** — Constante `live` exportée (1 300 lignes de JSON hardcodé datant de décembre 2024), jamais importée par aucun module.

**Entité fantôme — `src/match/entities/match.entity.ts`** — Classe avec decorateurs `class-validator`, jamais utilisée comme entité TypeORM (`@Entity` absent), non importée par aucun module.

**Redondance `DatabaseModule`** — Liste explicitement les entités dans `entities: []` ET utilise `autoLoadEntities: true`. Les entités `Country`, `League`, `Match`, `Standing` sont absentes de la liste explicite mais chargées via `autoLoadEntities` — incohérence à risque.

**Absence de validation DTO** — `SmartRulesController.updateConfig(@Body() body: SmartRulesConfig)` : aucun DTO class-validator — n'importe quel JSON arbitraire est accepté et persisté en base.

**`MatchService.filterMatches()` monolithique** — 180 lignes avec seuils hardcodés et bug latent sur `tempsJeux` (voir section bugs).

---

## 9. Sécurité

### Points positifs
- `JsonLogger` rédacte les clés sensibles (`apiKey`, `x-rapidapi-key`, `token`, `password`, `db_url`)
- `ValidationPipe` global bloque les propriétés non déclarées
- Pas de SQL injection : QueryBuilder avec paramètres bindés, upsert TypeORM uniquement
- `AllExceptionsFilter` masque les détails d'erreur interne

### Risques identifiés

**CRITIQUE — Aucune authentification** — L'API est entièrement publique, y compris `PUT /settings/smart-rules` qui modifie les règles de prise de pari. N'importe qui peut altérer la configuration métier.

**MOYEN — Clé API exposée dans les paramètres URL** — Pour apifootball (`API_FOOTBALL_VENDOR=apifootball`), la clé est passée en query param (`APIkey=...`), visible dans les logs serveur et les proxies intermediaires. Le `JsonLogger` rédacte les objets structurés mais peut ne pas couvrir tous les contextes de log.

**MOYEN — Absence de validation sur `PUT /settings/smart-rules`** — Aucun DTO de validation sur `SmartRulesController.updateConfig()` : n'importe quel JSON est accepté et persisté en base, permettant d'injecter des valeurs incohérentes dans les règles de recommandation.

---

## 10. Tests

**Couverture : 0%**

Aucun fichier `.spec.ts` dans `backend/src/`. Le répertoire `test/` n'existe pas. Les scripts `npm run test:lot1` et `npm run test:lot2` référencent des fichiers qui n'existent pas. La CI ne peut pas valider les régressions.

---

## 11. Dépendances clés

| Package | Version | Usage |
|---|---|---|
| `@nestjs/common` / `core` / `platform-express` | ^10.0.0 | Framework |
| `@nestjs/typeorm` | ^11.0.0 | ORM |
| `typeorm` | ^0.3.27 | ORM |
| `mysql2` | ^3.17.0 | Driver MySQL |
| `@nestjs/schedule` | ^6.1.1 | Crons |
| `@nestjs/axios` | ^3.1.3 | HTTP client |
| `axios` | ^1.7.9 | HTTP |
| `class-validator` | ^0.14.3 | Validation DTOs |
| `class-transformer` | ^0.5.1 | Transformation |
| `rxjs` | ^7.8.1 | Streams Axios |

**Anomalie** : `"api-score": "file:"` dans les `dependencies` — auto-référence inutile.

---

## 12. Bugs identifiés

### BUG 1 — `tempsJeux` écrasé par une string (impact : filtrage des matchs silencieusement cassé)
**Fichier :** `backend/src/match/match.service.ts:76-77`  
`tempsJeux` est assigné conditionnellement (int parsé), puis immédiatement réassigné inconditionnellement avec `match.match_status` (string). Les comparaisons `> 0 && <= 10` reçoivent une string dans la plupart des cas.

### BUG 2 — Double `@CreateDateColumn` sur `ApiUsageLog`
**Fichier :** `backend/src/database/entities/api-usage-log.entity.ts:35-39`  
`calledAt` et `createdAt` sont tous deux décorés avec `@CreateDateColumn`. `calledAt` devrait être une `@Column` normale.

### BUG 3 — `tryResume()` retourne la mauvaise valeur sémantique
**Fichier :** `backend/src/fixtures/fixtures-sync.scheduler.ts:187`  
Retourne `false` après avoir réactivé le job (`jobState = 'active'`). L'intention sémantique (retourner `true` = "on vient de reprendre, skip ce tick") est inversée. Le comportement résultant est correct par coïncidence, mais la logique est trompeuse.

---

## 13. Duplications de code

| Code dupliqué | Occurrences | Candidat d'extraction |
|---|---|---|
| `computePressureIndex()` | `fixtures-ingestion.service.ts:858` + `analytics.service.ts:159` | `src/common/utils/stats.utils.ts` |
| `getStatValue()` | `fixtures-ingestion.service.ts:878` + `analytics.service.ts:179` | `src/common/utils/stats.utils.ts` |
| `toNumber()` | `fixtures-ingestion.service.ts:806` + `api-football.client.ts:841` + `analytics.service.ts:213` | `src/common/utils/coerce.utils.ts` |
| Pattern pagination (`page`, `limit`, `skip`) | 3 services | Classe `PaginationQueryDto` partagée |
| Liste des entités | `database.module.ts:23-35` + `data-source.ts:30-46` | Extraire dans un fichier `entities.ts` commun |

---

## 14. Incohérences architecturales

**Deux modèles de "match" coexistent** — `Match` (table `matches`, format apifootball, scores en varchar) et `Fixture` (table `fixtures`, format normalisé, scores en int). La logique de recommandation n'utilise que `Fixture`. `Match` est uniquement utilisé par `ProviderPersistenceService` pour l'historique.

**Dépendance circulaire implicite** — `FixturesModule` → `RecommendationsModule` → `ProviderApiFootballModule` → `SettingsModule`. Résolu par NestJS mais rend l'architecture difficile à maintenir.

**Variables d'environnement sans validation** — 7 variables opérationnelles importantes ne sont pas dans `env.validation.ts`, ce qui peut causer des comportements silencieusement incorrects en production (circuit-breaker inactif, alertes muettes, etc.).

---

## 15. Résumé des priorités

| Priorité | Problème | Fichier |
|---|---|---|
| P0 | Aucune authentification sur l'API | Tous les controllers |
| P0 | Couverture de tests = 0% | `backend/src/` |
| P1 | Bug `tempsJeux` string vs int | `match.service.ts:76-77` |
| P1 | Absence de validation DTO sur `PUT /settings/smart-rules` | `smart-rules.controller.ts` |
| P1 | Variables d'env non validées (7) | `env.validation.ts` |
| P2 | `toNumber()` copié 3 fois | 3 fichiers |
| P2 | `computePressureIndex()` / `getStatValue()` dupliqués | 2 fichiers |
| P2 | `MatchModule` contourne `ApiFootballClient` | `match.service.ts` |
| P3 | Code mort (`schemat/livedata.ts`, `match.entity.ts`) | 2 fichiers |
| P3 | `notifyAlerts()` non implémenté | `monitoring.service.ts` |
| P3 | Auto-référence dans `package.json` | `package.json` |
