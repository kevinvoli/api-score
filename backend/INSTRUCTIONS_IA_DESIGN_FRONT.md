# INSTRUCTIONS_IA_DESIGN_FRONT - API SCORE

Version: 1.0
Date: 2026-02-12
Auteur: Synthese automatique depuis la documentation projet

## 1) Mission de l'IA Design

Concevoir un frontend web professionnel (desktop + mobile) pour une plateforme de paris football orientee decision rapide, avec focus sur:
- lecture live des matchs,
- analyse statistique exploitable,
- recommandations de paris explicables,
- generation et suivi de coupons,
- suivi performance (ROI, drawdown, hit-rate).

Le rendu doit etre moderne, dense, lisible sous pression temporelle, et adapte a un utilisateur expert des paris sportifs (15+ ans d'experience).

## 2) Contexte produit (source fonctionnelle)

Le backend actuel expose deja:
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

Fonctionnalites front a prevoir des maintenant (meme si API partiellement future):
- module odds (latest + timeline),
- recommandations live,
- audit des recommandations,
- KPIs bankroll/risque,
- coupons intelligents.

## 3) Utilisateur cible

Profil principal:
- parieur professionnel ou semi-pro,
- prend des decisions en quelques secondes,
- privilegie les signaux actionnables a la "data brute",
- veut comprendre "pourquoi" une recommandation existe,
- controle strict du risque et de l'exposition.

## 4) Objectifs UX prioritaires

1. Montrer rapidement les matchs les plus actionnables.
2. Expliquer la recommandation avec des raisons claires (`reasons[]`, `risk_flags[]`).
3. Visualiser la dynamique de match (momentum, tirs, danger, cotes).
4. Permettre creation de coupon en 1-2 interactions.
5. Donner une vision claire du risque global (exposition, drawdown, limites).

## 5) Architecture ecrans (information architecture)

## 5.1 Ecran A - Live Command Center (page principale)

But:
- vue temps reel de tous les matchs suivis.

Blocs:
- barre top: date, fuseau, etat systeme (`health`, quota API).
- panneau filtres: ligue, statut match, minute, confiance min, type marche.
- liste cartes match (triable):
  - score, minute, statut,
  - momentum home/away,
  - data quality,
  - confiance,
  - bouton "Analyser".
- colonne droite "Opportunites":
  - top recommandations live,
  - edge, cote actuelle, niveau risque,
  - action "Ajouter coupon".

## 5.2 Ecran B - Match Detail (war room)

But:
- analyse granulaire d'un match en live.

Sections:
- header match: equipes, score, minute, competition.
- timeline events: buts, cartons, substitutions, moments cles.
- stats live comparees home/away:
  - dangerous attacks,
  - attacks,
  - shots on/off,
  - corners,
  - possession.
- zone "Interpretation pro":
  - lecture automatique des tendances,
  - flags qualite,
  - contexte lineups/blessures si disponible.
- zone odds:
  - cote actuelle,
  - mini graphe drift 1/3/5 snapshots,
  - alerte variation brutale.
- panneau recommandation:
  - `market_type`, `selection`, `current_odd`, `min_acceptable_odd`, `value_edge_pct`, `confidence_score`, `reasons[]`, `risk_flags[]`.

## 5.3 Ecran C - Recommendations Feed

But:
- flux filtrable de recommandations exploitables.

Fonctions:
- filtres: `marketType`, `minConfidence`, `status`, ligue.
- tri: confidence, edge, date creation.
- cartes recommendation:
  - resume pari,
  - score de confiance,
  - edge,
  - niveau de risque,
  - bouton ajout coupon.

## 5.4 Ecran D - Coupon Builder (prioritaire)

But:
- construire un coupon intelligent et gerer le stake.

Composants:
- liste selections ajoutees.
- controles contraintes:
  - max selections (ex: 4),
  - correlation (badge faible/moyenne/forte),
  - exposition cumulative.
- affichage cotes combinees.
- champs bankroll/stake:
  - mode fixe,
  - mode Kelly fractionnel (si active).
- panneau "Qualite coupon":
  - esperance estimee,
  - risque,
  - warning drawdown.
- export/share du coupon (ID, timestamp).

## 5.5 Ecran E - Audit & Performance

But:
- evaluation resultat des recommandations.

Widgets:
- KPI cards: hit-rate, ROI, yield, drawdown, CLV.
- courbes periode 7j/30j.
- tableau historique recommandations + outcome (`won/lost/void`).
- filtres periode, ligue, marche.

## 5.6 Ecran F - Risk Center

But:
- surveiller et limiter le risque operationnel.

Blocs:
- exposition par ligue,
- exposition par marche,
- bankroll active,
- alertes: seuil drawdown, surcharge, qualite donnees faible.

## 6) Composants UI indispensables

- `MatchCardLive`
- `MomentumBarHomeAway`
- `DataQualityBadge`
- `ConfidenceGauge`
- `OddsDriftSparkline`
- `RecommendationCard`
- `CouponSelectionRow`
- `CouponRiskPanel`
- `KpiTile`
- `OutcomeTable`
- `SystemStatusPill`

## 7) Design system (direction visuelle imposee)

## 7.1 Principes

- style: "trading desk sportif" (pro, sobre, dense).
- priorite lisibilite numerique et vitesse de scan.
- contraste fort pour signaux critiques.

## 7.2 Palette (proposee)

- fond principal: `#0B1220`
- surface: `#111A2E`
- surface secondaire: `#17233D`
- texte principal: `#EAF0FF`
- texte secondaire: `#98A7C7`
- accent info: `#29B6F6`
- positif: `#22C55E`
- warning: `#F59E0B`
- negatif: `#EF4444`

## 7.3 Typographie

Eviter les polices systemes banales.
Proposition:
- titres/chiffres: `Space Grotesk`
- contenu: `IBM Plex Sans`
- chiffres tabulaires activees pour tableaux/kpis.

## 7.4 Grille et densite

- desktop: grille 12 colonnes.
- mobile: 4 colonnes.
- espacement base: 8px.
- mode dense active par defaut (parieur expert).

## 7.5 Iconographie et etats

- icones simples line + fill pour priorites.
- etats couleur standards:
  - `[UP]` vert,
  - `[DEGRADED]` ambre,
  - `[DOWN]` rouge.

## 8) Visualisation de donnees (charts)

- timeline events: axe temps horizontal + marqueurs types.
- comparaison home/away: barres doubles horizontales.
- odds drift: sparkline compacte + variation %.
- KPIs: cartes + mini trendline.
- drawdown: area chart avec zone risque.

Regles:
- toujours afficher unite/definition courte.
- jamais utiliser pie chart pour donnees temporelles.
- conserver la meme couleur d'une equipe a travers toute la page.

## 9) Logique metier a traduire visuellement

Signaux a mettre en avant:
- `danger_ratio`
- `shot_pressure`
- `on_target_ratio`
- `corner_pressure_10m`
- `price_drift`
- `confidence_score`
- `value_edge_pct`

Interpretation UI:
- badge "Convergence forte" si production + contexte + prix sont alignes.
- badge "No Bet" si `risk_flags` critique.
- bandeau "Data quality low" si flags de qualite present.

## 10) Specification module coupons (detail)

## 10.1 Donnees affichees par selection

- match + minute
- marche + selection
- cote actuelle
- cote minimale acceptable
- edge
- confiance
- raisons principales (max 3)
- flags risque

## 10.2 Regles UX coupon

- max 4 selections par coupon.
- empecher ajout si correlation trop forte.
- affichage immediate du risque cumule.
- proposer stake recommande (fixe/Kelly) avec borne min/max.
- avertir si exposition globale depasse limite.

## 10.3 Sortie coupon

- cote combinee
- probabilite estimee (si dispo)
- gain potentiel
- perte max
- note de risque globale (A/B/C/D)

## 11) Etats d'interface obligatoires

- loading skeleton pour listes live.
- etat vide utile (pas juste "No data").
- etat erreur actionnable (bouton retry + traceId affiche).
- etat degrade provider (donnees possiblement obsoletes).

## 12) Responsive et ergonomie

Desktop prioritaire, mobile operationnel:
- desktop: multi-panneaux simultanes.
- tablette/mobile: navigation par onglets (Live, Match, Reco, Coupon, Audit).
- actions critiques (Ajouter coupon / Valider stake) toujours accessibles en bas d'ecran mobile.

## 13) Accessibilite minimale

- contraste WCAG AA.
- navigation clavier sur tableaux et filtres.
- ne pas coder l'information uniquement par couleur (ajouter texte/icone).

## 14) Livrables attendus de l'IA Design

1. Sitemap complet.
2. Wireframes basse fidelite des 6 ecrans.
3. UI kit (tokens, typo, boutons, badges, cards, tableaux, charts).
4. Maquettes haute fidelite desktop + mobile.
5. Prototype cliquable (flux: Live -> Match -> Recommendation -> Coupon).
6. Spec handoff dev:
  - tailles,
  - espacements,
  - variantes composants,
  - etats,
  - regles responsives.

## 15) Prompt pret a utiliser pour une IA design

"Concois le frontend de la plateforme API SCORE avec un style trading desk football professionnel. Cree les ecrans Live Command Center, Match Detail, Recommendations Feed, Coupon Builder, Audit Performance, Risk Center. Priorise lisibilite numerique, vitesse de decision et gestion du risque. Integre visuellement les metriques momentum/confiance/edge/price drift et la logique coupon (max 4 selections, correlation, exposition, stake). Fournis wireframes, design system, maquettes desktop/mobile et prototype cliquable."
