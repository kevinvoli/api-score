import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiUsageLog } from './entities/api-usage-log.entity';
import { AppRuntimeState } from './entities/app-runtime-state.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DB_URL'),
        entities: [ApiUsageLog, AppRuntimeState],
        synchronize: false,
        logging: false,
      }),
    }),
    TypeOrmModule.forFeature([ApiUsageLog, AppRuntimeState]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
