import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BetDecision } from '../database/entities/bet-decision.entity';
import { Fixture } from '../database/entities/fixture.entity';
import { SimulationRun } from '../database/entities/simulation-run.entity';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { SimulationController } from './simulation.controller';
import { SimulationScheduler } from './simulation.scheduler';
import { SimulationService } from './simulation.service';

/**
 * Mode simulation : décisions et ordres strictement virtuels. Les seules
 * dépendances sont la source de signaux live et le sélecteur de cote observée
 * (OddsModule, global) ; aucun adaptateur de placement n'est importé.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([SimulationRun, BetDecision, Fixture]),
    RecommendationsModule,
  ],
  controllers: [SimulationController],
  providers: [SimulationService, SimulationScheduler],
})
export class SimulationModule {}
