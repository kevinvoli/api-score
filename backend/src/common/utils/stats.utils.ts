export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function getStatValue(
  statsPayload: Record<string, unknown> | null,
  statNames: string[],
): number {
  if (!statsPayload) {
    return 0;
  }

  const statistics = Array.isArray(
    (statsPayload as { statistics?: unknown }).statistics,
  )
    ? ((
        statsPayload as {
          statistics: Array<{ type?: unknown; value?: unknown }>;
        }
      ).statistics as Array<{ type?: unknown; value?: unknown }>)
    : [];

  for (const stat of statistics) {
    const statType = typeof stat?.type === 'string' ? stat.type : null;
    if (
      statType &&
      statNames.some((name) => name.toLowerCase() === statType.toLowerCase())
    ) {
      return toNumber(stat.value) ?? 0;
    }
  }

  for (const statName of statNames) {
    const legacyRaw = (statsPayload as Record<string, unknown>)[statName];
    const legacyParsed = toNumber(legacyRaw);
    if (legacyParsed !== null) {
      return legacyParsed;
    }
  }

  return 0;
}

export function computePressureIndex(
  statsPayload: Record<string, unknown> | null,
): number {
  if (!statsPayload) {
    return 0;
  }

  const attacks = getStatValue(statsPayload, ['Attacks']);
  const dangerousAttacks = getStatValue(statsPayload, ['Dangerous Attacks']);
  const onTarget = getStatValue(statsPayload, ['On Target', 'Shots on Goal']);
  const offTarget = getStatValue(statsPayload, [
    'Off Target',
    'Shots off Goal',
  ]);
  const corners = getStatValue(statsPayload, ['Corner Kicks', 'Corners']);

  return (
    dangerousAttacks * 1.4 +
    onTarget * 2 +
    corners * 1.2 +
    attacks * 0.15 -
    offTarget * 0.4
  );
}
