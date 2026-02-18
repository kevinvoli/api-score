# DOCUMENT FONCTIONNEL - API SCORE (mise a jour)

Version: 1.1
Date: 2026-02-12
Sources: `Systeme_Prediction_Football_Production.md`, `API_FOOTBALL_PARIS_PRO.md`, implementation actuelle du code.

## Regle de suivi (obligatoire)

A partir de maintenant, chaque fonctionnalite doit etre marquee:
- `[DEJA REALISE]` si implementee
- `[A REALISER]` si non implementee

## 1) Cible produit (vision production)

[DEJA REALISE] Base backend NestJS modulaire en place.
[A REALISER] Plateforme multi-services complete (Gateway + Prediction Engine + Coupon Optimizer + Risk Service).
[A REALISER] Consolidation multi-sources complete (API-Football + odds + xG + meteo).
[A REALISER] Modeles ML production (Poisson ajuste, boosting, ensemble, calibration).
[A REALISER] Detection value bet + optimiseur de coupons en production.
[A REALISER] Monitoring metier avance (ROI, drawdown, hit-rate, yield par marche).

## 2) Architecture fonctionnelle

[DEJA REALISE] Module `config` (validation stricte env).
[DEJA REALISE] Module `database` TypeORM + migrations.
[DEJA REALISE] Module `provider-api-football` (client centralise, retry, logs usage).
[DEJA REALISE] Module `fixtures` (ingestion live + endpoints de lecture).
[DEJA REALISE] Module `monitoring` (`/v1/health` enrichi DB+provider, `/v1/metrics/usage`, `/v1/metrics/pipeline`).
[DEJA REALISE] Middleware trace-id + logs JSON + filtre d'erreurs global.
[A REALISER] Module `odds` complet (pre-match/live + analyse drift).
[A REALISER] Module `predictions` (fusion provider + modele interne).
[A REALISER] Module `recommendations` (selection, edge, stake).
[A REALISER] Module `audit/backtest` complet.

## 3) Donnees et entites

[DEJA REALISE] `api_usage_logs`.
[DEJA REALISE] `app_runtime_state`.
[DEJA REALISE] `fixtures`.
[DEJA REALISE] `fixture_events`.
[DEJA REALISE] `fixture_stats_snapshots`.
[DEJA REALISE] `fixture_lineups`.
[DEJA REALISE] `fixture_player_stats_snapshots`.
[A REALISER] Entites metier avancees (`odds_market`, `match_predictions`, `value_bets`, `bet_recommendations`, `team_metrics`).

## 4) Ingestion live

[DEJA REALISE] Sync live fixtures via API-Football.
[DEJA REALISE] Ingestion events par fixture.
[DEJA REALISE] Ingestion statistics par fixture.
[DEJA REALISE] Ingestion lineups par fixture.
[DEJA REALISE] Ingestion players par fixture.
[DEJA REALISE] Scheduler live avec garde-fou quota/rate-limit + circuit breaker (pause/resume automatique).
[A REALISER] Priorisation de sync par importance match/league.
[A REALISER] Strategie de re-sync differenciee par phase de match.

## 5) API interne exposee

[DEJA REALISE] `GET /v1/health` (checks DB + provider, latency_ms, timestamp_utc)
[DEJA REALISE] `GET /v1/metrics/usage`
[DEJA REALISE] `GET /v1/metrics/pipeline` (fenetre glissante 5min, alertes actives)
[DEJA REALISE] `POST /v1/live/fixtures/sync`
[DEJA REALISE] `GET /v1/live/fixtures` (pagination + filtres + tri)
[DEJA REALISE] `GET /v1/live/fixtures/:fixtureId/events`
[DEJA REALISE] `GET /v1/live/fixtures/:fixtureId/lineups`
[DEJA REALISE] `GET /v1/live/fixtures/:fixtureId/players`
[DEJA REALISE] `GET /v1/live/fixtures/:fixtureId/stats/latest`
[DEJA REALISE] `GET /v1/live/fixtures/:fixtureId/summary`
[DEJA REALISE] `GET /v1/live/fixtures/:fixtureId/detail`
[A REALISER] `GET /v1/live/recommendations`
[A REALISER] `GET /v1/live/recommendations/:id`
[A REALISER] `GET /v1/audit/recommendations`

## 6) Qualite, securite, observabilite

[DEJA REALISE] Validation env stricte.
[DEJA REALISE] Cles API externalisees (plus de hardcode secret).
[DEJA REALISE] Logs JSON avec redaction des donnees sensibles.
[DEJA REALISE] Format erreur unifie `{ code, message, details, traceId }`.
[DEJA REALISE] Cache lecture live TTL configurable + invalidation post-sync.
[A REALISER] AuthN/AuthZ API interne.
[A REALISER] Dashboard Prometheus/Grafana branche.
[DEJA REALISE] Alerting metier en memoire (erreurs 5xx, timeouts, quota bas) avec hook stub Slack/Email.
[A REALISER] Alerting Slack/Email (integration reelle).

## 7) Regles metier summary (etat actuel)

[DEJA REALISE] Calcul `momentum` (home/away pressure index).
[DEJA REALISE] `dataQuality.flags` (stats/lineups/players manquants + stale data).
[DEJA REALISE] `confidence` (0-100) derive de qualite/fraicheur/coherence.
[A REALISER] Calibration statistique de `confidence` sur historique reel.
[A REALISER] Passage de regles heuristiques a modele probabiliste calibre.

## 8) Roadmap priorisee

1. [DEJA REALISE] Finaliser migration MySQL sur environnement cible (runbook + smoke tests).
2. [A REALISER] Ajouter module odds (ingestion, snapshots, derivees prix).
3. [A REALISER] Ajouter moteur recommandations + edge + stake management.
4. [A REALISER] Ajouter audit/backtest + KPIs ROI/drawdown/hit-rate.
5. [A REALISER] Ajouter prediction engine ML (service dedie) et calibration continue.
