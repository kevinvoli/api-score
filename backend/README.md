# API SCORE — Backend

API NestJS (TypeScript) qui alimente le scanner d'opportunités de paris football
API SCORE : ingestion live des matchs (API-Football), calcul de signaux
(pression offensive, tirs cadrés), taux de base réels par championnat,
recommandations et coupons intelligents, backtest sur historique.

Voir `AVIS_PRONOSTIQUEUR.md` (racine du dépôt) pour le positionnement produit :
un détecteur d'opportunités mesuré par hit-rate et rappel, pas une plateforme
de value betting.

## Stack

- NestJS 10 / TypeScript
- TypeORM 0.3 + **MySQL 8** (pas PostgreSQL)
- `@nestjs/schedule` pour les jobs (sync live, résolution des coupons, purge)
- Jest pour les tests unitaires

## Démarrage

```bash
npm install
copy .env.example .env    # ou cp sur Linux/macOS — puis renseigner API_FOOTBALL_KEY, DB_URL, API_KEY
npm run db:migrate        # applique les migrations sur la base MySQL pointée par DB_URL
npm run start:dev         # démarre en watch mode sur le PORT défini (3010 par défaut)
```

Toutes les routes sont préfixées par `/v1` et protégées par une clé API
(header `x-api-key`, voir `API_KEY` dans `.env`), à l'exception des routes
explicitement marquées publiques (`@Public()`).

## Scripts utiles

| Commande | Effet |
|---|---|
| `npm run start:dev` | Démarre l'API en mode watch |
| `npm run build` | Build de production (`dist/`) |
| `npm run lint:check` | Lint strict (utilisé en CI, `--max-warnings=0`) |
| `npm test` | Suite de tests unitaires (Jest) |
| `npm run test:cov` | Tests avec couverture |
| `npm run db:migrate` | Applique les migrations TypeORM en attente |
| `npm run db:migrate:revert` | Annule la dernière migration |
| `npm run import:history` | Importe l'historique d'un championnat/saison (LOT 1) |

## Modules principaux (`src/`)

| Module | Rôle |
|---|---|
| `fixtures` | Ingestion live des matchs, scheduler, lecture (`/v1/live/fixtures`) |
| `provider-api-football` | Client HTTP centralisé vers API-Football (retry, circuit breaker, logs de quota) |
| `recommendations` | Règles de déclenchement (`rules-evaluator.ts`), suggestions et smart coupons |
| `settings` | Configuration des règles métier, persistée en base (`/v1/settings/smart-rules`) |
| `analytics` | Métriques par fixture et **taux de base réels** par championnat (`base-rates.*`) |
| `odds` | Ingestion et historisation des cotes (désactivée par défaut, `ODDS_SYNC_ENABLED=false`) |
| `history` | Import de l'historique par championnat (LOT 1) |
| `backtest` / `audit` | Moteur de rejeu sur l'historique et endpoints `/v1/audit/backtest` |
| `monitoring` | Health check et métriques (`/v1/health`, `/v1/metrics/*`) |
| `maintenance` | Purge planifiée (rétention configurable, voir `DATA_RETENTION_DAYS`) |

## Variables d'environnement clés

Voir `.env.example` pour la liste complète et validée (`src/config/env.validation.ts`).
À retenir particulièrement :

- `DB_URL` : chaîne de connexion **MySQL** (`mysql://user:pass@host:3306/db`).
- `DATA_RETENTION_DAYS` (défaut 1095, ~3 saisons) : rétention des matchs et de
  leurs statistiques — matière première des taux de base et du backtest.
  `PAYLOAD_RETENTION_DAYS` (défaut 90) ne concerne que les payloads bruts,
  volumineux et réimportables.
- `ODDS_SYNC_ENABLED` : désactivé par défaut. Le module Odds est fonctionnel
  mais secondaire pour un scanner (voir `AVIS_PRONOSTIQUEUR.md`).
- `API_KEY` : clé exigée sur les routes protégées (header `x-api-key`).

## Documentation complémentaire

- `docs/SCHEMA.md` — schéma de données de référence.
- `docs/RUNBOOK_MYSQL.md` — exploitation de la base.
- `../RAPPORT_PROJET.md`, `../AUDIT.md` — analyse technique du dépôt (juin 2026).
- `../PLAN_IMPLEMENTATION.md`, `../AVIS_PRONOSTIQUEUR.md` — plan produit et avis critique (juillet 2026).
- `../Rapport_API_SCORE_2026-08-30.docx`, `../PLAN_IMPLEMENTATION_2026-08-30.md` — état d'avancement et plan de finalisation (août 2026).
