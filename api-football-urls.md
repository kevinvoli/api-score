# API-Football — URLs Postman

**Base URL** : `https://apiv3.apifootball.com/`
**Vendor** : `apifootball`
**APIkey** : `8c8b925e295afc994553d42a5e442ecfd190b326648a54285851d8c85c2045f7`
**Méthode** : toutes les requêtes sont des `GET`

---

## Matchs live (aujourd'hui)
```
GET https://apiv3.apifootball.com/?action=get_events&from=2026-02-25&to=2026-02-25&match_live=1&timezone=Europe/Paris&APIkey=8c8b925e295afc994553d42a5e442ecfd190b326648a54285851d8c85c2045f7
```

## Match par ID
```
GET https://apiv3.apifootball.com/?action=get_events&match_id=1234567&APIkey=8c8b925e295afc994553d42a5e442ecfd190b326648a54285851d8c85c2045f7
```

## Matchs d'une ligue
```
GET https://apiv3.apifootball.com/?action=get_events&league_id=152&APIkey=8c8b925e295afc994553d42a5e442ecfd190b326648a54285851d8c85c2045f7
```

## Évènements d'un match (buts, cartons, remplacements)
```
GET https://apiv3.apifootball.com/?action=get_events&match_id=1234567&APIkey=8c8b925e295afc994553d42a5e442ecfd190b326648a54285851d8c85c2045f7
```

## Statistiques d'un match (+ stats joueurs)
```
GET https://apiv3.apifootball.com/?action=get_statistics&match_id=1234567&APIkey=8c8b925e295afc994553d42a5e442ecfd190b326648a54285851d8c85c2045f7
```

## Compositions (lineups)
```
GET https://apiv3.apifootball.com/?action=get_lineups&match_id=1234567&APIkey=8c8b925e295afc994553d42a5e442ecfd190b326648a54285851d8c85c2045f7
```

## Pays
```
GET https://apiv3.apifootball.com/?action=get_countries&APIkey=8c8b925e295afc994553d42a5e442ecfd190b326648a54285851d8c85c2045f7
```

## Ligues (toutes)
```
GET https://apiv3.apifootball.com/?action=get_leagues&APIkey=8c8b925e295afc994553d42a5e442ecfd190b326648a54285851d8c85c2045f7
```

## Ligues d'un pays
```
GET https://apiv3.apifootball.com/?action=get_leagues&country_id=6&APIkey=8c8b925e295afc994553d42a5e442ecfd190b326648a54285851d8c85c2045f7
```

## Équipes d'une ligue
```
GET https://apiv3.apifootball.com/?action=get_teams&league_id=152&APIkey=8c8b925e295afc994553d42a5e442ecfd190b326648a54285851d8c85c2045f7
```

## Équipe par ID
```
GET https://apiv3.apifootball.com/?action=get_teams&team_id=85&APIkey=8c8b925e295afc994553d42a5e442ecfd190b326648a54285851d8c85c2045f7
```

---

## Notes
- Remplacer `1234567` par un vrai `match_id`
- Remplacer `152` par un vrai `league_id` (ex: 152 = Ligue 1)
- Remplacer `6` par un vrai `country_id` (ex: 6 = France)
- Remplacer `85` par un vrai `team_id`
- La date dans les matchs live doit être mise à jour au jour J (format `YYYY-MM-DD`)
