import {
  buildObservations,
  computeBaseRates,
  FixtureRow,
  GoalRow,
  SnapshotRow,
  TeamMatchObservation,
} from './base-rates.calculator';

function stats(entries: Record<string, number>): Record<string, unknown> {
  return {
    statistics: Object.entries(entries).map(([type, value]) => ({
      type,
      value,
    })),
  };
}

describe('computeBaseRates', () => {
  it('calcule le taux comme positifs / échantillon au-dessus du seuil', () => {
    const obs: TeamMatchObservation[] = [
      // 3 équipes-matchs à 2 tirs cadrés, 2 ont marqué en 1re MT
      mkObs({ on_target: 2, eventOccurred: true }),
      mkObs({ on_target: 2, eventOccurred: true }),
      mkObs({ on_target: 2, eventOccurred: false }),
      // 1 en dessous du seuil 2 : ignorée au seuil 2, comptée au seuil 1
      mkObs({ on_target: 1, eventOccurred: false }),
    ];

    const rates = computeBaseRates(obs);

    const t2 = rates.find((r) => r.signal === 'on_target' && r.threshold === 2);
    expect(t2).toMatchObject({ sampleSize: 3, observedRate: 0.6667 });

    const t1 = rates.find((r) => r.signal === 'on_target' && r.threshold === 1);
    expect(t1).toMatchObject({ sampleSize: 4, observedRate: 0.5 });

    // seuil au-dessus de toutes les valeurs → aucun échantillon → pas de ligne
    expect(
      rates.find((r) => r.signal === 'on_target' && r.threshold === 3),
    ).toBeUndefined();
  });

  it('respecte minSample', () => {
    const obs = [
      mkObs({ on_target: 5, eventOccurred: true }),
      mkObs({ on_target: 5, eventOccurred: false }),
    ];

    const rates = computeBaseRates(obs, { minSample: 3 });
    expect(rates.filter((r) => r.signal === 'on_target')).toHaveLength(0);
  });

  it('sépare les groupes par championnat / saison / marché', () => {
    const obs: TeamMatchObservation[] = [
      mkObs({ on_target: 2, eventOccurred: true, leagueId: 1, season: 2025 }),
      mkObs({ on_target: 2, eventOccurred: false, leagueId: 2, season: 2025 }),
      mkObs({ on_target: 2, eventOccurred: false, leagueId: 1, season: 2024 }),
    ];

    const rates = computeBaseRates(obs, {
      thresholdsBySignal: {
        on_target: [2],
        total_shots: [],
        pressure_index: [],
      },
    });

    const l1s2025 = rates.find(
      (r) => r.leagueId === 1 && r.season === 2025 && r.signal === 'on_target',
    );
    expect(l1s2025).toMatchObject({ sampleSize: 1, observedRate: 1 });
    expect(rates.filter((r) => r.signal === 'on_target')).toHaveLength(3);
  });

  it('accepte des seuils personnalisés par signal', () => {
    const obs = [mkObs({ pressure_index: 55, eventOccurred: true })];
    const rates = computeBaseRates(obs, {
      thresholdsBySignal: {
        pressure_index: [50],
        total_shots: [],
        on_target: [],
      },
    });
    expect(rates).toEqual([
      expect.objectContaining({
        signal: 'pressure_index',
        threshold: 50,
        sampleSize: 1,
        observedRate: 1,
      }),
    ]);
  });
});

describe('buildObservations', () => {
  const fixture: FixtureRow = {
    leagueId: 61,
    season: 2025,
    homeTeamId: 100,
    awayTeamId: 200,
  };

  it('émet goal_1h/goal_ft à la mi-temps et goal_2h sur le différentiel', () => {
    const snapshots: SnapshotRow[] = [
      {
        teamId: 100,
        half: '1',
        stats: stats({ 'On Target': 3, 'Off Target': 1 }),
      },
      {
        teamId: 100,
        half: '2',
        stats: stats({ 'On Target': 5, 'Off Target': 2 }),
      },
    ];
    const goals: GoalRow[] = [
      { teamId: 100, minute: 30 }, // 1re MT
      { teamId: 100, minute: 70 }, // 2e MT
    ];

    const obs = buildObservations(fixture, snapshots, goals);

    const g1h = obs.find((o) => o.market === 'goal_1h');
    expect(g1h).toMatchObject({ eventOccurred: true });
    expect(g1h?.signals.on_target).toBe(3);

    const gft = obs.find((o) => o.market === 'goal_ft');
    expect(gft).toMatchObject({
      eventOccurred: true,
      signals: { on_target: 3 },
    });

    const g2h = obs.find((o) => o.market === 'goal_2h');
    expect(g2h).toMatchObject({ eventOccurred: true });
    expect(g2h?.signals.on_target).toBe(2); // 5 (final) − 3 (MT)
  });

  it("n'émet pas goal_2h sans snapshot final", () => {
    const snapshots: SnapshotRow[] = [
      { teamId: 100, half: '1', stats: stats({ 'On Target': 2 }) },
    ];
    const obs = buildObservations(fixture, snapshots, []);
    expect(obs.map((o) => o.market).sort()).toEqual(['goal_1h', 'goal_ft']);
  });

  it('ignore une équipe sans snapshot mi-temps', () => {
    const snapshots: SnapshotRow[] = [
      { teamId: 200, half: '1', stats: stats({ 'On Target': 1 }) },
    ];
    const obs = buildObservations(fixture, snapshots, []);
    // Seule l'équipe 200 a un snapshot → ses 2 marchés uniquement
    expect(obs).toHaveLength(2);
    expect(obs.every((o) => o.leagueId === 61)).toBe(true);
  });

  it('exclut les fixtures sans leagueId ou saison', () => {
    const orphan: FixtureRow = { ...fixture, season: null };
    expect(buildObservations(orphan, [], [])).toEqual([]);
  });

  it("eventOccurred=false quand l'équipe ne marque pas", () => {
    const snapshots: SnapshotRow[] = [
      { teamId: 100, half: '1', stats: stats({ 'On Target': 4 }) },
    ];
    const obs = buildObservations(fixture, snapshots, [
      { teamId: 200, minute: 10 }, // but adverse, pas de l'équipe 100
    ]);
    const g1h = obs.find((o) => o.market === 'goal_1h');
    expect(g1h?.eventOccurred).toBe(false);
  });
});

function mkObs(input: {
  on_target?: number;
  total_shots?: number;
  pressure_index?: number;
  eventOccurred: boolean;
  leagueId?: number;
  season?: number;
}): TeamMatchObservation {
  return {
    leagueId: input.leagueId ?? 61,
    season: input.season ?? 2025,
    market: 'goal_1h',
    signals: {
      total_shots: input.total_shots ?? 0,
      on_target: input.on_target ?? 0,
      pressure_index: input.pressure_index ?? 0,
    },
    eventOccurred: input.eventOccurred,
  };
}
