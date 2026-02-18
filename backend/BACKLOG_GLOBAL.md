# BACKLOG GLOBAL - API SCORE

Date: 2026-02-12
Projet: `api-score`
Statut global: `[EN COURS]`
Derniere mise a jour: 2026-02-18

## References principales

- `BACKLOG_ETAPE_1_TICKETS.md`
- `BACKLOG_ETAPES_2_A_6_TICKETS.md`
- `CAHIER_DES_CHARGES_IA_API_SCORE.md`
- `DOCUMENT_FONCTIONNEL_API_SCORE.md`
- `FONCTIONNALITES.md`

## Regle de suivi

- Tous les tickets demarrent en `[A REALISER]`.
- Un ticket passe en `[DEJA REALISE]` uniquement si:
  - code implemente
  - tests associes verts
  - docs de suivi mises a jour
- Mise a jour obligatoire en parallele des fichiers:
  - `DOCUMENT_FONCTIONNEL_API_SCORE.md`
  - `FONCTIONNALITES.md`
  - `CAHIER_DES_CHARGES_IA_API_SCORE.md`
  - `BACKLOG_GLOBAL.md`

## Vue macro des etapes

1. Etape 1 (P0) - Stabilisation production
2. Etape 2 (P0) - Module Odds
3. Etape 3 (P0) - Signaux & Recommandations
4. Etape 4 (P1) - Audit, Settlement, KPIs
5. Etape 5 (P1) - Bankroll & Risk Management
6. Etape 6 (P2) - Prediction Engine avance

## Plan d'execution global (tickets)

### Etape 1 - Stabilisation production `[DEJA REALISE 2026-02-18]`

Source detaillee: `BACKLOG_ETAPE_1_TICKETS.md`

1. E1-T01 - Runbook MySQL + script verification `[DEJA REALISE]`
2. E1-T02 - Readiness DB/Provider dans health `[DEJA REALISE]`
3. E1-T03 - Test e2e migration + bootstrap `[DEJA REALISE]`
4. E1-T04 - Strategie reprise scheduler `[DEJA REALISE]`
5. E1-T05 - Alerting erreurs provider `[DEJA REALISE]`

### Etape 2 - Module Odds

Source detaillee: `BACKLOG_ETAPES_2_A_6_TICKETS.md`

1. E2-T01 - Schema odds
2. E2-T02 - Client provider odds
3. E2-T03 - Ingestion odds + idempotence
4. E2-T04 - Derivees prix
5. E2-T05 - Endpoints odds lecture
6. E2-T06 - Tests module odds

### Etape 3 - Signaux & Recommandations

Source detaillee: `BACKLOG_ETAPES_2_A_6_TICKETS.md`

1. E3-T01 - Schema signaux/recommandations
2. E3-T02 - Feature engineering v1
3. E3-T03 - Scoring
4. E3-T04 - Moteur de decision
5. E3-T05 - API recommandations
6. E3-T06 - Tests module recommandations

### Etape 4 - Audit, Settlement, KPIs

Source detaillee: `BACKLOG_ETAPES_2_A_6_TICKETS.md`

1. E4-T01 - Schema audit/outcomes
2. E4-T02 - Job settlement
3. E4-T03 - KPIs metier
4. E4-T04 - API audit
5. E4-T05 - Validation historique

### Etape 5 - Bankroll & Risk Management

Source detaillee: `BACKLOG_ETAPES_2_A_6_TICKETS.md`

1. E5-T01 - Parametrage bankroll
2. E5-T02 - Sizing stake
3. E5-T03 - Limites risque
4. E5-T04 - Refus explicite
5. E5-T05 - API exposition

### Etape 6 - Prediction Engine avance

Source detaillee: `BACKLOG_ETAPES_2_A_6_TICKETS.md`

1. E6-T01 - Service prediction dedie
2. E6-T02 - Dataset historique
3. E6-T03 - Baseline modele
4. E6-T04 - Calibration
5. E6-T05 - Versioning modele
6. E6-T06 - Integration progressive

## Jalons de validation

- Jalon A: Etape 1 terminee -> plateforme stable production
- Jalon B: Etapes 2 + 3 terminees -> recommandations live operationnelles
- Jalon C: Etapes 4 + 5 terminees -> boucle performance + risque maitrisee
- Jalon D: Etape 6 terminee -> moteur probabiliste avance deployable

## Prochain ticket a executer

- Ticket courant recommande: `E2-T01`
- Statut: `[A REALISER]`
- Raison: Etape 1 terminee - debut du module Odds
