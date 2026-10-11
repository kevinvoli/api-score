import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SessionPublic } from '../common/decorators/session-public.decorator';
import { AuthService } from './auth.service';
import {
  AuthenticatedPrincipal,
  AuthUserResponse,
  LoginResponse,
} from './auth.types';
import { LoginDto } from './dto/login.dto';
import { extractBearerToken } from '../common/guards/session.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @SessionPublic()
  login(@Body() dto: LoginDto): Promise<LoginResponse> {
    return this.authService.login(dto);
  }

  @Post('logout')
  @SessionPublic()
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(
    @Headers('authorization') authorization: string | string[] | undefined,
  ): Promise<void> {
    return this.authService.revokeSessionByToken(
      extractBearerToken(authorization),
    );
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedPrincipal): AuthUserResponse {
    return { id: user.id, email: user.email, role: user.role };
  }
}
