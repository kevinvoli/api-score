> **2026-10-11 : chantier d'exécution CLOS (NO-GO réel, décision de Kevin : pas de pari automatique).**
> Nouvel objectif : pronostics auto-évalués sans cote. Lire `PLAN_PRONOSTICS.md` (proposé, à valider) avant tout travail.
> Le texte ci-dessous décrit l'ancien chantier, conservé pour l'historique.

# Reprise — chantier PLAN_EXECUTION_PARIS

Derniere session : 2026-10-10. Lots 1 a 7 et console du lot 9 termines (non commites), **G1 : GO**, **G2 : NO-GO** (moteur pret, mesure reelle a faire), **G3 : non commence**. Mode d'execution : **DISABLED**.
Revues `reviewer` des lots 3, 4, 5, 6, 7 et 9 a faire.
Lot 7 clos le 2026-10-10 sous la derogation G3 (PLAN §7). Console du lot 9 livree le 2026-10-10 (pages /execution, /simulation, section walk-forward de /audit). Backlog sans arbitrage traite le 2026-10-11 (VOID backtest, walk-forward orphelins, Node, CLAUDE.md ; ci.yml a poser a la main depuis _to_delete/ci.yml.a-poser). Reste : lot 8 bloque externe (operateur non choisi), revues, gel des seuils G2, puis la fenetre G3 (30 jours / 500 decisions). Avant G2 : Kevin doit geler les seuils (PLAN l.455).

## Ce qui est fait

- **Lot 1 — authentification backend et roles** : termine. Argon2id, hash de token
  seul en base, rotation a la connexion, expiration/revocation, anti-bruteforce
  borne, roles VIEWER/OPERATOR/ADMIN, audit des connexions, CLI de creation du
  premier admin. Revue securite : 3 bloquants + 1 non-conformite au contrat,
  tous fermes.
- **Lot 2 — BFF Next.js** : termine. Toutes les requetes navigateur passent par
  `/api/backend/[...path]` en meme origine ; cle API et jeton de session restent
  serveur ; proxy ferme par allowlist ancree ; CSRF par recalcul HMAC serveur ;
  `NEXT_PUBLIC_API_KEY` supprimee. Revue securite : 3 bloquants + 10 mineurs,
  tous fermes.
- **G1 : GO**, les 5 criteres du PLAN l.397 verifies un par un (detail dans le SUIVI).

## Etat du depot

Branche `master`. **Rien n'est commite** — tout le travail des lots 1 et 2 est
dans l'arbre de travail. C'est Kevin qui commite.

Preuves rejouables (2026-10-04) :
```
cd backend && npx jest --runInBand auth common/guards   # 5 suites / 33 tests
cd backend && npx jest                                  # 20 suites / 188 tests
cd backend && npx tsc --noEmit --incremental false && npm run build
cd front   && pnpm run test                             # 3 fichiers / 33 tests
cd front   && npx tsc --noEmit --incremental false
cd front   && BACKEND_API_KEY=sentinel-backend-secret pnpm run build
cd front   && grep -rl -e 'NEXT_PUBLIC_API_KEY' -e 'sentinel-backend-secret' .next
```

Le front utilise **pnpm** (`packageManager` epingle a pnpm@11.9.0). Ne jamais
lancer `npm install` dans `front/` : cela creerait un `package-lock.json`
concurrent du `pnpm-lock.yaml`.

Nouvelles variables d'environnement a renseigner avant tout demarrage reel :
backend `API_KEY`, `AUTH_SESSION_TTL_SECONDS`, `AUTH_LOGIN_MAX_ATTEMPTS`,
`AUTH_LOGIN_WINDOW_SECONDS` ; front `BACKEND_API_BASE_URL`, `BACKEND_API_KEY`,
`CSRF_SECRET`, `ALLOWED_ORIGINS`, `SESSION_COOKIE_NAME`, `SESSION_COOKIE_SECURE`.
`SESSION_COOKIE_NAME` doit etre presente **au moment du build** (runtime Edge du
middleware), pas seulement au demarrage.

Premier admin a creer par la CLI : `cd backend && npm run create-admin`, avec
`CREATE_ADMIN_EMAIL`/`CREATE_ADMIN_PASSWORD` passees a l'invocation (elles ne
sont volontairement plus des cles du `.env`).

## Cinq questions en attente d'arbitrage de Kevin

Elles sont detaillees dans `SUIVI_EXECUTION_PARIS.md`. Resume :
1. **Audit des mutations** : le PLAN l.358 l'exige dans le lot 1, mais sa liste de
   fichiers (l.330-357) ne contient aucun fichier mutant. Contradiction interne au
   PLAN. Le lot 1 est "termine sous reserve" tant que ce n'est pas tranche.
2. **Contrat 3.2 l.76** : acter la revision de la cellule Role de `POST /auth/logout`
   (cle serveur-a-serveur, jeton optionnel) apres sa mise en idempotence.
3. **Une seule session active par utilisateur** : une connexion revoque toutes les
   autres. Non ecrit dans 3.2 ; interdit d'etre connecte depuis deux appareils.
4. **Liste de variables de 3.2 l.85** a completer avec `CSRF_SECRET` et `ALLOWED_ORIGINS`.
5. **Deconnexion inaccessible depuis l'interface** : la route existe, aucun bouton.
   A cadrer, probablement avec le lot 9.

Aucune de ces questions ne bloque le demarrage du lot 3.

## Point d'entree du lot suivant

**Lot 3 — Cote observable et suppression des fallbacks fictifs**, PLAN lignes
399-427. Dependance G1 : levee. Lire aussi la section 3.3 (contrat
`ExecutableQuote`) et la section 3.6, qui impose de reutiliser `OddsSnapshot`,
`BacktestEngineService`, `BacktestRun`, `BetResult` et `KpisCalculator` plutot que
de creer une seconde table de cotes, et de separer le signal (`RuleMatch`) de la
cote executable afin qu'une regle ne fabrique plus de prix.

Mode d'execution a laisser a `DISABLED`. Ne pas commencer le lot 3 sans avoir lu
son critere de sortie exact dans le PLAN.
