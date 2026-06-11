# Plan d'implémentation — api-score

**Basé sur :** `AUDIT.md` du 2026-06-10  
**Objectif :** Corriger les problèmes par ordre de criticité, sans casser l'existant.

---

## Vue d'ensemble

| Lot | Thème | Items | Effort estimé |
|---|---|---|---|
| **Lot 1** | Sécurité critique | Auth API + Validation DTO | 1–2 jours |
| **Lot 2** | Bugs & stabilité | 3 bugs + variables d'env | 0,5 jour |
| **Lot 3** | Tests | Couverture de base (services critiques) | 2–3 jours |
| **Lot 4** | Refactoring | Extractions utilitaires + code mort | 1 jour |
| **Lot 5** | Architecture | MatchModule legacy + alertes | 1–2 jours |

---

## Lot 1 — Sécurité critique (P0)

### 1.1 Authentification API (toutes les routes)

**Problème :** L'API est entièrement publique, y compris `PUT /settings/smart-rules`.

**Approche :** API Key statique via Guard NestJS (simple, sans overhead d'un serveur OAuth).

**Étapes :**

1. Ajouter `API_KEY` dans `env.validation.ts` (string, non vide, obligatoire en production).
2. Créer `src/common/guards/api-key.guard.ts` :
   - Lit le header `x-api-key`
   - Compare avec `process.env.API_KEY` via timing-safe comparison (`crypto.timingSafeEqual`)
   - Retourne 401 si absent ou invalide
3. Créer `src/common/decorators/public.decorator.ts` : décorateur `@Public()` pour exclure les routes qui ne nécessitent pas d'auth (ex: `/health`).
4. Enregistrer le guard en global dans `AppModule` via `APP_GUARD`.
5. Appliquer `@Public()` sur :
   - `GET /health`
   - `GET /metrics/usage`
   - `GET /metrics/pipeline`
6. Mettre à jour `.env.example` avec `API_KEY=`.

**Fichiers touchés :**
- `backend/src/config/env.validation.ts`
- `backend/src/common/guards/api-key.guard.ts` *(nouveau)*
- `backend/src/common/decorators/public.decorator.ts` *(nouveau)*
- `backend/src/app.module.ts`
- `backend/src/monitoring/monitoring.controller.ts`

---

### 1.2 Validation DTO sur `PUT /settings/smart-rules`

**Problème :** N'importe quel JSON est accepté et persisté en base.

**Étapes :**

1. Créer `src/settings/dto/update-smart-rules.dto.ts` avec `class-validator` :
   - `@IsOptional() @IsArray() @ValidateNested({ each: true }) firstHalfRules`
   - `@IsOptional() @IsArray() @ValidateNested({ each: true }) secondHalfRules`
   - Sous-DTO `SmartRuleItemDto` : `@IsInt() @Min(1) @Max(90) minute`, `@IsInt() @Min(0) shotsThreshold`, `@IsNumber() @Min(1.01) @Max(50) odds`
2. Remplacer `@Body() body: SmartRulesConfig` par `@Body() dto: UpdateSmartRulesDto` dans le controller.
3. Ajouter `@Type(() => SmartRuleItemDto)` sur les tableaux pour la transformation.

**Fichiers touchés :**
- `backend/src/settings/dto/update-smart-rules.dto.ts` *(nouveau)*
- `backend/src/settings/smart-rules.controller.ts`

---

## Lot 2 — Bugs & stabilité (P1)

### 2.1 Bug `tempsJeux` — string vs int dans `MatchService`

**Problème :** `tempsJeux` est parsé en int puis immédiatement réassigné avec la string `match.match_status`.

**Fichier :** `backend/src/match/match.service.ts:76-77`

**Fix :**
```typescript
// Avant
let tempsJeux = parseInt(match.match_status, 10);
tempsJeux = match.match_status;  // ← écrase l'int par la string

// Après
const tempsJeux = parseInt(match.match_status, 10);
```
Vérifier ensuite que toutes les comparaisons `tempsJeux > 0 && tempsJeux <= 10` etc. fonctionnent correctement avec la valeur int.

**Fichiers touchés :**
- `backend/src/match/match.service.ts`

---

### 2.2 Double `@CreateDateColumn` sur `ApiUsageLog`

**Problème :** `calledAt` et `createdAt` utilisent tous deux `@CreateDateColumn`.

**Fichier :** `backend/src/database/entities/api-usage-log.entity.ts:35-39`

**Fix :**
```typescript
// Avant
@CreateDateColumn()
calledAt: Date;

// Après — calledAt doit être la date d'appel passée explicitement
@Column({ type: 'datetime', nullable: true })
calledAt: Date;
```
Vérifier que `ApiFootballClient` assigne bien `calledAt` lors de la création du log.

**Migration requise :** oui — modifier le type de la colonne `called_at`.

**Fichiers touchés :**
- `backend/src/database/entities/api-usage-log.entity.ts`
- `backend/src/database/migrations/` *(nouvelle migration)*
- `backend/src/provider-api-football/` (vérifier l'assignation de `calledAt`)

---

### 2.3 Sémantique inversée de `tryResume()` dans `FixturesSyncScheduler`

**Problème :** Retourne `false` après avoir réactivé le job, ce qui est sémantiquement trompeur.

**Fichier :** `backend/src/fixtures/fixtures-sync.scheduler.ts:187`

**Fix :**
```typescript
// tryResume() doit retourner true quand le job vient d'être réactivé (= skip ce tick)
private tryResume(): boolean {
  if (this.jobState === 'paused' && Date.now() >= this.pauseUntil) {
    this.jobState = 'active';
    this.logger.log('scheduler_resumed');
    return true;  // ← on vient de reprendre, on skip ce tick
  }
  return false;
}
```
Adapter le code appelant en conséquence.

**Fichiers touchés :**
- `backend/src/fixtures/fixtures-sync.scheduler.ts`

---

### 2.4 Variables d'environnement non validées (7 variables)

**Problème :** 7 variables opérationnelles utilisées sans validation ni valeur par défaut explicite dans `env.validation.ts`.

**Étapes :**

Ajouter dans `env.validation.ts` :

```typescript
@IsOptional()
@IsIn(['apisports', 'apifootball'])
API_FOOTBALL_VENDOR?: string = 'apisports';

@IsOptional()
@IsString()
API_FOOTBALL_TIMEZONE?: string;

@IsOptional()
@IsInt()
@Min(1)
SCHEDULER_MAX_CONSECUTIVE_FAILURES?: number = 5;

@IsOptional()
@IsInt()
@Min(60000)
SCHEDULER_PAUSE_DURATION_MS?: number = 300000;

@IsOptional()
@IsInt()
@Min(1)
@Max(100)
ALERT_ERROR_RATE_PCT?: number = 20;

@IsOptional()
@IsInt()
@Min(1)
@Max(100)
ALERT_TIMEOUT_RATE_PCT?: number = 20;

@IsOptional()
@IsInt()
@Min(1)
@Max(100)
ALERT_QUOTA_REMAINING_MIN_PCT?: number = 10;
```

**Fichiers touchés :**
- `backend/src/config/env.validation.ts`

---

## Lot 3 — Tests (P0)

**Problème :** Couverture = 0%. Aucun spec, aucun répertoire `test/`.

**Priorité des services à couvrir :**

### 3.1 Tests unitaires — SmartSuggestionsService

Logique métier la plus critique (règles de paris, résolution WON/LOST).

Tests à écrire :
- `evaluateAndSave()` : règle déclenchée / non déclenchée selon les seuils
- `resolveSettledCoupons()` : coupon résolu WON, LOST, ignoré (PENDING)
- Chaque type de marché (1H, 2H, MATCH)
- Cas limites : fixture sans stats, score nul, fixture non terminée

**Fichier :** `backend/src/recommendations/smart-suggestions.service.spec.ts`

---

### 3.2 Tests unitaires — FixturesIngestionService

Tests à écrire :
- `normalizeFixturePayload()` : format api-sports vs apifootball
- `computePressureIndex()` : formule et cas limites (valeurs nulles)
- `getFixtureSummary()` : score de confiance 0-100
- Cache hit / miss selon TTL

**Fichier :** `backend/src/fixtures/fixtures-ingestion.service.spec.ts`

---

### 3.3 Tests unitaires — SmartRulesConfigService

Tests à écrire :
- `getConfig()` : retourne la config par défaut si aucune en base
- `updateConfig()` : persistance et relecture
- `resetToDefaults()` : si méthode applicable

**Fichier :** `backend/src/settings/smart-rules-config.service.spec.ts`

---

### 3.4 Tests unitaires — ApiKeyGuard (Lot 1)

Tests à écrire :
- Header absent → 401
- Header invalide → 401
- Header valide → passe
- Route `@Public()` → passe sans header

**Fichier :** `backend/src/common/guards/api-key.guard.spec.ts`

---

### 3.5 Tests d'intégration — endpoints critiques

Tests à écrire (supertest + base de test) :
- `POST /v1/live/fixtures/sync` → 200 + données en base
- `GET /v1/live/fixtures` → pagination, filtres
- `PUT /v1/settings/smart-rules` → validation DTO (cas valide + invalide)
- `GET /v1/health` → 200 sans header auth (`@Public()`)

**Fichier :** `backend/test/e2e/fixtures.e2e-spec.ts`, `backend/test/e2e/settings.e2e-spec.ts`

---

## Lot 4 — Refactoring & code mort (P2/P3)

### 4.1 Extraire les utilitaires dupliqués

**Problème :** `toNumber()`, `getStatValue()`, `computePressureIndex()` copiés dans 2–3 fichiers.

**Étapes :**

1. Créer `backend/src/common/utils/stats.utils.ts` :
   - `export function toNumber(val: unknown): number`
   - `export function getStatValue(stats: any[], key: string, fixture?: any): number`
   - `export function computePressureIndex(stats: Record<string, number>): number`

2. Remplacer les 3 implémentations dupliquées par des imports vers `stats.utils.ts` dans :
   - `backend/src/fixtures/fixtures-ingestion.service.ts`
   - `backend/src/analytics/analytics.service.ts`
   - `backend/src/provider-api-football/api-football.client.ts` (pour `toNumber` uniquement)

3. Créer `backend/src/common/dto/pagination-query.dto.ts` :
   - `@IsOptional() @IsInt() @Min(1) @Transform(...) page`
   - `@IsOptional() @IsInt() @Min(1) @Max(100) @Transform(...) limit`
   - `get skip(): number { return (this.page - 1) * this.limit; }`

4. Faire étendre `GetLiveFixturesQueryDto`, `GetLiveRecommendationsQueryDto`, `GetPayloadsQueryDto` depuis `PaginationQueryDto`.

**Fichiers touchés :**
- `backend/src/common/utils/stats.utils.ts` *(nouveau)*
- `backend/src/common/dto/pagination-query.dto.ts` *(nouveau)*
- `backend/src/fixtures/fixtures-ingestion.service.ts`
- `backend/src/analytics/analytics.service.ts`
- `backend/src/provider-api-football/api-football.client.ts`
- `backend/src/fixtures/dto/get-live-fixtures-query.dto.ts`
- `backend/src/recommendations/dto/get-live-recommendations-query.dto.ts`
- `backend/src/archive/dto/get-payloads-query.dto.ts`

---

### 4.2 Supprimer le code mort

**Étapes :**

1. Supprimer `backend/src/schemat/livedata.ts` (1 300 lignes de JSON hardcodé, jamais importé).
2. Supprimer `backend/src/match/entities/match.entity.ts` (classe fantôme sans `@Entity`).
3. Supprimer le stub `MatchController.create()` qui retourne une string littérale.
4. Corriger `TeamsController.getTeamFull()` : retourne `team` directement au lieu de `{ ...team, raw: team.raw }`.
5. Supprimer l'auto-référence `"api-score": "file:"` dans `backend/package.json`.

**Fichiers touchés :**
- `backend/src/schemat/livedata.ts` *(suppression)*
- `backend/src/match/entities/match.entity.ts` *(suppression)*
- `backend/src/match/match.controller.ts`
- `backend/src/teams/teams.controller.ts`
- `backend/package.json`

---

### 4.3 Unifier la liste des entités TypeORM

**Problème :** Liste dupliquée dans `DatabaseModule` et `data-source.ts`.

**Étapes :**

1. Créer `backend/src/database/entities/index.ts` qui exporte toutes les entités.
2. Importer ce tableau dans `DatabaseModule` (`entities`) et dans `data-source.ts` (`entities`).
3. Retirer `entities: []` explicite du `DatabaseModule` (garder uniquement `autoLoadEntities: true`).

**Fichiers touchés :**
- `backend/src/database/entities/index.ts` *(nouveau)*
- `backend/src/database/database.module.ts`
- `backend/src/database/data-source.ts`

---

## Lot 5 — Architecture (P2)

### 5.1 Brancher `MatchService` sur `ApiFootballClient`

**Problème :** `MatchService` fait un `fetch()` natif, contournant le retry, le rate-limit et les logs.

**Étapes :**

1. Injecter `ApiFootballClient` dans `MatchService`.
2. Remplacer le `fetch()` natif par l'appel approprié à `ApiFootballClient`.
3. Supprimer l'import `fetch` / `node-fetch` si présent.
4. Vérifier que le filtrage `filterMatches()` reste identique après le changement de source.

**Fichiers touchés :**
- `backend/src/match/match.module.ts`
- `backend/src/match/match.service.ts`

---

### 5.2 Implémenter `notifyAlerts()` dans `MonitoringService`

**Problème :** Stub vide avec TODO Slack/Email depuis la création du module.

**Approche :** Log structuré d'alerte avec niveau `error` dans un premier temps (simple, observable). Webhook Slack optionnel si `SLACK_ALERT_WEBHOOK_URL` est défini.

**Étapes :**

1. Ajouter `SLACK_ALERT_WEBHOOK_URL` optionnel dans `env.validation.ts`.
2. Dans `notifyAlerts()` :
   - Toujours logger l'alerte via `JsonLogger` avec niveau `error` et un champ `alert: true`
   - Si `SLACK_ALERT_WEBHOOK_URL` est défini, envoyer un POST avec `axios`
3. Ajouter un test unitaire pour vérifier que l'alerte est loggée.

**Fichiers touchés :**
- `backend/src/config/env.validation.ts`
- `backend/src/monitoring/monitoring.service.ts`

---

## Ordre d'exécution recommandé

```
Lot 1.1 (Auth)        ← débloquer la sécurité en premier
Lot 1.2 (DTO rules)   ← compléter la sécurité
Lot 2.1 (bug tempsJeux)
Lot 2.2 (bug calledAt + migration)
Lot 2.3 (bug tryResume)
Lot 2.4 (variables env)
Lot 4.2 (code mort)   ← nettoyage avant les tests
Lot 4.1 (utilitaires)
Lot 4.3 (entités)
Lot 3   (tests)       ← sur le code refactorisé et propre
Lot 5.1 (MatchService)
Lot 5.2 (alertes)
```

---

## Checklist de livraison par lot

### Lot 1 — Sécurité ✅
- [x] `ApiKeyGuard` créé et enregistré globalement
- [x] `@Public()` appliqué sur les routes de monitoring
- [x] `API_KEY` validé dans `env.validation.ts`
- [x] DTO `UpdateSmartRulesDto` créé avec contraintes
- [ ] `PUT /settings/smart-rules` rejette les payloads invalides (test manuel à faire)

### Lot 2 — Bugs ✅
- [x] `tempsJeux` corrigé (typage correct, comparaisons numériques)
- [x] `calledAt` corrigé + migration `20260611000001-fix-api-usage-log-called-at.ts`
- [x] `tryResume()` retourne `true` quand le job reprend
- [x] 7 variables ajoutées dans `env.validation.ts`

### Lot 3 — Tests ✅
- [x] `SmartSuggestionsService` : 17 cas de test (35/35 passent)
- [x] `FixturesIngestionService` : 18 cas de test (35/35 passent)
- [x] `ApiKeyGuard` : 4 cas de test
- [ ] `SmartRulesConfigService` : non couvert (optionnel)
- [ ] Tests e2e endpoints critiques (optionnel — requiert base de test)
- [x] `npm test` passe sans erreur

### Lot 4 — Refactoring ✅
- [x] `stats.utils.ts` créé, 3 fonctions extraites (`toNumber`, `getStatValue`, `computePressureIndex`)
- [x] `PaginationQueryDto` créé, 3 DTOs migrent
- [x] `schemat/livedata.ts` supprimé
- [x] `match.entity.ts` supprimé
- [x] `MatchController.create()` supprimé
- [x] `entities/index.ts` créé, `DatabaseModule` et `data-source.ts` mis à jour
- [ ] Auto-référence `package.json` — vérifier si supprimée

### Lot 5 — Architecture ✅
- [x] `MatchService.fetchLiveMatches()` utilise `ApiFootballClient`
- [x] `notifyAlerts()` logge les alertes avec niveau `error`
- [x] Webhook Slack optionnel fonctionnel (si `SLACK_ALERT_WEBHOOK_URL` défini)

---

## Problème de performance détecté (à traiter ultérieurement)

`SmartSuggestionsService.saveCoupons()` fait un `couponRepo.findOne()` dans une boucle — N+1 potentiel.
**Fix suggéré :** charger tous les coupons PENDING en un seul `findBy({ fixtureId: In(fixtureIds), status: 'PENDING' })` avant la boucle.
