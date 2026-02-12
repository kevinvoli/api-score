# Document fonctionnel - API Score (API-FOOTBALL v3)

Version: 1.0
Date: 2026-02-12
Perimetre: refonte fonctionnelle de `api-score` pour un moteur de signaux live et recommandations de paris football.
Base: `API_FOOTBALL_PARIS_PRO.md` + documentation officielle API-FOOTBALL/API-SPORTS.

## 1. Objectif produit

Construire une API backend qui:
- collecte les donnees live/pre-match API-FOOTBALL,
- qualifie la fiabilite des matchs (coverage + qualite data),
- calcule des signaux statistiques interpretable pour parieurs experimentes,
- genere des recommandations structurees (coupon/signal) avec confiance et explication,
- expose ces resultats via endpoints internes stables.

## 2. Sources externes et hypothese d integration

## 2.1 API provider

Provider principal:
- API-FOOTBALL / API-SPORTS v3

Host cible recommande:
- `https://v3.football.api-sports.io`

Headers:
- `x-rapidapi-key` ou cle API-SPORTS selon canal d abonnement
- `x-rapidapi-host: v3.football.api-sports.io` (si usage RapidAPI)

## 2.2 Endpoints externes cibles (module par module)

Discovery/metadata:
- `GET /countries`
- `GET /leagues`
- `GET /seasons`
- `GET /teams`

Match live/history:
- `GET /fixtures`
- `GET /fixtures?live=all` (ou equivalent selon doc live du plan)
- `GET /fixtures?ids=...` (bulk ids, max 20 ids par call selon tutoriel officiel)
- `GET /fixtures/events`
- `GET /fixtures/lineups`
- `GET /fixtures/statistics`
- `GET /fixtures/players`

Performance/contexte:
- `GET /standings`
- `GET /teams/statistics`
- `GET /injuries`
- `GET /predictions`

Prix marche:
- `GET /odds`
- `GET /odds/live`
- `GET /odds/bookmakers`
- `GET /odds/bets`
- `GET /odds/live/bets`

Note importante:
- La page `documentation-v3` est dynamique. Les signatures exactes (parametres obligatoires, noms de filtres) doivent etre confirmees dans le dashboard live au moment du codage.

## 3. Vision metier

## 3.1 Personas

- Trader/parieur experimente (10+ ans): veut des signaux rapides, explicables, compares au prix live.
- Analyste data betting: veut auditer les regles, backtester, suivre calibration.
- Operateur produit: veut surveiller quota API, latence et erreurs.

## 3.2 Cas d usage cle

1. Recuperer les matchs live avec data exploitable.
2. Calculer des scores de pression offensive et de probabilite de but court terme.
3. Confronter ce signal aux cotes live pour detecter value/no-value.
4. Exposer une liste priorisee de recommandations.
5. Journaliser toutes les decisions pour audit/backtest.

## 4. Modules fonctionnels

## 4.1 Module A - Ingestion API-FOOTBALL

Responsabilites:
- Appeler endpoints externes.
- Gerer retry, timeout, rate-limit, circuit breaker.
- Normaliser la reponse provider vers schema interne.

Entrees:
- cle API
- filtres (league, season, date, live)

Sorties:
- objets normalises (`Fixture`, `Event`, `TeamStatsSnapshot`, etc.)

## 4.2 Module B - Coverage & Eligibility

Responsabilites:
- Verifier la couverture des competitions (statistics, odds, lineups, predictions, injuries).
- Exclure les matchs insuffisamment couverts.

Regle:
- Un match est `ELIGIBLE` si coverage mini atteint.

## 4.3 Module C - Feature Engineering Live

Responsabilites:
- Construire variables derivees:
  - `danger_ratio = dangerous_attacks / attacks`
  - `shot_pressure = (on_target + off_target) / minutes`
  - `territorial_pressure = corners_delta_10m`
  - `price_drift` (variation cotes)
- Segmenter par phase (`first_half`, `second_half`, `late_game`).

## 4.4 Module D - Scoring & Rules Engine

Responsabilites:
- Appliquer regles metier versionnees.
- Calculer:
  - `goal_likelihood_score` (0..100)
  - `market_alignment_score` (0..100)
  - `confidence_score` (0..100)
- Produire raisons explicites (`reasons[]`).

## 4.5 Module E - Recommendation Engine

Responsabilites:
- Mapper les signaux vers marches (Next Goal, Over live, BTTS live, corners live).
- Appliquer filtres de risque.
- Sortir recommandations ordonnees.

## 4.6 Module F - Persistence & Audit

Responsabilites:
- Stocker snapshots de data, signaux, recommandations et resultats.
- Permettre backtest et audit post-match.

## 4.7 Module G - API interne (consommation front/clients)

Responsabilites:
- Exposer endpoints lisibles et stables.
- Fournir pagination, filtres, health, metrics.

## 4.8 Module H - Monitoring & Quota

Responsabilites:
- Suivre consommation quota/jour et rate/min.
- Alerter en cas de depassement imminent.

## 5. Entites fonctionnelles, champs et relations

## 5.1 Entites coeur

### 1) Country
Champs:
- `id` (number)
- `name` (string)
- `code` (string?)
- `flag_url` (string?)

Relations:
- 1 Country -> N Leagues
- 1 Country -> N Teams

### 2) League
Champs:
- `id` (number)
- `name` (string)
- `type` (string: league/cup)
- `logo_url` (string?)
- `country_id` (fk)

Relations:
- 1 League -> N Seasons
- 1 League -> N Fixtures
- 1 League -> 1 CoverageProfile (par season)

### 3) Season
Champs:
- `id` (uuid interne)
- `league_id` (fk)
- `year` (number)
- `start_date` (date)
- `end_date` (date)
- `current` (boolean)

Relations:
- 1 Season -> N Fixtures
- 1 Season -> N TeamSeasonStats

### 4) Team
Champs:
- `id` (number)
- `name` (string)
- `code` (string?)
- `country_id` (fk)
- `founded` (number?)
- `logo_url` (string?)

Relations:
- 1 Team -> N FixtureParticipant
- 1 Team -> N TeamSeasonStats
- 1 Team -> N InjuryReport

### 5) Venue
Champs:
- `id` (number)
- `name` (string)
- `city` (string?)
- `capacity` (number?)
- `surface` (string?)

Relations:
- 1 Venue -> N Fixtures

### 6) Fixture
Champs:
- `id` (number)
- `referee` (string?)
- `timezone` (string)
- `date_utc` (datetime)
- `timestamp` (number)
- `status_short` (string)
- `status_long` (string)
- `elapsed` (number?)
- `extra_minute` (number?)
- `league_id` (fk)
- `season_id` (fk)
- `venue_id` (fk)
- `home_team_id` (fk)
- `away_team_id` (fk)

Relations:
- 1 Fixture -> 1 Score
- 1 Fixture -> N Event
- 1 Fixture -> N TeamStatsSnapshot
- 1 Fixture -> N Lineup
- 1 Fixture -> N PlayerStatsSnapshot
- 1 Fixture -> N OddsSnapshot
- 1 Fixture -> N PredictionSnapshot
- 1 Fixture -> N SignalSnapshot
- 1 Fixture -> N BetRecommendation

### 7) Score
Champs:
- `fixture_id` (pk/fk)
- `home` (number)
- `away` (number)
- `halftime_home` (number?)
- `halftime_away` (number?)
- `fulltime_home` (number?)
- `fulltime_away` (number?)
- `extratime_home` (number?)
- `extratime_away` (number?)
- `penalty_home` (number?)
- `penalty_away` (number?)

Relations:
- 1 Score <-> 1 Fixture

### 8) Event
Champs:
- `id` (uuid interne)
- `fixture_id` (fk)
- `team_id` (fk?)
- `player_id` (number?)
- `assist_player_id` (number?)
- `minute` (number)
- `extra` (number?)
- `type` (string: Goal/Card/Subst/...)
- `detail` (string)
- `comments` (string?)

Relations:
- N Event -> 1 Fixture

### 9) TeamStatsSnapshot
Champs:
- `id` (uuid)
- `fixture_id` (fk)
- `team_id` (fk)
- `half` (enum: full, first, second)
- `elapsed` (number)
- `attacks` (number?)
- `dangerous_attacks` (number?)
- `shots_on_target` (number?)
- `shots_off_target` (number?)
- `shots_total` (number?)
- `shots_inside_box` (number?)
- `shots_outside_box` (number?)
- `corners` (number?)
- `possession_pct` (number?)
- `fouls` (number?)
- `yellow_cards` (number?)
- `red_cards` (number?)
- `xg` (number?)
- `provider_raw` (jsonb)
- `snapshot_at` (datetime)

Relations:
- N TeamStatsSnapshot -> 1 Fixture
- N TeamStatsSnapshot -> 1 Team

### 10) Lineup
Champs:
- `id` (uuid)
- `fixture_id` (fk)
- `team_id` (fk)
- `formation` (string?)
- `coach_id` (number?)
- `start_xi` (jsonb)
- `substitutes` (jsonb)
- `snapshot_at` (datetime)

Relations:
- N Lineup -> 1 Fixture
- N Lineup -> 1 Team

### 11) PlayerStatsSnapshot
Champs:
- `id` (uuid)
- `fixture_id` (fk)
- `team_id` (fk)
- `player_id` (number)
- `minutes` (number?)
- `rating` (number?)
- `shots_total` (number?)
- `shots_on` (number?)
- `goals` (number?)
- `assists` (number?)
- `passes_accuracy_pct` (number?)
- `duels_won` (number?)
- `tackles` (number?)
- `provider_raw` (jsonb)
- `snapshot_at` (datetime)

Relations:
- N PlayerStatsSnapshot -> 1 Fixture
- N PlayerStatsSnapshot -> 1 Team

### 12) InjuryReport
Champs:
- `id` (uuid)
- `team_id` (fk)
- `player_id` (number)
- `fixture_id` (fk?)
- `league_id` (fk?)
- `season` (number)
- `type` (string)
- `reason` (string?)
- `start_date` (date?)
- `expected_return_date` (date?)
- `source_updated_at` (datetime)

Relations:
- N InjuryReport -> 1 Team
- N InjuryReport -> 0..1 Fixture

### 13) OddsSnapshot
Champs:
- `id` (uuid)
- `fixture_id` (fk)
- `is_live` (boolean)
- `bookmaker_id` (number)
- `bookmaker_name` (string)
- `bet_market_id` (number)
- `bet_market_name` (string)
- `selection` (string)
- `odd_value` (decimal)
- `line` (decimal?)
- `snapshot_at` (datetime)

Relations:
- N OddsSnapshot -> 1 Fixture

### 14) PredictionSnapshot
Champs:
- `id` (uuid)
- `fixture_id` (fk)
- `advice` (string?)
- `home_win_pct` (number?)
- `draw_pct` (number?)
- `away_win_pct` (number?)
- `goals_home` (string?)
- `goals_away` (string?)
- `provider_raw` (jsonb)
- `snapshot_at` (datetime)

Relations:
- N PredictionSnapshot -> 1 Fixture

### 15) SignalSnapshot
Champs:
- `id` (uuid)
- `fixture_id` (fk)
- `elapsed` (number)
- `phase` (enum: early_1h, mid_1h, late_1h, early_2h, mid_2h, late_2h)
- `danger_ratio_home` (decimal?)
- `danger_ratio_away` (decimal?)
- `shot_pressure_home` (decimal?)
- `shot_pressure_away` (decimal?)
- `territorial_pressure_home` (decimal?)
- `territorial_pressure_away` (decimal?)
- `goal_likelihood_score_home` (number)
- `goal_likelihood_score_away` (number)
- `market_alignment_score` (number)
- `confidence_score` (number)
- `reasons` (jsonb)
- `risk_flags` (jsonb)
- `snapshot_at` (datetime)

Relations:
- N SignalSnapshot -> 1 Fixture

### 16) BetRecommendation
Champs:
- `id` (uuid)
- `fixture_id` (fk)
- `signal_snapshot_id` (fk)
- `market_type` (enum: next_goal, over_goals, btts, corners)
- `market_line` (decimal?)
- `selection` (string)
- `recommended_minute` (number)
- `min_acceptable_odd` (decimal)
- `current_odd` (decimal?)
- `value_edge_pct` (decimal?)
- `stake_plan` (enum: flat, fractional_kelly)
- `stake_units` (decimal)
- `status` (enum: open, hit, lost, void, skipped)
- `explanation` (text)
- `created_at` (datetime)

Relations:
- N BetRecommendation -> 1 Fixture
- N BetRecommendation -> 1 SignalSnapshot

### 17) ApiUsageLog
Champs:
- `id` (uuid)
- `provider` (string)
- `endpoint` (string)
- `request_params` (jsonb)
- `response_status` (number)
- `latency_ms` (number)
- `rate_limit_remaining` (number?)
- `called_at` (datetime)

Relations:
- independant (monitoring)

## 5.2 Relations principales (resume)

- `Country 1..N League`
- `League 1..N Season`
- `League 1..N Fixture`
- `Season 1..N Fixture`
- `Team N..N Fixture` (via `home_team_id`/`away_team_id`)
- `Fixture 1..N Event`
- `Fixture 1..N TeamStatsSnapshot`
- `Fixture 1..N OddsSnapshot`
- `Fixture 1..N SignalSnapshot`
- `SignalSnapshot 1..N BetRecommendation`

## 6. Regles fonctionnelles detaillees

## 6.1 Eligibility match

Un fixture entre dans le moteur si:
- statut live compatible (`1H`, `HT`, `2H`, `ET`, etc.),
- statistiques equipe disponibles,
- odds live disponibles si marche prix requis,
- ligue couverte selon profil coverage.

## 6.2 Calculs de base

- `danger_ratio = dangerous_attacks / max(attacks,1)`
- `shot_pressure = (shots_on + shots_off) / max(elapsed,1)`
- `on_target_ratio = shots_on / max(shots_on + shots_off,1)`
- `corner_pressure_10m = corners(t) - corners(t-10m)`

## 6.3 Regles de signal (v1)

- Signal offensif fort si:
  - `danger_ratio >= 0.38` et
  - `shot_pressure` au-dessus du percentile ligue de reference et
  - `on_target_ratio` non degradant sur 10 min.

- Signal prix valide si:
  - variation de cote compatible avec direction du signal, ou
  - absence de sur-reaction prix (edge positif > seuil).

- Recommandation publiee si:
  - `confidence_score >= 70`
  - `risk_flags` ne contient pas blocage critique (carton rouge contre, meteo extreme, data manquante)

## 6.4 Explicabilite obligatoire

Chaque recommandation doit inclure:
- `reasons[]` textuelles,
- top 3 features contributrices,
- timestamp et minute de match,
- reference odds (bookmaker/market).

## 7. API interne cible (spec fonctionnelle)

Base path: `/v1`

### 7.1 Health & monitoring
- `GET /health`
- `GET /metrics/usage`
- `GET /metrics/pipeline`

### 7.2 Live feed
- `GET /live/fixtures`
  - filtres: `leagueId`, `country`, `minConfidence`, `marketType`

- `GET /live/fixtures/:fixtureId`
  - details fixture + derniers snapshots stats/signaux/odds

### 7.3 Recommendations
- `GET /live/recommendations`
  - tri par `confidence_score` desc

- `GET /live/recommendations/:id`
  - detail complet + explication + historique signal

### 7.4 Backtest/Audit
- `GET /audit/recommendations`
- `GET /audit/recommendations/:id/outcome`

## 8. Exigences non fonctionnelles

- Latence endpoint interne live: p95 < 800 ms (cache chaud).
- Polling provider: adapte au plan (respect rate/min).
- Disponibilite service: >= 99.5%.
- Trace de chaque decision: obligatoire.
- Secret management: aucune cle en dur dans le code.
- Observabilite: logs structures + correlation id + dashboard erreurs provider.

## 9. Securite et conformite

- API keys en variables env (`.env`, vault).
- Rate-limit interne sur endpoints publics.
- Journalisation PII minimale.
- Controle d acces (token interne) si exposition internet.

## 10. Decoupage en modules techniques NestJS

- `modules/provider-api-football`
- `modules/coverage`
- `modules/fixtures`
- `modules/statistics`
- `modules/odds`
- `modules/predictions`
- `modules/signals`
- `modules/recommendations`
- `modules/audit`
- `modules/monitoring`
- `modules/config`

## 11. Roadmap fonctionnelle

Phase 1 (MVP live):
- ingestion fixtures live + team stats + rules v1 + recommandations.

Phase 2 (price intelligence):
- odds live/pre-match + module value edge + risk flags avances.

Phase 3 (industrialisation):
- backtest, calibration ligue, alerting temps reel, optimisation cout API.

## 12. Points de validation avant build

- Verifier mapping exact des endpoints/params dans dashboard API-FOOTBALL (doc dynamique).
- Valider les limitations de plan actif (quota + rate/min).
- Valider les ligues cibles et leur coverage reel avant production.
