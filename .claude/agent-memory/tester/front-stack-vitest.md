---
name: front-stack-vitest
description: Le dossier front/ (BFF Next.js) utilise vitest + pnpm, pas Jest/npm — ne pas appliquer les réflexes backend par défaut.
metadata:
  type: project
---

Depuis le lot 2 (`PLAN_EXECUTION_PARIS.md`), `front/` est testé avec **vitest** (`pnpm run test` = `vitest run`),
pas Jest. Le gestionnaire de paquets est **pnpm** : ne jamais lancer `npm install` dans `front/`, cela crée un
`package-lock.json` concurrent de `pnpm-lock.yaml`.

**Why** : contrainte posée explicitement dans le brief du lot 2, pour éviter un conflit de lockfiles entre
`backend/` (npm) et `front/` (pnpm).

**How to apply** : pour tout test ajouté sous `front/`, utiliser la syntaxe vitest (`import { describe, it,
expect, vi } from 'vitest'`), pas `jest`. Les specs vivent en `*.test.ts` colocalisées avec le fichier testé
(`route.test.ts` à côté de `route.ts`), pas dans un dossier `__tests__` séparé. Setup global des secrets
d'environnement dans `front/test/setup.ts`. Lancer `cd front && pnpm run test` et `npx tsc --noEmit
--incremental false` comme critères de sortie, jamais les commandes npm/jest par défaut de `backend/`.
