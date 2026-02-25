import { useEffect, useRef, useState } from 'react';
import type { LiveFixture } from '../types/live';

type ScoreEntry = { home: number | null; away: number | null };

/**
 * Compares scores between each render of `fixtures`.
 * Returns a Set of providerFixtureIds whose score changed since the last render.
 * The set auto-clears after `clearAfterMs` (default 2500ms).
 */
export function useChangedScores(
  fixtures: LiveFixture[],
  clearAfterMs = 2500,
): Set<string> {
  const prevMap = useRef<Map<string, ScoreEntry>>(new Map());
  const [changedIds, setChangedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const isFirstLoad = prevMap.current.size === 0;

    const nextMap = new Map<string, ScoreEntry>();
    const changed = new Set<string>();

    for (const f of fixtures) {
      nextMap.set(f.providerFixtureId, {
        home: f.scoreHome,
        away: f.scoreAway,
      });

      if (!isFirstLoad) {
        const prev = prevMap.current.get(f.providerFixtureId);
        if (
          prev &&
          (prev.home !== f.scoreHome || prev.away !== f.scoreAway)
        ) {
          changed.add(f.providerFixtureId);
        }
      }
    }

    prevMap.current = nextMap;

    if (changed.size === 0) return;

    setChangedIds(changed);
    const timer = setTimeout(() => setChangedIds(new Set()), clearAfterMs);
    return () => clearTimeout(timer);
  }, [fixtures, clearAfterMs]);

  return changedIds;
}
