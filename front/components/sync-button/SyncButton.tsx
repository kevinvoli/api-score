'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { syncLiveFixtures, type SyncResult } from '../../lib/api/live';
import styles from './SyncButton.module.css';

type Phase = 'idle' | 'success' | 'error';

export function SyncButton() {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>('idle');
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { mutate, isPending } = useMutation({
    mutationFn: syncLiveFixtures,
    onSuccess: (result) => {
      setLastResult(result);
      setPhase('success');
      queryClient.invalidateQueries({ queryKey: ['live-fixtures'] });
      scheduleRevert();
    },
    onError: () => {
      setPhase('error');
      scheduleRevert();
    },
  });

  const scheduleRevert = () => {
    if (revertTimer.current) clearTimeout(revertTimer.current);
    revertTimer.current = setTimeout(() => setPhase('idle'), 3000);
  };

  useEffect(() => () => {
    if (revertTimer.current) clearTimeout(revertTimer.current);
  }, []);

  const handleClick = () => {
    if (isPending || phase !== 'idle') return;
    mutate();
  };

  return (
    <button
      type="button"
      className={`navbar-btn primary ${styles.btn} ${styles[phase]} ${isPending ? styles.pending : ''}`}
      onClick={handleClick}
      disabled={isPending}
      title={lastResult ? `${lastResult.fixturesSynced} matchs · ${lastResult.eventsSynced} events · ${lastResult.statsSynced} stats` : undefined}
    >
      {isPending && <span className={styles.spinner} />}

      {isPending && 'Sync\u2026'}

      {!isPending && phase === 'idle' && 'Synchroniser'}

      {!isPending && phase === 'success' && lastResult && (
        <>
          <span className={styles.check}>✓</span>
          {lastResult.fixturesSynced === 0
            ? 'Aucun match live'
            : `${lastResult.fixturesSynced} match${lastResult.fixturesSynced > 1 ? 's' : ''} sync`}
        </>
      )}

      {!isPending && phase === 'error' && (
        <>
          <span className={styles.cross}>✕</span>
          Erreur sync
        </>
      )}
    </button>
  );
}
