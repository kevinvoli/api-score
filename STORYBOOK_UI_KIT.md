# STORYBOOK UI KIT - API SCORE

Date: 2026-02-18
Purpose: traduire le design system en stories/variants pour Storybook afin d'avoir un kit vivant pendant le développement front.

## 1) Theme tokens (Storybook parameters)

- Colors: `primaryBg #0B1220`, `surface #111A2E`, `surfaceAlt #17233D`, `textPrimary #EAF0FF`, `textSecondary #98A7C7`, `info #29B6F6`, `success #22C55E`, `warning #F59E0B`, `error #EF4444`.
- Typography: `Space Grotesk` (titles/numbers), `IBM Plex Sans` (body). Expose tokens `font.heading`, `font.body`.
- Spacing: base `8px`, dense `4px`. Storybook arg `layoutDensity` (dense/default) to toggle.
- Elevation: define `cardElevation`, `panelElevation`.
- Ratio tokens: `momentumBarHeight`, `sparklineHeight`.

## 2) Core components + stories

- `MatchCardLive` story variants:
  - `Default`: shows score, minute, status, momentum gauge (dominant side), data quality pills, confidence.
  - `HighRisk`: adds `riskFlag` badge (warning color) and degraded data quality.
  - `Loading skeleton`.
 Stories use props `fixture`, `momentum`, `confidence`.

- `MomentumBarHomeAway`:
  - `Balanced / Home / Away` states.
  - `Disabled` (no stats).
 Arguments: `homeValue`, `awayValue`, `labels`.

- `DataQualityBadge`:
  - `Healthy`, `Missing Stats`, `Stale`.
  - Provide icon + color-coded chips.

- `ConfidenceGauge`:
  - `High (85)`, `Medium (60)`, `Low (25)`.
  - Show also `tooltip` describing driver flags.

- `OddsDriftSparkline`:
  - `Flat`, `Spike Up`, `Spike Down`.
  - Input `values[]`, `currentOdd`, `percentChange`.

- `RecommendationCard` (for `Live Command Center` and `Recommendations Feed`):
  - Variants: `Strong edge`, `No bet (risk flag: red)`, `Low confidence`.
  - Args: `marketType`, `selection`, `currentOdd`, `edgePct`, `confidence`, `reasons`, `riskFlags`.

- `CouponSelectionRow`:
  - `Default`, `Correlation warning`, `Removed`.
  - Show `selection`, `odd`, `valueEdge`, `confidence`, `riskBadges`.

- `CouponRiskPanel`:
  - States: `Within risk`, `Exposure limit hit`, `Correlation warning`.
  - Display bankroll exposure, Kelly suggestion, drawdown label.

- `KpiTile`:
  - Cards for `ROI`, `hit-rate`, `drawdown`, `yield`.
  - Variation `positive`, `neutral`, `negative` colors.

- `OutcomeTable`:
  - Story showing last 10 recos with `result`.
  - Variation `empty state` (empty message + action).

- `SystemStatusPill`:
  - States: `Healthy`, `Degraded provider`, `Sync running`.
  - Highlight `traceId` field for errors.

## 3) Composite screens for Storybook

- Add `LiveCommandCenter` story showing layout:
  - `MatchCardLive` feed + `RecommendationCard` list in sidebar.
  - Provide knobs for filters (league, minute, confidence) to visualize states.

- `MatchDetailPanel` story:
  - Compose `header`, `timeline events`, `MomentumBarHomeAway`, `OddsDriftSparkline`, `ConfidenceGauge`.
  - Add `Interpretation` text + `DataQualityBadge` row.

- `CouponBuilderLayout`:
  - Hooks `CouponSelectionRow`s, `CouponRiskPanel`, `stake controls`.
  - Variation `max selections reached`, `Kelly suggestion`.

- `AuditAndRisk` story:
  - Show `KpiTile` grid + `OutcomeTable` + `RiskCenterPanel` (exposure bars).

## 4) Mocks & addons

- Use `Storybook` `parameters.msw.handlers` to serve mocks from `mocks/storybook`. Each story referencing future API (recommendations/coupon/audit) should call story-specific handlers.
- Provide `decorators` for `ThemeDecorator` (applies tokens) and `LayoutDecorator` (grids/dense mode).
- Document expected `args` shape for each component in `STORYBOOK_UI_KIT.md` so dev/test know what data fields to feed.

## 5) QA hooks

- Link Storybook stories to Chromatic builds for visual regression (key states: `LiveCommandCenter` filtered view, `MatchDetail` with degraded quality, `CouponBuilder` stake warning).
- Add `a11y` addon config to check key components for `aria-live` sections (loading, errors) and contrast.
