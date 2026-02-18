# BACKLOG ETAPES 2 A 6 - API SCORE

Date: 2026-02-12
Reference: `CAHIER_DES_CHARGES_IA_API_SCORE.md`
Statut global: `[A REALISER]`

## Regle de tracking

- Chaque ticket commence en `[A REALISER]`.
- Passer en `[DEJA REALISE]` uniquement si code + tests + doc sont a jour.
- A chaque implementation, mettre a jour aussi:
  - `DOCUMENT_FONCTIONNEL_API_SCORE.md`
  - `FONCTIONNALITES.md`
  - `CAHIER_DES_CHARGES_IA_API_SCORE.md`

## Etape 2 - Module Odds (P0)

Objectif: ajouter la couche prix pour calculer la value en live.

### Ordre de realisation

1. E2-T01 - Schema odds (tables/index/contraintes)
2. E2-T02 - Client provider odds pre-match/live
3. E2-T03 - Service ingestion odds + idempotence
4. E2-T04 - Derivees prix (drift/variation)
5. E2-T05 - Endpoints odds lecture
6. E2-T06 - Tests unit/integration/e2e odds

### E2-T01 - Schema odds

- Priorite: P0
- Statut: `[A REALISER]`
- Type: DB
- But: persister les cotes de facon exploitable et performante.

Scope:
- Creer entite + migration `odds_snapshots`
- Creer entite + migration `odds_market_lines`
- Ajouter index:
  - `(fixture_id, captured_at)`
  - `(fixture_id, market_type, selection_key)`
  - `(captured_at)`
- Ajouter contraintes d'unicite fonctionnelle pour eviter doublons techniques

Acceptance criteria:
- migrations executables sur DB vide et DB existante
- insertions repetitives ne creent pas de doublons metier
- requete latest odds par fixture < 200ms sur volume test

Verification:
- `npm run db:migrate`
- test integration repository odds

### E2-T02 - Client provider odds

- Priorite: P0
- Statut: `[A REALISER]`
- Type: Backend provider
- But: recuperer odds live et pre-match via API-Football.

Scope:
- Ajouter methods client:
  - `fetchOddsLive(...)`
  - `fetchOddsPrematch(...)`
- Mapper payload provider -> DTO interne normalise
- Gerer 429/5xx/timeouts via retry existant
- Logger quotas et statut de reponse sans exposer secrets

Acceptance criteria:
- appels provider odds fonctionnels sur fixtures cibles
- payload normalise stable meme en cas de champs manquants
- erreurs provider converties en erreurs internes coherentes

Verification:
- tests integration avec mocks HTTP (200/429/500/timeout)

### E2-T03 - Ingestion odds + idempotence

- Priorite: P0
- Statut: `[A REALISER]`
- Type: Backend pipeline
- But: alimenter la base en snapshots odds sans duplication.

Scope:
- Creer service `odds-sync.service`
- Integrer au scheduler (frequence configurable)
- Determiner cles d'idempotence
- Ajouter invalidation cache pertinente post-sync

Acceptance criteria:
- job odds actif sans impacter la stabilite live actuelle
- deux sync consecutives identiques ne dupliquent pas les lignes
- retries ne creent pas de corruption de donnees

Verification:
- tests integration scheduler + DB
- observation compteurs lignes avant/apres double sync

### E2-T04 - Derivees prix

- Priorite: P0
- Statut: `[A REALISER]`
- Type: Metier
- But: preparer les features prix pour decision.

Scope:
- Calculer:
  - `price_drift_1`
  - `price_drift_3`
  - `price_drift_5`
  - variation relative (%)
- Gerer manque d'historique (fallback explicite)
- Stocker derivees dans table dediee ou colonnes calculees

Acceptance criteria:
- derivees coherentes avec timeline odds
- aucun crash sur historique incomplet
- precision numerique stable (arrondi documente)

Verification:
- unit tests calcul drift
- tests integration sur snapshots simulés

### E2-T05 - Endpoints odds lecture

- Priorite: P0
- Statut: `[A REALISER]`
- Type: API
- But: exposer les odds utiles au moteur et au debug metier.

Scope:
- `GET /v1/live/fixtures/:fixtureId/odds/latest`
- `GET /v1/live/fixtures/:fixtureId/odds/timeline`
- Pagination/limit sur timeline
- Filtres: marketType, bookmaker

Acceptance criteria:
- contrats API stables et documentes
- temps de reponse acceptable sur fixture chargee
- reponse vide propre si pas d'odds

Verification:
- tests e2e endpoints odds

### E2-T06 - Tests module odds

- Priorite: P0
- Statut: `[A REALISER]`
- Type: Qualite
- But: verrouiller la non regression du module odds.

Scope:
- Unit tests mappers + derivees
- Integration tests DB idempotence
- E2E tests endpoints odds

Acceptance criteria:
- couverture module odds >= 80%
- scenarios erreurs critiques couverts

Verification:
- `npm run test`
- `npm run test:e2e`

DoD Etape 2:
- E2-T01 a E2-T06 en `[DEJA REALISE]`
- odds exploitables en lecture + pipeline stable

## Etape 3 - Signaux & Recommandations (P0)

Objectif: produire des recommandations live explicables.

### Ordre de realisation

1. E3-T01 - Schema signaux et recommandations
2. E3-T02 - Feature engineering v1
3. E3-T03 - Scoring et confidence
4. E3-T04 - Moteur de decision publication/no-bet
5. E3-T05 - API recommandations live
6. E3-T06 - Tests complets module

### E3-T01 - Schema signaux/recommandations

- Priorite: P0
- Statut: `[A REALISER]`
- Type: DB

Scope:
- Creer `signal_snapshots`
- Creer `bet_recommendations`
- Ajouter index `(fixture_id, captured_at)` et `(confidence_score)`
- Ajouter enums/contraintes status recommandation

Acceptance criteria:
- schema compatible avec audit futur
- insertion et lecture rapide par fixture et fenetre temps

Verification:
- `npm run db:migrate`
- tests repository

### E3-T02 - Feature engineering v1

- Priorite: P0
- Statut: `[A REALISER]`
- Type: Metier

Scope:
- Implementer calcul:
  - `danger_ratio`
  - `shot_pressure`
  - `on_target_ratio`
  - `corner_pressure_10m`
  - `price_drift` (depuis Etape 2)
- Gerer valeurs manquantes + flags qualite

Acceptance criteria:
- calculs deterministes et documentes
- sorties definies meme en data partielle

Verification:
- unit tests de chaque formule

### E3-T03 - Scoring

- Priorite: P0
- Statut: `[A REALISER]`
- Type: Metier

Scope:
- `goal_likelihood_score` (0-100)
- `market_alignment_score` (0-100)
- `confidence_score` (0-100)
- normalisation et pondérations configurables

Acceptance criteria:
- scores bornes et monotones selon regles definies
- variabilite saine sur jeux de test contrastes

Verification:
- unit tests scoring
- tests de robustesse bornes

### E3-T04 - Moteur de decision

- Priorite: P0
- Statut: `[A REALISER]`
- Type: Metier

Scope:
- Regle publication `confidence >= 70`
- Blocages via `risk_flags`
- Generation `reasons[]` et `risk_flags[]`
- Calcul `min_acceptable_odd` et `value_edge_pct`

Acceptance criteria:
- chaque recommandation est explicable
- aucun bet publie si bloqueur actif

Verification:
- tests unit decision table
- integration tests complete pipeline fixture -> recommandation

### E3-T05 - API recommandations

- Priorite: P0
- Statut: `[A REALISER]`
- Type: API

Scope:
- `GET /v1/live/recommendations`
- `GET /v1/live/recommendations/:id`
- Filtres: `marketType`, `minConfidence`, `status`
- Tri: `confidence`, `edge`, `createdAt`

Acceptance criteria:
- pagination stable
- contrat API coherent avec format global

Verification:
- tests e2e endpoints recommandations

### E3-T06 - Tests module recommandations

- Priorite: P0
- Statut: `[A REALISER]`
- Type: Qualite

Scope:
- Unit tests features/scoring/decision
- Integration tests persistence
- E2E endpoints

Acceptance criteria:
- couverture `signals` + `recommendations` >= 80%

Verification:
- `npm run test`
- `npm run test:e2e`

DoD Etape 3:
- recommandations live actives, explicables, traceables

## Etape 4 - Audit, Settlement, KPIs (P1)

Objectif: mesurer la performance reelle et fiabiliser la boucle de feedback.

### Ordre de realisation

1. E4-T01 - Schema outcomes et audit
2. E4-T02 - Job settlement post-match
3. E4-T03 - Calcul KPIs metier
4. E4-T04 - API audit
5. E4-T05 - Tests et validation historique

### E4-T01 - Schema audit/outcomes

- Priorite: P1
- Statut: `[A REALISER]`
- Type: DB

Scope:
- Creer `bet_outcomes`
- Ajouter liaison 1-1 avec `bet_recommendations`
- Ajouter champs CLV, pnl, odds_closing

Acceptance criteria:
- outcome unique par recommendation
- nullable controlle pour paris non settles

Verification:
- migration + tests repository

### E4-T02 - Job settlement

- Priorite: P1
- Statut: `[A REALISER]`
- Type: Backend scheduler

Scope:
- job toutes 10 min (configurable)
- recuperer resultat final fixture
- setter statut recommendation + pnl

Acceptance criteria:
- settlement idempotent
- pas de double settlement

Verification:
- tests integration sur fixtures finies

### E4-T03 - KPIs metier

- Priorite: P1
- Statut: `[A REALISER]`
- Type: Analytics

Scope:
- calculer par fenetre 7j/30j:
  - hit-rate
  - ROI
  - yield
  - drawdown max
  - CLV moyen (v1)

Acceptance criteria:
- formules explicites et testees
- resultats reproductibles

Verification:
- unit tests KPIs

### E4-T04 - API audit

- Priorite: P1
- Statut: `[A REALISER]`
- Type: API

Scope:
- `GET /v1/audit/recommendations`
- `GET /v1/audit/recommendations/:id/outcome`
- Filtres par periode/marche/league

Acceptance criteria:
- endpoints audit pagination + tri
- donnees conformes aux outcomes settles

Verification:
- tests e2e audit

### E4-T05 - Validation historique

- Priorite: P1
- Statut: `[A REALISER]`
- Type: Qualite

Scope:
- jeu de donnees de reference audit
- verification coherences (somme PnL, ratios)

Acceptance criteria:
- ecart zero sur dataset de reference

Verification:
- suite tests integration audit

DoD Etape 4:
- performance du systeme mesurable et exploitable

## Etape 5 - Bankroll & Risk Management (P1)

Objectif: controler exposition et stabiliser la variance bankroll.

### Ordre de realisation

1. E5-T01 - Parametrage bankroll
2. E5-T02 - Sizing stake (fixe + Kelly fractionnel)
3. E5-T03 - Limites risque globales
4. E5-T04 - Moteur de refus explicite
5. E5-T05 - API exposition et configuration

### E5-T01 - Parametrage bankroll

- Priorite: P1
- Statut: `[A REALISER]`
- Type: Metier

Scope:
- stocker capital de reference
- configurer mode stake par environnement
- versionner parametres risque

Acceptance criteria:
- changement parametre trace et reversible

Verification:
- tests unit config bankroll

### E5-T02 - Sizing stake

- Priorite: P1
- Statut: `[A REALISER]`
- Type: Metier

Scope:
- Mode stake fixe
- Mode Kelly fractionnel borne
- bornes min/max stake (%)

Acceptance criteria:
- pas de stake hors bornes
- determinisme du calcul

Verification:
- unit tests sur matrices de cas

### E5-T03 - Limites risque

- Priorite: P1
- Statut: `[A REALISER]`
- Type: Metier

Scope:
- limite exposition par ligue
- limite exposition par marche
- limite nombre bets simultanes
- circuit-break drawdown journalier

Acceptance criteria:
- aucune recommendation si limite depassee

Verification:
- tests integration pipeline recommandations

### E5-T04 - Refus explicite

- Priorite: P1
- Statut: `[A REALISER]`
- Type: Metier/API

Scope:
- enum raisons de refus (`NO_VALUE`, `RISK_LIMIT`, `LOW_QUALITY`, etc.)
- exposer raison dans reponse recommendation

Acceptance criteria:
- toute non-publication possede un motif explicite

Verification:
- unit tests decision no-bet

### E5-T05 - API exposition

- Priorite: P1
- Statut: `[A REALISER]`
- Type: API

Scope:
- endpoint etat exposition courante
- endpoint lecture config risk effective

Acceptance criteria:
- monitoring risque consultable en temps reel

Verification:
- tests e2e endpoints risque

DoD Etape 5:
- gestion bankroll integree a la decision de publication

## Etape 6 - Prediction Engine Avance (P2)

Objectif: evoluer vers un moteur probabiliste calibre et versionne.

### Ordre de realisation

1. E6-T01 - Design service prediction dedie
2. E6-T02 - Dataset et features historiques
3. E6-T03 - Baseline modele probabiliste
4. E6-T04 - Calibration + monitoring derive
5. E6-T05 - Versioning modele + rollback
6. E6-T06 - Integration progressive en prod

### E6-T01 - Service prediction dedie

- Priorite: P2
- Statut: `[A REALISER]`
- Type: Architecture

Scope:
- creer module/service prediction separe
- definir contrat entree/sortie probabilites
- isoler logique du moteur heuristique existant

Acceptance criteria:
- service integrable sans casser pipeline actuel

Verification:
- tests integration contrat service

### E6-T02 - Dataset historique

- Priorite: P2
- Statut: `[A REALISER]`
- Type: Data

Scope:
- construire pipeline extraction features historiques
- ajouter controles qualite dataset
- versionner schema dataset

Acceptance criteria:
- dataset reproductible et documente

Verification:
- scripts validation dataset

### E6-T03 - Baseline modele

- Priorite: P2
- Statut: `[A REALISER]`
- Type: ML

Scope:
- baseline probabiliste (ex: Poisson ajuste ou gradient boosting)
- evaluer Brier/logloss sur validation
- exporter probabilites compatibles moteur recommendations

Acceptance criteria:
- baseline meilleure ou egale heuristique selon metrique definie

Verification:
- rapport evaluation versionne

### E6-T04 - Calibration

- Priorite: P2
- Statut: `[A REALISER]`
- Type: ML/Metier

Scope:
- calibration probabilites (Platt/isotonic selon choix)
- monitoring derapage calibration

Acceptance criteria:
- courbe calibration stabilisee

Verification:
- tests de calibration + monitoring

### E6-T05 - Versioning modele

- Priorite: P2
- Statut: `[A REALISER]`
- Type: MLOps

Scope:
- versionner modele actif
- stocker metadata d'entrainement
- mecanisme rollback vers version precedente

Acceptance criteria:
- rollback teste et operationnel

Verification:
- test integration rollback

### E6-T06 - Integration progressive

- Priorite: P2
- Statut: `[A REALISER]`
- Type: Release

Scope:
- mode shadow (prediction comparee sans impact publication)
- gate d'activation progressive
- rapport avant/apres deployment

Acceptance criteria:
- aucun impact negatif non controle en production

Verification:
- suivi KPIs pre/post activation

DoD Etape 6:
- modele avance actif, traceable, rollbackable

## Definition of Done globale (Etapes 2 a 6)

Une etape est terminee si:
- 100% tickets de l'etape en `[DEJA REALISE]`
- migrations et tests associes passent
- endpoints documentes et verifies
- documentation de suivi synchronisee dans les 3 fichiers de reference
