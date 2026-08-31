import styles from './ConfidenceValue.module.css';

export interface ConfidenceValueProps {
  confidenceScore: number | null;
  baseRateSampleSize: number | null;
  layout?: 'stack' | 'inline';
  className?: string;
  valueClassName?: string;
  sampleClassName?: string;
}

const sampleLabel = (baseRateSampleSize: number | null): string | null => {
  if (baseRateSampleSize === null) return null;
  return `sur ${baseRateSampleSize} match${baseRateSampleSize > 1 ? 's' : ''}`;
};

export function ConfidenceValue({
  confidenceScore,
  baseRateSampleSize,
  layout = 'stack',
  className,
  valueClassName,
  sampleClassName,
}: ConfidenceValueProps) {
  const hasScore = confidenceScore !== null;
  const sample = hasScore ? sampleLabel(baseRateSampleSize) : null;

  return (
    <div
      className={[styles.wrapper, layout === 'inline' ? styles.inline : '', className]
        .filter(Boolean)
        .join(' ')}
      title={hasScore ? undefined : 'Taux de confiance indisponible (échantillon insuffisant)'}
    >
      <strong className={[styles.value, hasScore ? '' : styles.unavailable, valueClassName].filter(Boolean).join(' ')}>
        {hasScore ? `${confidenceScore}%` : '—'}
      </strong>
      {(sample || !hasScore) && (
        <span className={[styles.sample, sampleClassName].filter(Boolean).join(' ')}>
          {hasScore ? sample : 'Taux indisponible'}
        </span>
      )}
    </div>
  );
}
