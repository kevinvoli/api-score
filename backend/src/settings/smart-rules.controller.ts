import { Body, Controller, Get, Put } from '@nestjs/common';
import {
  SmartRulesConfigService,
  SmartRulesConfig,
} from './smart-rules-config.service';
import { UpdateSmartRulesDto } from './dto/update-smart-rules.dto';

@Controller('settings/smart-rules')
export class SmartRulesController {
  constructor(private readonly configService: SmartRulesConfigService) {}

  @Get()
  getConfig(): Promise<SmartRulesConfig> {
    return this.configService.getConfig();
  }

  @Put()
  updateConfig(@Body() dto: UpdateSmartRulesDto): Promise<SmartRulesConfig> {
    return this.configService.updateConfig(dto as unknown as SmartRulesConfig);
  }
}
