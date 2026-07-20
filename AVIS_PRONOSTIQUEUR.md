# Avis d'un parieur professionnel sur API SCORE

*Rédigé le 20 juillet 2026, après une journée passée dans le code, la base et les données réelles.*
*Révisé le même jour après recadrage du produit par son auteur — voir §0.*

Ce document est un avis critique, pas un satisfecit. Le socle technique est bon — c'est
précisément pour ça qu'il vaut la peine d'être franc sur ce qui ne va pas dans la partie
« pronostic ». Il n'est pas un conseil financier et n'encourage pas à miser de l'argent réel.

---

## 0. Recadrage : ce produit est un détecteur d'opportunités, pas une plateforme de paris

Ma première rédaction jugeait ce projet comme un système de *value betting*. C'était une
erreur d'analyse de ma part, et elle invalidait plusieurs de mes critiques.

**Ce que le produit est réellement :** un scanner qui surveille les matchs en continu selon
des critères définis par le pronostiqueur, et qui le prévient quand une situation
intéressante se présente — « dans ce championnat, sur ce match, il va probablement y avoir
un but ». Sa raison d'être est d'**éviter au parieur de rester des heures devant ses écrans**
à guetter des opportunités. Il ne connaît pas les cotes réelles des bookmakers et ne prétend
pas les battre.

**Ce que ça change dans mon jugement :**

| Ma critique initiale | Verdict après recadrage |
|---|---|
| « Il n'y a pas d'edge » | **Non pertinente** — le produit ne prétend pas en calculer un |
| « Les cotes sont supposées » | **Atténuée** — mais alors elles n'ont rien à faire dans l'interface |
| « Le ROI du backtest est trompeur » | **Confirmée et aggravée** — le ROI est le mauvais indicateur ici |
| « Signal faible (tirs totaux) » | **Confirmée et renforcée** — c'est désormais le cœur du produit |
| « Le score est ignoré » | **Confirmée et renforcée** — même raison |
| « Championnats à marge élevée » | **Reformulée** — l'enjeu est la fiabilité des données, pas la marge |

**La conséquence la plus importante : le bon indicateur de performance change.**

Pour un scanner, le ROI n'a aucun sens — il dépend de cotes qu'on ne connaît pas. Le seul
indicateur qui compte est la **précision de l'alerte** :

> Quand le système dit « il va y avoir un but », combien de fois a-t-il raison ?

C'est le **hit-rate**, et c'est justement ce que le backtest sait déjà mesurer. Le tableau
du §6 doit donc se lire en ignorant complètement la colonne ROI. Ce qui reste est solide et
honnête : 89,7 % / 75,9 % / 61,9 % selon le marché.

Deuxième conséquence : il faudrait aussi mesurer ce que le backtest ne voit pas encore — le
**taux de rappel**. Sur tous les matchs où un but a effectivement été marqué en 2e mi-temps,
combien le système a-t-il signalés ? Un scanner trop sélectif rate des occasions ; un
scanner trop laxiste noie l'utilisateur sous les alertes. C'est l'arbitrage central de ce
produit, et il n'est aujourd'hui pas mesuré.

---

## 1. Le constat qui prime sur tous les autres : il n'y a pas d'edge dans ce système

*(Section conservée telle quelle : même si le produit ne vise pas le value betting, elle
explique pourquoi les champs « edge » et « confiance » de l'interface sont trompeurs et
devraient disparaître ou être renommés.)*

C'est le point central, et il faut le regarder en face.

Dans `rules-evaluator.ts`, `edgePct` et `confidenceScore` ne sont **pas calculés**. Ils sont
recopiés depuis la configuration :

```ts
edgePct: oddsHT.edgePct,          // 12.5 — constante
confidenceScore: oddsHT.confidence, // 70 — constante
```

Conséquence : **toutes** les suggestions de buts 1re mi-temps affichent « edge 12,5 % » et
« confiance 70 % », que ce soit Manchester City contre une équipe de D4 ou deux clubs
amateurs australiens. C'est pour cette raison que tous les coupons de la page affichaient
`72 %` à l'identique.

Or, par définition :

```
edge = probabilité_estimée_par_le_modèle − probabilité_implicite_de_la_cote
```

Aujourd'hui, le système ne produit **aucune** probabilité estimée. Il n'a donc pas d'edge :
il a un **déclencheur** (un seuil de tirs). Ce n'est pas la même chose, et c'est même
l'inverse de ce que vend le nom « value bet ».

**Ce qu'il faut faire :** tant que la Phase 3 (Poisson calibré) n'existe pas, afficher ces
champs comme « non calculé » plutôt que comme des pourcentages. Un edge affiché faux est
pire qu'un edge absent : il donne une fausse assurance au moment de miser.

---

## 2. Les cotes sont supposées, pas observées

`odds.firstHalfHT.current = 1.75` est une hypothèse écrite en dur. Dans la réalité, la cote
« l'équipe marque en 1re mi-temps » varie entre ~1,40 et ~4,50 selon l'équipe, l'adversaire,
le score et la minute.

Le backtest l'a montré crûment : sur 109 paris rejoués, **89 utilisaient la cote par défaut**
et seulement 20 une vraie cote de marché — et ces vraies cotes valaient en moyenne **2,09**
là où la config suppose 1,65. Miser à un prix supposé plus généreux que le prix réel, c'est
la façon la plus classique de perdre lentement en croyant gagner.

**Ce qu'il faut faire :** rien de sérieux ne peut être mesuré tant que `ODDS_SYNC_ENABLED`
reste à `false`. Le module est prêt, il attend la reprise des championnats. **C'est la
priorité numéro un.**

---

## 3. Le signal choisi — le nombre de tirs — est faible

Le total de tirs mélange une frappe de 35 mètres dans les tribunes et une tête à bout
portant. Les signaux que le marché regarde vraiment, par ordre de valeur :

| Signal | Valeur | Disponible ici ? |
|---|---|---|
| xG (expected goals) | très forte | non |
| Grosses occasions | forte | non |
| Tirs cadrés | bonne | oui (`getStatValue`) mais inutilisé dans les règles |
| Attaques dangereuses | correcte | oui, calculé dans `computePressureIndex` mais pas dans les règles |
| Tirs totaux | **faible** | **c'est le seul utilisé** |

Le projet calcule déjà un `pressureIndex` (attaques dangereuses ×1,4 + tirs cadrés ×2 +
corners ×1,2 …) qui est nettement meilleur que le total de tirs — et les règles ne s'en
servent pas.

**Ce qu'il faut faire :** basculer les règles sur les tirs cadrés au minimum, sur le
`pressureIndex` idéalement. C'est peu de travail pour un gain de qualité immédiat.

---

## 4. Le score n'est pas pris en compte — c'est la plus grosse lacune analytique

Aucune règle ne regarde le score. Or, à volume de tirs identique :

- une équipe menant **3-0** qui frappe 12 fois gère son match, lève le pied, et la
  probabilité qu'elle marque encore chute ;
- une équipe menée **0-1** qui frappe 12 fois pousse, prend des risques, et la probabilité
  qu'elle marque grimpe — mais celle d'encaisser aussi.

Le bookmaker, lui, intègre le score instantanément. Parier sans le regarder, c'est accepter
d'être systématiquement du mauvais côté de cette information.

**Ce qu'il faut faire :** ajouter le score courant à `RuleEvaluationInput` et moduler les
seuils. C'est la modification la plus rentable de toute cette liste.

---

## 5. Les championnats ciblés sont les pires possibles

La page Live affichait : Iraqi League, FAW Championship Cymru South, Regionalliga Nordost,
championnats australiens d'État, Ghana Premier League. Un vétéran fuit ces marchés :

- **Marges énormes.** J'ai mesuré un overround de **11 %** sur le 1X2 du match ghanéen
  (contre 4 à 5 % sur un grand championnat européen). Cela signifie qu'il faut un edge de
  plus de 11 % rien que pour rentrer dans ses frais.
- **Données live peu fiables.** Statistiques saisies à la main, retards, corrections.
- **Limites de mise très basses.** Même avec un edge réel, le volume misable est dérisoire.

**Ce qu'il faut faire :** ajouter un filtre de championnats. Se concentrer sur 10 à 15
compétitions bien couvertes plutôt que 100 mal couvertes. La qualité de données prime sur
le volume de matchs.

---

## 6. Ce que dit vraiment le backtest (et ce qu'il ne dit pas)

Résultats du premier run baseline sur l'archive 25 février → 6 mars :

| Marché | Paris | Hit-rate | ROI affiché |
|---|---|---|---|
| Buts match | 32 | 89,7 % | +30,0 % |
| Buts 1re mi-temps | 32 | 75,9 % | +32,8 % |
| Buts 2e mi-temps | 45 | 61,9 % | +14,2 % |
| **Total** | **109** | **77,2 %** | **+26,8 %** |

**Trois lectures qu'un vétéran fait de ce tableau :**

1. **Le 89,7 % de « Buts match » n'est pas une bonne nouvelle, c'est un signal d'alerte.**
   Une équipe ayant déjà cadré 10 fois en 30 minutes finit par marquer très souvent — le
   marché le sait et cote ça autour de **1,15–1,25**, pas 1,45. Le ROI de +30 % vient
   entièrement de l'écart entre la cote supposée et la cote réelle. Avec le vrai prix,
   ce marché est probablement à l'équilibre ou perdant.

2. **Le volume est concentré sur le marché le plus faible.** 45 des 109 paris sont sur
   « Buts 2e mi-temps », qui affiche le pire hit-rate (61,9 %). Même déséquilibre côté
   coupons live : 38 sur 42. La règle de 2e mi-temps (`maxElapsed: 60, minShots: 5`) est
   trop permissive.

3. **L'échantillon ne prouve rien.** 109 paris, dont 30 sans résultat. Pour distinguer un
   edge réel de 5 % du simple hasard, il faut de l'ordre de **500 à 1 000 paris résolus**.
   Nous en sommes à 79. Toute conclusion tirée aujourd'hui serait de la superstition.

---

## 7. Avis sur la page Paramètres — Critères de sélection

### Ce qui est bien conçu

L'interface est la meilleure idée du projet côté produit. La formulation
« Si temps de jeu < 30 min et tirs ≥ 10 → suggérer +0.5 buts » est lisible, directement
compréhensible, et les règles progressives par fenêtre de temps sont la bonne structure.
Externaliser les seuils en base plutôt que les coder en dur est exactement ce qu'il faut
pour itérer.

### Deux bugs à corriger

**A. La page ne peut pas sauvegarder — `PUT /v1/settings/smart-rules` renvoie 400.**

Le DTO de validation (`update-smart-rules.dto.ts`) attend une forme qui n'existe nulle
part ailleurs :

```ts
{ minute: number; shotsThreshold: number; odds: number }   // le DTO
{ maxElapsed: number; minShots: number }                    // la vraie config
```

Avec `forbidNonWhitelisted: true` dans `main.ts`, toute sauvegarde depuis le front est
rejetée. Vérifié en direct :

```
"property secondHalfRule should not exist"
"property odds should not exist"
"firstHalfRules.0.property maxElapsed should not exist"
```

Le contrôleur fait par ailleurs `dto as unknown as SmartRulesConfig` — un cast qui masque
justement le désaccord de types que TypeScript aurait signalé.

**B. La config stockée en base est incohérente avec les valeurs par défaut.**

En base : `[{11,5},{21,8},{31,10},{41,12},{45,13},{45,…}]` — six règles, dont **deux avec
le même `maxElapsed: 45`**. La seconde est inatteignable : `findMatchedRule` retourne la
première qui correspond. C'est une règle morte, silencieuse.

### Ce qui manque à cette page

- **Aucun filtre de championnat** (point 5 ci-dessus) — le manque le plus coûteux.
- **Aucun paramètre de score** (point 4).
- **Les champs « edge » et « confiance » sont éditables** alors qu'ils ne sont pas calculés :
  l'utilisateur croit régler un seuil de valeur, il ne règle qu'un texte d'affichage.
- **Aucun bouton « tester cette configuration en backtest »** — alors que le moteur existe
  désormais. C'est le chaînon manquant évident : modifier un seuil, voir immédiatement son
  effet sur l'historique. Ce serait la fonctionnalité la plus utile du produit.
- Pas de garde-fou de cohérence (chevauchement de fenêtres, seuils décroissants).

---

## 8. Ce que je ferais maintenant, dans cet ordre

*Priorités révisées pour un produit de type scanner (cf. §0).*

### Fait le 20/07

1. ~~**Réparer la sauvegarde des paramètres.**~~ DTO aligné sur la vraie forme, cast trompeur
   supprimé, bornes de validation ajoutées, garde-fou contre les fenêtres en double
   (la règle morte `maxElapsed: 45` en double est éliminée). 4 specs.

### Immédiat — améliorer la qualité de l'alerte

2. **Brancher les règles sur les tirs cadrés ou le `pressureIndex`** plutôt que sur le total
   de tirs. C'est désormais LE cœur du produit : la qualité du signal est la valeur vendue.
   Le `pressureIndex` existe déjà et n'est pas utilisé.
3. **Intégrer le score courant dans les règles.** Une équipe menant 3-0 qui frappe 12 fois
   n'a pas la même probabilité de marquer qu'une équipe menée 0-1 qui en frappe autant.
   Modification la plus rentable de la liste.
4. **Retirer ou renommer « Edge % » et « Confiance »** dans l'interface Paramètres. Ces
   champs ne sont pas calculés et n'ont pas de sens pour un scanner. Les remplacer par un
   seuil utile : « ne m'alerter que si le hit-rate historique de cette règle dépasse X % ».

### Court terme — mesurer ce qui compte vraiment

5. **Ajouter le taux de rappel au backtest.** Aujourd'hui on sait « quand j'alerte, j'ai
   raison X % du temps ». Il manque « sur tous les buts marqués, j'en ai signalé Y % ».
   Sans les deux, impossible de régler l'arbitrage sélectivité / couverture — qui est le
   cœur du réglage d'un scanner.
6. **Bouton « tester cette configuration en backtest » dans Paramètres.** Le moteur existe
   déjà. Modifier un seuil et voir immédiatement son effet sur l'historique transformerait
   le produit : le pronostiqueur réglerait ses critères sur des faits, plus à l'intuition.
   **C'est la fonctionnalité la plus utile à construire ensuite.**
7. **Filtrer les championnats — pour la fiabilité des données.** Les statistiques live des
   petits championnats (saisie manuelle, retards, corrections) produisent de fausses
   alertes. Mieux vaut 15 compétitions bien couvertes que 100 approximatives.

### Ensuite

8. **Historique par match et par équipe** (mentionné par l'auteur) : buts encaissés en 2e
   mi-temps sur les 5 derniers matchs, tendance domicile/extérieur, moyenne de buts de la
   confrontation. C'est le complément naturel du signal live, et ça enrichit l'alerte sans
   dépendre des bookmakers.
9. **Relancer le backtest tous les mois** en suivant le hit-rate par règle et par
   championnat. Retirer les règles qui ne tiennent pas.

### Le module Odds dans ce cadre

`ODDS_SYNC_ENABLED` peut rester à `false` : les cotes ne sont pas nécessaires au
fonctionnement du scanner. Elles gardent deux usages secondaires — donner un ordre de
grandeur au pronostiqueur, et permettre un jour de vérifier si les alertes correspondent à
des situations sous-évaluées par le marché. Ce n'est plus une priorité, mais le module est
prêt le jour où tu en voudras.

### À ne pas faire tout de suite

- **Le Kelly fractionnel** (Phase 5). Kelly appliqué à un edge estimé faux mène à la ruine
  plus vite qu'une mise fixe. Rester à la mise plate de 1 unité tant que l'edge n'est pas
  prouvé.
- **L'optimiseur de coupons Monte Carlo.** Combiner des sélections multiplie les marges du
  bookmaker. Un coupon de 4 sélections à 5 % de marge chacune, c'est ~20 % de désavantage
  d'entrée. Les combinés sont le produit le plus rentable pour le bookmaker — ce n'est pas
  un hasard.
- **Le machine learning** (Phase 6). Sans données de cotes ni baseline mesurée, un modèle
  XGBoost apprendra surtout à reproduire le bruit de l'échantillon.

---

## 10. « J'aimerais ajouter une API de données historiques, mais je ne sais pas à quoi ça sert »

C'est la meilleure question du projet, et elle a deux réponses.

### Réponse courte : tu n'as probablement pas besoin d'une nouvelle API

**Ton abonnement actuel sert déjà les données historiques, et elles sont excellentes.**
Vérifié en direct sur un match de mars (`get_events&match_id=690949`) :

| Donnée | Disponible |
|---|---|
| Score mi-temps **et** score final | oui |
| Buteurs **avec la minute** et la période (1re/2e MT) | oui |
| `statistics_1half` — stats **à la mi-temps** | oui |
| `statistics` — stats fin de match | oui |
| Tirs cadrés / non cadrés, attaques, attaques dangereuses, possession, corners | oui, **sur les deux périodes** |
| Compositions, remplacements | oui |

Autrement dit, pour n'importe quel match passé, tu peux reconstituer :

- les **tirs de 1re mi-temps** (`On Target` + `Off Target` de `statistics_1half`) et savoir si
  l'équipe a marqué avant la pause (score MT) ;
- les **tirs de 2e mi-temps** (`statistics` − `statistics_1half`) et savoir si elle a marqué
  après la pause (score final − score MT).

**C'est exactement la vérité terrain dont tes règles ont besoin.** Aucun achat requis.

### À quoi ça sert concrètement — cinq usages, par ordre de valeur

**1. Remplacer la « confiance » inventée par un taux réel.** Aujourd'hui l'interface affiche
`70 %` parce que c'est écrit dans la config. Avec l'historique, tu calcules le vrai chiffre :

> « Dans ce championnat, sur les 3 dernières saisons, une équipe ayant 5 tirs cadrés à la
> mi-temps a marqué en 1re mi-temps dans **68 %** des cas. »

Voilà ce que ton utilisateur veut lire. C'est honnête, c'est calculé, et ça transforme une
alerte en information exploitable.

**2. Régler les seuils championnat par championnat.** Un championnat à 3,5 buts par match et
un autre à 1,8 ne peuvent pas partager le même seuil — c'est pourtant le cas aujourd'hui.
L'historique te donne le taux de base par compétition, donc des critères adaptés à chacune.
C'est probablement le gain de précision le plus important accessible à court terme.

**3. Régler le problème d'échantillon immédiatement.** Le backtest actuel tourne sur 10 jours
d'archive : 109 paris, dont 30 sans résultat. Beaucoup trop peu pour conclure quoi que ce
soit. En important des saisons entières, tu passes à **des milliers de matchs** et tu atteins
la significativité statistique **maintenant**, au lieu d'attendre des mois d'accumulation.
À mes yeux c'est l'argument décisif.

**4. Classer les matchs AVANT le coup d'envoi — la vraie tueuse pour ton produit.**
Aujourd'hui le scanner surveille tous les matchs à égalité. Avec les profils d'équipes tirés
de l'historique (buts encaissés en 2e MT, tendance à marquer tard, écart domicile/extérieur),
tu peux annoncer le matin :

> « Ces 8 matchs du jour ont le plus fort potentiel de buts. Surveille ceux-là. »

C'est littéralement ta proposition de valeur — éviter au parieur de rester devant ses écrans.
Le scanner live devient la seconde couche, et non plus la seule.

**5. Profils d'équipe et contexte.** Équipes qui s'écroulent physiquement après l'heure de
jeu, qui encaissent en fin de match, écarts domicile/extérieur (souvent 15 à 20 points de
pourcentage), confrontations historiquement fermées. Tout cela enrichit l'alerte sans
dépendre d'un bookmaker.

### La limite honnête de ces données

L'historique te donne l'état **à la mi-temps** et **à la fin**, pas minute par minute. Ta
règle « 10 tirs avant la 30ᵉ minute » ne peut donc pas être validée exactement — tu ne
connais pas l'état à la 30ᵉ.

Ce n'est pas bloquant : « N tirs à la mi-temps → a marqué en 1re MT ? » est un excellent
approximant pour calibrer les taux de base. Mais garde-le en tête avant de tirer des
conclusions trop fines sur le minutage.

Deux points pratiques à anticiper : `get_events` limite les plages à **5 jours** (vérifié),
donc importer une saison demande une boucle et du quota ; et le stockage existe déjà
(`api_football_payloads` archive tout, 9 545 payloads à ce jour).

### Si tu veux malgré tout une seconde API, voici ce qui vaut le coup

Uniquement pour ce que la tienne **ne fournit pas** :

- **xG (expected goals)** — SportMonks, Opta. C'est le meilleur prédicteur isolé de buts
  futurs, nettement supérieur au comptage de tirs. Le seul ajout réellement transformateur.
- **Statistiques historiques minute par minute** — rare et cher. Ne l'envisage que si le
  minutage fin devient central.
- **Compositions et blessures avant match** — utile pour le classement pré-match du point 4.

Ce qui ne vaut **pas** le coup : une API de plus pour des scores et statistiques finaux. Tu
les as déjà.

### Ce que je ferais, concrètement

1. Écrire un script d'import historique (`src/scripts/`) qui parcourt les championnats
   retenus sur 1 à 2 saisons et persiste dans `fixtures` + `fixture_stats_snapshots`.
2. Calculer les **taux de base par championnat** et les exposer dans Paramètres, à côté de
   chaque règle : « cette règle a historiquement raison à X % dans ce championnat ».
3. Relancer le backtest sur cet historique élargi — il est déjà capable de l'exploiter.
4. Alors seulement, envisager le xG si le besoin de précision se fait encore sentir.

---

## 9. Le mot de la fin

Le socle logiciel est nettement au-dessus de la moyenne des projets de ce type : ingestion
fiable, observabilité soignée, backtest sans look-ahead, résolution honnête des paris non
tranchés. La journée d'aujourd'hui a d'ailleurs éliminé un biais qui affichait **100 % de
réussite** là où le vrai chiffre est 86 % sur un échantillon minuscule.

Une fois le produit correctement compris comme un **scanner d'opportunités** (§0), le
jugement s'inverse largement en sa faveur : il n'a pas besoin de battre les bookmakers, il
a besoin d'**alerter juste et au bon moment**. C'est un objectif nettement plus atteignable,
et le backtest construit aujourd'hui le mesure déjà correctement — à condition de regarder
le hit-rate et d'ignorer le ROI.

Ce qui reste vrai malgré le recadrage : le signal est aujourd'hui **plus pauvre qu'il ne
pourrait l'être**. Le total de tirs est le plus faible des indicateurs disponibles, le score
n'est pas regardé, et le `pressureIndex` — déjà calculé, bien meilleur — dort inutilisé.
Trois chantiers modestes qui amélioreraient directement ce que l'utilisateur achète : la
justesse de l'alerte.

Et une chose à ne jamais perdre de vue : la valeur de ce produit tient à la **confiance**
qu'on peut avoir dans ses alertes. Un scanner qui se trompe souvent, ou qui affiche des
indicateurs inventés à côté de ses alertes, perd cette confiance d'un coup et ne la retrouve
pas. C'est pourquoi le nettoyage d'aujourd'hui — les 100 % fictifs, les matchs de mars
affichés « en direct », les recommandations mortes — comptait autant que n'importe quelle
fonctionnalité.

---

*Rien dans ce document ne constitue un conseil en investissement ou une incitation à parier.*
