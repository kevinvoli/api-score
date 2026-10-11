import { SetMetadata } from '@nestjs/common';

export const IS_SESSION_PUBLIC_KEY = 'isSessionPublic';
export const SessionPublic = () => SetMetadata(IS_SESSION_PUBLIC_KEY, true);
