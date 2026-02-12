# API-FOOTBALL v3 - Analyse integration et framework statistique pour paris

## Contexte

Ce document evalue ce qui est logique a integrer dans ton projet `api-score` a partir de la documentation/API pages officielles API-FOOTBALL/API-SPORTS, puis propose une grille de statistiques + interpretation orientee decision betting (niveau expert).

## 1) Ce que l'API rend possible (factuel)

### Capacites produit confirmees

- Donnees livescore, fixtures, teams, standings, events, lineups, players, statistics, predictions, pre-match odds et live odds.
- Donnees live mises a jour tres frequemment (fixtures/events annoncees a 15s).
- Couverture large (plus de 1200 competitions; page API-Sports affiche 1219 ligues/coupes et 20 ans d'historique).
- Endpoint odds/live disponible (release 3.9.2) + odds/live/bets.
- Endpoint fixtures/statistics avec parametre `half` (release 3.9.3) pour stats 1re/2e mi-temps.
- Endpoint fixtures avec parametre `ids` pour recuperer plusieurs fixtures dans un seul appel.
- Possibilite d'utiliser la `coverage` par ligue pour savoir si une ligue expose bien events/lineups/statistics/players/predictions/odds.

### Contraintes d'usage confirmees

- Quota/jour selon plan (100, 7500, 75000, 150000 requests/day).
- Limites de debit/min selon plan payant (300/450/900 req/min).
- Quota journalier reset a 00:00 UTC.

## 2) Evaluation de ton projet actuel vs integration logique

### Etat actuel du code (constat)

- Ton service `MatchService` consomme actuellement `https://apiv3.apifootball.com/?action=get_events&APIkey=...&match_live=1`.
- Le filtrage metier repose surtout sur: `Attacks`, `Dangerous Attacks`, `On Target`, `Off Target`, `Corners`, `Ball Possession`.
- Tu produis deja un objet "coupon" avec prediction ciblee "But en premiere mi-temps".

### Ce qui est logiquement integrable tout de suite (haute valeur)

1. `coverage` gate par ligue
- Avant tout calcul, verifier que la ligue couvre bien `statistics`, `odds`, `predictions`, `lineups`.
- Evite les appels inutiles et les faux signaux.

2. Pipeline live cadence par type de donnee
- `fixtures/live` + events: polling rapide.
- `fixtures/statistics`: polling plus lent (minute).
- `lineups`: fetch unique avant match puis cache.

3. Split temporel via `half`
- Utiliser `fixtures/statistics?half=first|second` pour differencier dynamique 1re MT / 2e MT.
- Plus robuste que des seuils "globaux" appliques a toutes minutes.

4. Ajout du bloc odds
- Integrer pre-match odds + live odds + bookmaker/bet filters.
- Calculer derivees metier: drift de cotes, compression de marge, divergence multi-books.

5. Ajout injuries + lineups
- Construire un "impact XI" (absences cle + remplacements) pour ajuster la proba en live.

### Ce qui est possible mais a faire en phase 2

- Combiner endpoint `predictions` avec ton propre modele (en feature, pas en verite terrain).
- Construire calibration historique (Brier/log-loss) par ligue et par marche.
- Detecter regimes de match (pression sterile, domination efficace, match casse, etc.).

### Inference explicite

- Je n'ai pas pu lire directement chaque operation Swagger de la page ancree `documentation-v3#...` (page dynamique). Les recommandations endpoint-par-endpoint ci-dessus sont deduites des pages officielles API-FOOTBALL/API-Sports et de leurs releases/tutoriels.

## 3) Statistiques pertinentes + interpretation (profil parieur experimente)

## 3.1 Stats coeur (deja presentes dans ton flux)

### A. Dangerous Attacks / Attacks (ratio qualite d'attaque)
- Formule: `DA_ratio = dangerous_attacks / attacks`.
- Lecture pro:
  - > 0.38: volume avec menace reelle.
  - 0.28-0.38: pression moyenne.
  - < 0.28: possession/stimulation sterile.
- Usage marche:
  - BTTS Live, Over 1.5/2.5 live, Next Goal.

### B. On Target + Off Target (production de tirs)
- Formule: `shots_total_proxy = on_target + off_target`.
- Lecture pro:
  - hausse continue + DA_ratio stable/hausse = momentum offensif credible.
  - hausse sans tirs cadres = pression faible qualite.
- Usage marche:
  - Over live, goal before minute X, next goal.

### C. Corners (pression territoriale)
- Lecture pro:
  - sequence corners concentree (fenetre 10-15 min) = siege territorial.
  - corners sans tirs cadres = bruit possible.
- Usage marche:
  - corners over, next team corner, hedge sur goal markets.

### D. Ball Possession
- Lecture pro:
  - possession seule = peu predictive.
  - utile seulement combinee avec tirs cadres + DA_ratio.
- Usage marche:
  - filtre anti-faux signal (eviter over base sur possession seule).

### E. Match status / elapsed / split half
- Lecture pro:
  - meme volume statistique n'a pas le meme sens a 12', 42', 78'.
  - l'intensite utile doit etre "par minute" et "par phase".
- Usage marche:
  - first-half goal, second-half over, late goal.

## 3.2 Stats de contexte (a ajouter)

### F. Lineups + substitutions
- Lecture pro:
  - XI offensif/defensif modifie la base-rate pre-match.
  - remplacements offensifs precoces = hausse de variance but.
- Usage marche:
  - pre-match edges, reprise live apres compo officielle.

### G. Injuries/sidelined
- Lecture pro:
  - absence d'un pivot creation/finition impacte conversion.
  - absences cumulatives en defense augmentent risque concession.
- Usage marche:
  - BTTS, team totals, opposee DNB/Asian.

### H. Odds pre-match + live
- Lecture pro:
  - drift brutal sans support stats = possible info exogene (blessure, carton, meteo, etc.).
  - drift + stats convergentes = signal fort.
- Usage marche:
  - arbitrage de timing d'entree, value detection, no-bet filter.

### I. Predictions endpoint
- Lecture pro:
  - utile comme feature externe, pas comme signal final autonome.
  - verifier calibration par ligue avant usage operationnel.
- Usage marche:
  - priorisation shortlist, pas execution directe.

## 3.3 Interpretation metier "pro" (regles decisionnelles)

### Regle 1: Convergence multi-signaux
Prendre position seulement si 3 blocs convergent:
- bloc production (tirs, DA_ratio),
- bloc contexte (lineups/injuries/cartons),
- bloc prix (odds drift compatible).

### Regle 2: Asymetrie score-state
- Equipe menee + pression reelle = bon candidat Over/Next Goal.
- Equipe menee sans creation = faux over frequent.

### Regle 3: Qualite > volume
- Prioriser tirs cadres + dangerosite sur possession brute et corners seuls.

### Regle 4: Timing d'entree
- Eviter entree tardive si la cote a deja absorbe l'information.
- Chercher fenetre avant re-pricing complet (latence du marche).

### Regle 5: Discipline portefeuille
- Stake fixe ou Kelly fractionne.
- Jamais augmenter la mise pour "se refaire".
- Tracker CLV (Closing Line Value) pour valider l'edge reel.

## 4) Plan d'integration conseille dans ton repo

1. Normaliser la couche API
- Creer un `ApiFootballClient` unique (headers, timeout, retries, rate-limit).

2. Ajouter "coverage-first"
- Cache hebdo des ligues + flags coverage.
- Skip automatique des ligues non couvertes.

3. Ajouter module odds
- Endpoints odds pre-match/live + mapping bookmaker/bet.
- Stocker snapshots pour analyser drift.

4. Refactor moteur de score live
- Remplacer seuils statiques par scores normalises par minute et phase (`half`).
- Ajouter score de confiance.

5. Sortie coupon "pro"
- Inclure `reasons[]`, `confidence`, `risk_flags[]`, `price_context`.

## 5) Limites a garder en tete

- Les stats live varient en qualite selon ligue et data provider.
- Les marches reagissent tres vite: edge fragile sans execution disciplinee.
- Sans backtest rigoureux par ligue/saison/marche, toute regle reste une hypothese.

## Sources officielles utilisees

- Documentation demandee (ancre v3): https://www.api-football.com/documentation-v3#
- API-FOOTBALL home (features/plans/live updates): https://www.api-football.com/
- API-SPORTS football page (coverage, volume, quotas/rate limits): https://api-sports.io/sports/football
- Release API-FOOTBALL 3.9.2 (odds/live, ids, status multi): https://www.api-football.com/news/post/api-football-new-release
- Release API-FOOTBALL 3.9.3 (fixtures/statistics `half`, injuries `ids`): https://www.api-football.com/news/post/api-football-new-release-available
- Tutoriel optimisation appels (coverage, frequences de MAJ, strategy polling): https://www.api-football.com/news/post/how-to-save-calls-to-the-api
- Article Predictions endpoint: https://www.api-football.com/news/post/predictions
