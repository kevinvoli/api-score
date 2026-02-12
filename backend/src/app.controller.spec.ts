import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  let appService: AppService;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: {
            getLives: jest.fn(),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
    appService = app.get<AppService>(AppService);
  });

  describe('getLives', () => {
    it('should return live matches', async () => {
      const mockLives = [{ id: 1, homeTeam: 'Team A', awayTeam: 'Team B' }];
      jest.spyOn(appService, 'getLives').mockResolvedValue(mockLives);

      expect(await appController.getLives()).toBe(mockLives);
    });
  });
});
