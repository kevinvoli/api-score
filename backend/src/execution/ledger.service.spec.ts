import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource, EntityManager } from 'typeorm';
import { BankrollAccount } from '../database/entities/bankroll-account.entity';
import { BankrollLedgerEntry } from '../database/entities/bankroll-ledger-entry.entity';
import {
  LedgerRuleError,
  LedgerService,
  movementEffect,
  planEntry,
} from './ledger.service';

const balances = (availableCents: number, reservedCents = 0) => ({
  availableCents,
  reservedCents,
});

describe('planEntry() — règles comptables en centimes', () => {
  it('RESERVE : disponible −mise, réservé +mise', () => {
    expect(
      planEntry('RESERVE', balances(10_000), { stakeCents: 2_500 }),
    ).toEqual({
      amountCents: -2_500,
      reservedDeltaCents: 2_500,
      availableAfterCents: 7_500,
      reservedAfterCents: 2_500,
    });
  });

  it('RESERVE du dernier centime permis, refus au centime suivant', () => {
    expect(
      planEntry('RESERVE', balances(100), { stakeCents: 100 })
        .availableAfterCents,
    ).toBe(0);
    expect(() =>
      planEntry('RESERVE', balances(100), { stakeCents: 101 }),
    ).toThrow('Solde disponible insuffisant');
  });

  it('RELEASE rend la mise au disponible', () => {
    expect(
      planEntry('RELEASE', balances(7_500, 2_500), { stakeCents: 2_500 }),
    ).toMatchObject({
      availableAfterCents: 10_000,
      reservedAfterCents: 0,
    });
    expect(() =>
      planEntry('RELEASE', balances(0, 100), { stakeCents: 101 }),
    ).toThrow(LedgerRuleError);
  });

  it.each([
    ['gagné à 1.85', 1_850, 10_850, 850],
    ['VOID', 1_000, 10_000, 0],
    ['perdu', 0, 9_000, -1_000],
  ])(
    'SETTLE %s : gain brut au disponible, mise retirée du réservé',
    (_l, payout, availableAfter, pnl) => {
      const plan = planEntry('SETTLE', balances(9_000, 1_000), {
        stakeCents: 1_000,
        payoutCents: payout,
      });
      expect(plan.availableAfterCents).toBe(availableAfter);
      expect(plan.reservedAfterCents).toBe(0);
      expect(plan.amountCents + plan.reservedDeltaCents).toBe(pnl);
    },
  );

  it.each([
    ['mise nulle', 'RESERVE', { stakeCents: 0 }],
    ['mise négative', 'RESERVE', { stakeCents: -1 }],
    ['mise fractionnaire', 'RESERVE', { stakeCents: 10.5 }],
    ['gain négatif', 'SETTLE', { stakeCents: 100, payoutCents: -1 }],
    ['gain absent', 'SETTLE', { stakeCents: 100 }],
    ['ajustement nul', 'ADJUSTMENT', { adjustmentCents: 0 }],
  ] as const)('refuse %s', (_label, type, movement) => {
    expect(() => planEntry(type, balances(10_000, 10_000), movement)).toThrow(
      LedgerRuleError,
    );
  });

  it('refuse tout solde négatif, y compris par ajustement', () => {
    expect(() =>
      planEntry('ADJUSTMENT', balances(100), { adjustmentCents: -101 }),
    ).toThrow('solde négatif');
  });

  it('l’effet d’un mouvement ne dépend pas des soldes (base du contrôle de rejeu)', () => {
    expect(movementEffect('RESERVE', { stakeCents: 300 })).toEqual({
      amountCents: -300,
      reservedDeltaCents: 300,
    });
  });
});

describe('ledger append-only', () => {
  it('LedgerService n’expose aucune méthode de modification ni de suppression', () => {
    const methods = Object.getOwnPropertyNames(LedgerService.prototype);
    expect(
      methods.filter((m) => /update|delete|remove|save|edit|patch/i.test(m)),
    ).toEqual([]);
  });

  it('aucun fichier du module n’écrit dans le ledger autrement que par insert', () => {
    const dir = __dirname;
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
      .filter((f) => {
        const src = readFileSync(join(dir, f), 'utf8');
        return (
          /BankrollLedgerEntry\)\s*\.\s*(update|delete|remove|save|softDelete|upsert)\(/.test(
            src,
          ) || /(UPDATE|DELETE FROM)\s+bankroll_ledger_entries/i.test(src)
        );
      });
    expect(offenders).toEqual([]);
  });

  it('appendBatch garde un nombre constant de requêtes pour 100 mouvements', async () => {
    let stored: BankrollLedgerEntry[] = [];
    const ledgerRepo = {
      findBy: jest.fn(async () => stored),
      insert: jest.fn(async (rows: Array<Partial<BankrollLedgerEntry>>) => {
        stored = rows.map(
          (row, index) =>
            ({ id: `entry-${index}`, ...row }) as BankrollLedgerEntry,
        );
      }),
    };
    const execute = jest.fn().mockResolvedValue({ affected: 1 });
    const accountRepo = {
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute,
      })),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === BankrollLedgerEntry ? ledgerRepo : accountRepo,
      ),
    } as unknown as EntityManager;
    const service = new LedgerService({} as DataSource);
    const account = {
      id: 'account-1',
      currency: 'EUR',
      availableBalance: '0.00',
      reservedBalance: '100.00',
      version: 1,
    } as BankrollAccount;
    const inputs = Array.from({ length: 100 }, (_, index) => ({
      type: 'RELEASE' as const,
      entryKey: `release:key-${index}`,
      movement: { stakeCents: 100 },
      orderId: `order-${index}`,
    }));

    const results = await service.appendBatch(manager, account, inputs);

    expect(results).toHaveLength(100);
    expect(ledgerRepo.findBy).toHaveBeenCalledTimes(2);
    expect(ledgerRepo.insert).toHaveBeenCalledTimes(1);
    expect(accountRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(account).toMatchObject({
      availableBalance: '100.00',
      reservedBalance: '0.00',
      version: 101,
    });
  });
});
