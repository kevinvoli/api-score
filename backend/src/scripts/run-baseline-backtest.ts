import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { BacktestEngineService } from '../backtest/backtest-engine.service';
import { baselineStrategy } from '../backtest/baseline.strategy';
import { SmartRulesConfigService } from '../settings/smart-rules-config.service';
import { BacktestKpis } from '../backtest/backtest.types';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  const config = await app.get(SmartRulesConfigService).getConfig();
  const engine = app.get(BacktestEngineService);

  const run = await engine.run('baseline-cli', baselineStrategy(config));
  const kpis = run.kpis as unknown as BacktestKpis;

  console.log('[backtest] run %s (%s)', run.id, run.status);
  console.log(
    '[backtest] fenêtre %s → %s',
    run.windowStart.toISOString(),
    run.windowEnd.toISOString(),
  );
  console.log(
    '[backtest] paris: %d | WON %d / LOST %d / NO_RESULT %d',
    kpis.betCount,
    kpis.wonBets,
    kpis.lostBets,
    kpis.noResultBets,
  );
  console.log(
    '[backtest] hit-rate %s%% | ROI %s%% | drawdown max %s%% | bankroll finale %s',
    kpis.hitRate,
    kpis.roiPct,
    kpis.maxDrawdownPct,
    kpis.finalBankroll,
  );
  for (const [market, y] of Object.entries(kpis.yieldByMarket)) {
    console.log(
      '[backtest]   %s : %d paris, hit-rate %s%%, ROI %s%%',
      market,
      y.bets,
      y.hitRate,
      y.roiPct,
    );
  }

  await app.close();
}

main().catch((err) => {
  console.error('[backtest] échec:', err);
  process.exit(1);
});
