import { useEffect, useState } from 'react';

/** Returns seconds remaining until `targetMs` (clamped to 0). Updates every 500ms. */
export function useCountdown(targetMs: number): number {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.round((targetMs - Date.now()) / 1000)),
  );

  useEffect(() => {
    const tick = () =>
      setRemaining(Math.max(0, Math.round((targetMs - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [targetMs]);

  return remaining;
}
