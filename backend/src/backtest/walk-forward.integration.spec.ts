import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { JsonLogger } from '../common/json.logger';
import { ALL_ENTITIES } from '../database/entities';
import { WalkForwardRun } from '../database/entities/walk-forward-run.entity';
import { BacktestEngineService } from './backtest-engine.service';
import {
  WALK_FORWARD_ORPHAN_ERROR,
  WalkForwardService,
  walkForwardLockName,
} from './walk-forward.service';

declare const JEST_INTEGRATION_RUN: boolean | undefined;

/**
 * Runs walk-forward orphelins sur MySQL réel : le comportement des verrous nommés (libérés à la
 * mort de la connexion) ne se simule pas fidèlement. Lancé par `npm run test:integration`.
 */
const integrationRun =
  typeof JEST_INTEGRATION_RUN !== 'undefined' && JEST_INTEGRATION_RUN;
const describeIntegration = integrationRun ? describe : describe.skip;
const databaseUrl = process.env.WALK_FORWARD_MYSQL_INTEGRATION_DB_URL;
const destructiveOptIn = 'api-score-walk-forward-it';
const ephemeralDatabaseName = 'api_score_walk_forward_it';

describeIntegration('Walk-forward — runs orphelins sur MySQL', () => {
  let dataSource: DataSource;
  let service: WalkForwardService;
  const logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as JsonLogger;

  const connect = () =>
    new DataSource({ type: 'mysql', url: databaseUrl }).initialize();

  async function insertRun(
    id: string,
    status: WalkForwardRun['status'],
    ageMs: number,
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO walk_forward_runs (id, strategy_version, strategy_snapshot, config, config_hash,
         status, range_from, range_to, created_at)
       VALUES (?, 'v-it', '{}', '{}', REPEAT('c', 64), ?, '2026-01-01', '2026-02-01', ?)`,
      [id, status, new Date(Date.now() - ageMs)],
    );
  }

  const statusOf = async (id: string) =>
    (await dataSource.getRepository(WalkForwardRun).findOneByOrFail({ id }))
      .status;

  beforeAll(async () => {
    if (!databaseUrl) {
      throw new Error(
        'WALK_FORWARD_MYSQL_INTEGRATION_DB_URL absent : ce test d’intégration ne peut pas être ignoré',
      );
    }
    if (
      process.env.WALK_FORWARD_MYSQL_INTEGRATION_DESTRUCTIVE !==
      destructiveOptIn
    ) {
      throw new Error(
        `Refus d'opération destructive sans WALK_FORWARD_MYSQL_INTEGRATION_DESTRUCTIVE=${destructiveOptIn}`,
      );
    }
    const admin = await connect();
    const [{ name }] = (await admin.query(
      'SELECT DATABASE() AS name',
    )) as Array<{
      name: string;
    }>;
    if (name !== ephemeralDatabaseName) {
      await admin.destroy();
      throw new Error(
        `Refus d'opération destructive hors de ${ephemeralDatabaseName}`,
      );
    }
    await admin.query(`DROP DATABASE ${ephemeralDatabaseName}`);
    await admin.query(`CREATE DATABASE ${ephemeralDatabaseName}`);
    await admin.destroy();

    dataSource = new DataSource({
      type: 'mysql',
      url: databaseUrl,
      entities: ALL_ENTITIES,
      migrations: [join(__dirname, '../database/migrations/*.ts')],
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();
    await dataSource.runMigrations();
    service = new WalkForwardService(
      dataSource.getRepository(WalkForwardRun),
      dataSource.getRepository('WalkForwardFold'),
      {} as BacktestEngineService,
      logger,
      dataSource,
    );
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  it('clôt le run sans exécutant, épargne le run verrouillé, le run récent et le run terminé', async () => {
    const orphan = '00000000-0000-4000-8000-0000000000a1';
    const leased = '00000000-0000-4000-8000-0000000000a2';
    const fresh = '00000000-0000-4000-8000-0000000000a3';
    const done = '00000000-0000-4000-8000-0000000000a4';
    await insertRun(orphan, 'RUNNING', 5 * 60_000);
    await insertRun(leased, 'RUNNING', 5 * 60_000);
    await insertRun(fresh, 'PENDING', 0);
    await insertRun(done, 'COMPLETED', 5 * 60_000);

    // Un autre « processus » exécute `leased` : il tient son verrou sur sa propre connexion.
    const otherInstance = await connect();
    const runner = otherInstance.createQueryRunner();
    await runner.connect();
    await runner.query('SELECT GET_LOCK(?, 0)', [walkForwardLockName(leased)]);

    await expect(service.failOrphanedRuns()).resolves.toBe(1);
    expect(await statusOf(orphan)).toBe('FAILED');
    expect(await statusOf(leased)).toBe('RUNNING');
    expect(await statusOf(fresh)).toBe('PENDING');
    expect(await statusOf(done)).toBe('COMPLETED');
    const [row] = (await dataSource.query(
      'SELECT error, completed_at AS completedAt FROM walk_forward_runs WHERE id = ?',
      [orphan],
    )) as Array<{ error: string; completedAt: Date | null }>;
    expect(row.error).toBe(WALK_FORWARD_ORPHAN_ERROR);
    expect(row.completedAt).not.toBeNull();

    // Crash de l'autre processus : ses connexions meurent, MySQL libère le verrou.
    await otherInstance.destroy();
    await expect(service.failOrphanedRuns()).resolves.toBe(1);
    expect(await statusOf(leased)).toBe('FAILED');

    // Rejouer ne change plus rien.
    await expect(service.failOrphanedRuns()).resolves.toBe(0);
  });
});
