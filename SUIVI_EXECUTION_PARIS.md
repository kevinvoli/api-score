# SUIVI — Exécution sécurisée des paris

## Avancement

| Lot | Objet | État | Preuve (commit, commande, date) |
|---|---|---|---|
| 1 | Authentification backend et rôles | **Terminé — GO** | 2026-10-10 : 46/46 tests ciblés, 214/214 suite backend, 3/3 intégration MySQL 8.4, migration up/down/up, build et revue GO |
| 2 | BFF Next.js et suppression du secret navigateur | **Terminé — GO**, non commité | 2026-10-04, re-vérifié le 2026-10-10 : 36 tests verts (lint inclus), `tsc` vert, build vert, aucune sentinelle ni `NEXT_PUBLIC_API_KEY` dans `.next` |
| G1 | Frontière de sécurité | **GO** | Prononcé le 2026-10-04, confirmé le 2026-10-10 sur l'état courant (5 critères, voir sections lot 2) |
| 3 | Cote observable sans fallback | **Terminé — non commité, revue externe à faire** | 2026-10-10 : critère de sortie vert (9 suites / 112 tests, `rg` des fallbacks vide, build), lint backend global 0 erreur, migration up/down/up sur MySQL 8.0 jetable avec 200 000 lignes |
| 4 | Validation walk-forward | **Terminé — moteur livré, non commité, revue externe à faire** | 2026-10-10 : critère de sortie vert (5 suites / 62 tests, `lint:check` 0, build), suite backend 274/277 (3 ignorés), migration up/down sur MySQL 8.0, run réel rejoué deux fois avec hashes identiques |
| G2 | Signal hors échantillon | NO-GO initial | Moteur prêt ; seuils à geler par Kevin avant le run final ; historique réel de cotes enrichies à mesurer |
| 5 | Simulation continue | **Terminé — non commité, revue externe à faire** | 2026-10-10 : critère de sortie vert (5 suites / 115 tests dont 6 MySQL réels, build), lint 0, suite backend 349/352, migration up/down, application démarrée. Collecte possible ; qualification après G2 |
| G3 | Simulation probante | NO-GO initial | Fenêtre de 30 jours / 500 décisions non commencée |
| 6 | Kill switch, risque et ledger | **Terminé — non commité, revue externe à faire** | 2026-10-10 : critère de sortie vert (92 tests unitaires, 12 tests d'intégration MySQL réels, build), lint 0, suite backend 446/461 (15 ignorés sans base), migration up/down, contrôle lu `DISABLED` au démarrage |
| 7 | Pipeline d'ordre, sandbox et réconciliation | **Terminé — non commité, revue externe à faire** | 2026-10-10 : critère de sortie vert (5 suites / 72 tests unitaires, 26/26 intégration MySQL 8.0 réel, build), lint 0, suite backend 518/553 (35 ignorés sans base), migration up/down/up/down/up depuis une base vide. Démarré sous la dérogation G3 (PLAN §7) ; mode toujours `DISABLED` |
| G4 | Intégrité sandbox | NO-GO initial | Campagne sandbox non commencée |
| 8 | Adaptateur opérateur approuvé | Bloqué externe | Opérateur, autorisation et documentation non fournis |
| G5 | Opérateur techniquement exécutable | NO-GO initial | Dépend du lot 8 |
| 9 | Console et déploiement progressif | **Console terminée — non commitée, revue externe à faire** | 2026-10-10 : critère de sortie vert (`pnpm run test` 8 fichiers / 79 tests, `tsc`, build, bundle sans secret), backend 522/557 (35 ignorés), parcours réel BFF + backend + MySQL 27/27 avec trois rôles. Vues opérateur réel en attente du lot 8 ; déploiement progressif = séquence du PLAN, non exécutée |
| G6 | Canary réel | NO-GO initial | Décision explicite de Kevin requise |

## Journal de décisions

### 2026-10-02 — Création du chantier sans autorisation d'exécution réelle

- **Contexte** : le dépôt sait produire des suggestions et des backtests, mais expose une clé au navigateur, tolère des cotes fictives et ne possède ni ledger ni réconciliation.
- **Décision** : proposer une livraison par gates, avec mode initial `DISABLED` puis simulation et sandbox ; aucune étape ne donne implicitement l'autorisation de miser.
- **Conséquence** : le lot opérateur et le passage `LIVE_CANARY` restent bloqués tant que les preuves et accords listés dans le PLAN ne sont pas réunis.
- **Ne pas corriger vers** : une activation par variable d'environnement seule ou une promotion automatique après des tests verts.

## Débordements constatés

| Date | Lot | Ce qui a été touché hors de son périmètre | Traitement |
|---|---|---|---|

## Mise a jour du 2026-10-04 — cloture du lot 1

> Le tableau d'avancement en tete de fichier est append-only : cette section
> décrivait un état intermédiaire. Le rectificatif définitif du 2026-10-10
> fait foi pour la clôture du lot 1.

| Lot | Objet | Etat | Preuve (commande, date) |
|---|---|---|---|
| 1 | Authentification backend et roles | **Termine**, avec une reserve ouverte (question 1 ci-dessous). Non commite. | 2026-10-04 : `npx jest --runInBand auth common/guards` -> 5 suites / 33 tests verts ; `npx jest` -> 20 suites / 188 tests verts ; `npx tsc --noEmit --incremental false` vert ; `npm run build` (nest build) vert. |

Deroule : implementation presente a l'ouverture de session -> completion des tests
obligatoires (24 -> 28 tests, les 9 scenarios du PLAN ligne 359 couverts) -> revue
securite `reviewer` : NO-GO, 3 bloquants + 1 non-conformite au contrat 3.2 ->
corrections `backend-dev` -> 4 findings fermes, 28 -> 33 tests.

### Findings de la revue du lot 1 et leur traitement

| Ref | Finding | Traitement |
|---|---|---|
| B1 | `RolesGuard` fail-open sur absence de `@Roles` : aucune route mutante du backend n'etant decoree, une session VIEWER pouvait declencher toutes les mutations (analytics, audit, fixtures, recommendations, settings/smart-rules). Non-conformite a 3.2, "VIEWER est lecture seule". | Ferme dans le lot. `roles.guard.ts` : methode non sure sans `@Roles` -> OPERATOR minimum ; methode sure -> session suffisante. |
| B2 | `RolesGuard` fail-open sur role inconnu : `ROLE_LEVEL[role] < min` valant false pour un role hors enum, l'acces etait accorde. Colonne role en varchar(20) sans contrainte. | Ferme dans le lot. Niveau resolu puis refus si undefined ; colonne passee en enum(VIEWER,OPERATOR,ADMIN) dans la migration. |
| B3 | `auth_login_throttles` : entite mappee vers une table qu'aucune migration ne cree, jamais utilisee (le throttle reel compte des lignes de `operation_audit_events`). Risque de derive de schema au prochain migration:generate. | Ferme dans le lot. Entite supprimee, reference retiree de `entities/index.ts`. |
| B4 | `POST /auth/logout` rendait 401 au rejeu sequentiel, contre "revocation idempotente, 204" (contrat 3.2 ligne 76). | Ferme dans le lot. 204 systematique, cle `x-api-key` toujours exigee, aucun audit ecrit quand rien n'est revoque. |
| M1-M5 | `@CurrentUser()` masquant un undefined ; longueur de token figee en dur dans le regex de `SessionGuard` ; CLI create-admin demarrant les crons via `AppModule` ; `CREATE_ADMIN_PASSWORD` persiste dans le .env du process API ; 3 tests verts donnant une fausse garantie. | Tous fermes dans le lot. |
| 4 lignes | Purge absente (`auth_sessions`, `operation_audit_events`) ; compteur de throttle alors heberge dans la table d'audit ; throttle alors non remis a zero ; absence de CLAUDE.md a la racine. | État intermédiaire : les constats sur le compteur et le reset sont annulés par le rectificatif du 2026-10-10 ; les autres constats restent historiques. |

### 2026-10-04 — Fermeture des fail-open d'autorisation cote guard, pas par decoration

- **Contexte** : la conformite a 3.2 exigeait de proteger les mutations, mais les 5 controleurs mutants sont hors de la liste de fichiers du lot 1 (PLAN 330-357).
- **Decision** : rendre `RolesGuard` fail-closed par defaut (mutation sans `@Roles` -> OPERATOR minimum) plutot que d'ajouter `@Roles` dans 5 controleurs hors perimetre. Les routes `@Public()` et `@SessionPublic()` en sont exemptees, sans quoi `POST /auth/login` devenait inaccessible.
- **Consequence** : le perimetre du lot est respecte et la garantie "VIEWER lecture seule" est portee par un seul fichier. Une route mutante future est protegee par defaut, meme si son auteur oublie le decorateur.
- **Ne pas corriger vers** : un retour au `return true` sur absence de metadonnee, ni une decoration route par route qui laisserait le defaut ouvert.

### 2026-10-04 — Décision intermédiaire annulée : throttle porté par la table d'audit

- **Contexte** : `auth-login-throttle.entity.ts` existait sans table et sans usage ; ni la liste de fichiers du lot 1 ni l'ERD 3.5 ne le mentionnent.
- **Decision intermédiaire** : supprimer l'entite plutot que creer la table. Cette décision est annulée par la clôture définitive du 2026-10-10 : le compteur repose désormais sur `auth_login_attempts` et est remis à zéro après succès.
- **Consequence historique** : les réserves sur le compteur dans l'audit et l'absence de reset sont closes ; la purge reste un sujet de backlog distinct.
- **Ne pas corriger vers** : la creation de `auth_login_throttles` sans revision de l'ERD 3.5 par Kevin.

### 2026-10-04 — POST /auth/logout rendu idempotent au niveau HTTP

- **Contexte** : le contrat 3.2 ligne 76 exige "revocation idempotente, 204" mais range la route sous "session active" ; le `SessionGuard` rejetait donc un token deja revoque en 401 avant le controleur.
- **Decision** : privilegier l'effet contractuel (204 idempotent) sur la colonne Role. La route passe `@SessionPublic()` : la cle serveur-a-serveur reste exigee, seule la session est contournee.
- **Consequence** : le BFF du lot 2 peut appeler logout sans traiter 401 comme un succes. La cellule Role de 3.2 ligne 76 ne decrit plus l'implementation : revision de PLAN a arbitrer par Kevin.
- **Ne pas corriger vers** : un logout qui leve 401 sur rejeu, ni un logout accessible sans `x-api-key`.

### Debordements constates — lot 1

| Date | Lot | Ce qui a ete touche hors de son perimetre | Traitement |
|---|---|---|---|
| 2026-10-04 | 1 | `backend/src/database/entities/auth-login-throttle.entity.ts` avait ete cree alors qu'il n'est ni dans la liste de fichiers du lot 1 ni dans l'ERD 3.5. | Repare dans le lot : fichier supprime, reference retiree. |
| 2026-10-04 | 1 | `backend/src/monitoring/monitoring.controller.ts` et son spec modifies : retrait de `@Public()` sur metrics/*. Fichier absent de la liste du lot 1, mais exige par 3.2 (les health checks restent les seules routes sans cle ni session). | Conserve, verrouille par un test de metadonnees. Signale ici, pas repare : le retirer reouvrirait une route sans cle. |
| 2026-10-04 | 1 | La cellule Role de 3.2 ligne 76 (`POST /auth/logout` -> session active) ne decrit plus l'implementation apres B4. | Non repare. Revision de PLAN, arbitrage Kevin (question 2). |
| 2026-10-04 | 1 | PLAN ligne 358 exige "audit des connexions et mutations" ; seuls les evenements d'auth sont audites, aucun fichier mutant n'etant dans la liste du lot. | Non repare. Contradiction interne au PLAN, arbitrage Kevin (question 1). |

### Questions ouvertes pour Kevin — non tranchees par le team-lead

1. **Audit des mutations** (PLAN 358 contre liste de fichiers 330-357) : le contenu du lot 1 l'exige, sa liste de fichiers l'interdit. Soit l'audit des mutations appartient aux lots 4-5, soit le perimetre du lot 1 doit etre revise. Tant que ce n'est pas tranche, le lot 1 est termine sous reserve.
2. **Contrat 3.2 ligne 76** : acter la revision de la cellule Role de `POST /auth/logout` (cle serveur-a-serveur, jeton optionnel) pour refleter B4.
3. **Une seule session active par utilisateur** : `auth.service.ts` revoque toutes les sessions actives a chaque connexion. Ce modele n'est ecrit nulle part dans 3.2 et interdit par construction d'etre connecte depuis deux appareils : un OPERATOR operant depuis deux postes se deconnecte lui-meme, silencieusement. Comportement laisse tel quel et documente par un test ; une ligne de contrat est necessaire.
4. **Transition de deploiement** : `SessionGuard` etant un APP_GUARD, toutes les routes exigent desormais une session. Le lot 1 ne doit pas etre deploye seul.

## Mise a jour du 2026-10-04 — cloture du lot 2 et prononce de G1

| Lot | Objet | Etat | Preuve (commande, date) |
|---|---|---|---|
| 2 | BFF Next.js et suppression du secret navigateur | **Termine**. Non commite. | 2026-10-04 : `pnpm run test` -> 3 fichiers / 33 tests verts (lint inclus dans le script) ; `npx tsc --noEmit --incremental false` vert ; `BACKEND_API_KEY=sentinel-backend-secret pnpm run build` -> succes, 15 pages ; grep sentinelle sur `.next` -> AUCUN SECRET DANS LE BUNDLE ; grep `NEXT_PUBLIC_API_KEY` sur les sources -> AUCUNE REFERENCE RESIDUELLE. |
| G1 | Frontiere de securite | **GO** | Les 5 criteres du PLAN ligne 397 verifies un par un, voir ci-dessous. |

Deroule : implementation `frontend-dev` (14 tests) -> completion des 8 tests
obligatoires par `tester` (14 -> 26 tests) -> revue securite `reviewer` :
LOT2 NO-GO 3 bloquants, G1 GO -> corrections `frontend-dev` (3 bloquants + 10
mineurs, 26 -> 33 tests).

### Prononce de G1, critere par critere (PLAN ligne 397)

| Critere | Verdict | Preuve |
|---|---|---|
| `NEXT_PUBLIC_API_KEY` n'existe plus dans le code/configuration frontend | OUI | grep sur sources et `.example` -> aucune occurrence. `.env.local.example` reecrit en variables serveur. `next.config.js` sans bloc `env`, donc aucune inlining involontaire. |
| Le bundle ne contient pas de secret sentinelle | OUI | grep sur `.next` -> rien. Verifie aussi par raisonnement d'import : aucun module de `app/`, `components/`, `lib/` hors `app/api/**` n'importe `lib/server/*`, et `middleware.ts` non plus. `lib/types/auth.ts`, partage client/serveur, ne contient que types, guards et noms de cookie. |
| Les mutations exigent session + role + CSRF | OUI | Le proxy exige cookie de session, `Origin` et CSRF sur POST/PUT/PATCH/DELETE. Le **role** reste arbitre par le backend (403 normalise) : le BFF n'est pas une autorite d'autorisation, c'est le bon decoupage. |
| Le backend refuse l'acces direct sans cle serveur | OUI | La cle et l'URL backend ne sont plus atteignables depuis le navigateur ; l'exigence cote backend releve du lot 1, deja revu, et rien du lot 2 ne l'affaiblit. |
| Les tests 401/403 sont verts | OUI | 401 session absente (proxy, me), 401 login normalise, 403 hors allowlist, 403 cross-origin (proxy, logout, et desormais login), 403 CSRF invalide, 403 backend normalise sans corps brut. |

### Findings de la revue du lot 2 et leur traitement

| Ref | Finding | Traitement |
|---|---|---|
| B1 | `POST /api/auth/login` ne verifiait ni `Origin` ni `Host` alors qu'un login est mutant (il pose deux cookies). Scenario : page malveillante -> POST cross-site avec les identifiants de l'attaquant -> cookies de la victime ecrases, deconnexion forcee, actions de la victime enregistrees dans le compte de l'attaquant. | Ferme dans le lot. `isOriginValid` appele en premier, 403 avant tout appel backend. |
| B2 | Cookie CSRF pose sans `maxAge` alors que le cookie de session est persistant : apres fermeture du navigateur, session valide mais CSRF disparu -> toutes les mutations en 403, **logout compris**, aucune route ne reposant le cookie. Impasse. | Ferme dans le lot. Cookie CSRF pose avec le meme `maxAge` que la session. |
| B3 | Un backend rendant 2xx avec un corps non conforme produisait `{status: 200, error: ...}` : le client voyait `response.ok`, redirigeait, aucun cookie pose, retour silencieux sur `/login`. | Ferme dans le lot. 2xx + type guard en echec -> 502 "Reponse backend invalide". |
| M4-M13 | `maxAge` non positif traite comme reponse invalide ; `Origin` compare a `ALLOWED_ORIGINS` au lieu de `x-forwarded-host` (controlable par l'appelant) ; `application/json` force + `nosniff` + `no-store` ; session verifiee **avant** l'allowlist (l'ordre inverse permettait d'enumerer le perimetre proxyfie) ; corps borne a 1 Mo (413) ; echec explicite cote client si cookie CSRF absent ; test trompeur sur la non-recopie d'en-tetes rendu probant ; lint remis dans le script `test` ; `pnpm-workspace.yaml` desambiguise et `packageManager` epingle ; avertissement sur l'inlining Edge de `SESSION_COOKIE_NAME`. | Tous fermes dans le lot. |
| 3 lignes | Aucun job `front` en CI ; aucun composant/hook ne conditionne les actions mutantes au role ; les hooks ne distinguent pas un 401 d'une erreur generique. | Hors perimetre -> inscrits au `BACKLOG_EXECUTION_PARIS.md` par le `reviewer`. |

### 2026-10-04 — Decision : CSRF par recalcul HMAC serveur, et non double-submit

- **Contexte** : le PLAN 3.2 l.84 exige un jeton CSRF "lie a la session" ; le BFF est sans etat serveur.
- **Decision** : le jeton est `HMAC-SHA256(sessionToken, CSRF_SECRET)`, pose dans un second cookie lisible par le JS et renvoye en en-tete `X-CSRF-Token` ; le serveur **recalcule** et compare en temps constant.
- **Consequence** : le serveur ne fait jamais confiance au cookie, donc une injection de cookie depuis un sous-domaine voisin ne donne rien — la ou un double-submit naif tomberait. Aucun etat serveur, aucune table.
- **Ne pas corriger vers** : une comparaison cookie/en-tete sans recalcul, ni un jeton CSRF stocke en base.

### Debordements constates — lot 2

| Date | Lot | Ce qui a ete touche hors de son perimetre | Traitement |
|---|---|---|---|
| 2026-10-04 | 2 | `front/pnpm-workspace.yaml` modifie (absent de la liste du PLAN 367-389) : effet de bord de `pnpm approve-builds` apres l'ajout de `vitest`. | Repare dans le lot : champ contradictoire supprime, `packageManager` epingle pour rendre l'installation deterministe. |
| 2026-10-04 | 2 | Deux variables serveur hors de la liste de 3.2 l.85 : `CSRF_SECRET` (requis par la decision CSRF ci-dessus) et `ALLOWED_ORIGINS` (requis par la correction M6). Aucune n'est `NEXT_PUBLIC_*`, la clause contraignante de 3.2 l.85 est donc respectee. | Conserve. Signale ici : la liste de variables de 3.2 l.85 est a completer a la prochaine revision du PLAN. |
| 2026-10-04 | 2 | `front/app/layout.tsx` et `front/tsconfig.json`, listes au PLAN l.371 et l.375, n'ont **pas** eu besoin d'etre touches. Pas un debordement : une liste de fichiers plus large que necessaire. | Aucun. Signale pour que l'absence de diff sur ces deux fichiers ne passe pas pour un oubli. |

### Question ouverte supplementaire pour Kevin

5. **Deconnexion inaccessible depuis l'interface** : `app/layout.tsx` n'a pas ete modifie, donc aucun bouton de deconnexion n'existe. L'ajouter imposait de transformer le layout racine en composant client (perte de l'export `metadata`) ou de creer un fichier hors perimetre. Le lot 2 livre la route `POST /api/auth/logout` et ses tests, mais aucun point d'entree utilisateur : a cadrer, probablement avec le lot 9 (console d'exploitation).

## Rectificatif définitif du 2026-10-10 — clôture du lot 1

Cette section remplace l'état intermédiaire et les réserves du 2026-10-04 pour
le lot 1. Verdict final : **Terminé — GO**, non commité.

### Décisions finales

- Les sessions utilisent un jeton opaque ; seul son hash est persisté. Les mots de passe sont hachés avec Argon2id.
- La clé backend reste une clé serveur-à-serveur portée par le BFF et n'est jamais exposée au navigateur.
- L'autorisation est fail-closed : toute mutation non classifiée requiert le rôle `ADMIN` ; les rôles ou métadonnées invalides sont refusés.
- Les mutations et les refus `403` sont consignés dans l'audit, sans secret ni jeton de session.
- Le throttling de connexion repose sur `auth_login_attempts`, avec incrément et décision atomiques sous concurrence ; un succès remet le compteur à zéro.
- Les emails sont normalisés en NFKC avant comparaison et la colonne utilise une collation binaire afin d'éviter les collisions Unicode/casse implicites.
- `POST /auth/logout` est idempotent : un rejeu conserve le résultat attendu sans recréer ni prolonger une session.

### Preuves de sortie

| Vérification | Résultat |
|---|---|
| Tests ciblés du lot 1 | **46/46 verts** |
| Suite backend complète | **214/214 verts** |
| Intégration MySQL 8.4 | **3/3 verts** |
| Migration d'authentification | **up/down/up vert** |
| Rotation de session concurrente | **Verte** |
| Throttle concurrent | **Vert** |
| Build backend | **Vert** |
| Diff-check du périmètre | **Vert** |
| Lint limité aux fichiers du lot 1 | **Vert** |
| Revue finale qualité/sécurité | **GO** |

### Questions du 2026-10-04 désormais tranchées

- L'audit des mutations et des refus `403` est implémenté ; la réserve n°1 est levée.
- Le logout idempotent est le contrat retenu ; la réserve n°2 est levée.
- La rotation concurrente des sessions est couverte par la preuve dédiée ; la réserve n°3 est levée.
- Le lot 1 ne doit toujours pas être déployé isolément du BFF, mais cela ne bloque plus sa clôture puisque les fichiers du lot 2 sont déjà présents dans l'arbre de travail.

### Débordements constatés — clôture finale du lot 1

| Date | Lot | Ce qui est présent hors de son périmètre | Traitement |
|---|---|---|---|
| 2026-10-10 | 1 | Des fichiers relevant déjà des lots 2 et 3 sont présents dans l'arbre de travail, notamment sous `front/app/api/`, `front/lib/server/`, `backend/src/odds/`, `backend/src/backtest/` et `backend/src/recommendations/`. | Non absorbés par le lot 1 ; ils restent attribués à leurs lots respectifs. |
| 2026-10-10 | 1 | Le lint backend global reste rouge avec **12 erreurs** dans des fichiers hors lot 1, issus des travaux des lots 2/3. | Non corrigé dans le lot 1 ; inscrit au backlog pour traitement dans le lot propriétaire. Le lint scoped lot 1 est vert. |

## Mise à jour du 2026-10-10 — clôture du lot 3

Verdict : **Terminé**, non commité. Le code du lot 3 était déjà présent dans l'arbre de
travail mais n'avait jamais été vérifié ni clôturé. Cette session l'a vérifié, corrigé et
prouvé. La revue indépendante par `reviewer` (recherche de fabrication de cote restante)
reste à faire avant de considérer le lot relu au sens de la définition de terminé.

### Ce qui était déjà en place (vérifié)

- `ExecutableQuoteService` unique : chargement groupé des candidates puis sélection de la
  dernière cote admissible, sans donnée future (`receivedAt <= T`, `observedAt <= receivedAt`,
  âge borné, `available`, cote > 1), départage déterministe des snapshots concurrents.
- `RuleMatch` ne porte plus de prix (`currentOdd` et `liveOdd` retirés) ; `minAcceptableOdd` est
  un seuil, pas une cote. Une suggestion n'est émise qu'avec une cote observée admissible.
- `STRATEGY_DEFAULT`, `liveOdd ??` et `sourced?.odd ??` absents de `src/`.
- Les 10 tests obligatoires du PLAN sont présents (`executable-quote.service.spec.ts`,
  `backtest-engine.service.spec.ts`, mapper, ingestion, smart-suggestions).

### Corrections apportées le 2026-10-10

| Constat | Gravité | Correction |
|---|---|---|
| `received_at`/`observed_at` en `datetime` sans fraction : MySQL **arrondit** (12:00:00.400 → 12:00:00), donc une cote reçue après T devenait sélectionnable à T. Violation sub-seconde du test « cote reçue après T exclue ». | Haute | `datetime(3)` dans la migration et l'entité. Prouvé en base : la ligne reçue à 12:00:00.400 n'est plus retenue à T=12:00:00. |
| Index `idx_odds_snapshots_executable_lookup` mené par `provider_key`, jamais filtré par égalité : la requête de sélection faisait un **scan complet** (`EXPLAIN` : `type ALL`, 197 432 lignes sur 200 000). | Haute | Index ramené à `(providerFixtureId, received_at)` : `type range`, 3 lignes examinées. |
| 12 erreurs de lint dans les fichiers du lot 3 (prettier + 2 variables inutilisées), inscrites au backlog à la clôture du lot 1. | Moyenne | Corrigées. Lint backend global : 0 erreur. |

La migration `20261002100000-enrich-executable-odds.ts` a été modifiée en place, ce qui est
admissible tant qu'elle n'est ni commitée ni déployée. **Si elle a déjà été jouée sur une base
locale**, faire `npm run db:migrate:revert` puis `npm run db:migrate` pour obtenir `datetime(3)`
et le nouvel index (les colonnes du lot 3 sont recréées vides, puis réalimentées par l'ingestion).

### Preuves de sortie

| Vérification | Résultat |
|---|---|
| `npm test -- --runInBand odds backtest recommendations/rules recommendations/smart-suggestions.service.spec.ts` | **9 suites / 112 tests verts** |
| `rg -n "STRATEGY_DEFAULT\|liveOdd\s*\?\?\|sourced\?\.odd\s*\?\?" src` | **Aucune occurrence** |
| `npm run build` | **Vert** |
| `eslint` global backend | **0 erreur** |
| Chaîne complète des migrations sur MySQL 8.0 vierge | **Verte** |
| Migration du lot 3 up/down/up/down/up avec 200 000 lignes | **Verte**, lignes historiques conservées, non enrichies donc inéligibles |
| `schema:log` sur les colonnes du lot 3 | **Aucun écart** entité/schéma |
| Suite backend complète | **230/233 verts, 3 ignorés, 0 échec** (après la décision `MYSQL_PASSWORD`) |

### Hors périmètre constaté, non corrigé

- ~~`src/config/env.validation.spec.ts` échoue sur `MYSQL_PASSWORD`~~ — **tranché le 2026-10-10** (voir décision ci-dessous).
- `smart-rules-config` conserve des champs `odds.*.current` (1.75, 1.45, 1.65) qui ne sont plus
  lus par aucune décision. Inscrit au backlog.
- Le tableau d'avancement indique encore le lot 2 « À faire » et G1 « NO-GO » alors que les
  sections du 2026-10-04 les déclarent terminé et GO. À réconcilier par Kevin.

### Débordements constatés — lot 3

| Date | Lot | Ce qui a été touché hors de son périmètre | Traitement |
|---|---|---|---|
| 2026-10-10 | 3 | `backend/src/main.ts` (CORS : `*` traduit en `origin: true`, en-têtes autorisés complétés, formatage) et `front/.env.local` créé (non suivi par git) pour débloquer la connexion locale. Correction de bug demandée hors chantier. | Conservé. |

### 2026-10-10 — Décision : `MYSQL_PASSWORD` optionnel

- **Contexte** : la base locale de Kevin tourne sans mot de passe. Pour démarrer, le mot de passe avait été
  mis en commentaire dans `database.module.ts` et `data-source.ts` : il était alors **ignoré même renseigné**,
  et `env.validation.spec.ts` était rouge.
- **Décision (Kevin)** : `MYSQL_PASSWORD` est optionnel. Absent ou vide → connexion sans mot de passe ;
  renseigné → transmis à l'API, à la CLI TypeORM et à `check-db-connection`. Une valeur faite uniquement
  d'espaces reste refusée.
- **Preuves** : suite backend 230/233 (3 ignorés, 0 échec), lint 0, build vert ; sur MySQL 8.0, connexion OK sans
  mot de passe, OK avec mot de passe, refus `Access denied` avec un mauvais mot de passe.
- **Ne pas corriger vers** : une ligne `password` commentée, qui fait ignorer un mot de passe réel.
- Fichiers : `config/env.validation.ts` et sa spec, `database/database.module.ts`, `database/data-source.ts`,
  `scripts/check-db-connection.ts`, `AGENTS.md`, `backend/README.md`, `backend/.env.example`.

## Mise à jour du 2026-10-10 — clôture du lot 4

Verdict : **Terminé (moteur livré)**, non commité. Conformément au PLAN l.430, la couverture
réelle de cotes n'est pas encore mesurée sur les données de production : **G2 reste NO-GO**.
La revue indépendante `reviewer` (frontières temporelles) reste à faire.

### Ce qui a été livré

- `POST /v1/audit/walk-forward` (`ADMIN`, `202 { runId }`) et `GET /v1/audit/walk-forward/:id` (`VIEWER+`,
  run + folds ordonnés). Les routes `/v1/audit/backtest*` gardent exactement leurs URL.
- `WalkForwardService` : folds glissants à fenêtres semi-ouvertes `[from, to[`, tests disjoints
  (`stepDays >= testWindowDays`), au plus 200 folds, plage bornée à 1 096 jours.
- **Gel avant mesure** : stratégie copiée en profondeur, version, fenêtres, paramètres de cote et seuil
  d'éligibilité persistés avant exécution ; l'exécution ne relit que cette copie. `config_hash`,
  `dataset_hash` (stats, fixtures, buts, cotes candidates, ordre-indépendant) et `result_hash` en sha256.
- **Un seul rejeu** sur toute la plage, puis découpage par fold : une requête par table, jamais par fixture ni par fold.
- **Éligibilité explicite** : `INCOMPLETE_WINDOW`, `NO_SIGNAL`, `INSUFFICIENT_ODDS_COVERAGE` (< 95 %, seuil
  initial de G2) ; jamais d'interpolation. Le résumé n'agrège que les tests des folds éligibles.
- **Comptabilité des signaux** : chaque signal (fixture, équipe, marché) est classé au stade le plus avancé
  atteint (pas de cote à la décision, sous le minimum, pas de cote à l'exécution, cote tombée sous le minimum, placé).
- **KPIs** : ROI net, mise et profit totaux, drawdown, slippage moyen (décision → exécution), IC 95 % du
  rendement unitaire, couverture. Mise plafonnée à la bankroll disponible ; bankroll épuisée = pari non placé.
- Exécution unique garantie par transition conditionnelle `PENDING → RUNNING` ; échec → `FAILED` sans fold.

### Preuves de sortie

| Vérification | Résultat |
|---|---|
| `npm test -- --runInBand walk-forward backtest audit` | **5 suites / 62 tests verts** |
| `npm run lint:check` | **0 erreur, 0 avertissement** |
| `npm run build` | **Vert** |
| Suite backend complète | **274/277, 3 ignorés, 0 échec** |
| Migration `20261002110000` up/down/up/down/up sur MySQL 8.0 | **Verte** ; contrainte d'ordre des dates appliquée par le SGBD |
| Run réel sur MySQL (30 matchs, 1 sur 5 sans cote), exécuté deux fois | `config_hash`, `dataset_hash`, `result_hash` et résumé **identiques** ; 3 folds sur 6 écartés pour couverture insuffisante, 1 incomplet |

Tests obligatoires du PLAN couverts : frontière exacte (début inclus, fin exclue), cote reçue après la
décision ignorée et comptée, stats hors plage non lues, fold incomplet, couverture insuffisante, stratégie
modifiée après lancement sans effet, rejouabilité bit à bit (y compris cotes dans un autre ordre), bornes de
bankroll (nulle, négative, épuisée, mise plafonnée), absence de N+1 (12 fixtures → une requête par table).

### Décisions

- **Pas d'ajustement sur l'entraînement** : l'optimisation hyperparamétrique est hors périmètre (PLAN l.450).
  La stratégie est figée ; les métriques train/validation sont calculées et conservées pour lecture, le test
  est mesuré une seule fois et seul agrégé.
- **Couverture** = part des signaux disposant d'une cote admissible à la décision **et** à l'exécution ; un
  refus pour cote sous le minimum n'est pas une absence de donnée et ne dégrade pas la couverture.
- **Mise plafonnée à la bankroll** : avant ce lot, une mise FLAT pouvait rendre la bankroll négative. Le
  backtest classique hérite de ce comportement (plus réaliste) ; ses paris non placés ne sont plus insérés.

### Débordements constatés — lot 4

| Date | Lot | Constat | Traitement |
|---|---|---|---|
| 2026-10-10 | 4 | `audit.module.ts`, listé au PLAN, n'a pas eu besoin d'être modifié (`BacktestModule` exporte déjà le service). | Aucun. Signalé pour que l'absence de diff ne passe pas pour un oubli. |
| 2026-10-10 | 4 | `backtest-engine.service.spec.ts` (lot 3) mocke le query builder sans `addOrderBy` : le départage des snapshots simultanés est fait en mémoire plutôt qu'en SQL, pour ne pas toucher ce fichier hors liste. | Conservé, ordre identique. |

## Mise à jour du 2026-10-10 — clôture du lot 5

Verdict : **Terminé**, non commité. Le mode simulation peut collecter dès maintenant ; il ne sera
**qualifié** qu'après G2 (PLAN l.459). G3 n'a pas commencé : sa fenêtre probante de 30 jours et 500
décisions résolues démarre au premier run sous une version de stratégie gelée. Revue `reviewer`
(aucune branche vers un opérateur réel) à faire.

### Ce qui a été livré

- Routes du contrat 3.3 : `POST /v1/simulation/runs` (`ADMIN`, même clé + même contenu → même run,
  contenu différent → `409`), `POST /v1/simulation/runs/:id/stop` (`ADMIN`, idempotent),
  `GET …/decisions` (`VIEWER+`, curseur stable, filtres statut/marché/période) et `GET …/summary` (`VIEWER+`).
- `simulation_runs` : stratégie et politique de risque/cote figées, bankroll initiale `decimal`, devise.
  `bet_decisions` : **une ligne par signal évalué, accepté ou rejeté**, clé d'idempotence unique, copie
  immuable des cotes (décision et exécution) ; la purge d'un `odds_snapshot` met la référence à NULL sans
  toucher la décision (vérifié en base). Suppression d'un run avec décisions refusée (`RESTRICT`).
- Cycle d'un ordre virtuel : cote admissible à la décision → mise réservée (`ORDER_RESERVED`) → cote
  recherchée à `decidedAt + latence` chez le même bookmaker → slippage mesuré, ou refus `ODD_MOVED` /
  `NO_EXECUTABLE_ODD` → règlement `WON`/`LOST`/`VOID`, ou `NO_RESULT` après 24 h (mise rendue).
- Montants en **centimes entiers** (`toCents`/`fromCents`, `decimal(14,2)` en base), jamais de float ;
  gain calculé en millièmes de cote, une seule règle d'arrondi.
- Bankroll virtuelle dérivée uniquement du journal (initial + réalisé − mises ouvertes) ; mise plafonnée
  par la bankroll, le plafond par pari et l'exposition maximale, sinon rejet `LIMIT_EXCEEDED`.
- Tick sous **verrou exclusif de la ligne du run** (`SELECT … FOR UPDATE`) : deux ticks concurrents, sur une
  ou plusieurs instances, sont sérialisés. Clés d'idempotence + `INSERT IGNORE` en seconde ligne.
- Scheduler **désactivé par défaut** (`SIMULATION_SCHEDULER_ENABLED=false`), un run en échec n'arrête pas les autres.
- Aucun import d'adaptateur réseau ou opérateur dans `simulation/` (test statique).

### Preuves de sortie

| Vérification | Résultat |
|---|---|
| `npm test -- --runInBand simulation recommendations/smart-suggestions.service.spec.ts recommendations/rules/outcome-resolver.spec.ts` | **5 suites / 115 tests verts**, dont 6 sur MySQL 8.0 réel |
| `npm run build` | **Vert** |
| `npm run lint:check` | **0 erreur** |
| Suite backend complète | **349/352, 3 ignorés, 0 échec** |
| Migration `20261002120000` up/down/up/down/up | **Verte** |
| Test de mutation : verrou du tick retiré | Le test de bankroll concurrente **échoue** (60 + 60 sur 100) : le test protège bien |
| Démarrage réel de l'application | 4 routes montées, scheduler désactivé, appels non authentifiés → `401` |

Tests obligatoires du PLAN couverts : double tick simultané (3 ticks concurrents → 1 décision),
redémarrage après crash (nouvelle instance → exécution et règlement sans doublon), décision sans cote,
cote déplacée sous le minimum, ordre virtuel accepté/refusé, `VOID`/`NO_RESULT`, limite de bankroll (y
compris sous concurrence), arrêt d'un run (plus de décision, règlement des ordres ouverts) et agrégats
identiques à un recalcul indépendant du journal.

Les tests MySQL s'activent comme ceux du lot 1, sur une base éphémère dédiée :
`SIMULATION_MYSQL_INTEGRATION_DB_URL=mysql://…/api_score_simulation_it SIMULATION_MYSQL_INTEGRATION_DESTRUCTIVE=api-score-simulation-it npm test -- simulation`.
Sans ces variables, ils sont ignorés.

### Décisions

- **Match annulé = `VOID`** pour la simulation, via une nouvelle fonction `resolveSettlement`. `resolveOutcome`
  (coupons historiques, backtest) reste inchangé et compte toujours une annulation comme `LOST` : signalé au backlog.
- **Rejets journalisés une fois par motif et par signal** : un signal qui déclenche à chaque tick sans cote
  produit une ligne `NO_EXECUTABLE_ODD`, pas une ligne par tick. Un ordre refusé à l'exécution peut être
  retenté au tick suivant avec une nouvelle clé (`ORDER:1`, …), comme le backtest.
- **`BELOW_MIN_ODD`** ajouté à `RejectionCode` : une cote vue mais sous le minimum de la règle n'est ni une
  absence de donnée ni un mouvement de marché. La couverture de cote ne compte comme manquants que les signaux
  qui n'ont jamais eu de cote admissible.
- `POST /simulation/runs` répond `200` à la création comme au rejeu : le client n'a pas à distinguer les deux.

### Débordements constatés — lot 5

| Date | Lot | Constat | Traitement |
|---|---|---|---|
| 2026-10-10 | 5 | `audit/audit.controller.ts` : `isWalkForwardStrategy` exporté (un mot) pour valider la stratégie de simulation sans dupliquer la garde. | Conservé ; déplacement vers un module partagé inscrit au backlog. |
| 2026-10-10 | 5 | `backend/.env.example` et `AGENTS.md` : deux variables optionnelles documentées (`SIMULATION_SCHEDULER_ENABLED`, `SIMULATION_TICK_INTERVAL_MS`), non validées par `env.validation.ts` (hors liste) mais lues avec défauts et bornes. | Conservé. |
| 2026-10-10 | 5 | `odds/executable-quote.service.ts`, listé au PLAN, n'a pas eu besoin d'être modifié. | Aucun. |

## Mise à jour du 2026-10-10 — re-vérification du lot 2 et confirmation de G1

Le tableau d'avancement indiquait encore le lot 2 « À faire » et G1 « NO-GO », en contradiction avec la
section du 2026-10-04. Le lot 2 a été **re-vérifié sur l'état courant** de l'arbre (backend des lots 3 à 5
compris) avant de corriger le tableau.

### Preuves (2026-10-10, installation `pnpm install --frozen-lockfile`, pnpm 11.9.0)

| Vérification | Résultat |
|---|---|
| `pnpm run test` (lint + vitest) | **3 fichiers / 36 tests verts** (33 + 3 nouveaux) |
| `npx tsc --noEmit --incremental false` | **Vert** |
| `BACKEND_API_KEY=sentinel-backend-secret pnpm run build` | **Vert**, 15 pages |
| Recherche `NEXT_PUBLIC_API_KEY` / `sentinel-backend-secret` dans `.next` et dans les sources | **Aucune occurrence** |
| Couverture de l'allowlist BFF | Chacun des 23 appels de `lib/api/*.ts` correspond à une entrée ; les URL `/v1/audit/backtest*` sont inchangées après le lot 4 |
| Backend démarré (lot 5) : appel direct sans clé serveur, puis avec clé sans session | **401** dans les deux cas — critère G1 « accès direct refusé » confirmé sur le backend courant |

### Correction apportée : diagnostic des refus d'origine

- **Constat (incident du 2026-10-10)** : sans `front/.env.local`, `ALLOWED_ORIGINS` était vide ; toute mutation,
  connexion comprise, était refusée en 403 « Origine invalide » sans aucune trace côté serveur. Le symptôme a été
  pris pour un problème CORS backend. Même effet silencieux pour un accès par `127.0.0.1` alors que seule
  `localhost` est autorisée.
- **Correction** (`lib/server/csrf.ts`) : le refus reste systématique (fail-closed inchangé) ; le serveur Next
  journalise désormais la cause, **une fois par cause** et dans une mémoire bornée (20 origines) : configuration
  absente (`console.error`) ou origine reçue hors liste avec la liste attendue (`console.warn`). Seules des origines,
  publiques par nature, sont journalisées — jamais corps, mot de passe ni cookie (test dédié).
- **Tests ajoutés** (`app/api/auth/login/route.test.ts`) : configuration absente → 403 + message unique ; origine
  `127.0.0.1` hors liste → 403 + origine et liste journalisées ; aucune donnée sensible dans les logs.
- `front/.env.local.example` : consignes `SESSION_COOKIE_SECURE=false` en dev http et « localhost ≠ 127.0.0.1 ».
  **Non reporté automatiquement** (écriture des fichiers `.env*` interdite à l'outil) : à appliquer à la main.

### Points ouverts du lot 2 — traités le 2026-10-10 (voir section suivante)

- Allowlist : walk-forward et simulation toujours non exposés (backlog lot 9).

## Mise à jour du 2026-10-10 — fermeture des points ouverts du lot 2

Demandé par Kevin : déconnexion dans l'interface, CI du front, actions conditionnées au rôle. Le
traitement du `401` (même ligne de backlog que le rôle) a été fait avec, car il en est indissociable.

### Livré

- **Déconnexion** (question n°5, close) : `components/session-menu/SessionMenu.tsx` dans la barre du haut —
  email, badge de rôle, « Se déconnecter » (révocation backend + effacement des cookies + vidage du cache
  TanStack, puis `/login`). Le layout **reste un composant serveur** avec son export `metadata` : y inclure
  un composant client suffisait, contrairement à ce que notait la question n°5.
- **Rôle dans l'interface** : `GET /api/auth/me` via `lib/api/session.ts` et `lib/hooks/useCurrentUser.ts`
  (`usePermission`). Synchronisation, backtest baseline, test de configuration et sauvegarde des réglages sont
  **désactivés** hors `ADMIN`, avec l'infobulle « Action réservée aux administrateurs », et une mention
  « Lecture seule » sur les paramètres. Désactivés aussi pendant le chargement du rôle (fail-closed). Le backend
  reste la seule autorité ; `MUTATION_ROLE = 'ADMIN'` reflète son défaut fail-closed du lot 1.
- **Session expirée** : `apiFetch` redirige vers `/login` sur un `401` du BFF, jamais depuis `/login` (pas de
  boucle) ; un `403` ne déconnecte pas.
- **CI** : job `front` ajouté à `.github/workflows/ci.yml` (pnpm épinglé par `packageManager`, `pnpm install
  --frozen-lockfile`, lint + tests, `tsc`, build avec `BACKEND_API_KEY=sentinel-backend-secret`, échec si la
  sentinelle ou `NEXT_PUBLIC_API_KEY` apparaît dans `.next`). **Fichier protégé contre l'écriture à distance :
  à poser à la main** (contenu fourni à Kevin le 2026-10-10).

### Preuves

| Vérification | Résultat |
|---|---|
| `pnpm run test` | **5 fichiers / 50 tests verts** (+14 : session, permissions, redirection 401) |
| `tsc`, build sentinelle, grep `.next` | **Verts**, bundle propre |
| Job CI simulé depuis un état vierge (sans `node_modules` ni `.next`) | **Vert** — a d'abord détecté une erreur de typage dans un nouveau test, corrigée |
| Parcours réel Playwright (backend + front démarrés, MySQL) | **17/17** : ADMIN actions actives ; déconnexion → cookies effacés, session révoquée en base, page protégée → `/login` ; VIEWER badge « Lecture », 4 actions désactivées avec infobulle ; session révoquée côté serveur → redirection automatique et `/login` stable |
| `next lint` | Aucun nouvel avertissement (les journaux serveur de `csrf.ts` sont explicitement autorisés) |

### Débordements constatés

| Date | Lot | Constat | Traitement |
|---|---|---|---|
| 2026-10-10 | 2 (suite) | Fichiers hors liste du lot 2 : `components/session-menu/*`, `lib/api/session.ts`, `lib/hooks/useCurrentUser.ts`, `app/audit/page.tsx`, `app/parametres/page.tsx`, `components/sync-button/SyncButton.tsx`, `app/globals.css`, `.github/workflows/ci.yml`. | Demande explicite de Kevin ; points issus du backlog du lot 2. |

## Mise à jour du 2026-10-10 — clôture du lot 6

Verdict : **Terminé**, non commité. **Le mode reste `DISABLED`** : la migration crée le contrôle arrêté,
indépendamment de toute variable ; aucune gate n'est enregistrée. Revue `reviewer` (fail-open, mutation du
ledger, calcul flottant) à faire.

### Livré

- **Kill switch persistant** (`execution_controls`, ligne `GLOBAL` versionnée, ADR 003). Lecture fail-closed :
  base indisponible, ligne absente ou mode inconnu → `DISABLED`. Lu au démarrage, avant chaque réservation (verrou
  partagé) ; l'arrêt prend le verrou exclusif, attend les réservations en cours puis les bloque toutes. L'arrêt
  n'est **jamais refusé** (même version périmée) et recrée la ligne si elle a disparu.
- **Transitions de mode** versionnées (`409` sur version périmée), une marche à la fois en montée, retour direct à
  `DISABLED` toujours permis. Monter exige une politique de risque active et les preuves de gate : SIMULATION ← G1+G2,
  SANDBOX ← G3, LIVE_CANARY ← G4+G5+G6 **et** `REAL_MONEY_INTERLOCK=true` (second verrou, jamais suffisant seul).
- **Preuves de gate** immuables (`execution_gate_evidence`), enregistrées et approuvées par un ADMIN identifié,
  rattachées au contrôle ; verdict `GO` exigé.
- **Politiques de risque** immuables et versionnées : mise par pari, budget du jour, perte du jour, exposition,
  âge maximal de cote, devise. Activation seulement contrôle arrêté.
- **Ledger append-only** : `RESERVE` / `RELEASE` / `SETTLE` / `ADJUSTMENT` (ouverture de compte seulement), montants
  en centimes entiers et `decimal(14,2)`, clé d'écriture unique (rejeu = même résultat, autre montant = refus),
  chaque écriture porte la version du compte qu'elle produit (unicité `(compte, version)` en base). Aucune méthode
  ni requête de mise à jour ou de suppression des écritures (tests statiques).
- **Moteur de risque** : limite exactement atteinte acceptée, dépassée d'un centime refusée. **Arrêts automatiques** :
  contrôle illisible ou base en erreur, cote périmée ou datée du futur, budget ou perte du jour atteints, horloge
  applicative/MySQL au-delà de 2 s, invariant ledger rompu. Tout arrêt est audité et exige une réactivation manuelle.
  Les déclencheurs opérateur (solde divergent, ordre `UNKNOWN` ancien, reçu absent, réconciliation en retard, taux
  d'erreur) sont déclarés et seront branchés aux lots 7-8.
- Relâcher et régler restent possibles exécution arrêtée : l'arrêt ne doit jamais empêcher de dénouer une exposition.
- **Audit** de chaque transition, arrêt et activation dans la même transaction : métadonnées scalaires choisies,
  motif sur une ligne, borné à 500 caractères.
- Routes : `GET /execution/control`, `PUT …/control/stop`, `PUT …/control/mode`, `GET /execution/accounts/:id`,
  `POST /execution/risk-policies`, `POST /execution/gate-evidence`.

### Bug trouvé et corrigé par les tests d'intégration

En `REPEATABLE READ` (défaut MySQL), la vue d'une transaction est figée à sa première lecture simple, qui avait lieu
**avant** le verrou du compte. Le budget du jour était donc calculé sur un instantané périmé : **20 réservations
concurrentes acceptées sur un reste de 5**, et deux écritures concurrentes de même clé finissaient en erreur. Toutes les
transactions qui écrivent dans le ledger sont désormais en `READ COMMITTED` (`LEDGER_ISOLATION`, commentaire
explicatif dans le code). **Ne pas revenir au niveau par défaut.**

### Preuves de sortie

| Vérification | Résultat |
|---|---|
| `npm test -- --runInBand execution` | **92 tests verts** (12 d'intégration ignorés hors base) |
| `npm run test:integration -- --runInBand execution` | **12/12 verts sur MySQL 8.0** ; **échoue** si la base n'est pas configurée (pas de succès silencieux) |
| `npm run build` / `npm run lint:check` | **Verts** |
| Suite backend complète | **446/461, 15 ignorés, 0 échec** |
| Migration `20261002130000` up/down/up/down/up | **Verte** ; contrôle initial `GLOBAL / DISABLED / v1 / BOOTSTRAP` |
| Démarrage réel | 6 routes montées ; `execution_control_loaded` : `DISABLED`, interlock fermé ; arrêt sans session → `401` |

Tests obligatoires couverts sur MySQL : 20 réservations concurrentes sur le dernier budget (exactement 5 acceptées,
arrêt automatique ensuite), limites exactement atteintes / dépassées, double écriture même clé, écriture forgée refusée
et ledger altéré détecté avec arrêt, base indisponible, contrôle absent, interlock fermé, changement de mode concurrent
(une seule transition gagne), arrêt pendant des réservations (aucune écriture postérieure à l'arrêt) et audit expurgé.

Lancement des tests d'intégration :
`EXECUTION_MYSQL_INTEGRATION_DB_URL=mysql://…/api_score_execution_it EXECUTION_MYSQL_INTEGRATION_DESTRUCTIVE=api-score-execution-it npm run test:integration -- --runInBand execution`.

### Décisions

- **L'arrêt est permis en toute circonstance** et ne vérifie pas la version : arrêter est toujours sûr ; la version
  n'est vérifiée que pour monter.
- **Exposition et solde insuffisant ne déclenchent pas d'arrêt** : ils sont transitoires et se résorbent au règlement.
  Seuls le budget **épuisé** et la perte du jour **atteinte** arrêtent (« limite atteinte » du PLAN).
- **Jour = jour UTC** pour les plafonds journaliers.
- Gates par mode : SIMULATION ← G1+G2, SANDBOX ← G3, LIVE_CANARY ← G4+G5+G6. À confirmer par Kevin (le PLAN ne fixe pas
  explicitement ce mapping, il découle de l'ordre des gates).

### Débordements constatés — lot 6

| Date | Lot | Constat | Traitement |
|---|---|---|---|
| 2026-10-10 | 6 | `dto/record-gate-evidence.dto.ts` et `POST /execution/gate-evidence` : absents du contrat 3.4, mais sans voie d'enregistrement des preuves aucune montée de mode n'est possible. | Conservé ; route ADMIN, preuve immuable. |
| 2026-10-10 | 6 | `src/config/env.validation.spec.ts` : deux tests `REAL_MONEY_INTERLOCK`. | Conservé. |
| 2026-10-10 | 6 | `backend/.env.example` **non modifié** (écriture des fichiers `.env*` interdite à l'outil) : `REAL_MONEY_INTERLOCK=false` à ajouter à la main. | À faire par Kevin. |

## Mise à jour du 2026-10-10 — clôture du lot 7

Verdict : **Terminé**, non commité. Démarré sous la dérogation G3 du PLAN §7 (sandbox déterministe uniquement).
**Le mode reste `DISABLED`** ; `LIVE_CANARY` n'a aucun adaptateur et `portFor` le refuse même si on en câblait un.
Revue `reviewer` (idempotence bout en bout, expurgation) à faire, comme pour les lots 3 à 6.

### Livré (code trouvé écrit en début de session, vérifié puis complété)

- **Port opérateur** (`operator.port.ts`, ADR 004) et deux adaptateurs : **papier** (reproduit la simulation) et
  **sandbox déterministe** (scénarios forcés : acceptation, refus, cote déplacée, timeout avant/après acceptation,
  visibilité retardée, réponse malformée, reçu dupliqué, cote indisponible).
- **Pipeline d'ordre** (`order-execution.service.ts`) : réservation atomique ordre + mise ; cote relue **hors verrou**,
  puis revérification contrôle/mode/politique/âge/minimum sous verrou ; passage `SUBMITTING` ; soumission **unique**
  sous permis du kill switch ; persistance du résultat et du **reçu expurgé** ; règlement ou relâchement du ledger.
  Une ambiguïté (timeout, réponse malformée, crash entre appel et persistance) produit `UNKNOWN`, qui ne sort que par
  **lecture opérateur avec la même clé** : jamais de second placement.
- **Clé d'idempotence** déterministe sur mode + opérateur + fixture + marché + sélection + version de stratégie +
  créneau de 15 min (PLAN 3.4).
- **Réconciliation** (`reconciliation.service.ts`) : run idempotent par clé, comparaison ordres/reçus/règlements/solde
  en **une lecture groupée** chez l'opérateur (pas de N+1), écarts `CRITICAL` → arrêt automatique avec la cause la plus
  précise. **Scheduler** désactivé par défaut, verrou nommé MySQL (un seul run par compte et par créneau même avec deux
  instances), arrêt `RECONCILIATION_LATE` si l'exécution est active sans run complété récent.
- Routes `GET /execution/orders` (paginé, reçu expurgé) et `POST`/`GET /execution/reconciliations`.
- **FK `bankroll_ledger_entries.order_id → bet_orders` (`RESTRICT`)** posée par la migration `20261002140000` : point
  haut du backlog du lot 6 fermé.

### Défaut trouvé et corrigé pendant la vérification

L'appel de placement se fait sous le **verrou partagé** du contrôle (c'est ce qui garantit qu'un arrêt bloque toute
nouvelle soumission), mais **sans délai maximal**. Un opérateur qui ne répond pas gardait le verrou : l'arrêt manuel,
qui attend ce verrou en exclusif, **échouait au bout de 50 s** (`Lock wait timeout exceeded`). Sans effet avec les
adaptateurs en mémoire du lot 7, mais bloquant dès le lot 8.

- Correction : `SUBMISSION_TIMEOUT_MS = 20 s` (sous `innodb_lock_wait_timeout` et sous `SUBMITTING_STALE_MS`) appliqué
  par `boundedSubmission()` ; au-delà, l'ordre devient `UNKNOWN`, le verrou est relâché, la réponse tardive est
  retrouvée par clé.
- Test d'intégration ajouté : opérateur bloqué → arrêt manuel abouti en moins de 10 s pendant l'appel, ordre `UNKNOWN`,
  puis `ACCEPTED` par lecture de la clé, **1 seul appel de placement**. **Test de mutation** : délai repoussé à 10 min →
  le test échoue sur `Lock wait timeout exceeded` après 50 s. Le test protège bien.
- 4 tests unitaires de `boundedSubmission` (réponse dans le délai, appel bloqué, erreur propagée sans minuteur
  résiduel, bornes du délai par défaut).

### Preuves de sortie

| Vérification | Résultat |
|---|---|
| `npm test -- --runInBand order-execution reconciliation operator-receipt-redactor` (+ `deterministic-sandbox`) | **5 suites / 72 tests verts** |
| `npm run test:integration -- --runInBand execution.integration.spec.ts` | **26/26 verts sur MySQL 8.0.39** (12 du lot 6, 14 du lot 7) |
| `npx tsc --noEmit`, `npm run build`, `npm run lint:check` | **Verts**, 0 erreur |
| Suite backend complète | **518/553, 35 ignorés (intégration sans base), 0 échec** |
| Migration `20261002140000` depuis une base vide | 27 migrations ; up/down/up/down/up **verts** ; 4 tables et FK ledger créées/supprimées symétriquement |
| Empreintes MD5 de `backend/src` | Copie de test et dossier de Kevin **identiques** (242 fichiers) |

Tests obligatoires du PLAN couverts sur MySQL : acceptation, refus, déplacement de cote, timeout avant/après
acceptation, réponse malformée, reçu dupliqué, crash entre appel et persistance, réconciliation par clé, solde
divergent, double scheduler, kill switch entre réservation et soumission. « Aucune donnée secrète dans logs/reçus » :
reçus expurgés vérifiés contre des secrets témoins en intégration ; les journaux du pipeline ne portent que des
identifiants internes et des statuts (relecture du code).

Environnement de preuve : Jest étant trop lent sur le dossier Windows monté (voir backlog), les preuves ont été jouées
sur une copie Linux de `backend/` (`npm ci`) avec un MySQL 8.0.39 jetable sans mot de passe, sur le port 3307,
supprimé en fin de session. Commande d'intégration :
`EXECUTION_MYSQL_INTEGRATION_DB_URL=mysql://root@127.0.0.1:3307/api_score_execution_it EXECUTION_MYSQL_INTEGRATION_DESTRUCTIVE=api-score-execution-it npm run test:integration -- --runInBand execution.integration.spec.ts`.

### Décisions

- **Délai de soumission de 20 s** côté pipeline, quel que soit l'adaptateur. Le lot 8 doit en plus configurer un
  timeout HTTP plus court que ce délai.
- Le « taux d'erreur opérateur » est pour l'instant **tout échec de lecture** pendant une réconciliation (arrêt
  immédiat, fail-closed). Un vrai taux sur les placements est renvoyé au lot 8.

### Débordements constatés — lot 7

| Date | Lot | Constat | Traitement |
|---|---|---|---|
| 2026-10-10 | 7 | `adapters/deterministic-sandbox.adapter.spec.ts` : absent de la liste du PLAN. | Conservé ; tests de l'adaptateur lui-même. |
| 2026-10-10 | 7 | `execution.types.ts` et `order-execution.service.spec.ts` : constante `SUBMISSION_TIMEOUT_MS` et tests de `boundedSubmission` (correctif ci-dessus). | Fichiers de la liste du lot ; aucun débordement. |

## Mise à jour du 2026-10-10 — lot 9 : console d'exploitation

Verdict : **console terminée**, non commitée. Le mode reste `DISABLED`. Revue `reviewer` (« l'UI ne peut contourner
aucune règle backend ») à faire. Les vues propres à un opérateur réel attendent le lot 8 ; la partie « déploiement
progressif » est la séquence du PLAN §4, qui n'est pas du code et n'a pas été exécutée.

### Livré

- **Page `/execution`** : état du kill switch (mode, version, motif, origine, second verrou), **arrêt immédiat** (motif
  obligatoire, un seul clic, sans confirmation supplémentaire), **changement de mode** avec version attendue et preuves
  de gate (ADMIN), politique de risque active (lecture), bankroll et exposition par compte, **ordres** paginés avec les
  ambigus (`UNKNOWN`, `RECONCILIATION_REQUIRED`) surlignés et comptés, **réconciliation** des dernières 24 h (OPERATOR+)
  avec écarts critiques en tête.
- **Page `/simulation`** : runs, synthèse (capital, P&L, ROI, drawdown, couverture de cote, latence, slippage), journal
  des décisions paginé et filtrable, arrêt d'un run (ADMIN).
- **Page `/audit`** : section walk-forward en lecture (runs, synthèse hors échantillon, folds et motifs d'exclusion).
- Liens « Exécution » et « Simulation » dans la navigation.
- **Aucune logique de risque ni transition optimiste dans le navigateur** : chaque action part au backend, puis l'état est
  relu (`invalidateQueries` après succès **et** échec, 409 compris). Les montants restent des chaînes décimales.
- **Aucun état trompeur** : chargement, backend injoignable (même avec une donnée en cache) ou contrôle illisible →
  « État inconnu » / « Arrêtée », jamais « Active » ; soldes et ordres en cache marqués « non confirmés ».
- **Double clic** : `singleFlight` partage la requête en cours ; la réconciliation utilise une clé stable à la minute,
  donc le backend renvoie le même run.
- **Allowlist BFF** étendue aux seuls appels de la console (13 routes). Politiques de risque, preuves de gate, lancement
  de simulation et de walk-forward **restent inaccessibles depuis le navigateur**, même pour un ADMIN.

### Preuves

| Vérification | Résultat |
|---|---|
| `pnpm run test` (lint + vitest) | **8 fichiers / 79 tests verts** (50 → 79) ; lint sans avertissement dans les nouveaux fichiers |
| `npx tsc --noEmit --incremental false` | **Vert** |
| `BACKEND_API_KEY=sentinel-backend-secret pnpm run build` | **Vert** (17 pages dont `/execution` et `/simulation`) ; sentinelle et `NEXT_PUBLIC_API_KEY` absentes de `.next` |
| Test de mutation : « backend injoignable → inconnu » affaibli | **2 tests échouent** : la règle est protégée |
| Backend : `lint:check`, build, suite complète | **Verts**, 522/557 (35 ignorés sans base), 0 échec |
| Parcours réel : MySQL 8.0 + backend (`dist`) + `next start`, requêtes de navigateur (cookies, Origin, CSRF) | **27/27** : VIEWER lecture seule et 4 mutations refusées ; OPERATOR réconcilie (202, double clic → même run) sans arrêt ni mode ; ADMIN 2 arrêts simultanés → 200 sans nouvelle version ; version périmée → **409 relayé** ; montée sans politique/gates refusée, mode resté `DISABLED` ; gate-evidence et risk-policies → 403 même ADMIN ; pages servies ; `/execution` sans session → `/login` |
| Backend coupé pendant que la page est ouverte | BFF → **502**, l'écran passe à « État inconnu » (capture), plus aucune action de mode possible, l'arrêt reste saisissable |

Tests obligatoires du PLAN couverts : VIEWER lecture seule, OPERATOR réconciliation sans changement de mode, ADMIN arrêt,
double clic idempotent, conflit de version, backend indisponible affiché inconnu, aucun état visuel « actif » trompeur.

Captures d'écran (ADMIN, VIEWER, backend coupé, simulation, audit) : `_to_delete/captures-lot9/`, à supprimer après
lecture.

### Corrigé pendant la vérification visuelle

- Synthèse de simulation : une latence absente s'affichait « undefined ms » → « — ».
- Bankroll et ordres restaient affichés sans avertissement après la chute du backend → bandeau « non confirmés » et
  plus de « Aucun ordre » trompeur.

### Décisions

- **Arrêt réservé à ADMIN** côté écran, comme le contrat 3.4 ; l'ouverture à OPERATOR attend toujours l'arbitrage de
  Kevin (backlog lot 6). L'arrêt reste possible quand l'état est inconnu : arrêter est toujours sûr.
- Le changement de mode propose la marche supérieure et les modes inférieurs ; le backend reste seul juge.
- Démarrer une simulation ou un walk-forward exige une stratégie complète : **hors console**, renvoyé au backlog.

### Débordements constatés — lot 9

| Date | Lot | Constat | Traitement |
|---|---|---|---|
| 2026-10-10 | 9 | Backend : `GET /execution/accounts`, `GET /simulation/runs`, `GET /audit/walk-forward` (lecture, VIEWER+, bornés à 100, sans stratégie figée) dans `execution.controller.ts`, `simulation.controller.ts`/`simulation.service.ts`, `audit.controller.ts`/`walk-forward.service.ts` et leurs specs. | Conservé : sans liste, la console ne peut rien afficher par défaut (le backlog du lot 5 le signalait). |
| 2026-10-10 | 9 | Front hors liste : `lib/api/client.ts` (`ApiError` typée, message inchangé), `lib/hooks/useExecution.ts`, `useSimulation.ts`, `useBacktest.ts` (convention AGENTS : les pages passent par des hooks), `components/execution/BankrollAccountsTable.tsx`, `format.ts`, `execution.module.css`, `components/simulation/simulation.module.css`, `ReconciliationStatus.test.tsx`, `lib/api/execution.test.ts`, `app/SidebarNav.tsx`, `vitest.config.ts` (tests `.tsx`, JSX automatique). | Conservé. `app/layout.tsx`, listé au PLAN, n'a pas eu besoin d'être modifié (la navigation vit dans `SidebarNav`). |

## Mise à jour du 2026-10-11 — traitement du backlog sans arbitrage

Aucun lot du PLAN n'étant faisable sans décision de Kevin, les points du backlog qui n'en exigeaient aucune ont été
traités. Rien n'est commité ; le mode reste `DISABLED`.

### Livré

| Point du backlog | Traitement | Preuve |
|---|---|---|
| **Backtest : match annulé compté `LOST`** (Haute, avant G2) | Le moteur résout avec `resolveSettlement`, comme la simulation : issue `VOID`, profit nul, hors mise totale, hit-rate, ROI, edge moyen et yield par marché. `kpis.voidBets` ajouté ; colonne `bet_results.outcome` (`varchar(12)`) inchangée, aucune migration. Front Audit : libellé « Remboursé » et compteur. | 3 tests moteur + 2 tests KPI. **Mutation** (retour à `resolveOutcome`) : 2 tests échouent. Elle révèle un second biais : un pari **déjà gagné** sur un match ensuite interrompu était compté perdu. |
| **Walk-forward resté `RUNNING` après redémarrage** (Moyenne) | Chaque exécution tient un verrou nommé MySQL (`api_score:wf:<id>`) sur une connexion dédiée. Au démarrage, **une seule requête** passe en `FAILED` les runs `PENDING`/`RUNNING` créés il y a plus de 60 s dont le verrou est libre. Sûr avec plusieurs instances ; ne bloque jamais le démarrage. | 4 tests unitaires et **1 test d'intégration MySQL réel** : orphelin clôt ; run verrouillé par une autre connexion épargné, puis clôt dès que cette connexion meurt (crash simulé) ; run récent et run terminé intacts ; rejeu sans effet. |
| **`baselineStrategy()` partageait `DEFAULT_CONFIG`** (Basse) | Copie (`structuredClone`) des règles. | Test dédié ; **mutation** : le test échoue et pollue le test suivant, comme le bug. |
| **`isWalkForwardStrategy` dans `audit.controller.ts`** (Basse) | Déplacée dans `backtest/strategy.guard.ts`, importée par l'audit et la simulation. | 8 tests de la garde. |
| **Node.js 18 annoncé, 20+ requis** (Moyenne) | `engines` : backend `>=20.19.0` (Node 18 n'est plus maintenu ; dépendances compatibles dès 18.18), front `>=22.12.0` (exigé par Vitest 5 / Vite 8). Entrée racine du `package-lock.json`, AGENTS.md et runbook MySQL alignés. | `npm ci` et `pnpm install --frozen-lockfile` verts depuis un dossier vierge. |
| **Tests d'intégration MySQL hors CI** (Haute) | `ci.yml` complet préparé : job `backend-mysql` (service `mysql:8.0`, quatre bases éphémères, `test:integration` + simulation) et job `front` (lint, tests, typage, build sentinelle, contrôle du bundle). **Fichier protégé contre l'écriture à distance** : déposé dans `_to_delete/ci.yml.a-poser`, à copier à la main dans `.github/workflows/ci.yml`. | YAML valide ; la commande exacte du job MySQL jouée localement : **30/30** (auth, contrôle/ledger/ordres, walk-forward) + **35/35** (simulation). |
| **Pas de `CLAUDE.md`** (Moyenne) | `CLAUDE.md` à la racine, qui importe `AGENTS.md` sans le dupliquer. | — |

### Vérifications finales

| Vérification | Résultat |
|---|---|
| Backend `lint:check`, build | **Verts** |
| Backend suite complète | **540/576, 36 ignorés (intégration sans base), 0 échec** |
| Backend intégration MySQL 8.0 (4 suites) | **30/30 + 35/35** |
| Front `pnpm run test`, `tsc`, build sentinelle, bundle | **79/79**, verts, aucun secret |

### Conséquence à connaître avant G2

Les résultats de backtest et de walk-forward **changent** pour toute fenêtre contenant un match annulé, reporté ou
interrompu (ROI, hit-rate, hashes de résultat). Les runs antérieurs au 2026-10-11 ne sont pas comparables aux suivants ;
le run final G2 doit être lancé après ce changement.

### Débordements constatés

| Date | Lot | Constat | Traitement |
|---|---|---|---|
| 2026-10-11 | Backlog | `front/app/audit/page.tsx`, `front/lib/api/audit.ts` (issue `VOID`), `backend/src/scripts/run-baseline-backtest.ts`, `backend/src/database/entities/bet-result.entity.ts`. | Conservé : conséquences directes de l'alignement `VOID`. |

## 2026-10-11 — Clôture du chantier : NO-GO réel

- **Décision de Kevin** : l'application ne doit pas parier automatiquement. Son but est de proposer des pronostics,
  de vérifier chacun après le match et d'affiner les suivants par équipe, championnat et pays, **sans dépendre des
  cotes**.
- **Clôture retenue** : NO-GO réel au sens de la définition de terminé (PLAN §5) — mode `DISABLED`, aucun credential
  opérateur, schedulers de simulation et de réconciliation désactivés par défaut (vérifié). Le code des lots 5 à 9
  reste en place, dormant ; aucune suppression, aucune migration.
- **Abandonnés** : G2 à G6, lot 8, revues externes des lots 5 à 9 en tant que conditions de clôture, et les décisions
  qui en dépendaient (seuils G2, dérogation G3, correspondance gates/modes, arrêt par OPERATOR, écran de politiques et
  de preuves).
- **Repris ailleurs** : `PLAN_PRONOSTICS.md` (proposé, à valider). Il corrige notamment le filtre du lot 3 qui masque
  et n'enregistre pas les pronostics sans cote, contraire au nouvel objectif.
- **Ne pas corriger vers** : réactiver un mode d'exécution ou rendre la cote obligatoire dans la chaîne de pronostic.
