# BACKLOG ETAPE 1 - Stabilisation Production (P0)

Date: 2026-02-12
Reference: `CAHIER_DES_CHARGES_IA_API_SCORE.md` (Etape 1)
Statut global: `[A REALISER]`

## Objectif Etape 1

Rendre le backend actuel fiable en production sur MySQL avant d'ajouter les modules odds/recommandations.

## Ordre de realisation

1. Ticket E1-T01 - Runbook MySQL + script de verification
2. Ticket E1-T02 - Readiness DB/Provider dans health
3. Ticket E1-T03 - Test e2e migration + bootstrap
4. Ticket E1-T04 - Strategie de reprise scheduler
5. Ticket E1-T05 - Alerting erreurs provider

## E1-T01 - Runbook MySQL + script de verification

- Priorite: P0
- Statut: `[A REALISER]`
- Type: Documentation + DevOps
- But: standardiser la creation de la base, des droits et des verifications initiales.

### Scope
- Ajouter un document `backend/docs/RUNBOOK_MYSQL.md`:
  - prerequis MySQL 8+
  - creation DB
  - creation user applicatif (droits minimaux)
  - variable `DB_URL` exemple
  - commandes migration
  - check connectivite
- Ajouter script `backend/scripts/check-db-connection.ts` qui:
  - charge env
  - tente connexion TypeORM
  - retourne exit code 0/1

### Acceptance criteria
- runbook complet et executable en local
- script de check echoue proprement sans DB_URL
- script de check passe avec DB valide

### Verification
- `npm run build`
- `npm run typeorm -- migration:run`
- `node dist/scripts/check-db-connection.js`

## E1-T02 - Readiness DB/Provider dans health

- Priorite: P0
- Statut: `[A REALISER]`
- Type: Backend API
- But: enrichir `/v1/health` avec etat detaille des dependances.

### Scope
- Etendre reponse health:
  - `status`: `ok | degraded | down`
  - `checks.database`: `up | down`, latence_ms
  - `checks.providerApiFootball`: `up | down | skipped`, latence_ms
  - `timestamp_utc`
- Ajouter timeout court pour checks (ex: 1500ms)
- Ne jamais exposer secrets dans la reponse

### Acceptance criteria
- health retourne statut global coherent
- si DB down alors status global != ok
- si provider timeout mais DB up alors status = degraded

### Verification
- test manuel endpoint: `GET /v1/health`
- simulation DB indisponible
- simulation provider timeout (mock/test)

## E1-T03 - Test e2e migration + bootstrap

- Priorite: P0
- Statut: `[A REALISER]`
- Type: Qualite
- But: garantir que l'application demarre proprement apres migrations.

### Scope
- Ajouter suite e2e `backend/test/e2e/bootstrap.e2e-spec.ts`
- Scenario 1: env valide + migrations appliquees -> app start OK
- Scenario 2: `DB_URL` absent -> echec startup avec message explicite
- Scenario 3: `API_FOOTBALL_KEY` absent -> echec config si obligatoire

### Acceptance criteria
- tests reproductibles en CI
- messages d'erreur non ambigus
- aucun faux positif

### Verification
- `npm run test:e2e`

## E1-T04 - Strategie de reprise scheduler

- Priorite: P0
- Statut: `[A REALISER]`
- Type: Backend resilience
- But: eviter blocage pipeline live apres erreurs transientes provider.

### Scope
- Ajouter politique retry/backoff par job scheduler
- Ajouter compteur d'echecs consecutifs par job
- Ajouter seuil de pause temporaire (circuit-break simple)
- Ajouter logs structurés de transition d'etat job:
  - active
  - throttled
  - paused
  - resumed

### Acceptance criteria
- pas de crash process sur erreur provider repetitive
- reprise automatique apres fenetre de pause
- etat courant du scheduler lisible dans logs

### Verification
- test integration avec provider mock 429/500
- observation logs JSON

## E1-T05 - Alerting erreurs provider

- Priorite: P0
- Statut: `[A REALISER]`
- Type: Observabilite
- But: detecter rapidement une derive de la qualite de service provider.

### Scope
- Definir seuils:
  - taux erreurs 5xx > X% sur 5 min
  - taux timeouts > Y% sur 5 min
  - quota restant < Z%
- Ajouter agregation metriques en memoire (v1)
- Exposer etat alertes dans `GET /v1/metrics/usage` ou `GET /v1/metrics/pipeline`
- Preparer hook notifier (stub) pour Slack/Email future

### Acceptance criteria
- seuils calcules correctement sur fenetre glissante
- endpoint metriques affiche alertes actives
- faux positifs limites sur trafic faible

### Verification
- tests unit de calcul fenetre glissante
- tests integration sur endpoint metrics

## Definition of Done Etape 1

Etape 1 passe en `[DEJA REALISE]` si:
- E1-T01 a E1-T05 sont en `[DEJA REALISE]`
- migrations et tests e2e passent
- health detaille et metriques sont exploitables
- documentation mise a jour:
  - `DOCUMENT_FONCTIONNEL_API_SCORE.md`
  - `FONCTIONNALITES.md`
  - `CAHIER_DES_CHARGES_IA_API_SCORE.md`
  - `BACKLOG_ETAPE_1_TICKETS.md`
