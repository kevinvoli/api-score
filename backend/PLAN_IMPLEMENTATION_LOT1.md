# PLAN_IMPLEMENTATION_LOT1.md

Version: 1.0
Date: 2026-02-12
Base: `CAHIER_DES_CHARGES_IA_API_SCORE.md`
Objectif: rendre le Lot 1 directement codable (tickets actionnables).

## Perimetre Lot 1

Fondations techniques uniquement:
- configuration/env validee,
- base de donnees branchee,
- logging structure,
- gestion erreurs standard,
- healthcheck et metrics minimales,
- socle de tests et CI locale.

Hors perimetre Lot 1:
- ingestion provider,
- moteur de signaux,
- recommandations.

## Definition of Done Lot 1

Le Lot 1 est termine si:
- app demarre avec config validee,
- app refuse de demarrer si env invalide,
- connexion DB OK + migration initiale appliquee,
- endpoint `GET /v1/health` OK,
- endpoint `GET /v1/metrics/usage` retourne structure minimale,
- format erreur unifie `{ code, message, details, traceId }`,
- logs JSON avec `traceId`,
- tests unitaires/e2e Lot 1 passent.

## Ticket L1-001 - Initialiser module Config robuste

Objectif:
- Creer `ConfigModule` global avec validation stricte des variables env.

Taches:
1. Ajouter un schema de validation (Joi ou Zod).
2. Definir variables minimales:
- `PORT`
- `NODE_ENV`
- `DB_URL`
- `API_FOOTBALL_BASE_URL`
- `API_FOOTBALL_KEY`
- `API_FOOTBALL_HOST`
- `REQUEST_TIMEOUT_MS`
- `RETRY_MAX`
- `RATE_LIMIT_PER_MIN`
3. Stopper bootstrap si schema invalide.
4. Ajouter `.env.example` a jour.

Critere d acceptation:
- Lancement sans une variable requise => echec explicite.
- Lancement avec variables valides => application demarre.

Definition de test:
- test unitaire de validation schema.

## Ticket L1-002 - Brancher la base de donnees + migration initiale

Objectif:
- Integrer PostgreSQL + ORM (Prisma recommande) et migration initiale minimale.

Taches:
1. Installer ORM + client.
2. Configurer datasource via `DB_URL`.
3. Creer migration initiale avec tables minimales Lot 1:
- `api_usage_logs`
- `app_runtime_state` (optionnel pour metriques simples)
4. Exposer service DB injectable.

Critere d acceptation:
- Migration s applique sans erreur.
- Requete simple DB fonctionnelle depuis service Nest.

Definition de test:
- test integration DB (insert/select sur `api_usage_logs`).

## Ticket L1-003 - Middleware Trace ID + logging JSON

Objectif:
- Garantir tracabilite de toutes requetes.

Taches:
1. Creer middleware `trace-id`:
- lire `x-trace-id` entrant ou generer UUID,
- injecter dans contexte requete + header reponse.
2. Creer logger JSON:
- champs minimum: `timestamp`, `level`, `message`, `traceId`, `context`.
3. Activer logs requete/reponse (sans fuite de secret).

Critere d acceptation:
- Chaque reponse contient `x-trace-id`.
- Logs comportent `traceId` coherent.

Definition de test:
- e2e verifie presence header `x-trace-id`.

## Ticket L1-004 - Gestion d erreurs unifiee

Objectif:
- Uniformiser toutes les erreurs applicatives HTTP.

Taches:
1. Creer `GlobalExceptionFilter`.
2. Normaliser le payload:
- `code` (string)
- `message` (string)
- `details` (object|array|null)
- `traceId` (string)
3. Mapper erreurs techniques communes:
- validation,
- not found,
- conflits,
- erreurs internes.

Critere d acceptation:
- Toute erreur API respecte le format contractuel unique.

Definition de test:
- e2e endpoint de test renvoie format erreur normalise.

## Ticket L1-005 - API Health et metrics minimales

Objectif:
- Exposer et verifier la sante applicative de base.

Taches:
1. Creer `MonitoringModule`.
2. Ajouter endpoints:
- `GET /v1/health`
- `GET /v1/metrics/usage`
3. `health` retourne:
- `status` (`ok|degraded|down`)
- `time`
- `uptime`
- `db` (`up|down`)
4. `metrics/usage` retourne:
- `apiCallsLastHour`
- `apiErrorsLastHour`
- `lastProviderCallAt`

Critere d acceptation:
- `health` et `metrics/usage` repondent 200 sur environnement sain.

Definition de test:
- e2e sur les deux endpoints.

## Ticket L1-006 - Squelette API versionnee + prefix

Objectif:
- Standardiser la surface API interne.

Taches:
1. Configurer prefix global `/v1`.
2. Activer CORS configurable via env.
3. Ajouter validation globale DTO (whitelist, forbidNonWhitelisted).

Critere d acceptation:
- Tous endpoints Lot 1 accessibles via `/v1/*`.

Definition de test:
- e2e confirme routes prefixed.

## Ticket L1-007 - Hygiene securite secrete

Objectif:
- Eviter les cles hardcodees et fuites.

Taches:
1. Retirer les cles API en dur existantes dans le code.
2. Lire cle provider uniquement via config.
3. Ajouter regle de redaction des secrets dans logs.
4. Ajouter check simple pre-commit (optionnel) contre motifs de secrets.

Critere d acceptation:
- `rg` dans `src` ne trouve plus de cle API explicite.

Definition de test:
- commande verif + revue diff.

## Ticket L1-008 - Socle de tests et scripts

Objectif:
- Rendre Lot 1 reproductible.

Taches:
1. Ajuster scripts npm:
- `test`, `test:e2e`, `lint`, `build`
2. Ajouter tests:
- config validation,
- health,
- metrics,
- erreur standard.
3. Ajouter `README` section "Demarrage Lot 1".

Critere d acceptation:
- `npm run build`
- `npm run test`
- `npm run test:e2e`
passes localement.

## Ordonnancement recommande

1. L1-001
2. L1-002
3. L1-006
4. L1-003
5. L1-004
6. L1-005
7. L1-007
8. L1-008

## Commandes de verification Lot 1

1. `npm install`
2. `npm run build`
3. `npm run test`
4. `npm run test:e2e`
5. `npm run start:dev`
6. `curl http://localhost:3010/v1/health`
7. `curl http://localhost:3010/v1/metrics/usage`

## Format de compte-rendu attendu pour IA de codage

Pour chaque ticket livre:
- Fichiers crees/modifies.
- Migrations ajoutees.
- Tests ajoutes + resultats.
- Limites connues.
- Prochaine action.

## Prompt pret a l emploi (Lot 1)

"Implemente uniquement le Lot 1 selon `PLAN_IMPLEMENTATION_LOT1.md`.
Respecte l ordre des tickets L1-001 a L1-008.
Ne code aucune fonctionnalite des lots suivants.
A la fin de chaque ticket, execute les tests pertinents et fournis:
- resume des changements,
- fichiers touches,
- commandes lancees,
- sorties cle,
- risques restants.
"
