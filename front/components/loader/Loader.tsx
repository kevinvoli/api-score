import styles from './Loader.module.css';

type Props = {
  /** Taille du spinner en px (défaut 32) */
  size?: number;
  /** Affiche un label sous le spinner */
  label?: string;
  /** Centre dans son conteneur */
  centered?: boolean;
};

export function Loader({ size = 32, label, centered = false }: Props) {
  return (
    <div className={`${styles.wrapper} ${centered ? styles.centered : ''}`}>
      <span
        className={styles.spinner}
        style={{ width: size, height: size }}
        aria-label={label ?? 'Chargement'}
        role="status"
      />
      {label && <span className={styles.label}>{label}</span>}
    </div>
  );
}

/** Ligne squelette animée */
export function SkeletonLine({ width = '100%', height = 14 }: { width?: string | number; height?: number }) {
  return (
    <span
      className={styles.skeletonLine}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

/** Bloc squelette pour une card / row */
export function SkeletonCard({ rows = 2 }: { rows?: number }) {
  return (
    <div className={styles.skeletonCard} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonLine key={i} width={i === 0 ? '60%' : '40%'} />
      ))}
    </div>
  );
}

/** Squelette d'une liste de rows (matchs, équipes…) */
export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className={styles.skeletonList} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={styles.skeletonRow}>
          <SkeletonLine width="15%" />
          <SkeletonLine width="45%" />
          <SkeletonLine width="20%" />
        </div>
      ))}
    </div>
  );
}

/** Squelette d'une grille de cards */
export function SkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <div className={styles.skeletonGrid} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} rows={2} />
      ))}
    </div>
  );
}
