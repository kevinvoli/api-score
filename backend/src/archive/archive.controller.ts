import { Controller, Get, Query } from '@nestjs/common';
import { ArchiveService } from './archive.service';
import { GetPayloadsQueryDto } from './dto/get-payloads-query.dto';

@Controller('archive')
export class ArchiveController {
  constructor(private readonly archiveService: ArchiveService) {}

  @Get('payloads')
  getPayloads(@Query() query: GetPayloadsQueryDto) {
    return this.archiveService.getPayloads(query);
  }
}
