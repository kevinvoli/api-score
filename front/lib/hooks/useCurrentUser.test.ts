import { describe, expect, it } from 'vitest';
import { AuthUser, hasMinimumRole, MUTATION_ROLE } from '../types/auth';
import { describePermission } from './useCurrentUser';

const user = (role: AuthUser['role']): AuthUser => ({ id: 'u', email: 'u@x.y', role });

describe('hasMinimumRole()', () => {
  it('suit la hiérarchie VIEWER < OPERATOR < ADMIN', () => {
    expect(hasMinimumRole(user('ADMIN'), 'ADMIN')).toBe(true);
    expect(hasMinimumRole(user('ADMIN'), 'VIEWER')).toBe(true);
    expect(hasMinimumRole(user('OPERATOR'), 'OPERATOR')).toBe(true);
    expect(hasMinimumRole(user('OPERATOR'), 'ADMIN')).toBe(false);
    expect(hasMinimumRole(user('VIEWER'), 'OPERATOR')).toBe(false);
  });

  it('refuse un utilisateur inconnu (chargement ou déconnecté)', () => {
    expect(hasMinimumRole(null, 'VIEWER')).toBe(false);
    expect(hasMinimumRole(undefined, 'VIEWER')).toBe(false);
  });
});

describe('describePermission()', () => {
  it('les mutations exigent ADMIN, comme le défaut fail-closed du backend', () => {
    expect(MUTATION_ROLE).toBe('ADMIN');
    expect(describePermission(user('ADMIN'), false, MUTATION_ROLE)).toEqual({ allowed: true, reason: null });
    expect(describePermission(user('OPERATOR'), false, MUTATION_ROLE)).toEqual({
      allowed: false,
      reason: 'Action réservée aux administrateurs',
    });
    expect(describePermission(user('VIEWER'), false, MUTATION_ROLE).allowed).toBe(false);
  });

  it('désactive pendant le chargement du rôle (fail-closed)', () => {
    expect(describePermission(undefined, true, 'ADMIN')).toEqual({
      allowed: false,
      reason: 'Vérification des droits…',
    });
  });

  it('nomme le rôle requis hors ADMIN', () => {
    expect(describePermission(user('VIEWER'), false, 'OPERATOR').reason).toBe(
      'Action réservée au rôle OPERATOR ou supérieur',
    );
  });
});
