'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { logout } from '../../lib/api/session';
import { useCurrentUser } from '../../lib/hooks/useCurrentUser';
import type { UserRole } from '../../lib/types/auth';
import styles from './SessionMenu.module.css';

const ROLE_LABEL: Record<UserRole, string> = {
  VIEWER: 'Lecture',
  OPERATOR: 'Opérateur',
  ADMIN: 'Admin',
};

/**
 * Identité de la session et déconnexion. Ne s'affiche que pour une session valide : sur
 * `/login` (même layout), `/api/auth/me` répond 401 et le composant reste vide, sans redirection.
 */
export function SessionMenu() {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  if (!user) {
    return null;
  }

  const handleLogout = async (): Promise<void> => {
    if (pending) return;
    setPending(true);
    try {
      await logout();
    } finally {
      // Même si le BFF est injoignable, on quitte l'interface : aucune donnée en cache ne doit
      // survivre à la déconnexion, et /login reposera de nouveaux cookies.
      queryClient.clear();
      window.location.assign('/login');
    }
  };

  return (
    <div className={styles.menu}>
      <span className={styles.email} title={user.email}>
        {user.email}
      </span>
      <span className={`${styles.role} ${styles[user.role]}`}>{ROLE_LABEL[user.role]}</span>
      <button
        type="button"
        className={styles.logout}
        onClick={() => void handleLogout()}
        disabled={pending}
      >
        {pending ? 'Déconnexion…' : 'Se déconnecter'}
      </button>
    </div>
  );
}
