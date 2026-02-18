import { Controller, Get } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';

@Controller()
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Get('health')
  getHealth() {
    return this.monitoringService.getHealth();
  }

  @Get('metrics/usage')
  getUsageMetrics() {
    return this.monitoringService.getUsageMetrics();
  }

  @Get('metrics/pipeline')
  getPipelineMetrics() {
    return this.monitoringService.getPipelineMetrics();
  }
}
