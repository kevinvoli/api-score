'use client';

import { useMemo } from 'react';

export function DateBar() {
  const dateLabel = useMemo(() => {
    return new Date().toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }, []);

  return (
    <div className="date-bar">
      <div className="date-bar-left">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="date-bar-icon">
          <rect x="1" y="2.5" width="12" height="10.5" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
          <path d="M4 1v3M10 1v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          <path d="M1 6h12" stroke="currentColor" strokeWidth="1.1"/>
        </svg>
        <span className="date-bar-text">{dateLabel}</span>
      </div>

      <div className="date-bar-right">
        <div className="date-bar-search">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M8.5 8.5L11.5 11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          <span>Rechercher un match…</span>
        </div>
      </div>
    </div>
  );
}
