export type UserRole = 'VIEWER' | 'OPERATOR' | 'ADMIN';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface LoginRequestBody {
  email: string;
  password: string;
}

/** Réponse brute du backend NestJS (`POST /v1/auth/login`) — jamais exposée au navigateur telle quelle. */
export interface LoginBackendResponse {
  sessionToken: string;
  expiresAt: string;
  user: AuthUser;
}

/** Réponse du BFF (`POST /api/auth/login`, `GET /api/auth/me`) — sans le `sessionToken`. */
export interface LoginResponseBody {
  user: AuthUser;
}

export interface MeResponseBody {
  user: AuthUser;
}

export interface BffErrorBody {
  error: string;
}

export const SESSION_CSRF_COOKIE_NAME = 'csrf_token';
export const SESSION_CSRF_HEADER_NAME = 'X-CSRF-Token';

const USER_ROLES: readonly UserRole[] = ['VIEWER', 'OPERATOR', 'ADMIN'];

const ROLE_LEVEL: Record<UserRole, number> = { VIEWER: 1, OPERATOR: 2, ADMIN: 3 };

/**
 * Miroir d'affichage de la hiérarchie backend (VIEWER < OPERATOR < ADMIN). Ne sert qu'à
 * masquer ou désactiver une action : l'autorisation réelle reste vérifiée par le backend.
 * Utilisateur inconnu (chargement, session absente) → refusé.
 */
export const hasMinimumRole = (user: AuthUser | null | undefined, minimum: UserRole): boolean =>
  !!user && ROLE_LEVEL[user.role] >= ROLE_LEVEL[minimum];

/** Rôle exigé par le backend pour toute mutation non classifiée (fail-closed, lot 1). */
export const MUTATION_ROLE: UserRole = 'ADMIN';

const isUserRole = (value: unknown): value is UserRole =>
  typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);

export const isAuthUser = (value: unknown): value is AuthUser => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.email === 'string' &&
    isUserRole(record.role)
  );
};

export const isLoginRequestBody = (value: unknown): value is LoginRequestBody => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.email === 'string' && typeof record.password === 'string';
};

export const isLoginBackendResponse = (value: unknown): value is LoginBackendResponse => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.sessionToken === 'string' &&
    typeof record.expiresAt === 'string' &&
    isAuthUser(record.user)
  );
};

export const isBffErrorBody = (value: unknown): value is BffErrorBody =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Record<string, unknown>).error === 'string';
