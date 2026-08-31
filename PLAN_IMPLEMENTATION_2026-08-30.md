# Plan d'implémentation — Finalisation API SCORE

*Rédigé le 30 août 2026, à partir du Rapport d'analyse du 30/08/2026 (Rapport_API_SCORE_2026-08-30.docx)
et de la documentation existante du projet (PLAN_IMPLEMENTATION.md, AVIS_PRONOSTIQUEUR.md, AUDIT.md).*

Ce document a deux parties, à ne pas confondre :

1. **Un plan technique** (sections 1 à 6) : ce qu'il reste à coder pour boucler les objectifs déjà
   fixés par le projet lui-même (lots 4 à 7 du plan du 20/07, plus l'hygiène de dépôt relevée dans
   le rapport du 30/08).
2. **Un avis de pronostiqueur professionnel** (section 7) : ce que je mettrais en place, avec
   plusieurs années de métier, si ce produit était le mien — au-delà de ce qui est déjà écrit
   dans le dépôt. C'est un avis, pas une vérité d'ingénierie ; il est signalé comme tel partout où
   il engage un jugement plutôt qu'un fait constaté dans le code.

Rien dans ce document n'est un conseil financier ni une incitation à parier de l'argent réel.

---

## 0. Rappel express de l'état actuel

| Lot | Objectif | Statut au 30/08 |
|---|---|---|
| 0 | Rétention des données | Fait |
| 1 | Import de l'historique | Fait |
| 2 | Taux de base réels | Fait |
| 3 | Qualité du signal (pressureIndex, score au match) | Fait |
| 4 | Interface honnête + bouton backtest | À faire |
| 5 | Rappel (recall) en plus du hit-rate | À faire |
| 6 | Classement pré-match | À faire |
| 7 | Filtrage des championnats | Partiel (entité posée, pas branchée) |

Risque non fonctionnel signalé dans le rapport : le travail des lots 0 à 3 vit uniquement sur la
branche `feat/odds-module`, non fusionnée sur `master`. **Ce point est traité en priorité 0
ci-dessous, avant tout nouveau code.**

---

## 1. Priorité 0 — Hygiène de dépôt (avant d'écrire une ligne de fonctionnalité)

Objectif : ne plus risquer de perdre le travail déjà fait, et repartir d'un dépôt lisible.

| # | Tâche | Détail | Effort |
|---|---|---|---|
| 0.1 | Fusionner `feat/odds-module` vers `master` | Ouvrir la PR, la faire relire, merger. C'est le point le plus urgent du rapport : 20 commits n'existent nulle part ailleurs. | 0,5 j |
| 0.2 | Pousser les 3 commits locaux manquants | `git push` vers `origin/feat/odds-module` avant la fusion, pour ne pas dépendre d'une seule machine. | 0,1 j |
| 0.3 | Statuer sur `refactor/clean-architecture` | Branche morte depuis le 23/08/2025. Soit on en récupère ce qui est utile et on la supprime, soit on la supprime directement. Une branche fantôme dans `git branch -a` finit toujours par être ouverte par erreur un jour. | 0,25 j |
| 0.4 | Ajouter un `.gitattributes` (`* text=auto eol=lf`) | Élimine le diff fantôme de ~13 000 lignes constaté dans le rapport (bruit CRLF/LF), qui rend tout futur `git diff` illisible. | 0,25 j |
| 0.5 | `npm audit` (backend et front) dès qu'un réseau est disponible | Le projet documente 28 vulnérabilités Dependabot dont 13 critiques (20/07), jamais revérifiées depuis. Bloquant avant toute mise en ligne. | 0,5 j |
| 0.6 | Réécrire `backend/README.md` | Le README est encore le boilerplate Nest par défaut (mentionne PostgreSQL). Un onboarding ou un audit externe s'y trompe en 30 secondes. | 0,5 j |
| 0.7 | Rafraîchir ou remplacer `AUDIT.md` | Il date du 10/06 et ne reflète plus trois lots de travail. Soit une repasse complète, soit un renvoi explicite vers ce plan et le rapport du 30/08. | 0,5 j |

**Critère de sortie :** `master` contient tout le travail vivant, `git diff` ne montre plus que de
vrais changements, et les vulnérabilités connues sont soit corrigées, soit consciemment acceptées
et documentées.

**Total priorité 0 : ~2,5 jours.**

---

## 2. Lot A (ex-Lot 4) — Interface honnête et backtest en un clic

C'est le lot que la documentation interne du projet identifie elle-même comme le plus rentable :
impact perçu maximal pour l'effort le plus faible.

| # | Tâche | Fichier | Effort |
|---|---|---|---|
| A.1 | Retirer le champ « Edge % » de Paramètres | `front/app/parametres/page.tsx` | 0,25 j |
| A.2 | Retirer ou renommer « Confiance » | idem — le remplacer par le taux de base réel (Lot 2, déjà exposé côté backend via `GET /v1/analytics/base-rates`) | 0,5 j |
| A.3 | Afficher la taille d'échantillon à côté de chaque taux affiché | idem — jamais de pourcentage sans son « sur combien de matchs » | 0,5 j |
| A.4 | Renommer « Cote actuelle » en « Cote de référence (indicative) » | idem | 0,25 j |
| A.5 | Bouton **« Tester cette configuration en backtest »** | Appelle `POST /v1/audit/backtest` (existant) avec la config en cours d'édition, affiche hit-rate + rappel + volume d'alertes en moins de 30 s, sans quitter la page | 1,5 j |
| A.6 | Garde-fous de cohérence sur les règles | `smart-rules.controller.ts` — seuils décroissants, fenêtres qui se chevauchent (la base contient déjà une règle doublonnée `maxElapsed: 45` documentée comme morte) | 0,5 j |
| A.7 | Specs front + back sur les points ci-dessus | — | 1 j |

**Critère de sortie :** on modifie un seuil dans Paramètres et on voit son effet chiffré sur
l'historique sans quitter la page ; aucun chiffre affiché n'est un texte statique non calculé.

**Total Lot A : ~4,5 jours.**

---

## 3. Lot B (ex-Lot 5) — Mesurer le rappel, pas seulement la précision

| # | Tâche | Fichier | Effort |
|---|---|---|---|
| B.1 | Calcul du rappel : événements réalisés détectés / événements réalisés totaux, par marché | `backend/src/backtest/kpis-calculator.ts` | 1 j |
| B.2 | Ajouter `recallPct`, `alertsPerMatch`, `missedEvents` aux `BacktestKpis` | `backtest/backtest.types.ts` (JSON, pas de migration nécessaire) | 0,5 j |
| B.3 | Courbe précision/rappel selon le seuil | Page front Audit | 1,5 j |
| B.4 | Specs | `kpis-calculator.spec.ts` | 0,5 j |

**Critère de sortie :** la page Audit répond à « si je durcis ce seuil, combien d'occasions je
rate en échange de combien de fausses alertes en moins ? »

**Total Lot B : ~3,5 jours.**

---

## 4. Lot C (ex-Lot 7) — Brancher le filtrage des championnats

L'entité `league_watchlist` existe déjà (posée au Lot 1) : il ne reste que le câblage, pas la
conception.

| # | Tâche | Fichier | Effort |
|---|---|---|---|
| C.1 | Interface de sélection des championnats suivis | Front Paramètres | 1 j |
| C.2 | Appliquer le filtre à l'ingestion live | `fixtures-sync.scheduler.ts` | 0,5 j |
| C.3 | Appliquer le filtre aux suggestions/alertes | `smart-suggestions.service.ts` | 0,5 j |
| C.4 | Indicateur de qualité de données par championnat (taux de champs manquants, retards de sync) | `analytics/league-quality.service.ts` (à créer) | 1,5 j |
| C.5 | Suggestion automatique de désactivation sous un seuil de fiabilité | idem | 0,5 j |

**Critère de sortie :** le volume d'alertes baisse et le hit-rate monte, mesurés avant/après sur le
même historique.

**Total Lot C : ~4 jours.**

---

## 5. Lot D (ex-Lot 6) — Classement pré-match

Le plus gros chantier restant, mais désormais débloqué puisqu'il dépend des taux de base (Lot 2,
livré).

| # | Tâche | Fichier | Effort |
|---|---|---|---|
| D.1 | Entité `team_profiles` (buts marqués/encaissés par période, écart domicile/extérieur, tendance à marquer tard, sur N derniers matchs) | `database/entities/team-profile.entity.ts` | 0,5 j |
| D.2 | Job de calcul quotidien depuis l'historique | `analytics/team-profiles.service.ts` | 1,5 j |
| D.3 | Score de potentiel de buts par match du jour | `analytics/match-ranking.service.ts` | 1,5 j |
| D.4 | `GET /v1/analytics/daily-ranking` | Contrôleur | 0,5 j |
| D.5 | Page front « Les matchs à surveiller aujourd'hui » | `front/app/(nouvelle page)` | 2 j |
| D.6 | Specs | — | 1 j |

**Critère de sortie :** chaque matin, une liste ordonnée des matchs du jour avec un potentiel
chiffré et sa raison (« les deux équipes encaissent en 2e MT », « championnat à 3,4 buts/match »).

**Total Lot D : ~7 jours.**

---

## 6. Séquencement

```
Priorité 0 (hygiène dépôt)  ──►  bloquant, à faire en premier, sans exception

Lot A (interface honnête)   ──►  peut démarrer immédiatement après la priorité 0
Lot C (filtrage championnats) ──► en parallèle du Lot A (équipes/fichiers différents)
Lot B (rappel)               ──►  en parallèle du Lot A (moteur de backtest différent du front)
Lot D (classement pré-match) ──►  après le Lot C, pour ne pas calculer un classement sur des
                                    championnats qu'on s'apprête à exclure
```

| Bloc | Effort | Cumulé |
|---|---|---|
| Priorité 0 — hygiène | 2,5 j | 2,5 j |
| Lot A — interface honnête | 4,5 j | 7 j |
| Lot B — rappel | 3,5 j | 10,5 j |
| Lot C — filtrage championnats | 4 j | 14,5 j |
| Lot D — classement pré-match | 7 j | 21,5 j |

**Total : ~21,5 jours-homme** pour boucler l'intégralité du plan déjà fixé par le projet — contre
36 jours estimés le 20/07, l'écart s'expliquant par les lots 0 à 3 déjà livrés depuis.

---

## 7. Ce que je mettrais en place si j'étais le pronostiqueur derrière ce produit

*Cette section est un avis, pas un audit de code. Elle part du principe — déjà acté par le projet
le 20/07 — qu'API SCORE est un outil d'aide à la décision pour un parieur qui reste seul décideur,
pas un système autonome qui parie. Avec plusieurs années de métier, voici ce que j'ajouterais au
plan ci-dessus, dans l'ordre où je le ferais.*

### 7.1 Avant tout : un journal de paris, pas seulement un journal d'alertes

Le backtest mesure ce que le système *aurait* fait sur l'historique. Il ne mesure pas ce que
*toi* tu as réellement fait avec les alertes : à quelle minute tu as vu l'alerte, si tu as pu
parier avant que la cote ne bouge, si tu as ignoré l'alerte et pourquoi. Sans ce journal-là, on
optimise un système sur des critères qui ne correspondent pas à l'usage réel.

**Ce que je ferais :** une table `bet_journal` séparée de `bet_results`, simple, remplie
manuellement ou semi-automatiquement (un clic « j'ai suivi cette alerte » / « j'ai passé »), avec
la minute d'action et un commentaire libre. Objectif : mesurer un jour l'écart entre la
performance théorique du backtest et la performance réellement exploitable. C'est souvent là que
les systèmes de trading sportif s'effondrent — pas dans le modèle, dans l'exécution.

### 7.2 Le rappel (Lot B) ne suffit pas : il faut aussi une fenêtre de latence

Une alerte parfaite mais qui arrive trop tard pour agir ne vaut rien. Je mesurerais, en plus du
hit-rate et du rappel, le **temps restant entre l'alerte et l'issue du marché qu'elle vise** (par
exemple : combien de minutes reste-t-il avant la fin de la période visée quand l'alerte part ?).
Une règle qui déclenche à la 44e minute pour un marché « but en 1re mi-temps » n'est pas
exploitable de la même façon qu'une règle qui déclenche à la 20e.

### 7.3 Ne jamais faire confiance à un hit-rate sans intervalle de confiance

77,2 % de hit-rate sur 109 paris et 77,2 % sur 1 000 paris ne veulent pas dire la même chose. Je
ferais afficher systématiquement un intervalle de confiance (par exemple, intervalle de Wilson à
95 %) à côté de chaque hit-rate dans l'interface Audit, pas seulement la taille d'échantillon déjà
prévue au Lot 2. Un chiffre sans marge d'erreur incite à sur-régler des seuils sur du bruit — la
documentation du projet appelle déjà ça de la « superstition » à moins de 500-1 000 paris résolus,
et je serais encore plus strict : j'afficherais le chiffre en grisé tant que l'échantillon est
sous ce seuil, plutôt que de le montrer avec la même certitude visuelle qu'un chiffre solide.

### 7.4 Valider hors échantillon, systématiquement, sans exception

Toute règle réglée sur une fenêtre d'historique doit être vérifiée sur une fenêtre différente,
jamais vue pendant le réglage (walk-forward, pas un simple split aléatoire — l'ordre chronologique
compte en sport, les compositions et la forme des équipes changent dans le temps). Je bloquerais
politiquement toute promotion d'une règle en production tant qu'elle n'a pas survécu à une période
de test qu'on n'a pas utilisée pour la régler. C'est la garde-fou le plus important contre le
sur-ajustement, et c'est peu coûteux à mettre en place une fois le Lot B livré.

### 7.5 Réintroduire les cotes réelles, mais uniquement en mesure, pas en fonctionnement

Le projet a raison de garder `ODDS_SYNC_ENABLED=false` pour ne pas complexifier un scanner qui
n'en a pas besoin pour fonctionner. Je ferais toutefois une exception ciblée : activer la capture
des cotes de clôture (closing odds) uniquement en tâche de fond, sans rien changer aux règles de
décision, pour calculer a posteriori la **Closing Line Value** de chaque alerte (est-ce que le
marché a bougé dans le sens de l'alerte entre le moment où elle est partie et la clôture ?). C'est,
dans le métier, l'indicateur le plus fiable de la qualité réelle d'un signal — bien plus que le
ROI ou même le hit-rate seul, parce qu'il ne dépend pas de la chance sur un petit échantillon de
résultats. Le module Odds existe déjà et est fonctionnel : le coût marginal de cette mesure est
faible comparé à sa valeur diagnostique.

### 7.6 Moins de championnats, mais mieux : je durcirais le seuil du Lot C

Le rapport et la documentation interne s'accordent déjà : 10 à 15 championnats fiables valent
mieux que 100 approximatifs. Avec l'expérience du terrain, j'irais plus loin que « désactiver sous
un seuil de fiabilité » (C.5) : je partirais d'une liste blanche assumée (grands championnats
européens + deuxièmes divisions bien couvertes) plutôt que d'une liste noire qui course après les
mauvaises surprises une par une. On active un nouveau championnat seulement après avoir vérifié
sa qualité de données sur un historique test, jamais en direct par défaut.

### 7.7 Se méfier du volume d'alertes comme d'un KPI de vanité

Un scanner qui alerte beaucoup donne l'impression d'être utile ; un scanner qui alerte juste est
utile. Je mettrais un plafond raisonnable d'alertes par jour et par utilisateur (configurable), et
je trierais les alertes envoyées par qualité estimée plutôt que de toutes les pousser — la
« fatigue d'alerte » est la façon la plus courante dont un outil de ce type finit ignoré au bout de
quelques semaines, bien avant qu'on ait pu juger s'il est rentable.

### 7.8 Segmenter la performance, ne jamais la regarder en agrégé

Un hit-rate global de 77 % peut cacher un marché à 95 % et un autre à 55 %. Le rapport l'a déjà
relevé sur les trois marchés existants. Je pousserais cette logique plus loin dans la page Audit :
segmenter systématiquement par championnat, par marché ET par tranche horaire du match, et retirer
sans état d'âme les segments qui ne tiennent pas la route sur suffisamment de données — plutôt que
de garder une règle globale qui moyenne un bon et un mauvais segment.

### 7.9 Un langage produit qui n'encourage jamais la précipitation

Ce n'est pas un point technique, mais je le mettrais quand même dans les critères d'acceptation du
Lot A : aucune formulation du type « opportunité à ne pas manquer » ou compte à rebours anxiogène
dans les notifications. Le produit vend de la lucidité factuelle (hit-rate, rappel, échantillon) ;
tout ce qui pousse à agir vite sans réfléchir va à l'encontre de sa proposition de valeur et, plus
largement, d'un usage responsable d'un outil lié au pari sportif.

### Ce que je ne changerais pas

Le recadrage du 20 juillet (scanner honnête plutôt que fausse promesse de value betting), le
séquencement mesure-avant-complexité, et le refus explicite du ML tant que les taux de base et
l'échantillon ne sont pas suffisants : c'est, avec l'expérience, exactement la bonne discipline.
Beaucoup de projets similaires font l'inverse — un modèle impressionnant sur un historique
insuffisant — et le paient cash en conditions réelles.

---

## 8. Définition du « projet finalisé »

En reprenant les deux plans (technique et personnel ci-dessus), je considérerais les objectifs du
projet atteints quand :

- `master` contient tout le travail actuel, sans branche de travail isolée contenant des
  fonctionnalités livrées mais invisibles ailleurs.
- L'interface n'affiche plus aucun chiffre non calculé (Lot A).
- Le hit-rate ET le rappel sont mesurés et segmentés, avec intervalle de confiance et taille
  d'échantillon visibles (Lot B + 7.3 + 7.8).
- Le filtrage des championnats est actif en production, pas seulement modélisé en base (Lot C).
- Le classement pré-match est disponible (Lot D), complétant la couverture live.
- Un mécanisme de validation hors échantillon existe et est utilisé avant toute promotion de règle
  (7.4).
- Les vulnérabilités de dépendances connues sont traitées ou explicitement acceptées (0.5).

À ce stade, le produit tient la promesse qu'il s'est lui-même fixée le 20 juillet 2026 : un
détecteur d'opportunités honnête, mesuré sur des faits plutôt que sur une intuition ou une
promesse de rendement qu'il n'a jamais eu les moyens de tenir.

---

*Ce document décrit une direction technique et produit. Il ne constitue pas un conseil financier
ni une incitation à parier de l'argent réel.*
