import { useQuery } from '@tanstack/react-query';
import { fetchCurrentUser } from '../api/session';
import { AuthUser, hasMinimumRole, MUTATION_ROLE, UserRole } from '../types/auth';

export const CURRENT_USER_QUERY_KEY = ['current-user'] as const;

export const useCurrentUser = () =>
  useQuery({
    queryKey: CURRENT_USER_QUERY_KEY,
    queryFn: fetchCurrentUser,
    staleTime: 5 * 60_000,
    retry: false,
  });

export interface Permission {
  allowed: boolean;
  /** Raison affichable quand l'action est indisponible (infobulle). */
  reason: string | null;
}

/** Libellé d'une permission ; pur, testable sans React. */
export const describePermission = (
  user: AuthUser | null | undefined,
  isLoading: boolean,
  minimum: UserRole,
): Permission => {
  if (hasMinimumRole(user, minimum)) {
    return { allowed: true, reason: null };
  }
  if (isLoading) {
    return { allowed: false, reason: 'Vérification des droits…' };
  }
  return {
    allowed: false,
    reason:
      minimum === 'ADMIN'
        ? 'Action réservée aux administrateurs'
        : `Action réservée au rôle ${minimum} ou supérieur`,
  };
};

/**
 * Permission d'affichage d'une action mutante. Désactivée tant que le rôle n'est pas connu
 * (fail-closed) ; le backend reste la seule autorité.
 */
export const usePermission = (minimum: UserRole = MUTATION_ROLE): Permission => {
  const { data, isLoading } = useCurrentUser();
  return describePermission(data, isLoading, minimum);
};
