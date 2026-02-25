import type { LiveFixture } from '../../lib/types/live';
import { MatchRow } from '../match-row/MatchRow';
import styles from './LeagueGroup.module.css';

type Props = {
  leagueName: string;
  fixtures: LiveFixture[];
  onAnalyze: (fixtureId: string) => void;
  changedScoreIds?: Set<string>;
};

export function LeagueGroup({ leagueName, fixtures, onAnalyze, changedScoreIds }: Props) {
  return (
    <div className={styles.group}>
      <div className={styles.header}>
        <span className={styles.name}>{leagueName}</span>
        <span className={styles.count}>{fixtures.length}</span>
      </div>
      <div className={styles.rows} role="rowgroup">
        {fixtures.map((fixture) => (
          <MatchRow
            key={fixture.id}
            fixture={fixture}
            scoreChanged={changedScoreIds?.has(fixture.providerFixtureId) ?? false}
            onAnalyze={() => onAnalyze(String(fixture.providerFixtureId))}
          />
        ))}
      </div>
    </div>
  );
}
