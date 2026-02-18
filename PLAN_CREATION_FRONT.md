# PLAN DE CREATION DU FRONT - API SCORE

Date: 2026-02-18
Source: analyse du projet backend + docs fonctionnelles/design

## 1) Analyse rapide de l'existant

Backend (NestJS) deja en place avec endpoints live:
- `GET /v1/health`
- `GET /v1/metrics/usage`
- `POST /v1/live/fixtures/sync`
- `GET /v1/live/fixtures`
- `GET /v1/live/fixtures/:fixtureId/events`
- `GET /v1/live/fixtures/:fixtureId/lineups`
- `GET /v1/live/fixtures/:fixtureId/players`
- `GET /v1/live/fixtures/:fixtureId/stats/latest`
- `GET /v1/live/fixtures/:fixtureId/summary`
- `GET /v1/live/fixtures/:fixtureId/detail`

Fonctionnalites front a anticiper (API partiellement future):
- module odds
- recommandations live
- audit et KPIs
- coupons intelligents
- risk center

Direction visuelle imposee (trading desk sportif), avec palette sombre, typo `Space Grotesk` + `IBM Plex Sans`, UI dense.

## 2) Objectif du front

Creer un frontend web pro (desktop + mobile) qui permet:
- decision rapide sur matchs live
- visualisation claire des signaux (momentum, confidence, edge, drift)
- creation de coupon en 1-2 actions
- suivi de performance (ROI, drawdown, hit-rate)
- suivi du risque (exposition, alertes)

## 3) Architecture d'ecrans (MVP)

Ecrans prioritaires:
1. Live Command Center
2. Match Detail (war room)
3. Recommendations Feed
4. Coupon Builder
5. Audit & Performance
6. Risk Center

Navigation:
- Desktop: multi-panneaux + routes internes
- Mobile: onglets principaux (Live, Match, Reco, Coupon, Audit, Risk)

## 4) Mapping API -> ecrans (etat actuel)

- Live Command Center:
  - `GET /v1/live/fixtures` (liste + filtres + tri)
  - `GET /v1/metrics/usage` (etat quota)
  - `GET /v1/health` (etat systeme)

- Match Detail:
  - `GET /v1/live/fixtures/:fixtureId/detail`
  - `GET /v1/live/fixtures/:fixtureId/events`
  - `GET /v1/live/fixtures/:fixtureId/lineups`
  - `GET /v1/live/fixtures/:fixtureId/players`
  - `GET /v1/live/fixtures/:fixtureId/stats/latest`
  - `GET /v1/live/fixtures/:fixtureId/summary`

Ecrans futurs (API a prevoir):
- Recommendations Feed, Coupon Builder, Audit & Risk Center

## 5) Plan de creation (phases)

Phase 0 - Cadrage & contrats API
- Valider URL base, auth (non disponible pour l'instant), CORS.
- Documenter schemas JSON reels des endpoints live.
- Definir maquettes de donnees pour modules futurs (odds, recos, audit).

Livrable: fiche "API contracts" + exemples reponses.

Phase 1 - Design system & UI kit
- Tokens (couleurs, spacing, typo, ombres).
- Composants UI indispensables:
  - `MatchCardLive`, `MomentumBarHomeAway`, `DataQualityBadge`, `ConfidenceGauge`,
  - `OddsDriftSparkline`, `RecommendationCard`, `CouponSelectionRow`,
  - `CouponRiskPanel`, `KpiTile`, `OutcomeTable`, `SystemStatusPill`
- Etats obligatoires: loading skeleton, empty state utile, error state actionnable.

Livrable: UI kit + librairie de composants.

Phase 2 - Wireframes + maquettes haute fidelite
- Wireframes basse fidelite des 6 ecrans.
- Maquettes desktop + mobile.
- Prototype cliquable (Live -> Match -> Reco -> Coupon).

Livrable: fichiers design + specs handoff.

Phase 3 - Frontend scaffold & architecture
- Choix stack (propose):
  - Framework: Next.js (React + SSR/ISR)
  - Etat: Zustand ou Redux Toolkit (selon complexite)
  - Data fetching: React Query
  - Charts: Recharts ou ECharts
  - Styling: CSS Modules ou Styled Components
- Setup base:
  - theming + tokens
  - routing
  - layout responsif (desktop/mob)
  - accessibilite de base (WCAG AA)

Livrable: squelette projet + routing + theming.

Phase 4 - Implementation ecran Live + Match Detail (MVP 1)
- Live Command Center:
  - filtres + tri + match cards
  - colonne opportunites (placeholder si recos non dispo)
- Match Detail:
  - timeline events
  - stats comparees home/away
  - interpretation pro + data quality

Livrable: MVP live + match detail fonctionnels.

Phase 5 - Recommendations + Coupon Builder (MVP 2)
- Recommendations Feed (mock data au debut)
- Coupon Builder:
  - max 4 selections
  - correlation + risque cumule
  - stake fixe/Kelly (si dispo)

Livrable: flux Reco -> Coupon operationnel.

Phase 6 - Audit & Risk Center (MVP 3)
- KPIs + tableaux historique (mock data puis API reelle)
- Exposition + alertes risque

Livrable: dashboards audit + risk.

Phase 7 - Durcissement
- Tests UI + e2e
- Performance (virtualisation listes live)
- Observabilite front (log errors, retry)

## 6) Hypotheses & pre-requis

- AuthN/AuthZ non disponible => front en mode "internal".
- Recommandations/odds/audit non encore exposes => mock/stubs a maintenir.
- Besoin d'un mapping stable des statuts/match states cote backend.
- Necessite d'un endpoint "metrics/pipeline" (future) pour health avanc.

## 7) Priorites de livraison

1. Live Command Center
2. Match Detail
3. Coupon Builder
4. Recommendations Feed
5. Audit & Performance
6. Risk Center

## 8) Prochaines decisions a valider

- Stack definitive (Next.js vs Vite + React)
- Librairie charts (Recharts vs ECharts)
- Strategie d'auth (quand disponible)
- Budget performance (refresh temps reel)

## 9) Plan technique détaillé

- **Structure des dossiers**: `app/` (routes/pages), `components/` (UI atoms/molecules), `features/live`, `features/match`, `features/recommendations`, `features/coupon`, `features/audit`, `features/risk`, `modules/theme`, `lib/api`, `lib/hooks`, `lib/state`, `mocks/`, `public/assets`.
- **Conventions**: `PascalCase` pour composants, `featureName` folders collocating UI + hooks + tests, `*.contract.ts` for DTO/type guards, `constants.ts` for enums/status listes.
- **Schemas & types**: Définir `LiveFixture`, `MatchSummary`, `MatchDetail`, `Recommendation`, `CouponSelection`, `KpiSnapshot`, `RiskProfile`. Centraliser exemples JSON dans `lib/api/contracts` avec `zod`/`io-ts` pour validation en dev.
- **Data fetching**: React Query hooks (`useLiveFixtures`, `useMatchDetail`, `useRecommendations`, `useCouponPreview`) + `queryClient` global. Standardiser wrappers (`apiClient`) pour ajouter timelines/momentum/edge calculations.
- **Mocks & stubs**: `mocks/fixtures.json`, `mocks/recommendations.json`, factories (`MockLiveFixtureFactory`) pour simuler momentum/confidence extremes. Utiliser MSW pour intercepter APIs futures (reco/coupon/audit) pendant dev/test.
- **State distants**: `Zustand` slices `uiControls` (filters, tri, modal), `couponBuilder` (sélections, mode Kelly, warnings), `systemStatus` (health/metrics). Les composants consomment via hooks pour éviter prop drilling.
- **Tests & qualité**: Storybook stories pour composants critiques + Chromatic snapshots pour states `loading`, `empty`, `degraded`. Tests unitaires sur hooks/transformations, tests Playwright (Live list, Match detail, Coupon builder flows) et accessibility axe.
- **Observabilité front**: `trackRequest` wrapper journalise status code + latency (React Query middleware). Ajouter Sentry/browser logs et console reporting pour `risk_flags` critiques.

## 10) Proposition de stack

- **Framework**: `Next.js (App Router)` pour SSR/ISR, outils SEO, routes API pour futurs webhooks, et compatibilité Reac Query. Lancer en `pnpm`/`npm`.
- **Styling**: `CSS Modules` + `@tailwindcss/forms` (si Tailwind choisi) + tokens via `modules/theme` (couleurs, spacing, typography). Importer `Space Grotesk` + `IBM Plex Sans` via `next/font`.
- **State management**: `Zustand` (slices + immer) pour UI/coupon states. `React Query` pour data fetching, `React Query Devtools` en dev pour observer caches.
- **Charts**: `Recharts` (bar/area) et `react-sparkline`/`visx` pour odds drift. Prévoir `Victory` si besoin comparaisons stack. Abstraction `components/charts` pour isoler libs.
- **Dev tooling**: `storybook` (UI kit + variantes), `MSW` pour stubs, `ESLint` + `Prettier` + `typescript`, `commitlint`, `bundlewatch` pour bundle size. Standard `husky` hooks (lint-staged).
- **CI/CD**: pipeline `run lint/test/storybook` puis `deploy` (Vercel/Netlify). Ajouter `bundlewatch` pour vérifier taille. Préparer `preview` par environnement (live vs staging).
- **Raisons**: Next + React Query/Storybook combo facilite prototypage rapide, ISO stack stable + alignement front/back (contract-first). Zustand + React Query répondent à la réactivité temps réel sans surcomplexité.
