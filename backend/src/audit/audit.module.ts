import { Module } from '@nestjs/common';
import { BacktestModule } from '../backtest/backtest.module';
import { SettingsModule } from '../settings/settings.module';
import { AuditController } from './audit.controller';

@Module({
  imports: [BacktestModule, SettingsModule],
  controllers: [AuditController],
})
export class AuditModule {}
