import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { normalizeAuthEmail } from '../auth-email';

export class LoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeAuthEmail(value) : value,
  )
  @IsEmail()
  @MaxLength(320)
  email: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password: string;
}
