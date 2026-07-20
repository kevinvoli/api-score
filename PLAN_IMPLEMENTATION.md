# Plan d'implémentation — API SCORE

*Établi le 20 juillet 2026, à partir de `AVIS_PRONOSTIQUEUR.md`.*

Ce plan traite le produit pour ce qu'il est : un **détecteur d'opportunités** qui surveille
les matchs selon les critères du pronostiqueur, pas une plateforme de paris. L'indicateur qui
compte est donc la **justesse de l'alerte** (hit-rate et rappel), jamais le ROI.

Chaque lot se termine par un critère de sortie vérifiable. Les estimations supposent un
développeur à temps plein.

---

## LOT 0 — Urgence : la rétention détruit les données du backtest

**Constat vérifié le 20/07 :** `CleanupService.cleanupOldData` (cron 3h) supprime tout ce
qui dépasse 90 jours. Dans la nuit du 19 au 20 juillet, il a effacé :

| Table | Avant | Après |
|---|---|---|
| `fixtures` | 268 | 0 |
| `fixture_stats_snapshots` | 3 554 | 0 |
| `fixture_events` | 1 319 | 0 |
| `api_football_payloads` | 9 545 | 46 |

Les `bet_results` (109) et `backtest_runs` ont survécu uniquement parce qu'ils n'ont
volontairement pas de clé étrangère vers `fixtures`.

**Le problème de fond :** une rétention de 90 jours est incompatible avec un produit dont la
valeur repose sur l'historique. Elle supprimerait tout import de saisons passées dès la nuit
suivante. **Rien d'autre dans ce plan ne peut fonctionner tant que ce point n'est pas réglé.**

### Tâches

| # | Tâche | Fichier | Effort |
|---|---|---|---|
| 0.1 | Rétention configurable par env (`DATA_RETENTION_DAYS`), défaut relevé à 1095 j (3 saisons) | `maintenance/cleanup.service.ts`, `config/env.validation.ts`, `.env.example` | 0,5 j |
| 0.2 | Ne plus supprimer les `fixtures` sur `matchDate` — ne purger que les payloads bruts, volumineux et réimportables | idem | 0,5 j |
| 0.3 | Journaliser un avertissement avant toute suppression massive (> 1000 lignes) | idem | 0,25 j |
| 0.4 | Specs de non-régression sur les seuils | `cleanup.service.spec.ts` | 0,25 j |

**Critère de sortie :** un import de matchs vieux de 2 ans survit à une exécution manuelle du
cron. Vérifié en base, pas seulement en test.

---

## LOT 1 — Import de l'historique (le déverrouillage)

Ton abonnement actuel sert déjà, pour tout match passé : score mi-temps et final, buteurs
avec minute, `statistics_1half` **et** `statistics` (tirs cadrés / non cadrés, attaques
dangereuses, possession, corners). **Aucun achat d'API n'est nécessaire.**

### Tâches

| # | Tâche | Fichier | Effort |
|---|---|---|---|
| 1.1 | Entité `league_watchlist` : championnats suivis (leagueId, nom, actif, priorité) + migration | `database/entities/league-watchlist.entity.ts` | 0,5 j |
| 1.2 | Service d'import historique : boucle par championnat et par fenêtre de 5 jours (limite `get_events` vérifiée), respect du quota via `hasRateBudget()` | `history/history-import.service.ts` | 2 j |
| 1.3 | Persistance : `fixtures` + 2 snapshots par équipe et par match (état mi-temps depuis `statistics_1half`, état final depuis `statistics`), `fixture_events` depuis `goalscorer` avec minute | idem | 1,5 j |
| 1.4 | Idempotence : réimporter la même période ne duplique rien | idem | 0,5 j |
| 1.5 | Script CLI `import-history` avec paramètres championnat / saison / plage | `scripts/import-history.ts` | 0,5 j |
| 1.6 | Specs sur payload réel (échantillon match 690949 déjà collecté) | `history-import.service.spec.ts` | 1 j |

**Point d'attention technique :** les snapshots historiques portent `elapsed = 45` et
`elapsed = 90`. Les règles live exigeant `elapsed < maxElapsed`, elles ne se déclencheront
**pas** sur ces données. C'est normal et attendu : l'historique sert à calculer des **taux de
base** (lot 2), pas à rejouer les règles minute par minute. Ne pas confondre les deux usages.

**Critère de sortie :** une saison complète d'un championnat importée, comptages vérifiés en
base (matchs, snapshots MT/FT, buts avec minute), réimport sans doublon.

---

## LOT 2 — Taux de base : remplacer la confiance inventée par un chiffre réel

Aujourd'hui `confidenceScore: 70` et `edgePct: 12.5` sont des constantes recopiées à chaque
suggestion. C'est la principale malhonnêteté de l'interface.

### Tâches

| # | Tâche | Fichier | Effort |
|---|---|---|---|
| 2.1 | Calculateur pur de taux de base : « N tirs cadrés à la MT → a marqué en 1re MT ? » par championnat et par saison | `analytics/base-rates.calculator.ts` | 1,5 j |
| 2.2 | Entité `base_rates` (leagueId, marché, seuil, échantillon, tauxObserve, calculatedAt) + migration | `database/entities/base-rate.entity.ts` | 0,5 j |
| 2.3 | Job de recalcul mensuel + déclenchement manuel | `analytics/base-rates.scheduler.ts` | 0,5 j |
| 2.4 | Exposition `GET /v1/analytics/base-rates` (filtres championnat / marché) | `analytics/analytics.controller.ts` | 0,5 j |
| 2.5 | **Brancher `confidenceScore` sur le taux réel** quand il existe, `null` sinon — ne jamais inventer | `recommendations/rules/rules-evaluator.ts` | 1 j |
| 2.6 | Afficher la taille d'échantillon à côté du taux (un taux sur 12 matchs n'est pas un taux) | front | 0,5 j |
| 2.7 | Specs | `base-rates.calculator.spec.ts` | 1 j |

**Critère de sortie :** l'interface affiche « 68 % (sur 340 matchs, Ligue X, saison 2025/26) »
au lieu de « Confiance 70 % ». Aucun chiffre affiché sans son échantillon.

---

## LOT 3 — Qualité du signal

Le total de tirs est le plus faible des indicateurs disponibles. Le `pressureIndex`
(attaques dangereuses ×1,4 + tirs cadrés ×2 + corners ×1,2 − tirs non cadrés ×0,4) existe
déjà dans `common/utils/stats.utils.ts` et n'est **pas utilisé** par les règles.

⚠ `evaluateRules` est partagé entre le live et le backtest. Toute modification de
`RuleEvaluationInput` touche les deux simultanément — c'est voulu (iso-comportement), mais
impose de faire évoluer les deux chemins ensemble et de garder les specs vertes.

### Tâches

| # | Tâche | Fichier | Effort |
|---|---|---|---|
| 3.1 | Ajouter `shotsOnTarget` et `pressureIndex` à `RuleEvaluationInput`, alimentés par les deux adaptateurs (live + rejeu) | `rules/rules-evaluator.ts`, `smart-suggestions.service.ts`, `backtest-engine.service.ts` | 1 j |
| 3.2 | Rendre le **critère** configurable : `signal: 'TOTAL_SHOTS' \| 'ON_TARGET' \| 'PRESSURE_INDEX'` dans `SmartRulesConfig` | `settings/smart-rules-config.service.ts`, DTO, front | 1 j |
| 3.3 | **Ajouter le score courant** à `RuleEvaluationInput` (scoreHome, scoreAway) | idem 3.1 | 0,5 j |
| 3.4 | Modulation par état du match : seuils ajustables selon menant / mené / nul | `rules/rules-evaluator.ts`, config | 1,5 j |
| 3.5 | Specs aux seuils exacts pour chaque signal et chaque état de score | `rules-evaluator.spec.ts` | 1 j |
| 3.6 | Comparer les trois signaux en backtest sur l'historique, garder le meilleur | — | 0,5 j |

**Critère de sortie :** le hit-rate du meilleur signal est mesuré et documenté contre celui
du total de tirs, sur le même échantillon historique.

---

## LOT 4 — Interface honnête et réglage sur des faits

### Tâches

| # | Tâche | Fichier | Effort |
|---|---|---|---|
| 4.1 | Retirer « Edge % » de Paramètres (notion de pari sans objet ici) | `front/app/parametres/page.tsx` | 0,25 j |
| 4.2 | Renommer « Cote actuelle » en « Cote de référence (indicative) » — elle n'est pas issue du marché | idem | 0,25 j |
| 4.3 | Remplacer « Confiance » par le taux de base réel du lot 2, en lecture seule | idem | 0,5 j |
| 4.4 | **Bouton « Tester cette configuration en backtest »** : lance un run sur l'historique avec la config en cours d'édition et affiche hit-rate + rappel + volume d'alertes | front + `POST /v1/audit/backtest` (existe déjà) | 1,5 j |
| 4.5 | Garde-fous de cohérence : seuils décroissants, fenêtres qui se chevauchent | `smart-rules.controller.ts` (base déjà posée le 20/07) | 0,5 j |

**Critère de sortie :** modifier un seuil et voir en moins de 30 secondes son effet chiffré
sur l'historique, sans quitter la page. C'est la fonctionnalité la plus utile du produit.

---

## LOT 5 — Mesurer ce qui compte pour un scanner

Le backtest mesure aujourd'hui « quand j'alerte, j'ai raison X % du temps ». Il manque le
symétrique : « sur tous les buts marqués, j'en ai signalé Y % ». Sans les deux, impossible
de régler l'arbitrage sélectivité / couverture — le cœur du réglage d'un scanner.

### Tâches

| # | Tâche | Fichier | Effort |
|---|---|---|---|
| 5.1 | Calcul du rappel : événements réalisés / événements signalés, par marché | `backtest/kpis-calculator.ts` | 1 j |
| 5.2 | Ajouter `recallPct`, `alertsPerMatch`, `missedEvents` aux `BacktestKpis` | `backtest/backtest.types.ts` + migration `backtest_runs.kpis` (JSON, pas de migration nécessaire) | 0,5 j |
| 5.3 | Courbe précision / rappel selon le seuil, pour choisir le point de fonctionnement | front page Audit | 1,5 j |
| 5.4 | Specs | `kpis-calculator.spec.ts` | 0,5 j |

**Critère de sortie :** la page Audit permet de répondre à « si je durcis mon seuil, combien
d'occasions je rate en échange de combien de fausses alertes en moins ? »

---

## LOT 6 — Classement pré-match (la fonctionnalité la plus alignée avec ta promesse)

Ta proposition de valeur est d'éviter au parieur de rester devant ses écrans. Le scanner live
n'en couvre que la moitié : il faut encore attendre. Le classement pré-match couvre l'autre.

### Tâches

| # | Tâche | Fichier | Effort |
|---|---|---|---|
| 6.1 | Entité `team_profiles` : buts marqués/encaissés par période, écart domicile/extérieur, tendance à marquer tard, sur N derniers matchs | `database/entities/team-profile.entity.ts` | 0,5 j |
| 6.2 | Job de calcul quotidien depuis l'historique | `analytics/team-profiles.service.ts` | 1,5 j |
| 6.3 | Score de potentiel de buts par match du jour, à partir des deux profils + taux de base du championnat | `analytics/match-ranking.service.ts` | 1,5 j |
| 6.4 | `GET /v1/analytics/daily-ranking` | contrôleur | 0,5 j |
| 6.5 | Page front : « Les matchs à surveiller aujourd'hui », triés par potentiel | `front/app/(nouvelle page)` | 2 j |
| 6.6 | Specs | — | 1 j |

**Critère de sortie :** chaque matin, une liste ordonnée des matchs du jour avec leur
potentiel chiffré et la raison (« les deux équipes encaissent en 2e MT », « championnat à
3,4 buts/match »).

---

## LOT 7 — Filtrage des championnats

Les statistiques live des petits championnats (saisie manuelle, retards, corrections)
produisent de fausses alertes. Mieux vaut 15 compétitions fiables que 100 approximatives.

### Tâches

| # | Tâche | Fichier | Effort |
|---|---|---|---|
| 7.1 | Interface de sélection des championnats suivis (`league_watchlist` du lot 1) | front Paramètres | 1 j |
| 7.2 | Appliquer le filtre à l'ingestion live, aux suggestions et au scanner | `fixtures-sync.scheduler.ts`, `smart-suggestions.service.ts` | 1 j |
| 7.3 | Indicateur de qualité de données par championnat (taux de champs manquants, retards de sync) calculé depuis l'historique | `analytics/league-quality.service.ts` | 1,5 j |
| 7.4 | Recommandation automatique : proposer de désactiver les championnats sous un seuil de fiabilité | idem | 0,5 j |

**Critère de sortie :** le volume d'alertes baisse et le hit-rate monte, tous deux mesurés
avant / après sur le même historique.

---

## Séquencement et dépendances

```
LOT 0 (rétention)  ──►  LOT 1 (import historique)  ──┬──►  LOT 2 (taux de base)  ──►  LOT 4 (interface)
     BLOQUANT                    déverrouille        │
                                                     ├──►  LOT 6 (classement pré-match)
                                                     └──►  LOT 7 (filtrage championnats)

LOT 3 (qualité du signal)  ──►  indépendant, mais se mesure avec le LOT 1
LOT 5 (rappel)             ──►  indépendant, se mesure avec le LOT 1
```

| Lot | Effort | Peut démarrer |
|---|---|---|
| 0 — Rétention | 1,5 j | **immédiatement (bloquant)** |
| 1 — Import historique | 6 j | après lot 0 |
| 2 — Taux de base | 5,5 j | après lot 1 |
| 3 — Qualité du signal | 5,5 j | en parallèle du lot 1 |
| 4 — Interface honnête | 3 j | après lot 2 |
| 5 — Rappel | 3,5 j | en parallèle du lot 2 |
| 6 — Classement pré-match | 7 j | après lot 1 |
| 7 — Filtrage championnats | 4 j | après lot 1 |

**Total : ~36 jours-homme.** Chemin critique 0 → 1 → 2 → 4, soit ~16 jours pour un produit
qui affiche enfin des chiffres honnêtes et se règle sur des faits.

---

## Ordre recommandé si le temps est compté

Si tu ne devais faire que trois choses :

1. **LOT 0** — sans quoi tout le reste s'efface chaque nuit.
2. **LOT 1 + 2** — remplacer la confiance inventée par un taux réel calculé sur des milliers
   de matchs. C'est ce qui rend ton produit crédible.
3. **LOT 4.4** — le bouton « tester cette config en backtest ». C'est ce qui te fait passer du
   réglage à l'intuition au réglage sur des faits.

Le lot 6 (classement pré-match) est le plus prometteur commercialement, mais il n'a de sens
qu'une fois les taux de base fiables.

---

## Hors périmètre, et pourquoi

- **Kelly fractionnel, optimiseur de coupons Monte Carlo** — sans cotes réelles ni edge
  mesuré, ces outils appliquent une précision mathématique à des entrées inventées.
- **Machine learning (XGBoost, Poisson)** — sans taux de base fiables ni échantillon
  suffisant, un modèle apprendra le bruit. À reconsidérer une fois les lots 1 et 2 livrés :
  ils fourniront précisément les données d'entraînement qui manquent aujourd'hui.
- **Achat d'une API de données historiques** — inutile, ton abonnement les sert déjà
  (vérifié). Seul le **xG** justifierait une dépense, et pas avant les lots 1 à 4.
- **Activation du module Odds** — construit et fonctionnel, mais secondaire pour un scanner.
  Il reste disponible le jour où tu voudras comparer tes alertes aux prix du marché.

---

## Dette technique à traiter en parallèle

Constats de la revue de code du 19/07, non bloquants :

| Sujet | Fichier | Priorité |
|---|---|---|
| `POST /v1/audit/backtest` synchrone et stratégie peu validée | `audit.controller.ts` | à traiter avec le lot 4.4 |
| `Record<string, any>` dans le parsing odds | `odds-ingestion.service.ts` | basse |
| Courbe bankroll front tronquée à 500 paris | `front/app/audit/page.tsx` | avec le lot 5 |
| Marché-partition sensible aux issues dupliquées | `odds-ingestion.service.ts` | basse |
| `limit` / `offset` négatifs acceptés | `audit.controller.ts` | basse |
| **Créer un `CLAUDE.md`** documentant la normalisation des statuts | racine | **haute** — cause racine de 6 bugs le 19/07 |
| 28 vulnérabilités Dependabot (13 critiques) | `package.json` | haute avant toute mise en ligne |

---

*Ce document décrit une direction d'architecture logicielle. Il ne constitue pas un conseil
financier ni une incitation à parier de l'argent réel.*
