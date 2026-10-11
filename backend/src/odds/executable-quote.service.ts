import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OddsSnapshot } from '../database/entities/odds-snapshot.entity';
import {
  ExecutableQuote,
  ExecutableQuoteLookup,
  QuoteCandidatesQuery,
} from './odds.types';

@Injectable()
export class ExecutableQuoteService {
  constructor(
    @InjectRepository(OddsSnapshot)
    private readonly oddsSnapshotRepository: Repository<OddsSnapshot>,
  ) {}

  async loadCandidates(
    query: QuoteCandidatesQuery,
  ): Promise<ExecutableQuote[]> {
    if (!query.providerFixtureIds.length) {
      return [];
    }

    const snapshots = await this.oddsSnapshotRepository
      .createQueryBuilder('snapshot')
      .where('snapshot.providerFixtureId IN (:...providerFixtureIds)', {
        providerFixtureIds: query.providerFixtureIds,
      })
      .andWhere('snapshot.receivedAt BETWEEN :receivedFrom AND :receivedTo', {
        receivedFrom: query.receivedFrom,
        receivedTo: query.receivedTo,
      })
      .andWhere('snapshot.providerKey IS NOT NULL')
      .andWhere('snapshot.bookmakerKey IS NOT NULL')
      .andWhere('snapshot.marketKey IS NOT NULL')
      .andWhere('snapshot.selectionKey IS NOT NULL')
      .andWhere('snapshot.observedAt IS NOT NULL')
      .andWhere('snapshot.available = :available', { available: true })
      .andWhere('snapshot.oddValue > :minimumOdd', { minimumOdd: 1 })
      .andWhere('snapshot.observedAt <= snapshot.receivedAt')
      .orderBy('snapshot.observedAt', 'DESC')
      .addOrderBy('snapshot.receivedAt', 'DESC')
      .addOrderBy('snapshot.id', 'ASC')
      .getMany();

    return snapshots.map((snapshot) => this.toExecutableQuote(snapshot));
  }

  selectLatest(
    candidates: ExecutableQuote[],
    lookup: ExecutableQuoteLookup,
  ): ExecutableQuote | null {
    const atMs = lookup.at.getTime();
    const matches = candidates.filter((quote) => {
      if (
        quote.providerFixtureId !== lookup.target.providerFixtureId ||
        quote.marketKey !== lookup.target.marketKey ||
        quote.selectionKey !== lookup.target.selectionKey
      ) {
        return false;
      }
      if (
        lookup.target.providerKey !== undefined &&
        quote.providerKey !== lookup.target.providerKey
      ) {
        return false;
      }
      if (
        lookup.target.bookmakerKey !== undefined &&
        quote.bookmakerKey !== lookup.target.bookmakerKey
      ) {
        return false;
      }

      const observedAtMs = quote.observedAt.getTime();
      const receivedAtMs = quote.receivedAt.getTime();
      const ageMs = atMs - observedAtMs;
      return (
        quote.available &&
        Number.isFinite(quote.oddValue) &&
        quote.oddValue > 1 &&
        observedAtMs <= receivedAtMs &&
        receivedAtMs <= atMs &&
        ageMs >= 0 &&
        ageMs <= lookup.maxQuoteAgeMs
      );
    });

    matches.sort((left, right) => {
      const observedDifference =
        right.observedAt.getTime() - left.observedAt.getTime();
      if (observedDifference !== 0) return observedDifference;

      const receivedDifference =
        right.receivedAt.getTime() - left.receivedAt.getTime();
      if (receivedDifference !== 0) return receivedDifference;

      const providerDifference = left.providerKey.localeCompare(
        right.providerKey,
      );
      if (providerDifference !== 0) return providerDifference;

      const bookmakerDifference = left.bookmakerKey.localeCompare(
        right.bookmakerKey,
      );
      if (bookmakerDifference !== 0) return bookmakerDifference;

      return left.snapshotId.localeCompare(right.snapshotId);
    });

    return matches[0] ?? null;
  }

  private toExecutableQuote(snapshot: OddsSnapshot): ExecutableQuote {
    return {
      snapshotId: snapshot.id,
      providerKey: snapshot.providerKey!,
      fixtureId: snapshot.fixtureId,
      providerFixtureId: String(snapshot.providerFixtureId),
      bookmakerKey: snapshot.bookmakerKey!,
      marketKey: snapshot.marketKey!,
      selectionKey: snapshot.selectionKey!,
      oddValue: snapshot.oddValue,
      observedAt: snapshot.observedAt!,
      receivedAt: snapshot.receivedAt!,
      available: true,
    };
  }
}
