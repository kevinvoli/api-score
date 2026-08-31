import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { HistoryImportService } from '../history/history-import.service';

function parseArgs(argv: string[]): {
  leagueId: number;
  from: Date;
  to: Date;
} {
  const options = new Map<string, string>();
  for (const arg of argv) {
    const match = /^--([a-z]+)=(.+)$/.exec(arg);
    if (match) {
      options.set(match[1], match[2]);
    }
  }

  const league = options.get('league');
  const from = options.get('from');
  const to = options.get('to');

  if (!league || !from || !to) {
    throw new Error(
      'Usage: import-history --league=<id> --from=YYYY-MM-DD --to=YYYY-MM-DD',
    );
  }

  const leagueId = Number(league);
  if (Number.isNaN(leagueId)) {
    throw new Error(`--league doit être un nombre, reçu "${league}"`);
  }

  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T00:00:00`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new Error('--from et --to doivent être au format YYYY-MM-DD');
  }

  return { leagueId, from: fromDate, to: toDate };
}

async function main(): Promise<void> {
  const { leagueId, from, to } = parseArgs(process.argv.slice(2));

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  const historyImportService = app.get(HistoryImportService);
  const result = await historyImportService.importLeagueSeason(
    leagueId,
    from,
    to,
  );

  console.log(
    '[import-history] championnat %d, %s → %s',
    result.leagueId,
    result.from,
    result.to,
  );
  console.log(
    '[import-history] %d fenêtre(s), %d appel(s) API consommé(s)',
    result.windowsProcessed,
    result.apiCallsUsed,
  );
  console.log(
    '[import-history] %d match(s) trouvé(s), %d fixture(s) importée(s)',
    result.matchesFound,
    result.fixturesUpserted,
  );
  console.log(
    '[import-history] %d snapshot(s) (MT+FT), %d événement(s), %d but(s)',
    result.snapshotsCreated,
    result.eventsCreated,
    result.goalsImported,
  );

  await app.close();
}

main().catch((err) => {
  console.error('[import-history] échec:', err);
  process.exit(1);
});
