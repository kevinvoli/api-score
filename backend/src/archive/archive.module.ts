import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiFootballPayload } from '../database/entities/api-football-payload.entity';
import { ArchiveController } from './archive.controller';
import { ArchiveService } from './archive.service';

@Module({
  imports: [TypeOrmModule.forFeature([ApiFootballPayload])],
  controllers: [ArchiveController],
  providers: [ArchiveService],
})
export class ArchiveModule {}
