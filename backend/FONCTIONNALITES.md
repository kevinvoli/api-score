# FONCTIONNALITES - API SCORE (tracking)

Date: 2026-02-12
Convention:
- `[DEJA REALISE]` = implemente dans le code
- `[A REALISER]` = non implemente

## Backend & socle

[DEJA REALISE] Runbook MySQL (creation DB/user, droits minimaux, migrations)
[DEJA REALISE] Script check-db-connection.ts (exit 0/1)
[DEJA REALISE] Tests e2e bootstrap (env valide / DB_URL absent / API_FOOTBALL_KEY absent)
[DEJA REALISE] Config env stricte
[DEJA REALISE] TypeORM + migrations
[DEJA REALISE] Base MySQL (driver mysql2, config mysql)
[DEJA REALISE] Logs JSON structures
[DEJA REALISE] Trace ID global
[DEJA REALISE] Filtre global d'erreurs
[DEJA REALISE] Redaction des donnees sensibles dans logs

## Monitoring

[DEJA REALISE] `GET /v1/health` (DB check + provider check enrichis, latency_ms, timestamp_utc)
[DEJA REALISE] `GET /v1/metrics/usage`
[DEJA REALISE] `GET /v1/metrics/pipeline` (fenetre glissante 5min, taux erreurs/timeouts, quota, alertes)

## Provider API-Football

[DEJA REALISE] Client HTTP centralise
[DEJA REALISE] Retry basique (429/5xx)
[DEJA REALISE] Logging de consommation API
[DEJA REALISE] Endpoints provider utilises: fixtures, events, statistics, lineups, players
[DEJA REALISE] Gestion avancee des erreurs provider/circuit breaker (pause/resume, logs d'etat)

## Ingestion Live

[DEJA REALISE] Sync live fixtures
[DEJA REALISE] Sync events
[DEJA REALISE] Sync stats
[DEJA REALISE] Sync lineups
[DEJA REALISE] Sync players
[DEJA REALISE] Scheduler de sync live
[DEJA REALISE] Garde-fou quota/rate-limit
[A REALISER] Strategie multi-frequence par type de donnees

## Endpoints Live

[DEJA REALISE] `POST /v1/live/fixtures/sync`
[DEJA REALISE] `GET /v1/live/fixtures` (filtres + tri + pagination)
[DEJA REALISE] `GET /v1/live/fixtures/:fixtureId/events`
[DEJA REALISE] `GET /v1/live/fixtures/:fixtureId/lineups`
[DEJA REALISE] `GET /v1/live/fixtures/:fixtureId/players`
[DEJA REALISE] `GET /v1/live/fixtures/:fixtureId/stats/latest`
[DEJA REALISE] `GET /v1/live/fixtures/:fixtureId/summary`
[DEJA REALISE] `GET /v1/live/fixtures/:fixtureId/detail`

## Intelligence metier (actuel)

[DEJA REALISE] Summary avec momentum home/away
[DEJA REALISE] Data quality flags
[DEJA REALISE] Score de confiance (0-100)
[DEJA REALISE] Cache lecture TTL configurable + invalidation post-sync
[A REALISER] Recommendations de paris live
[A REALISER] Detection value bet
[A REALISER] Gestion de bankroll/stake (Kelly fractionnel)

## Prochaines fonctionnalites ciblees

[A REALISER] Module odds complet
[A REALISER] Module predictions/modeles
[A REALISER] Module recommendations
[A REALISER] Module audit/backtest
[A REALISER] KPIs metier (ROI, drawdown, hit-rate)
[A REALISER] Exposition API securisee (auth)
