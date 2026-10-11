export enum UserRole {
  VIEWER = 'VIEWER',
  OPERATOR = 'OPERATOR',
  ADMIN = 'ADMIN',
}

export interface AuthUserResponse {
  id: string;
  email: string;
  role: UserRole;
}

export interface LoginResponse {
  sessionToken: string;
  expiresAt: string;
  user: AuthUserResponse;
}

export interface AuthenticatedPrincipal extends AuthUserResponse {
  sessionId: string;
}

export interface RequestWithPrincipal {
  method: string;
  headers?: Record<string, string | string[] | undefined>;
  authUser?: AuthenticatedPrincipal;
}

export const SESSION_TOKEN_BYTES = 32;
export const SESSION_TOKEN_LENGTH =
  Buffer.alloc(SESSION_TOKEN_BYTES).toString('base64url').length;
