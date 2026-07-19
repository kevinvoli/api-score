# Rapport projet — API SCORE

*Analyse du dépôt `api-score` — 24 juin 2026*

## En une phrase

API SCORE est une plateforme de **prédiction football et de génération de paris assistée** : elle collecte des données de matchs en temps réel via API-Football, les stocke et les analyse, puis produit des recommandations de paris (« value bets ») et des coupons intelligents, le tout exposé dans un dashboard web.

## Pourquoi ce projet existe

L'objectif produit, décrit dans `Systeme_Prediction_Football_Production.md`, est de bâtir une plateforme « industrielle » capable de détecter automatiquement les inefficiences du marché des paris sportifs et d'en tirer un rendement positif sur le long terme (ROI cible 5–10 %).

La logique métier repose sur une idée simple : un bookmaker fixe des cotes qui impliquent une probabilité ; si le modèle interne estime une probabilité plus élevée que celle impliquée par la cote, l'écart (l'*edge*) représente une opportunité de pari à valeur positive. Le système cherche ces écarts en continu, surtout pendant les matchs en direct, applique des règles de confiance et de gestion du risque, puis assemble des sélections en coupons optimisés.

Le projet est structuré et suivi de façon rigoureuse : chaque fonctionnalité des documents fonctionnels est marquée `[DEJA REALISE]` ou `[A REALISER]`, et le travail est découpé en « lots » successifs (socle/monitoring, ingestion live, puis recommandations, odds, backtest, ML).

## Architecture

Le dépôt est un monorepo à deux briques :

**Backend (`/backend`)** — API en NestJS / TypeScript, base de données MySQL via TypeORM (avec migrations versionnées). Il est organisé en modules : `config` (validation stricte des variables d'environnement), `database`, `provider-api-football` (client HTTP centralisé vers API-Football avec retry, logs de consommation et circuit breaker), `fixtures` (ingestion live et lecture), `analytics`, `recommendations`, `settings` (règles métier configurables), `monitoring` et `maintenance`. Observabilité soignée : logs JSON structurés, trace-id global, filtre d'erreurs unifié `{ code, message, details, traceId }`, et rédaction des données sensibles.

**Frontend (`/front`)** — dashboard Next.js 14 / React avec React Query et Zustand. Pages : live, recommandations, coupons, analytics, championnats, audit et paramètres. Composants dédiés (cartes de match live, panneau de détail, builder de coupon, etc.) plus un UI kit documenté sous Storybook.

La cible long terme (non encore atteinte) est une architecture microservices : API Gateway NestJS + moteur de prédiction en Python/FastAPI + services Odds, Coupon Optimizer et Risk Management, avec Redis, Prometheus/Grafana et déploiement conteneurisé.

## Fonctionnalités déjà réalisées

**Ingestion temps réel.** Synchronisation des matchs en direct depuis API-Football, avec ingestion des événements, statistiques, compositions (lineups) et stats joueurs par match. Un scheduler gère la cadence avec garde-fou quota/rate-limit et circuit breaker (pause/reprise automatiques).

**API interne de lecture.** Endpoints `GET /v1/live/fixtures` (pagination, filtres par ligue/équipe/statut/temps écoulé, tri), plus détail par match : events, lineups, players, dernières stats, summary et detail. Cache de lecture à TTL configurable, invalidé après chaque sync.

**Intelligence métier (heuristique).** Calcul d'un indice de momentum domicile/extérieur, des *data quality flags* (données manquantes ou périmées) et d'un score de confiance 0–100 dérivé de la qualité, de la fraîcheur et de la cohérence des données.

**Recommandations et coupons.** Un service de *smart suggestions* analyse les matchs live selon des règles configurables (marchés buts 1re/2e mi-temps et match), calcule un edge et une cote minimale acceptable, attache des raisons et des drapeaux de risque, et génère des recommandations ainsi que des *smart coupons* avec résolution automatique du résultat (gagné/perdu/void selon le statut final du match).

**Monitoring.** `GET /v1/health` (checks DB + provider, latence), `GET /v1/metrics/usage` et `GET /v1/metrics/pipeline` (fenêtre glissante 5 min, taux d'erreurs/timeouts, quota, alertes). Alerting métier en mémoire avec hook stub Slack/Email.

**Qualité.** Tests unitaires et e2e organisés par lot, runbook MySQL, scripts utilitaires (vérification de connexion DB, rejeu des payloads provider).

## Ce qui reste à faire (vision cible)

Les documents fonctionnels listent encore comme `[A REALISER]` : un module *odds* complet (cotes pré-match et live, analyse du drift de marché), un véritable moteur de prédiction ML (Poisson ajusté, gradient boosting, ensemble avec probabilités calibrées) en remplacement des heuristiques actuelles, l'optimisation des coupons par simulation Monte Carlo, la gestion de bankroll (Kelly fractionnel, stop-loss, limites d'exposition), un module audit/backtest avec KPIs métier (ROI, drawdown, hit-rate, yield par marché), l'authentification de l'API interne, et le branchement réel de l'alerting et des dashboards Prometheus/Grafana.

## Lecture d'ensemble

Le socle est solide et professionnel : ingestion live fiable, observabilité, base de données structurée et un premier étage de recommandations/coupons fonctionnel basé sur des règles. Le cœur différenciant promis par la vision — modèles ML calibrés, intégration des cotes réelles, value betting et backtest mesuré — reste largement devant. Le projet est aujourd'hui à mi-chemin entre un agrégateur de données live très propre et la plateforme de prédiction complète visée.
