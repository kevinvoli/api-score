/**
 * Échantillon réel de la réponse apifootball `get_events` pour le match
 * 690949 du 2026-03-06 (Nations FC 3-0 Bechem United, Ghana Premier League).
 * Compositions/remplacements tronqués (non utilisés par l'import historique) ;
 * `goalscorer`, `statistics` et `statistics_1half` sont intacts.
 */
export const APIFOOTBALL_HISTORY_MATCH_SAMPLE: Record<string, unknown> = {
  match_id: '690949',
  country_id: '50',
  country_name: 'Ghana',
  league_id: '177',
  league_name: 'Premier League',
  match_date: '2026-03-06',
  match_status: 'Finished',
  match_time: '16:00',
  match_hometeam_id: '32645',
  match_hometeam_name: 'Nations FC',
  match_hometeam_score: '3',
  match_awayteam_name: 'Bechem United',
  match_awayteam_id: '4288',
  match_awayteam_score: '0',
  match_hometeam_halftime_score: '2',
  match_awayteam_halftime_score: '0',
  match_live: '0',
  team_home_badge: 'https://apiv3.apifootball.com/badges/32645_nations.jpg',
  team_away_badge:
    'https://apiv3.apifootball.com/badges/4288_bechem-united.jpg',
  league_year: '2025/2026',
  goalscorer: [
    {
      time: '10',
      home_scorer: 'E. Annor',
      home_scorer_id: '1677222351',
      home_assist: '',
      home_assist_id: '',
      score: '[1 - 0]',
      away_scorer: '',
      away_scorer_id: '',
      away_assist: '',
      away_assist_id: '',
      info: '',
      score_info_time: '1st Half',
    },
    {
      time: '45',
      home_scorer: 'A. Sarpong',
      home_scorer_id: '3823763764',
      home_assist: '',
      home_assist_id: '',
      score: '[2 - 0]',
      away_scorer: '',
      away_scorer_id: '',
      away_assist: '',
      away_assist_id: '',
      info: '',
      score_info_time: '1st Half',
    },
    {
      time: '90',
      home_scorer: 'R. Danso',
      home_scorer_id: '4252716097',
      home_assist: '',
      home_assist_id: '',
      score: '[3 - 0]',
      away_scorer: '',
      away_scorer_id: '',
      away_assist: '',
      away_assist_id: '',
      info: '',
      score_info_time: '2nd Half',
    },
  ],
  cards: [],
  statistics: [
    { type: 'Corners', home: '3', away: '8' },
    { type: 'Throw In', home: '0', away: '0' },
    { type: 'Free Kick', home: '0', away: '0' },
    { type: 'Goal Kick', home: '0', away: '0' },
    { type: 'Penalty', home: '0', away: '0' },
    { type: 'Substitution', home: '4', away: '4' },
    { type: 'Attacks', home: '64', away: '76' },
    { type: 'Dangerous Attacks', home: '33', away: '28' },
    { type: 'On Target', home: '5', away: '5' },
    { type: 'Off Target', home: '7', away: '11' },
    { type: 'Ball Possession', home: '43%', away: '57%' },
  ],
  statistics_1half: [
    { type: 'Corners', home: '3', away: '3' },
    { type: 'Throw In', home: '0', away: '0' },
    { type: 'Free Kick', home: '0', away: '0' },
    { type: 'Goal Kick', home: '0', away: '0' },
    { type: 'Penalty', home: '0', away: '0' },
    { type: 'Substitution', home: '0', away: '0' },
    { type: 'Attacks', home: '33', away: '36' },
    { type: 'Dangerous Attacks', home: '20', away: '7' },
    { type: 'On Target', home: '4', away: '1' },
    { type: 'Off Target', home: '5', away: '2' },
    { type: 'Ball Possession', home: '52%', away: '48%' },
  ],
};

/**
 * Même match, mais sans aucune statistique disponible (petit championnat,
 * saisie manquante) — cas réel à ne pas faire planter l'import.
 */
export const APIFOOTBALL_HISTORY_MATCH_SAMPLE_NO_STATS: Record<
  string,
  unknown
> = {
  ...APIFOOTBALL_HISTORY_MATCH_SAMPLE,
  match_id: '690950',
  statistics: [],
  statistics_1half: [],
  goalscorer: [],
};
