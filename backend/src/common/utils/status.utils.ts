/**
 * Normalise le champ match_status d'apifootball.com en code api-sports standard.
 * - ""          → "NS"   (Not Started)
 * - "75" etc.   → "LIVE" (en cours, la valeur numérique = minutes écoulées)
 * - "HT","FT","AET","ET","P","1H","2H" → inchangés (déjà compatibles)
 * - "Cancelled" → "CANC", "Postponed" → "PST", etc.
 *
 * Extrait de FixturesIngestionService le 20/07/2026 : cette normalisation doit
 * rester unique (import live ET import historique) — la dupliquer a déjà
 * causé 6 bugs corrigés le 19/07.
 */
export function normalizeApifootballStatus(
  raw: string | null | undefined,
): string | null {
  if (raw === null || raw === undefined) return null;
  if (raw === '') return 'NS';
  // "75", "45+2", mais aussi "90+" / "45+" (le + peut n'être suivi d'aucun
  // chiffre) : sans le `?`, ces deux formes traversaient sans être normalisées.
  if (/^\d+(\+\d*)?$/.test(raw)) return 'LIVE';
  const MAP: Record<string, string> = {
    // Sans ces deux entrées, 'Finished'/'Half Time' traversaient tels quels
    // (MAP[raw] ?? raw) et ne correspondaient à aucun code attendu par la
    // résolution des coupons : la branche LOST devenait inatteignable.
    Finished: 'FT',
    'Half Time': 'HT',
    Cancelled: 'CANC',
    Postponed: 'PST',
    Interrupted: 'INT',
    Abandoned: 'ABD',
    Awarded: 'AWD',
    Suspended: 'SUSP',
    'Not Coverage': 'NS',
    // apifootball termine parfois les matchs aux tirs au but avec 'Pen.'
    'Pen.': 'PEN',
  };
  return MAP[raw] ?? raw;
}
