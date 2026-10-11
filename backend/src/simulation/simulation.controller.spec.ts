import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuthenticatedPrincipal, UserRole } from '../auth/auth.types';
import { baselineStrategy } from '../backtest/baseline.strategy';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { ListDecisionsQueryDto } from './dto/list-decisions-query.dto';
import { StartSimulationDto } from './dto/start-simulation.dto';
import { SimulationController } from './simulation.controller';
import { SimulationService } from './simulation.service';

const admin: AuthenticatedPrincipal = {
  id: 'admin-1',
  email: 'admin@example.com',
  role: UserRole.ADMIN,
  sessionId: 'session-1',
};

function body(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: 'sim-2026-10-10-a',
    name: 'Baseline live',
    strategyVersion: 'baseline-1.0.0',
    strategy: structuredClone(baselineStrategy()) as unknown as Record<
      string,
      unknown
    >,
    currency: 'EUR',
    initialBankroll: '1000.00',
    maxQuoteAgeMs: 120_000,
    executionLatencyMs: 30_000,
    ...overrides,
  };
}

async function startDto(overrides: Record<string, unknown> = {}) {
  const instance = plainToInstance(StartSimulationDto, body(overrides));
  return { instance, errors: await validate(instance) };
}

describe('SimulationController', () => {
  let controller: SimulationController;
  let simulation: {
    start: jest.Mock;
    stop: jest.Mock;
    listDecisions: jest.Mock;
    summary: jest.Mock;
    listRuns: jest.Mock;
  };

  beforeEach(() => {
    simulation = {
      start: jest.fn().mockResolvedValue({ id: 'run-1', status: 'RUNNING' }),
      stop: jest.fn().mockResolvedValue({ id: 'run-1', status: 'STOPPED' }),
      listDecisions: jest
        .fn()
        .mockResolvedValue({ data: [], nextCursor: null }),
      summary: jest.fn().mockResolvedValue({ runId: 'run-1' }),
      listRuns: jest.fn().mockResolvedValue([{ id: 'run-1' }]),
    };
    controller = new SimulationController(
      simulation as unknown as SimulationService,
    );
  });

  it('réserve démarrage et arrêt à ADMIN, la lecture à VIEWER+', () => {
    const proto = SimulationController.prototype;
    const roles = (handler: unknown) =>
      Reflect.getMetadata(ROLES_KEY, handler as object);

    expect(roles(proto.start)).toEqual([UserRole.ADMIN]);
    expect(roles(proto.stop)).toEqual([UserRole.ADMIN]);
    expect(roles(proto.listDecisions)).toEqual([UserRole.VIEWER]);
    expect(roles(proto.summary)).toEqual([UserRole.VIEWER]);
    expect(roles(proto.list)).toEqual([UserRole.VIEWER]);
  });

  it('liste les runs récents via le service', async () => {
    await expect(controller.list()).resolves.toEqual([{ id: 'run-1' }]);
    expect(simulation.listRuns).toHaveBeenCalledWith();
  });

  it('transmet un démarrage valide avec la politique de risque et l’auteur', async () => {
    const { instance, errors } = await startDto({
      bookmakerKey: 'bet365',
      risk: { maxStakePerBet: '25', maxOpenExposure: '200.50' },
    });
    expect(errors).toEqual([]);

    await controller.start(instance, admin);

    const [input, userId] = simulation.start.mock.calls[0];
    expect(userId).toBe('admin-1');
    expect(input).toMatchObject({
      idempotencyKey: 'sim-2026-10-10-a',
      initialBankroll: '1000.00',
      currency: 'EUR',
      bookmakerKey: 'bet365',
      maxStakePerBet: '25',
      maxOpenExposure: '200.50',
    });
  });

  it.each([
    ['clé trop courte', { idempotencyKey: 'abc' }],
    ['clé avec caractères interdits', { idempotencyKey: 'clé avec espaces!' }],
    ['bankroll nulle', { initialBankroll: '0.00' }],
    ['bankroll négative', { initialBankroll: '-10' }],
    ['bankroll à 3 décimales', { initialBankroll: '10.001' }],
    ['bankroll en float JSON', { initialBankroll: 10.5 }],
    ['devise invalide', { currency: 'eur' }],
    ['latence hors borne', { executionLatencyMs: 300_001 }],
    ['âge de cote nul', { maxQuoteAgeMs: 0 }],
    ['plafond par pari nul', { risk: { maxStakePerBet: '0' } }],
    ['nom vide', { name: '   ' }],
  ])('refuse le DTO : %s', async (_label, overrides) => {
    const { errors } = await startDto(overrides);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('refuse une stratégie incomplète sans rien démarrer', async () => {
    const { instance } = await startDto();
    delete instance.strategy.entryRules;

    await expect(controller.start(instance, admin)).rejects.toThrow(
      BadRequestException,
    );
    expect(simulation.start).not.toHaveBeenCalled();
  });

  it('pagine par défaut à 50 et transmet les filtres', async () => {
    const query = plainToInstance(ListDecisionsQueryDto, {
      status: 'REJECTED',
      marketType: 'Buts match',
      from: '2026-10-01T00:00:00.000Z',
    });
    expect(await validate(query)).toEqual([]);

    await controller.listDecisions('run-1', query);

    expect(simulation.listDecisions).toHaveBeenCalledWith('run-1', {
      cursor: undefined,
      limit: 50,
      status: 'REJECTED',
      marketType: 'Buts match',
      from: new Date('2026-10-01T00:00:00.000Z'),
      to: undefined,
    });
  });

  it.each([
    ['statut inconnu', { status: 'PENDING' }],
    ['limite trop grande', { limit: '201' }],
    ['limite nulle', { limit: '0' }],
    ['curseur avec caractères interdits', { cursor: 'abc$def' }],
    ['date invalide', { to: 'demain' }],
  ])('refuse la requête de journal : %s', async (_label, raw) => {
    const query = plainToInstance(ListDecisionsQueryDto, raw);
    expect((await validate(query)).length).toBeGreaterThan(0);
  });

  it('refuse une plage de dates inversée', () => {
    const query = plainToInstance(ListDecisionsQueryDto, {
      from: '2026-10-02T00:00:00.000Z',
      to: '2026-10-01T00:00:00.000Z',
    });

    expect(() => controller.listDecisions('run-1', query)).toThrow(
      BadRequestException,
    );
  });

  it('arrêt et synthèse délèguent au service', async () => {
    await expect(controller.stop('run-1')).resolves.toMatchObject({
      status: 'STOPPED',
    });
    await expect(controller.summary('run-1')).resolves.toEqual({
      runId: 'run-1',
    });
  });
});
