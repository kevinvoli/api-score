/**
 * Échantillon réel réduit (3 bookmakers) de la réponse apifootball `get_odds`
 * pour le match 690949 du 2026-03-06. Champs tronqués aux marchés couverts par
 * les tests ; les champs absents chez le bookmaker valent "" dans la vraie API.
 */
export const APIFOOTBALL_ODDS_SAMPLE: Record<string, string>[] = [
  {
    match_id: '690949',
    odd_bookmakers: '10Bet',
    odd_date: '2026-03-06 21:23:44',
    odd_1: '1.48',
    odd_x: '3.2',
    odd_2: '8.2',
    odd_1x: '1.01',
    odd_12: '1.25',
    odd_x2: '2.5',
    'ah-1_1': '1.91',
    'ah-1_2': '1.8',
    'ah+0.5_1': '', // absent chez ce bookmaker
    'ah+0.5_2': '', // n'existe jamais dans la vraie API
    'o+1.5': '1.55',
    'u+1.5': '2.15',
    bts_yes: '',
    bts_no: '',
  },
  {
    match_id: '690949',
    odd_bookmakers: 'WilliamHill',
    odd_date: '2026-03-06 21:23:44',
    odd_1: '1.44',
    odd_x: '3.1',
    odd_2: '8',
    odd_1x: '1.07',
    odd_12: '1.3',
    odd_x2: '2.4',
    'ah+0.5_1': '2.05', // valeur réelle possible sans pendant _2
    bts_yes: '2.62',
    bts_no: '1.4',
  },
  {
    match_id: '690949',
    odd_bookmakers: 'Marathon',
    odd_date: '2026-03-06 21:23:44',
    odd_1: '1.45',
    odd_x: '3.42',
    odd_2: '7.7',
    odd_1x: '1.02',
    odd_12: '1.22',
    odd_x2: '2.38',
    'ah-2.5_1': '5.55',
    'ah-2.5_2': '1.08',
    'o+2.5': '2.7',
    'u+2.5': '1.36',
    bts_yes: '2.88',
    bts_no: '1.33',
  },
];
