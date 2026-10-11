import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import {
  AuthenticatedPrincipal,
  SESSION_TOKEN_LENGTH,
  UserRole,
} from './auth.types';

describe('AuthController', () => {
  let controller: AuthController;
  let app: INestApplication;
  const authService = {
    login: jest.fn(),
    logout: jest.fn(),
    revokeSessionByToken: jest.fn(),
  };
  const principal: AuthenticatedPrincipal = {
    sessionId: 'session-1',
    id: 'user-1',
    email: 'admin@example.com',
    role: UserRole.ADMIN,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();
    controller = module.get(AuthController);
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('renvoie le contrat de login fourni par le service', async () => {
    const response = {
      sessionToken: 'token',
      expiresAt: '2026-10-03T12:00:00.000Z',
      user: {
        id: principal.id,
        email: principal.email,
        role: principal.role,
      },
    };
    authService.login.mockResolvedValue(response);

    await expect(
      controller.login({
        email: principal.email,
        password: 'correct-password-123',
      }),
    ).resolves.toEqual(response);
  });

  it('répond 204 au premier logout puis à son rejeu avec le même jeton', async () => {
    const sessionToken = 'a'.repeat(SESSION_TOKEN_LENGTH);
    authService.revokeSessionByToken.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('authorization', `Bearer ${sessionToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('authorization', `Bearer ${sessionToken}`)
      .expect(204);

    expect(authService.revokeSessionByToken).toHaveBeenNthCalledWith(
      1,
      sessionToken,
    );
    expect(authService.revokeSessionByToken).toHaveBeenNthCalledWith(
      2,
      sessionToken,
    );
    expect(authService.logout).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'un email invalide',
      body: { email: 'invalide', password: 'correct-password-123' },
    },
    {
      label: 'un mot de passe trop court',
      body: { email: principal.email, password: 'court' },
    },
    {
      label: 'un champ inconnu',
      body: {
        email: principal.email,
        password: 'correct-password-123',
        unexpected: true,
      },
    },
  ])('rejette $label via le ValidationPipe HTTP', async ({ body }) => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send(body)
      .expect(400);
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('renvoie le profil sans identifiant de session ni secret', () => {
    expect(controller.me(principal)).toEqual({
      id: principal.id,
      email: principal.email,
      role: principal.role,
    });
  });
});
