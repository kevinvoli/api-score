# API-Football v3 — Référence complète des endpoints

**Base URL** : `https://apiv3.apifootball.com/`
**Méthode** : toutes les requêtes sont des `GET`
**Auth** : paramètre `APIkey` obligatoire sur chaque requête
**APIkey** : `8c8b925e295afc994553d42a5e442ecfd190b326648a54285851d8c85c2045f7`
**Timezone par défaut** : `Europe/Berlin` (surcharger avec `&timezone=Europe/Paris`)

---

## 1. Pays — `get_countries`

Retourne la liste des pays disponibles dans ton abonnement.

```
GET https://apiv3.apifootball.com/?action=get_countries&APIkey={KEY}
```

| Paramètre | Requis | Description |
|-----------|--------|-------------|
| `action`  | ✓ | `get_countries` |
| `APIkey`  | ✓ | Clé API |

---

## 2. Ligues / Championnats — `get_leagues`

```
# Toutes les ligues
GET https://apiv3.apifootball.com/?action=get_leagues&APIkey={KEY}

# Ligues d'un pays
GET https://apiv3.apifootball.com/?action=get_leagues&country_id=6&APIkey={KEY}
```

| Paramètre    | Requis | Description |
|--------------|--------|-------------|
| `action`     | ✓ | `get_leagues` |
| `APIkey`     | ✓ | Clé API |
| `country_id` | — | Filtrer par pays (ex: `6` = France) |

---

## 3. Matchs / Événements — `get_events`

Endpoint central. Retourne matchs passés, en cours et à venir avec scores, buts, cartons, remplacements.

```
# Matchs live aujourd'hui
GET https://apiv3.apifootball.com/?action=get_events&from=2026-03-06&to=2026-03-06&match_live=1&timezone=Europe/Paris&APIkey={KEY}

# Matchs d'une période
GET https://apiv3.apifootball.com/?action=get_events&from=2026-03-01&to=2026-03-31&timezone=Europe/Paris&APIkey={KEY}

# Matchs d'une ligue sur une période
GET https://apiv3.apifootball.com/?action=get_events&from=2026-03-01&to=2026-03-31&league_id=152&APIkey={KEY}

# Match par ID
GET https://apiv3.apifootball.com/?action=get_events&match_id=1234567&APIkey={KEY}

# Matchs d'une équipe sur une période
GET https://apiv3.apifootball.com/?action=get_events&from=2026-01-01&to=2026-06-30&team_id=85&APIkey={KEY}

# Avec statistiques joueurs incluses
GET https://apiv3.apifootball.com/?action=get_events&from=2026-03-06&to=2026-03-06&withPlayerStats=1&APIkey={KEY}
```

| Paramètre         | Requis | Description |
|-------------------|--------|-------------|
| `action`          | ✓ | `get_events` |
| `APIkey`          | ✓ | Clé API |
| `from`            | ✓* | Date début `YYYY-MM-DD` (*sauf si `match_id`) |
| `to`              | ✓* | Date fin `YYYY-MM-DD` |
| `timezone`        | — | Fuseau horaire, ex: `Europe/Paris` |
| `country_id`      | — | Filtrer par pays |
| `league_id`       | — | Filtrer par ligue |
| `match_id`        | — | Match spécifique (remplace `from`/`to`) |
| `team_id`         | — | Matchs d'une équipe |
| `match_live`      | — | `1` = uniquement les matchs en cours |
| `withPlayerStats` | — | `1` = inclure stats individuelles joueurs |

**Valeurs `match_status`** :
```
''           → Pas encore commencé (NS)
'1H'         → Première mi-temps
'HT'         → Mi-temps
'2H'         → Deuxième mi-temps
'ET'         → Prolongations
'P'          → Tirs au but
'FT'         → Terminé
'AET'        → Terminé après prolongations
'Pen.'       → Terminé aux tirs au but
'Postponed'  → Reporté
'Cancelled'  → Annulé
'Awarded'    → Match attribué
'INT'        → Interrompu
```

---

## 4. Statistiques d'un match — `get_statistics`

```
GET https://apiv3.apifootball.com/?action=get_statistics&match_id=1234567&APIkey={KEY}
```

| Paramètre  | Requis | Description |
|------------|--------|-------------|
| `action`   | ✓ | `get_statistics` |
| `APIkey`   | ✓ | Clé API |
| `match_id` | ✓ | ID du match |

Retourne : tirs, tirs cadrés, possession, corners, fautes, hors-jeux, cartons, arrêts, stats individuelles joueurs.

---

## 5. Compositions — `get_lineups`

```
GET https://apiv3.apifootball.com/?action=get_lineups&match_id=1234567&APIkey={KEY}
```

| Paramètre  | Requis | Description |
|------------|--------|-------------|
| `action`   | ✓ | `get_lineups` |
| `APIkey`   | ✓ | Clé API |
| `match_id` | ✓ | ID du match |

Retourne : XI de départ + remplaçants, numéros, positions, schéma tactique.

---

## 6. Classements — `get_standings`

```
GET https://apiv3.apifootball.com/?action=get_standings&league_id=152&APIkey={KEY}
```

| Paramètre  | Requis | Description |
|------------|--------|-------------|
| `action`   | ✓ | `get_standings` |
| `APIkey`   | ✓ | Clé API |
| `league_id`| ✓ | ID de la ligue |

---

## 7. Équipes — `get_teams`

```
# Équipes d'une ligue
GET https://apiv3.apifootball.com/?action=get_teams&league_id=152&APIkey={KEY}

# Équipe par ID
GET https://apiv3.apifootball.com/?action=get_teams&team_id=85&APIkey={KEY}
```

| Paramètre  | Requis | Description |
|------------|--------|-------------|
| `action`   | ✓ | `get_teams` |
| `APIkey`   | ✓ | Clé API |
| `league_id`| ✓* | (*ou `team_id`) |
| `team_id`  | ✓* | (*ou `league_id`) |

---

## 8. Joueurs — `get_players`

```
# Joueur par ID
GET https://apiv3.apifootball.com/?action=get_players&player_id=12345&APIkey={KEY}

# Joueur par nom
GET https://apiv3.apifootball.com/?action=get_players&player_name=Mbappe&APIkey={KEY}
```

| Paramètre     | Requis | Description |
|---------------|--------|-------------|
| `action`      | ✓ | `get_players` |
| `APIkey`      | ✓ | Clé API |
| `player_id`   | ✓* | (*ou `player_name`) |
| `player_name` | ✓* | (*ou `player_id`) |

---

## 9. Cotes — `get_odds`

```
# Cotes sur une période
GET https://apiv3.apifootball.com/?action=get_odds&from=2026-03-06&to=2026-03-07&APIkey={KEY}

# Cotes d'un match
GET https://apiv3.apifootball.com/?action=get_odds&match_id=1234567&APIkey={KEY}
```

| Paramètre  | Requis | Description |
|------------|--------|-------------|
| `action`   | ✓ | `get_odds` |
| `APIkey`   | ✓ | Clé API |
| `from`     | ✓ | Date début |
| `to`       | ✓ | Date fin |
| `match_id` | — | Match spécifique |

Marchés disponibles : **1X2**, **BTS** (les deux équipes marquent), **O/U** (over/under), **AH** (asian handicap).

---

## 10. Cotes live + commentaires — `get_live_odds_comments`

```
# Tous les matchs live
GET https://apiv3.apifootball.com/?action=get_live_odds_commnets&APIkey={KEY}

# Filtré par ligue
GET https://apiv3.apifootball.com/?action=get_live_odds_commnets&league_id=152&APIkey={KEY}

# Match spécifique
GET https://apiv3.apifootball.com/?action=get_live_odds_commnets&match_id=1234567&APIkey={KEY}
```

> ⚠️ Faute de frappe officielle dans l'API : `commnets` (double `m`, pas `comments`)

| Paramètre    | Requis | Description |
|--------------|--------|-------------|
| `action`     | ✓ | `get_live_odds_commnets` |
| `APIkey`     | ✓ | Clé API |
| `country_id` | — | Filtrer par pays |
| `league_id`  | — | Filtrer par ligue |
| `match_id`   | — | Match spécifique |

---

## 11. Head-to-Head — `get_H2H`

```
# Par noms d'équipes
GET https://apiv3.apifootball.com/?action=get_H2H&firstTeam=PSG&secondTeam=Marseille&timezone=Europe/Paris&APIkey={KEY}

# Par IDs d'équipes (plus précis)
GET https://apiv3.apifootball.com/?action=get_H2H&firstTeamId=85&secondTeamId=91&APIkey={KEY}
```

| Paramètre      | Requis | Description |
|----------------|--------|-------------|
| `action`       | ✓ | `get_H2H` |
| `APIkey`       | ✓ | Clé API |
| `firstTeam`    | ✓* | Nom équipe 1 (*ou `firstTeamId`) |
| `secondTeam`   | ✓* | Nom équipe 2 (*ou `secondTeamId`) |
| `firstTeamId`  | ✓* | ID équipe 1 |
| `secondTeamId` | ✓* | ID équipe 2 |
| `timezone`     | — | Fuseau horaire |

Retourne : confrontations directes + forme récente des deux équipes.

---

## 12. Prédictions — `get_predictions`

```
# Prédictions du jour
GET https://apiv3.apifootball.com/?action=get_predictions&from=2026-03-06&to=2026-03-06&APIkey={KEY}

# Prédictions d'une ligue
GET https://apiv3.apifootball.com/?action=get_predictions&from=2026-03-06&to=2026-03-13&league_id=152&APIkey={KEY}

# Prédiction d'un match
GET https://apiv3.apifootball.com/?action=get_predictions&match_id=1234567&APIkey={KEY}
```

| Paramètre    | Requis | Description |
|--------------|--------|-------------|
| `action`     | ✓ | `get_predictions` |
| `APIkey`     | ✓ | Clé API |
| `from`       | ✓ | Date début |
| `to`         | ✓ | Date fin |
| `country_id` | — | Filtrer par pays |
| `league_id`  | — | Filtrer par ligue |
| `match_id`   | — | Match spécifique |

**Champs de probabilités retournés** :

| Champ         | Description |
|---------------|-------------|
| `prob_HW`     | % victoire domicile |
| `prob_D`      | % match nul |
| `prob_AW`     | % victoire extérieur |
| `prob_O`      | % over (plus de buts) |
| `prob_U`      | % under (moins de buts) |
| `prob_bts`    | % les deux équipes marquent |
| `prob_ots`    | % une seule équipe marque |
| `prob_AHhome` | Asian Handicap domicile |
| `prob_AHaway` | Asian Handicap extérieur |

---

## 13. Meilleurs buteurs — `get_topscorers`

```
GET https://apiv3.apifootball.com/?action=get_topscorers&league_id=152&APIkey={KEY}
```

| Paramètre   | Requis | Description |
|-------------|--------|-------------|
| `action`    | ✓ | `get_topscorers` |
| `APIkey`    | ✓ | Clé API |
| `league_id` | ✓ | ID de la ligue |

---

## 14. Vidéos / Highlights — `get_videos`

```
# Toutes les vidéos disponibles
GET https://apiv3.apifootball.com/?action=get_videos&APIkey={KEY}

# Vidéos d'un match
GET https://apiv3.apifootball.com/?action=get_videos&match_id=1234567&APIkey={KEY}
```

| Paramètre  | Requis | Description |
|------------|--------|-------------|
| `action`   | ✓ | `get_videos` |
| `APIkey`   | ✓ | Clé API |
| `match_id` | — | Match spécifique |

---

## 15. Livescore WebSocket (temps réel)

Connexion WebSocket pour recevoir les mises à jour en push (buts, cartons, stats) sans polling.

```
wss://wss.apifootball.com/livescore?APIkey={KEY}&timezone=Europe/Paris

# Filtrer par ligue
wss://wss.apifootball.com/livescore?APIkey={KEY}&league_id=152&timezone=Europe/Paris

# Filtrer par match
wss://wss.apifootball.com/livescore?APIkey={KEY}&match_id=1234567
```

| Paramètre    | Requis | Description |
|--------------|--------|-------------|
| `APIkey`     | ✓ | Clé API |
| `timezone`   | — | Format TZ (ex: `Europe/Paris`, `+02:00`) |
| `country_id` | — | Filtrer par pays |
| `league_id`  | — | Filtrer par ligue |
| `match_id`   | — | Match spécifique |

Push notifications sur : changements de score, buts, cartons, remplacements, statistiques.

---

## IDs utiles

| ID | Description |
|----|-------------|
| `152` | Ligue 1 (France) |
| `149` | Premier League (Angleterre) |
| `168` | La Liga (Espagne) |
| `207` | Serie A (Italie) |
| `175` | Bundesliga (Allemagne) |
| `244` | Champions League |
| `6`   | France (country_id) |

---

## Notes importantes

- `from` et `to` sont **obligatoires** sauf pour les endpoints `match_id`
- Format des dates : `YYYY-MM-DD`
- Pour les matchs live : utiliser `&from=TODAY&to=TODAY&match_live=1`
- `get_live_odds_commnets` — faute de frappe officielle dans l'API (**à conserver**)
- La date de la dernière mise à jour de cette doc officielle : **2023-07-22** (API v3.0.2)
