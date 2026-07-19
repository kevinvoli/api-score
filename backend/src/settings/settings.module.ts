import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppRuntimeState } from '../database/entities/app-runtime-state.entity';
import { SmartRulesConfigService } from './smart-rules-config.service';
import { SmartRulesController } from './smart-rules.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AppRuntimeState])],
  controllers: [SmartRulesController],
  providers: [SmartRulesConfigService],
  exports: [SmartRulesConfigService],
})
export class SettingsModule {}
