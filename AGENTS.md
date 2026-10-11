# AGENTS.md

Ce fichier décrit la structure, les commandes et les conventions à respecter dans le dépôt API SCORE.

## Objet du projet

API SCORE est un scanner d'opportunités de paris football. Il ingère les données live d'API-Football, calcule des signaux et des taux de base par championnat, produit des recommandations et permet de les évaluer par backtest. Le produit est un outil de mesure et d'aide à la décision, pas encore un système autorisé à placer des paris réels.

## Structure du dépôt

```text
backend/                 — API NestJS 10, TypeORM 0.3, MySQL 8, port 3010 par défaut
  src/
    analytics/           — métriques de fixtures et taux de base
    archive/             — consultation des payloads fournisseur archivés
    audit/               — endpoints de lancement et lecture des backtests
    backtest/            — rejeu chronologique et calcul des KPI
    common/              — garde API, journalisation, filtres, middleware et utilitaires partagés
    config/              — chargement et validation des variables d'environnement
    database/            — DataSource, entités et migrations TypeORM
    fixtures/            — ingestion, synchronisation et lecture des matchs
    history/             — import des données historiques
    maintenance/         — purge selon les durées de rétention
    monitoring/          — health check et métriques d'exploitation
    odds/                — ingestion et historisation des cotes
    provider-api-football/ — client HTTP unique vers API-Football
    recommendations/     — règles, recommandations et coupons simulés
    settings/            — configuration persistée des règles métier
    teams/               — lecture des équipes
front/                   — Next.js 14 App Router, React 18, port 3000 par défaut
  app/                   — pages, layout et providers globaux
  components/            — composants React et CSS Modules associés
  lib/api/               — fonctions d'accès à l'API
  lib/hooks/             — hooks TanStack Query
  lib/state/             — état local Zustand
  lib/types/             — contrats TypeScript du frontend
.github/workflows/ci.yml — CI backend sur les PR et les push vers master
```

Les documents produit et les plans de chantier sont à la racine. Le schéma et le runbook MySQL se trouvent dans `backend/docs/`.

## Prérequis et gestionnaires de paquets

- Node.js 22 est la version de référence de la CI. Minimums déclarés dans `engines` : backend Node.js ≥ 20.19 (Node.js 18 n'est plus maintenu), front Node.js ≥ 22.12 (exigé par Vitest 5 et Vite 8).
- MySQL 8 est l'unique base de données.
- Utiliser `npm` dans `backend/` (`package-lock.json`).
- Utiliser `pnpm` dans `front/` (`pnpm-lock.yaml`).

## Commandes

### Backend (`backend/`)

```bash
npm ci                              # installation reproductible
npm run start:dev                   # API en watch mode
npm run build                       # build NestJS dans dist/
npm run lint:check                  # lint sans modification, commande de CI
npm test                            # tests Jest
npm test -- --runInBand             # tests séquentiels
npm run test:cov                    # couverture Jest
npm run db:migrate                  # applique les migrations en attente
npm run db:migrate:revert           # annule la dernière migration
npm run typeorm -- migration:generate src/database/migrations/<timestamp>-<nom>
npm run import:history              # importe un historique championnat/saison
npm run persist:provider            # rejoue et persiste des payloads fournisseur
```

Ne pas lancer `npm run lint` : ce script porte `--fix` et réécrit les fichiers. Utiliser `npm run lint:check`.

### Frontend (`front/`)

```bash
pnpm install --frozen-lockfile       # installation reproductible
pnpm dev                             # serveur Next.js local
pnpm build                           # build de production
pnpm lint                            # lint Next.js
pnpm storybook                       # Storybook sur le port 6006
pnpm build-storybook                 # build statique Storybook
```

## Architecture

### Flux principaux

1. Les schedulers de `fixtures/` et `odds/` appellent le client centralisé `provider-api-football/`.
2. Les payloads bruts et les journaux de quota sont archivés, puis l'ingestion normalise les fixtures, équipes, événements, compositions, statistiques et cotes dans MySQL.
3. `analytics/` calcule les métriques par fixture et les taux de base historiques.
4. `recommendations/` évalue les règles sur les données disponibles, enregistre les recommandations et les coupons simulés, puis résout leurs résultats après le match.
5. `backtest/` rejoue l'historique dans l'ordre chronologique ; `audit/` expose le lancement et les résultats.
6. Le frontend appelle les routes `/v1/*` via `front/lib/api/client.ts`, TanStack Query gère l'état serveur et Zustand l'état d'interface.

Toutes les routes backend ont le préfixe `/v1`. Le garde global exige le header `x-api-key`, sauf sur les handlers explicitement marqués `@Public()`.

### Modules backend principaux

| Module | Responsabilité |
|---|---|
| `fixtures` | Synchronisation live, persistance et lecture détaillée des matchs |
| `provider-api-football` | Appels fournisseur, retry, circuit breaker et suivi des quotas |
| `analytics` | Statistiques dérivées et taux de base |
| `recommendations` | Évaluation des règles, suggestions et coupons simulés |
| `odds` | Snapshots de cotes pré-match et live |
| `backtest` / `audit` | Rejeu historique, KPI et API d'audit |
| `monitoring` | Santé de l'application et métriques du pipeline |
| `maintenance` | Nettoyage planifié des données expirées |

### Entités et tables clés

| Entité | Table | Rôle |
|---|---|---|
| `Fixture` | `fixtures` | Match normalisé et état live courant |
| `FixtureEvent` | `fixture_events` | Événements d'un match |
| `FixtureLineup` | `fixture_lineups` | Compositions |
| `FixtureStatsSnapshot` | `fixture_stats_snapshots` | Statistiques d'équipe horodatées |
| `FixturePlayerStatsSnapshot` | `fixture_player_stats_snapshots` | Statistiques joueur horodatées |
| `OddsSnapshot` | `odds_snapshots` | Cote observée, bookmaker, marché, phase et instant de capture |
| `FixtureAnalytics` | `fixture_analytics` | Métriques dérivées d'une fixture |
| `BaseRate` | `base_rates` | Taux de référence par contexte et signal |
| `BetRecommendation` | `bet_recommendations` | Décision/recommandation issue des règles |
| `SmartCoupon` | `smart_coupons` | Coupon simulé et résultat résolu |
| `BacktestRun` | `backtest_runs` | Configuration, état et synthèse d'un backtest |
| `BetResult` | `bet_results` | Décision individuelle d'un backtest |
| `ApiFootballPayload` | `api_football_payloads` | Payload fournisseur brut archivé |
| `ApiUsageLog` | `api_usage_logs` | Consommation, latence et résultat des appels fournisseur |
| `AppRuntimeState` | `app_runtime_state` | État persistant clé/valeur de l'application |
| `Country`, `League`, `Team`, `Standing`, `Match` | tables homonymes en snake_case | Référentiel fournisseur et classement |

### Base de données

- Une seule base MySQL 8 est utilisée en lecture et en écriture via `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD` et `MYSQL_DATABASE`.
- `synchronize: false` est obligatoire : toute évolution du schéma passe par une migration.
- `backend/src/database/data-source.ts` est le DataSource de la CLI TypeORM.
- `backend/src/database/entities/index.ts` expose `ALL_ENTITIES`. Toute nouvelle entité doit y être ajoutée.
- Les migrations sont ordonnées par timestamp dans `backend/src/database/migrations/` et doivent avoir un `up` et un `down` cohérents.

## Conventions backend et TypeORM

- Code NestJS organisé par domaine : module, contrôleur, service, DTO et tests colocalisés.
- Valider les entrées externes avec des DTO `class-validator`. Le `ValidationPipe` global transforme les valeurs, supprime les champs inconnus et les refuse avec `forbidNonWhitelisted`.
- Injecter les repositories avec `TypeOrmModule.forFeature` et `@InjectRepository` ; ne pas créer de connexion parallèle.
- Tables, index et contraintes en `snake_case`; propriétés TypeScript et colonnes historiques en `camelCase`. Respecter la convention du module touché au lieu de renommer mécaniquement l'existant.
- Les identifiants internes sont généralement des UUID ; conserver séparément les identifiants du fournisseur.
- Les colonnes décimales TypeORM/MySQL peuvent être retournées comme chaînes : convertir explicitement à la frontière métier sans perdre de précision.
- Utiliser `upsert`, une contrainte unique ou une transaction pour les chemins concurrents/idempotents. Un `find` suivi d'un `save` ne constitue pas une protection anti-doublon.
- Ne jamais effectuer une requête SQL/ORM dans une boucle quand une lecture ou écriture groupée est possible.
- Toujours utiliser les paramètres liés de TypeORM/QueryBuilder ; aucune concaténation de valeurs dans une clause SQL.
- Les tests unitaires portent le suffixe `.spec.ts` et résident près du fichier testé.
- Aucun nouveau `any`. Employer `unknown`, des types dédiés et des gardes de type.
- Les commentaires sont réservés au pourquoi non évident.

## Conventions frontend

- Next.js 14 utilise l'App Router sous `front/app/` et TypeScript strict.
- Les composants réutilisables vivent dans `front/components/<nom>/` avec leur fichier `*.module.css` associé.
- Les appels HTTP sont définis dans `front/lib/api/`; les pages et composants passent par les hooks de `front/lib/hooks/` plutôt que d'appeler `fetch` directement.
- TanStack Query gère les données distantes et leurs invalidations. Zustand est réservé à l'état local d'interface et au constructeur de coupon.
- Les contrats API frontend vivent dans `front/lib/types/` ou au plus près du module API lorsqu'ils sont strictement locaux.
- Afficher les dates avec la locale `fr-FR`. Les échanges API utilisent des chaînes ISO ; le format `YYYY-MM-DD` n'est utilisé que pour les paramètres date sans heure.
- Représenter une valeur absente par `null` ou `undefined` selon le contrat API, sans valeur fictive silencieuse.
- Aucun nouveau `any`. Les payloads fournisseur non fiables commencent en `unknown` puis sont validés ou affinés.
- Ne pas dupliquer les helpers, types ou clés de requête : scanner `front/lib/` et les composants existants avant toute création.

## Variables d'environnement

Copier les fichiers d'exemple localement ; ne jamais commiter les fichiers `.env`.

### Backend (`backend/.env`)

Variables obligatoires validées au démarrage :

```text
PORT
NODE_ENV
MYSQL_HOST
MYSQL_PORT
MYSQL_USER
MYSQL_DATABASE
API_FOOTBALL_BASE_URL
API_FOOTBALL_KEY
API_FOOTBALL_HOST
REQUEST_TIMEOUT_MS
RETRY_MAX
RATE_LIMIT_PER_MIN
CORS_ENABLED
LIVE_FIXTURES_SYNC_ENABLED
LIVE_FIXTURES_SYNC_INTERVAL_MS
SYNC_RATE_LIMIT_HEADROOM_PCT
LIVE_READ_CACHE_TTL_MS
API_KEY
```

Variables optionnelles/configurables :

```text
MYSQL_PASSWORD
CORS_ORIGIN
SIMULATION_SCHEDULER_ENABLED
SIMULATION_TICK_INTERVAL_MS
API_FOOTBALL_VENDOR
API_FOOTBALL_TIMEZONE
SCHEDULER_MAX_CONSECUTIVE_FAILURES
SCHEDULER_PAUSE_DURATION_MS
ALERT_ERROR_RATE_PCT
ALERT_TIMEOUT_RATE_PCT
ALERT_QUOTA_REMAINING_MIN_PCT
SLACK_ALERT_WEBHOOK_URL
ODDS_SYNC_ENABLED
ODDS_PREMATCH_SYNC_INTERVAL_MS
ODDS_LIVE_SYNC_INTERVAL_MS
DATA_RETENTION_DAYS
PAYLOAD_RETENTION_DAYS
```

`MYSQL_PASSWORD` est optionnel : absente ou vide, la connexion se fait sans mot de passe (base locale de dev) ; renseignée, elle est transmise à l'API, à la CLI TypeORM et à `check-db-connection`. Une valeur composée uniquement d'espaces est refusée. Toute base partagée ou de production doit avoir un mot de passe.

`DATA_RETENTION_DAYS` ne doit pas descendre sous 365 jours. Sa valeur par défaut est 1095 jours afin de conserver la matière première analytique. `PAYLOAD_RETENTION_DAYS` vaut 90 jours par défaut.

### Frontend (`front/.env.local`)

```text
NEXT_PUBLIC_API_BASE_URL
NEXT_PUBLIC_API_KEY
```

`NEXT_PUBLIC_API_KEY` décrit l'état actuel mais n'est pas un secret : Next.js l'intègre au bundle navigateur. Elle ne doit jamais autoriser une opération sensible ou une mise. La cible de sécurité est un BFF/routes serveur Next.js avec secret côté serveur et authentification de session ; ne pas reproduire cette clé dans un nouveau code client.

## Vérifications avant livraison

- Backend : `npm run lint:check`, `npm run build`, puis les specs concernées ou `npm test`.
- Frontend : `pnpm lint` et `pnpm build`.
- Une migration doit être vérifiée dans les deux sens et ne jamais dépendre de `synchronize`.
- Tout nouveau contrat entre frontend et backend doit être aligné des deux côtés et tester au minimum le cas nominal, les données absentes et les entrées invalides.
- Ne pas commiter, créer de branche ou merger automatiquement.

## Points d'attention métier

- Une cote manquante ou périmée doit provoquer une décision non exécutable ; ne jamais la remplacer par une cote fictive dans une validation ou une simulation destinée à mesurer la performance.
- Les backtests doivent respecter l'ordre temporel et ne consommer que les informations disponibles à l'instant de décision.
- Les schedulers et imports doivent être idempotents et tolérer les retries sans produire de doublons.
- Toute future exécution réelle doit être désactivée par défaut, dotée d'une clé d'idempotence, d'un reçu opérateur, d'une réconciliation, de plafonds atomiques et d'un arrêt manuel/automatique persistant. Se référer à `PLAN_EXECUTION_PARIS.md`.
- Ne pas réduire la rétention des fixtures et snapshots sans mesurer l'impact sur les taux de base et le backtest.

## Règles de sécurité

### Entrées externes

- Valider les paramètres, query strings et corps avec des DTO backend.
- Considérer les payloads API-Football et les réponses d'un opérateur comme non fiables.
- Borner pagination, plages temporelles, montants et fréquences d'appel.
- Ne jamais interpoler une entrée utilisateur dans du SQL, une commande shell ou du HTML.

### Secrets et journalisation

- Ne jamais retourner ni journaliser `API_FOOTBALL_KEY`, `API_KEY`, `MYSQL_PASSWORD`, les webhooks, jetons de session ou identifiants opérateur.
- Les variables `NEXT_PUBLIC_*` sont publiques par définition.
- Conserver les secrets backend uniquement côté serveur et utiliser le principe du moindre privilège pour l'utilisateur MySQL.
- Les logs structurés doivent conserver le `traceId`, le statut et la latence, sans payload sensible complet.

## Documentation de référence

- `backend/README.md` — démarrage, modules et commandes backend.
- `backend/docs/SCHEMA.md` — schéma de données.
- `backend/docs/RUNBOOK_MYSQL.md` — installation et exploitation MySQL.
- `FRONT_API_CONTRACTS.md` — contrats consommés par le frontend.
- `AVIS_PRONOSTIQUEUR.md` — positionnement du produit.
- `PLAN_EXECUTION_PARIS.md`, `SUIVI_EXECUTION_PARIS.md`, `BACKLOG_EXECUTION_PARIS.md` — chantier de sécurisation, simulation et exécution bornée.
