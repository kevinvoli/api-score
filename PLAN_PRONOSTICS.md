# PLAN — Pronostics auto-évalués

> Statut : **proposé le 2026-10-11, à valider par Kevin.** Aucun code n'est écrit tant que ce plan n'est pas validé.
> Remplace l'objectif de `PLAN_EXECUTION_PARIS.md`, clos le même jour (voir lot P0).

## 1. Objectif

API SCORE **ne place aucun pari**. Elle propose des pronostics de match, vérifie chacun après coup (succès ou échec)
et se sert de ces résultats pour affiner ses pronostics par équipe, championnat, pays et marché. Elle s'appuie sur les
événements et statistiques du match, des équipes et des joueurs, ainsi que sur le contexte des matchs passés et à venir.
**Aucun pronostic ne dépend d'une cote.**

La qualité se mesure en **fiabilité**, plus en rentabilité :

- **taux de réussite** par dimension (équipe, championnat, pays, marché, minute), toujours accompagné de la taille de
  l'échantillon et d'un intervalle de confiance ;
- **calibration** : quand l'application annonce 80 %, le pronostic doit réussir environ 8 fois sur 10 ;
- **score de Brier** (erreur quadratique entre probabilité annoncée et résultat), comparé à une référence naïve.

Limite à afficher honnêtement : un pronostic fiable n'est pas forcément rentable. L'interface parle de probabilité et
de réussite observée, jamais de gain.

## 2. Constat sur l'existant (2026-10-11)

| Élément | État | Conséquence |
|---|---|---|
| Règles live (`rules-evaluator.ts`) | 3 marchés de buts (1ère MT, 2ème MT, match) déclenchés par tirs, tirs cadrés ou indice de pression, modulés par le score. | Base réutilisable telle quelle. |
| Taux de base (`base-rates.*`) | Calculés chaque mois depuis l'historique, par championnat/saison/marché/signal/seuil. La confiance affichée en dérive. | Bonne référence a priori, mais **elle n'apprend pas des pronostics eux-mêmes**. |
| Coupons (`smart_coupons`) | Chaque pronostic est enregistré puis résolu automatiquement après le match. | C'est l'échantillon d'apprentissage, à enrichir. |
| **Filtre de cote** (lot 3) | Une suggestion sans cote bookmaker observée est **masquée** (`smart-suggestions.service.ts`, `attachExecutableQuotes`) et **n'est pas enregistrée en coupon**. | **Contraire à l'objectif** : de bons pronostics disparaissent, et l'échantillon d'apprentissage ne retient que les marchés cotés (biais). |
| Résolution des coupons | `resolveOutcome` compte un match annulé comme perdu. | Fausse le taux de réussite ; un match annulé doit être exclu (`VOID`). |
| Prix de configuration (`SmartRulesConfig.odds.*`) | `min`, `current`, `edgePct`, `confidence` saisis à la main. | Sans objet sans cote ; source de confusion. |
| Chantier d'exécution (lots 5 à 9 de l'ancien plan) | Livré, mode `DISABLED`. | Clos et laissé dormant (lot P0). |

## 3. Périmètre

### Dans le périmètre

- Pronostics produits et évalués sans cote ; cote affichée à titre d'information quand elle existe.
- Journal de pronostics figé au moment du pronostic, puis résolu.
- Mesures de fiabilité et de calibration, par dimension.
- Probabilités affinées à partir des résultats passés des pronostics, sans fuite d'information.
- Ajout progressif de facteurs (équipes, joueurs, calendrier), chacun conditionné à un gain mesuré.

### Hors périmètre

- Tout placement de pari, toute bankroll, tout opérateur. Le code d'exécution reste dormant, mode `DISABLED`.
- Rentabilité, ROI ou « value » (exigeraient les cotes comme donnée obligatoire).
- Modèles d'apprentissage automatique opaques tant que les règles et l'affinage statistique n'ont pas été mesurés.

## 4. Contrat de données

### 4.1 Journal de pronostics

On réutilise `smart_coupons` (une migration ajoute des colonnes, aucune nouvelle table de pronostics). Une ligne est
**figée au moment du pronostic** et n'est plus modifiée, sauf ses champs de résolution.

| Champ | Rôle |
|---|---|
| `fixtureId`, `leagueId`, `season`, `countryName`, `teamId`, `opponentTeamId`, `isHomeTeam` | Dimensions d'analyse, copiées pour survivre à la rétention des fixtures. |
| `marketType`, `selection`, `elapsedAtSuggestion` | Ce qui est pronostiqué et quand. |
| `signal`, `signalValue`, `signalThreshold`, `scoreAtSuggestion` | Pourquoi (données disponibles à l'instant du pronostic, uniquement). |
| `predictedProbability` (0-1), `probabilitySource`, `sampleSize` | Probabilité annoncée, son origine (taux de base, affinage) et la taille d'échantillon qui la porte. |
| `modelVersion` | Version des règles et de l'affinage : on ne mélange jamais deux versions dans une même mesure. |
| `observedOdd` (nullable) | Cote observée si disponible, purement informative. |
| `status` : `PENDING` / `WON` / `LOST` / `VOID` / `NO_RESULT`, `resolvedAt` | Résolution ; `VOID` (match annulé, reporté, interrompu avant décision) est exclu des mesures. |

Unicité : un seul pronostic par `(fixtureId, teamId, marketType, modelVersion)` — le premier déclenchement. Sans
cela, un match qui déclenche à chaque cycle de 2 minutes pèserait vingt fois dans l'échantillon.

Les lignes antérieures à la migration restent en lecture seule et sont exclues des mesures (pas de probabilité figée,
annulations comptées perdues).

### 4.2 Mesures (lecture seule)

| Route | Rôle | Entrée / sortie |
|---|---|---|
| `GET /v1/predictions` | VIEWER+ | Journal paginé, filtrable par dimension, statut et version. |
| `GET /v1/predictions/reliability` | VIEWER+ | `?groupBy=league\|country\|team\|market\|minute\|probability&modelVersion&from&to` → par groupe : pronostics résolus, réussites, taux, intervalle de Wilson 95 %, Brier. |
| `GET /v1/predictions/calibration` | VIEWER+ | Tranches de probabilité annoncée (0-10 %, …, 90-100 %) → taux observé et effectif par tranche. |

Règle d'affichage : un groupe de moins de 30 pronostics résolus est montré comme « échantillon insuffisant », jamais
comme un taux.

## 5. Lots

### Lot P0 — Clôture du chantier d'exécution

- **Contenu** : enregistrer dans `SUIVI_EXECUTION_PARIS.md` la clôture **NO-GO réel** (décision de Kevin du 2026-10-11 :
  pas de pari automatique), mode `DISABLED`, aucun credential opérateur, schedulers d'exécution et de réconciliation
  désactivés par défaut (déjà le cas). Retirer « Exécution » du menu ; garder les routes et les tables (aucune
  suppression, aucune migration). La page Simulation reste dans le menu tant que P2 ne l'a pas remplacée.
- **Critère de sortie** : `front` tests verts ; aucune route backend modifiée.

### Lot P1 — Pronostic indépendant de la cote

- **Contenu** : la cote devient facultative partout dans la chaîne live. Une suggestion est produite et enregistrée
  qu'une cote existe ou non ; si une cote admissible existe, elle est jointe pour affichage. Suppression de
  `SmartRulesConfig.odds.*` (prix et edge de configuration) et des champs du formulaire Paramètres ; `minAcceptableOdd`
  et `edgePct` ne sont plus produits. `BetRecommendation.currentOdd` devient nullable (migration).
- **Tests obligatoires** : suggestion sans cote visible et enregistrée ; suggestion avec cote jointe ; aucune
  suggestion masquée pour une cote absente ou basse ; config persistée ancienne (avec `odds`) relue sans erreur.
- **Critère de sortie** : tests `recommendations` et `settings` verts, build back et front, et une recherche des usages
  de `attachExecutableQuotes` comme filtre qui ne renvoie plus rien.

### Lot P2 — Journal de pronostics et mesures de fiabilité

- **Contenu** : migration de `smart_coupons` (champs 4.1, index par dimension) ; écriture figée au premier
  déclenchement ; résolution par `resolveSettlement` (VOID) ; service de mesures pur (taux, Wilson, Brier, calibration)
  calculé en SQL agrégé, sans requête par pronostic ; routes 4.2 ; page front **Fiabilité** (tableaux par dimension,
  courbe de calibration) ; la page Coupons affiche probabilité, échantillon et résultat.
- **Tests obligatoires** : unicité sous déclenchements répétés et concurrents ; figement (une relance ne réécrit pas la
  probabilité) ; VOID et NO_RESULT exclus ; Wilson et Brier contre des valeurs calculées à la main ; groupe < 30
  marqué insuffisant ; aucune fuite (la probabilité n'utilise que des données antérieures au pronostic).
- **Critère de sortie** : tests verts, migration up/down sur MySQL jetable, intégration MySQL des agrégats.

### Lot P3 — Affinage par les résultats

- **Contenu** : la probabilité annoncée combine le taux de base historique et la réussite observée des pronostics
  **déjà résolus avant l'instant du pronostic**, par niveaux emboîtés (global → pays → championnat → équipe), avec
  rétrécissement bayésien : un niveau peu fourni reste proche du niveau supérieur. Exemple : `(réussites + k × p_parent)
  / (pronostics + k)`. `k` est un paramètre versionné.
- **Validation** : rejeu chronologique (réutilise le découpage walk-forward existant, avec des mesures de fiabilité à la
  place du ROI). L'affinage n'est activé que s'il **améliore le score de Brier** hors échantillon par rapport au taux de
  base seul.
- **Tests obligatoires** : aucune donnée future dans le calcul ; un niveau sans historique retombe sur son parent ;
  rejeu reproductible (mêmes hashes).

### Lot P4 — Facteurs supplémentaires (à cadrer après P3)

Statistiques des équipes sur les derniers matchs, importance des joueurs (temps de jeu, buts et passes, présence dans la
composition annoncée), calendrier et enjeu (classement, matchs rapprochés, match suivant important), pronostics avant
match. Les données existent en partie (`fixture_lineups`, `fixture_player_stats_snapshots`, `standings`, import
historique). **Règle d'entrée : un facteur n'est activé que s'il améliore la calibration ou le Brier hors échantillon**,
mesure enregistrée dans le SUIVI. Un plan détaillé sera proposé une fois P2 et P3 mesurés.

## 6. Gate

### Gate F1 — Fiabilité mesurée

Après au moins **30 jours et 500 pronostics résolus** d'une même version : écart de calibration moyen ≤ 5 points,
Brier inférieur à la référence naïve (taux de réussite global constant), aucun doublon, 100 % des pronostics figés avec
leur probabilité. Seuils **proposés**, à geler par Kevin avant la mesure ; jamais révisés après lecture des résultats.

## 7. Risques

| Risque | Parade |
|---|---|
| Biais de sélection (seuls certains matchs sont suivis) | Ligues suivies figées par version ; mesures toujours par version et par ligue. |
| Fuite temporelle dans l'affinage | Probabilité calculée uniquement sur les pronostics résolus avant l'instant du pronostic ; test dédié. |
| Petits échantillons trompeurs par équipe | Seuil de 30 et rétrécissement vers le niveau supérieur. |
| Quota API-Football | P1 rend la collecte de cotes facultative ; possibilité de la réduire. |
| Interface qui suggère des gains | Vocabulaire de probabilité et de réussite observée ; pas de ROI dans les écrans de pronostic. |

## 8. Questions ouvertes pour Kevin

1. **Marchés** : rester sur les buts (1ère MT, 2ème MT, match) pendant P1-P3, ou ajouter d'autres marchés (1X2,
   les deux équipes marquent, plus/moins de buts, corners, cartons) ?
2. **Avant match** : les pronostics avant le coup d'envoi font-ils partie de l'objectif à court terme (lot P4), ou le
   direct suffit-il d'abord ?
3. **Seuils de F1** : valider ou ajuster les valeurs proposées.
4. **Backtest et simulation** : garder ces pages en les convertissant aux mesures de fiabilité (P2-P3), ou les retirer ?

## 9. Définition de terminé (P0 à P3)

Lots P0 à P3 terminés et relus, critères de sortie verts, migrations vérifiées dans les deux sens, aucune cote requise
nulle part dans la chaîne de pronostic, Gate F1 évaluée avec ses seuils gelés, et la page Fiabilité affichant les
mesures réelles par dimension.
