export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface AllowlistEntry {
  method: HttpMethod;
  pattern: RegExp;
}

/** Segment borné : un identifiant (uuid ou alphanumérique), jamais un suffixe arbitraire. */
const ID_SEGMENT = '[A-Za-z0-9_-]+';

/**
 * Allowlist stricte reconstruite depuis les appels réels de `lib/api/*.ts` (lot 2).
 * Toute route backend absente d'ici est refusée en 403 par le proxy, sans exception de joker.
 */
const ALLOWLIST: AllowlistEntry[] = [
  { method: 'GET', pattern: /^\/v1\/health$/ },
  { method: 'GET', pattern: /^\/v1\/metrics\/usage$/ },
  { method: 'GET', pattern: new RegExp(`^/v1/analytics/fixtures/${ID_SEGMENT}$`) },
  { method: 'GET', pattern: /^\/v1\/audit\/backtest$/ },
  { method: 'POST', pattern: /^\/v1\/audit\/backtest$/ },
  { method: 'GET', pattern: new RegExp(`^/v1/audit/backtest/${ID_SEGMENT}$`) },
  // Lot 9 — lecture seule du walk-forward ; son lancement reste serveur à serveur.
  { method: 'GET', pattern: /^\/v1\/audit\/walk-forward$/ },
  { method: 'GET', pattern: new RegExp(`^/v1/audit/walk-forward/${ID_SEGMENT}$`) },
  // Lot 9 — console d'exécution. Ni politique de risque ni preuve de gate : aucun écran ne les
  // enregistre, elles restent hors de portée du navigateur.
  { method: 'GET', pattern: /^\/v1\/execution\/control$/ },
  { method: 'PUT', pattern: /^\/v1\/execution\/control\/stop$/ },
  { method: 'PUT', pattern: /^\/v1\/execution\/control\/mode$/ },
  { method: 'GET', pattern: /^\/v1\/execution\/accounts$/ },
  { method: 'GET', pattern: /^\/v1\/execution\/orders$/ },
  { method: 'POST', pattern: /^\/v1\/execution\/reconciliations$/ },
  { method: 'GET', pattern: new RegExp(`^/v1/execution/reconciliations/${ID_SEGMENT}$`) },
  // Lot 9 — simulation : lecture et arrêt d'un run ; le démarrage reste serveur à serveur.
  { method: 'GET', pattern: /^\/v1\/simulation\/runs$/ },
  { method: 'GET', pattern: new RegExp(`^/v1/simulation/runs/${ID_SEGMENT}/summary$`) },
  { method: 'GET', pattern: new RegExp(`^/v1/simulation/runs/${ID_SEGMENT}/decisions$`) },
  { method: 'POST', pattern: new RegExp(`^/v1/simulation/runs/${ID_SEGMENT}/stop$`) },
  { method: 'GET', pattern: /^\/v1\/live\/fixtures$/ },
  { method: 'GET', pattern: new RegExp(`^/v1/live/fixtures/${ID_SEGMENT}/summary$`) },
  { method: 'GET', pattern: new RegExp(`^/v1/live/fixtures/${ID_SEGMENT}/detail$`) },
  { method: 'POST', pattern: /^\/v1\/live\/fixtures\/sync$/ },
  { method: 'GET', pattern: /^\/v1\/live\/recommendations$/ },
  { method: 'GET', pattern: /^\/v1\/live\/recommendations\/smart$/ },
  { method: 'GET', pattern: /^\/v1\/live\/recommendations\/coupons$/ },
  { method: 'GET', pattern: /^\/v1\/provider\/countries$/ },
  { method: 'GET', pattern: /^\/v1\/provider\/leagues$/ },
  { method: 'GET', pattern: /^\/v1\/provider\/teams$/ },
  { method: 'GET', pattern: /^\/v1\/provider\/matches$/ },
  { method: 'GET', pattern: /^\/v1\/provider\/standings$/ },
  { method: 'GET', pattern: /^\/v1\/settings\/smart-rules$/ },
  { method: 'PUT', pattern: /^\/v1\/settings\/smart-rules$/ },
];

export function isPathAllowed(method: string, path: string): boolean {
  return ALLOWLIST.some((entry) => entry.method === method && entry.pattern.test(path));
}
