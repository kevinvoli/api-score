# Roadmap de finalisation — API SCORE

*Établie le 24 juin 2026 — séquençage : prouver la valeur avant de construire la complexité.*

## Principe directeur

On inverse la roadmap intuitive. Plutôt que de construire d'abord le moteur ML, on pose d'abord les briques qui permettent de **mesurer** si une stratégie est rentable : les cotes réelles, puis le backtest. Le ML n'arrive qu'une fois qu'on peut prouver qu'il bat les heuristiques actuelles. Chaque phase se termine par un critère de sortie mesurable.

Ordre des phases : **Odds → Backtest/Mesure → Modèle Poisson calibré → Auth & durcissement prod → ML avancé & optimisation coupons.**

---

## Phase 0 — Mise à plat (1 semaine)

Objectif : verrouiller le socle existant avant d'empiler du neuf.

- [ ] Geler le périmètre actuel : checklist de ce qui marche réellement (lancer les suites de tests lot1/lot2, vérifier la sync live de bout en bout).
- [ ] Documenter le schéma de données actuel (entités + relations) dans un seul fichier de référence.
- [ ] Mettre en place CI minimale (GitHub Actions : lint + tests sur chaque PR) si absente.
- [ ] Créer un environnement de staging isolé de ta machine de dev (DB dédiée, `.env` séparé).

**Critère de sortie :** build vert en CI, sync live fonctionnelle en staging, schéma documenté.

---

## Phase 1 — Module Odds (2–3 semaines) ⭐ priorité absolue

Objectif : ingérer et historiser les cotes réelles. Sans ça, aucun edge n'est calculable.

- [ ] Choisir la source : odds d'API-Football (déjà sous contrat) en priorité, The Odds API en complément si besoin de profondeur bookmakers.
- [ ] Créer l'entité `odds_market` (fixture_id, bookmaker, market_type, odd_value, implied_probability, captured_at) + migration.
- [ ] Étendre le client provider pour l'endpoint `/odds` (pré-match et live).
- [ ] Service d'ingestion des cotes + scheduler (cadence différenciée pré-match / live), réutiliser le garde-fou quota existant.
- [ ] Calcul de la probabilité implicite (avec retrait de la marge bookmaker / overround).
- [ ] Snapshots horodatés pour suivre le *drift* de marché.
- [ ] Endpoints de lecture `GET /v1/odds/fixtures/:id` + tests.

**Critère de sortie :** pour un match donné, on récupère l'historique des cotes et la probabilité implicite nette de marge.

---

## Phase 2 — Backtest & mesure (2–3 semaines) ⭐ le cœur décisionnel

Objectif : pouvoir rejouer une stratégie sur l'historique et sortir des KPIs honnêtes. C'est ce qui transforme le projet en plateforme de décision.

- [ ] Définir le format d'une « stratégie » (règles d'entrée, marché, seuil d'edge, seuil de confiance, staking).
- [ ] Moteur de backtest s'appuyant sur les payloads archivés + le script de rejeu existant.
- [ ] Calcul des KPIs : ROI, hit-rate, yield par marché, drawdown max, nombre de paris, edge moyen réalisé.
- [ ] Gérer les biais clés : utiliser la cote *disponible au moment de la décision* (pas la cote finale), modéliser la latence d'exécution, exclure le look-ahead.
- [ ] Entité `bet_results` pour historiser les résultats résolus (tu as déjà la résolution auto des smart coupons — la réutiliser).
- [ ] Endpoints `GET /v1/audit/backtest` + page front Audit branchée sur de vraies données.

**Critère de sortie :** on backteste les règles heuristiques actuelles sur l'historique et on obtient un ROI/hit-rate chiffré. On a enfin une référence (*baseline*) à battre.

---

## Phase 3 — Modèle Poisson calibré (3–4 semaines)

Objectif : un premier vrai modèle probabiliste, simple, mesurable contre la baseline.

- [ ] Feature engineering minimal : différence Elo (ou rating maison), moyenne buts marqués/encaissés glissante, forme domicile/extérieur, jours de repos.
- [ ] Entité `team_metrics` (elo_rating, attack_index, defense_index, form_index) + job de mise à jour périodique.
- [ ] Modèle Poisson ajusté produisant probabilités 1X2 / Over-Under / BTTS + buts attendus.
- [ ] Entité `match_predictions` (probas, expected goals, model_version, confidence).
- [ ] Calibration des probabilités (isotonic regression ou Platt scaling) — plus important que la complexité du modèle.
- [ ] Implémenter au départ dans une lib appelée par le backend NestJS (pas de microservice Python séparé pour l'instant).
- [ ] Détection de value bet réelle : edge = proba_modèle − proba_implicite, conditions edge ≥ 5 % et confiance ≥ 70 %.
- [ ] Backtester le Poisson vs la baseline heuristique.

**Critère de sortie :** le Poisson calibré est mesuré contre les heuristiques. On garde celui qui gagne, prouvé par le backtest.

---

## Phase 4 — Auth & durcissement production (1–2 semaines)

Objectif : rendre l'API déployable hors de la machine de dev. Bloquant avant tout usage réel.

- [ ] Authentification de l'API interne (API key au minimum, JWT si multi-utilisateurs) — le guard existe déjà partiellement, le finaliser.
- [ ] Rate limiting sur les endpoints exposés.
- [ ] Secrets externalisés proprement (variables d'env / vault), aucun secret en clair.
- [ ] Alerting Slack/Email réel (remplacer le hook stub existant).
- [ ] Backup quotidien de la base + procédure de restauration testée.
- [ ] Health checks et logs prêts pour la prod.

**Critère de sortie :** API authentifiée, secrets sécurisés, alerting réel, backups en place.

---

## Phase 5 — Gestion du risque & coupons (2–3 semaines)

Objectif : transformer les value bets en sélections exploitables avec discipline de mise.

- [ ] Staking : Kelly fractionnel (0.25), plafond d'exposition par championnat, stop-loss journalier, max % de bankroll actif.
- [ ] Optimiseur de coupons : combinaisons ≤ 4 sélections, contrôle de corrélation inter-matchs, simulation Monte Carlo (10 000 itérations) pour maximiser l'espérance.
- [ ] Brancher la page Coupons et le builder front sur ce moteur.
- [ ] Backtester les coupons optimisés vs paris simples.

**Critère de sortie :** génération de coupons avec staking discipliné, performance mesurée en backtest.

---

## Phase 6 — ML avancé & itération continue (en continu, après validation)

Objectif : pousser la performance seulement si les phases précédentes prouvent que le concept tient.

- [ ] Gradient Boosting (XGBoost) pour 1X2 / Over 2.5 / BTTS, puis ensemble pondéré avec le Poisson.
- [ ] Si la charge le justifie : extraire un service Prediction Engine en Python/FastAPI.
- [ ] Sources complémentaires : xG (SportMonks), météo (OpenWeather), impact blessures pondéré.
- [ ] Recalibrage continu et versioning des modèles (model_version déjà prévu).
- [ ] Observabilité métier : dashboard Prometheus/Grafana branché, KPIs en temps réel.

**Critère de sortie :** l'ensemble ML bat le Poisson seul en backtest *et* sur une période de validation hors échantillon.

---

## Vue d'ensemble du séquençage

| Phase | Livrable clé | Durée indicative | Bloquant pour |
|-------|--------------|------------------|----------------|
| 0 | Socle gelé + CI | 1 sem | tout le reste |
| 1 | Module Odds | 2–3 sem | calcul d'edge |
| 2 | Backtest & KPIs | 2–3 sem | toute décision modèle |
| 3 | Poisson calibré | 3–4 sem | value betting réel |
| 4 | Auth & prod | 1–2 sem | mise en prod |
| 5 | Risque & coupons | 2–3 sem | exploitation |
| 6 | ML avancé | continu | performance |

Estimation globale jusqu'à une v1 exploitable et mesurée : **~3 à 4 mois** à un rythme soutenu, les phases 4 et 5 pouvant se paralléliser partiellement.

## Règles à garder en tête

- **Ne jamais avancer d'une phase sans son critère de sortie.** La discipline de mesure est ce qui distingue ce projet d'un pari sur le hasard.
- **Méfiance backtest :** un ROI positif en simulation se traduit rarement tel quel en réel (surapprentissage, latence, cotes qui bougent). Valide toujours sur une période hors échantillon.
- **Résiste à l'over-engineering :** microservices, Redis et Kubernetes seulement quand un besoin réel et mesuré le justifie.
- Ceci est une direction d'architecture logicielle, pas un conseil financier ni une incitation à miser de l'argent réel.
