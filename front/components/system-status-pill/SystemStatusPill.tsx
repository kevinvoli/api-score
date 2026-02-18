import styles from './SystemStatusPill.module.css';

export type SystemStatus = 'Healthy' | 'Degraded' | 'Syncing';

export type SystemStatusPillProps = {
  status: SystemStatus;
  traceId?: string;
  message?: string;
};

const statusClass = (status: SystemStatus) => {
  if (status === 'Healthy') return styles.healthy;
  if (status === 'Degraded') return styles.degraded;
  if (status === 'Syncing') return styles.syncing;
  return '';
};

export function SystemStatusPill({ status, traceId, message }: SystemStatusPillProps) {
  return (
    <div className={`${styles.pill} ${statusClass(status)}`}>
      <span className={styles.status}>{status}</span>
      {message && <span className={styles.message}>{message}</span>}
      {traceId && <span className={styles.trace}>trace {traceId}</span>}
    </div>
  );
}
