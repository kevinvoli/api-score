import { Body, Controller, Get, Put } from '@nestjs/common';
import { SmartRulesConfigService, SmartRulesConfig } from './smart-rules-config.service';

@Controller('settings/smart-rules')
export class SmartRulesController {
  constructor(private readonly configService: SmartRulesConfigService) {}

  @Get()
  getConfig(): Promise<SmartRulesConfig> {
    return this.configService.getConfig();
  }

  @Put()
  updateConfig(@Body() body: SmartRulesConfig): Promise<SmartRulesConfig> {
    return this.configService.updateConfig(body);
  }
}
