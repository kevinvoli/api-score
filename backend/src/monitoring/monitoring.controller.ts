import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { MonitoringService } from './monitoring.service';

@Controller()
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Public()
  @Get('health')
  getHealth() {
    return this.monitoringService.getHealth();
  }

  @Public()
  @Get('metrics/usage')
  getUsageMetrics() {
    return this.monitoringService.getUsageMetrics();
  }

  @Public()
  @Get('metrics/pipeline')
  getPipelineMetrics() {
    return this.monitoringService.getPipelineMetrics();
  }
}
