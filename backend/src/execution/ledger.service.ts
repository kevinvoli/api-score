import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { BankrollAccount } from '../database/entities/bankroll-account.entity';
import { BankrollLedgerEntry } from '../database/entities/bankroll-ledger-entry.entity';
import {
  DecimalString,
  ExecutionMode,
  LedgerEntryType,
  fromCents,
  toCents,
} from './execution.types';

/** Règle comptable violée : écriture refusée, rien n'est écrit. */
export class LedgerRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerRuleError';
  }
}

export interface Balances {
  availableCents: number;
  reservedCents: number;
}

export interface PlannedEntry {
  amountCents: number;
  reservedDeltaCents: number;
  availableAfterCents: number;
  reservedAfterCents: number;
}

export interface EntryMovement {
  /** Mise concernée (RESERVE, RELEASE, SETTLE). */
  stakeCents?: number;
  /** Montant rendu au disponible par un SETTLE : mise × cote si gagné, mise si VOID, 0 si perdu. */
  payoutCents?: number;
  /** Mouvement signé d'un ADJUSTMENT (réservé à l'ouverture de compte dans ce lot). */
  adjustmentCents?: number;
}

const isPositiveInteger = (value: number | undefined): value is number =>
  value !== undefined && Number.isSafeInteger(value) && value > 0;

/**
 * Effet comptable d'une écriture, en centimes entiers. Pure et exhaustive : toute
 * combinaison qui rendrait un solde négatif ou incohérent est refusée.
 *
 * RESERVE : disponible −mise, réservé +mise
 * RELEASE : disponible +mise, réservé −mise
 * SETTLE  : disponible +gain brut, réservé −mise
 * ADJUSTMENT : disponible ±montant, réservé inchangé
 */
export function movementEffect(
  type: LedgerEntryType,
  movement: EntryMovement,
): { amountCents: number; reservedDeltaCents: number } {
  switch (type) {
    case 'RESERVE':
    case 'RELEASE':
    case 'SETTLE':
      if (!isPositiveInteger(movement.stakeCents)) {
        throw new LedgerRuleError('Mise strictement positive requise');
      }
      if (type === 'RESERVE') {
        return {
          amountCents: -movement.stakeCents,
          reservedDeltaCents: movement.stakeCents,
        };
      }
      if (type === 'RELEASE') {
        return {
          amountCents: movement.stakeCents,
          reservedDeltaCents: -movement.stakeCents,
        };
      }
      if (
        movement.payoutCents === undefined ||
        !Number.isSafeInteger(movement.payoutCents) ||
        movement.payoutCents < 0
      ) {
        throw new LedgerRuleError('Gain brut entier et positif ou nul requis');
      }
      return {
        amountCents: movement.payoutCents,
        reservedDeltaCents: -movement.stakeCents,
      };
    case 'ADJUSTMENT':
      if (
        movement.adjustmentCents === undefined ||
        !Number.isSafeInteger(movement.adjustmentCents) ||
        movement.adjustmentCents === 0
      ) {
        throw new LedgerRuleError('Ajustement entier non nul requis');
      }
      return { amountCents: movement.adjustmentCents, reservedDeltaCents: 0 };
    default:
      throw new LedgerRuleError(`Type d'écriture inconnu : ${String(type)}`);
  }
}

export function planEntry(
  type: LedgerEntryType,
  balances: Balances,
  movement: EntryMovement,
): PlannedEntry {
  const { amountCents, reservedDeltaCents } = movementEffect(type, movement);
  if (type === 'RESERVE' && balances.availableCents < -amountCents) {
    throw new LedgerRuleError('Solde disponible insuffisant');
  }
  if (
    (type === 'RELEASE' || type === 'SETTLE') &&
    balances.reservedCents < -reservedDeltaCents
  ) {
    throw new LedgerRuleError(
      type === 'RELEASE'
        ? 'Réservé insuffisant pour relâcher cette mise'
        : 'Réservé insuffisant pour régler cette mise',
    );
  }

  const availableAfterCents = balances.availableCents + amountCents;
  const reservedAfterCents = balances.reservedCents + reservedDeltaCents;
  if (availableAfterCents < 0 || reservedAfterCents < 0) {
    throw new LedgerRuleError('Écriture refusée : solde négatif');
  }
  return {
    amountCents,
    reservedDeltaCents,
    availableAfterCents,
    reservedAfterCents,
  };
}

export interface AppendInput {
  type: LedgerEntryType;
  entryKey: string;
  movement: EntryMovement;
  orderId?: string | null;
  actorUserId?: string | null;
  metadata?: Record<string, string | number | boolean | null> | null;
}

export interface AppendResult {
  entry: BankrollLedgerEntry;
  /** true : la clé existait déjà avec le même effet, rien n'a été réécrit. */
  replayed: boolean;
}

export interface DailyAggregates {
  /** Mises réservées depuis le début du jour UTC. */
  stakedCents: number;
  /** Résultat net réglé depuis le début du jour UTC (gains bruts − mises). */
  settledPnlCents: number;
}

export interface InvariantReport {
  ok: boolean;
  account: Balances;
  ledgerSum: Balances;
  lastEntry: Balances | null;
}

/**
 * Journal append-only. Les seules écritures possibles sont des ajouts ; le compte n'est
 * modifié que dans la même transaction, sous verrou, avec contrôle de version. Aucune
 * méthode ne met à jour ni ne supprime une écriture.
 */
@Injectable()
export class LedgerService {
  constructor(private readonly dataSource: DataSource) {}

  /** Ouvre un compte et y inscrit le solde initial comme écriture d'ouverture. */
  async openAccount(
    input: {
      mode: ExecutionMode;
      operatorKey: string;
      currency: string;
      initialBalance: DecimalString;
    },
    actorUserId: string | null,
  ): Promise<BankrollAccount> {
    const initialCents = toCents(input.initialBalance);
    if (initialCents <= 0) {
      throw new LedgerRuleError('Solde initial strictement positif requis');
    }
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const repo = manager.getRepository(BankrollAccount);
      const existing = await repo.findOneBy({
        mode: input.mode,
        operatorKey: input.operatorKey,
        currency: input.currency,
      });
      if (existing) {
        throw new ConflictException(
          'Un compte existe déjà pour ce mode, cet opérateur et cette devise',
        );
      }
      await repo.insert({
        mode: input.mode,
        operatorKey: input.operatorKey,
        currency: input.currency,
        availableBalance: '0.00',
        reservedBalance: '0.00',
        version: 1,
        updatedAt: new Date(),
      });
      const created = await this.lockAccountBy(manager, {
        mode: input.mode,
        operatorKey: input.operatorKey,
        currency: input.currency,
      });
      await this.append(manager, created, {
        type: 'ADJUSTMENT',
        entryKey: `open:${created.id}`,
        movement: { adjustmentCents: initialCents },
        actorUserId,
        metadata: { reason: 'Ouverture de compte' },
      });
      return repo.findOneByOrFail({ id: created.id });
    });
  }

  async lockAccount(
    manager: EntityManager,
    accountId: string,
  ): Promise<BankrollAccount> {
    const account = await manager
      .getRepository(BankrollAccount)
      .createQueryBuilder('a')
      .setLock('pessimistic_write')
      .where('a.id = :id', { id: accountId })
      .getOne();
    if (!account)
      throw new NotFoundException(`Compte ${accountId} introuvable`);
    return account;
  }

  private async lockAccountBy(
    manager: EntityManager,
    key: { mode: string; operatorKey: string; currency: string },
  ): Promise<BankrollAccount> {
    const account = await manager
      .getRepository(BankrollAccount)
      .createQueryBuilder('a')
      .setLock('pessimistic_write')
      .where(
        'a.mode = :mode AND a.operatorKey = :operatorKey AND a.currency = :currency',
        key,
      )
      .getOne();
    if (!account) throw new NotFoundException('Compte introuvable');
    return account;
  }

  async findEntry(
    manager: EntityManager,
    entryKey: string,
  ): Promise<BankrollLedgerEntry | null> {
    return manager.getRepository(BankrollLedgerEntry).findOneBy({ entryKey });
  }

  /**
   * Ajoute une écriture sur un compte DÉJÀ verrouillé par l'appelant dans `manager`.
   * Même clé, même effet → renvoie l'écriture existante ; même clé, autre effet → 409.
   */
  async append(
    manager: EntityManager,
    account: BankrollAccount,
    input: AppendInput,
  ): Promise<AppendResult> {
    const balances: Balances = {
      availableCents: toCents(account.availableBalance),
      reservedCents: toCents(account.reservedBalance),
    };
    const existing = await this.findEntry(manager, input.entryKey);
    if (existing) {
      const expected = movementEffect(input.type, input.movement);
      const same =
        existing.accountId === account.id &&
        existing.entryType === input.type &&
        toCents(existing.amount) === expected.amountCents &&
        toCents(existing.reservedDelta) === expected.reservedDeltaCents;
      if (!same) {
        throw new ConflictException(
          `Clé d'écriture ${input.entryKey} déjà utilisée pour un autre mouvement`,
        );
      }
      return { entry: existing, replayed: true };
    }

    const planned = planEntry(input.type, balances, input.movement);
    const entryRepo = manager.getRepository(BankrollLedgerEntry);
    await entryRepo.insert({
      accountId: account.id,
      orderId: input.orderId ?? null,
      entryKey: input.entryKey,
      entryType: input.type,
      amount: fromCents(planned.amountCents),
      reservedDelta: fromCents(planned.reservedDeltaCents),
      availableAfter: fromCents(planned.availableAfterCents),
      reservedAfter: fromCents(planned.reservedAfterCents),
      currency: account.currency,
      accountVersion: account.version + 1,
      actorUserId: input.actorUserId ?? null,
      metadata: input.metadata ?? null,
    });

    // Second garde-fou après le verrou : la version doit être celle lue.
    const update = await manager
      .getRepository(BankrollAccount)
      .createQueryBuilder()
      .update(BankrollAccount)
      .set({
        availableBalance: fromCents(planned.availableAfterCents),
        reservedBalance: fromCents(planned.reservedAfterCents),
        version: () => 'version + 1',
        updatedAt: () => 'CURRENT_TIMESTAMP(6)',
      })
      .where('id = :id AND version = :version', {
        id: account.id,
        version: account.version,
      })
      .execute();
    if (update.affected !== 1) {
      throw new ConflictException(
        'Compte modifié concurremment : écriture annulée',
      );
    }
    account.availableBalance = fromCents(planned.availableAfterCents);
    account.reservedBalance = fromCents(planned.reservedAfterCents);
    account.version += 1;

    return {
      entry: await entryRepo.findOneByOrFail({ entryKey: input.entryKey }),
      replayed: false,
    };
  }

  /** Ajoute plusieurs mouvements sur le même compte avec lectures/écritures groupées. */
  async appendBatch(
    manager: EntityManager,
    account: BankrollAccount,
    inputs: readonly AppendInput[],
  ): Promise<AppendResult[]> {
    if (!inputs.length) return [];
    const keys = inputs.map((input) => input.entryKey);
    if (new Set(keys).size !== keys.length) {
      throw new ConflictException('Clé d’écriture dupliquée dans le lot');
    }
    const existing = await manager
      .getRepository(BankrollLedgerEntry)
      .findBy({ entryKey: In(keys) });
    const existingByKey = new Map(
      existing.map((entry) => [entry.entryKey, entry]),
    );
    let balances: Balances = {
      availableCents: toCents(account.availableBalance),
      reservedCents: toCents(account.reservedBalance),
    };
    let nextVersion = account.version;
    const rows: Array<Partial<BankrollLedgerEntry>> = [];

    for (const input of inputs) {
      const replay = existingByKey.get(input.entryKey);
      if (replay) {
        const expected = movementEffect(input.type, input.movement);
        if (
          replay.accountId !== account.id ||
          replay.entryType !== input.type ||
          toCents(replay.amount) !== expected.amountCents ||
          toCents(replay.reservedDelta) !== expected.reservedDeltaCents
        ) {
          throw new ConflictException(
            `Clé d'écriture ${input.entryKey} déjà utilisée pour un autre mouvement`,
          );
        }
        continue;
      }
      const planned = planEntry(input.type, balances, input.movement);
      nextVersion += 1;
      rows.push({
        accountId: account.id,
        orderId: input.orderId ?? null,
        entryKey: input.entryKey,
        entryType: input.type,
        amount: fromCents(planned.amountCents),
        reservedDelta: fromCents(planned.reservedDeltaCents),
        availableAfter: fromCents(planned.availableAfterCents),
        reservedAfter: fromCents(planned.reservedAfterCents),
        currency: account.currency,
        accountVersion: nextVersion,
        actorUserId: input.actorUserId ?? null,
        metadata: input.metadata ?? null,
      });
      balances = {
        availableCents: planned.availableAfterCents,
        reservedCents: planned.reservedAfterCents,
      };
    }

    if (rows.length) {
      await manager.getRepository(BankrollLedgerEntry).insert(rows);
      const updated = await manager
        .getRepository(BankrollAccount)
        .createQueryBuilder()
        .update(BankrollAccount)
        .set({
          availableBalance: fromCents(balances.availableCents),
          reservedBalance: fromCents(balances.reservedCents),
          version: nextVersion,
          updatedAt: () => 'CURRENT_TIMESTAMP(6)',
        })
        .where('id = :id AND version = :version', {
          id: account.id,
          version: account.version,
        })
        .execute();
      if (updated.affected !== 1) {
        throw new ConflictException(
          'Compte modifié concurremment : lot d’écritures annulé',
        );
      }
      account.availableBalance = fromCents(balances.availableCents);
      account.reservedBalance = fromCents(balances.reservedCents);
      account.version = nextVersion;
    }

    const all = rows.length
      ? await manager
          .getRepository(BankrollLedgerEntry)
          .findBy({ entryKey: In(keys) })
      : existing;
    const byKey = new Map(all.map((entry) => [entry.entryKey, entry]));
    return inputs.map((input) => ({
      entry: byKey.get(input.entryKey)!,
      replayed: existingByKey.has(input.entryKey),
    }));
  }

  /** Mises réservées et résultat réglé du jour UTC, en une requête groupée. */
  async dailyAggregates(
    manager: EntityManager,
    accountId: string,
    dayStart: Date,
  ): Promise<DailyAggregates> {
    const rows: Array<{ staked: string | null; pnl: string | null }> =
      await manager.query(
        `SELECT
           COALESCE(SUM(CASE WHEN entry_type = 'RESERVE' THEN reserved_delta ELSE 0 END), 0) AS staked,
           COALESCE(SUM(CASE WHEN entry_type = 'SETTLE' THEN amount + reserved_delta ELSE 0 END), 0) AS pnl
         FROM bankroll_ledger_entries
         WHERE account_id = ? AND created_at >= ?`,
        [accountId, dayStart],
      );
    return {
      stakedCents: toCents(String(rows[0]?.staked ?? '0')),
      settledPnlCents: toCents(String(rows[0]?.pnl ?? '0')),
    };
  }

  /**
   * Invariant comptable : soldes du compte = somme des écritures = soldes après la
   * dernière écriture. Toute divergence doit arrêter l'exécution.
   */
  async verifyInvariant(accountId: string): Promise<InvariantReport> {
    const manager = this.dataSource.manager;
    const account = await manager
      .getRepository(BankrollAccount)
      .findOneBy({ id: accountId });
    if (!account)
      throw new NotFoundException(`Compte ${accountId} introuvable`);
    const [sums]: Array<{ available: string | null; reserved: string | null }> =
      await manager.query(
        `SELECT COALESCE(SUM(amount), 0) AS available, COALESCE(SUM(reserved_delta), 0) AS reserved
           FROM bankroll_ledger_entries WHERE account_id = ?`,
        [accountId],
      );
    // Ordre total par version de compte (unique), pas par horodatage.
    const last = await manager.getRepository(BankrollLedgerEntry).findOne({
      where: { accountId },
      order: { accountVersion: 'DESC' },
    });
    const accountBalances = {
      availableCents: toCents(account.availableBalance),
      reservedCents: toCents(account.reservedBalance),
    };
    const ledgerSum = {
      availableCents: toCents(String(sums.available ?? '0')),
      reservedCents: toCents(String(sums.reserved ?? '0')),
    };
    const lastEntry = last
      ? {
          availableCents: toCents(last.availableAfter),
          reservedCents: toCents(last.reservedAfter),
        }
      : null;
    const same = (a: Balances, b: Balances) =>
      a.availableCents === b.availableCents &&
      a.reservedCents === b.reservedCents;
    return {
      ok:
        same(accountBalances, ledgerSum) &&
        (lastEntry === null ||
          (same(accountBalances, lastEntry) &&
            last!.accountVersion === account.version)),
      account: accountBalances,
      ledgerSum,
      lastEntry,
    };
  }
}
