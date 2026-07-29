import { normalizeApifootballStatus } from './status.utils';

describe('normalizeApifootballStatus()', () => {
  it('mappe les libellés terminaux vers les codes attendus par la résolution', () => {
    // Sans ces deux mappings, la branche LOST de resolveCouponOutcome est
    // inatteignable et le taux de réussite des coupons vaut toujours 100 %.
    expect(normalizeApifootballStatus('Finished')).toBe('FT');
    expect(normalizeApifootballStatus('Half Time')).toBe('HT');
  });

  it('normalise les minutes, y compris le temps additionnel sans chiffre', () => {
    expect(normalizeApifootballStatus('75')).toBe('LIVE');
    expect(normalizeApifootballStatus('45+2')).toBe('LIVE');
    expect(normalizeApifootballStatus('90+')).toBe('LIVE');
    expect(normalizeApifootballStatus('45+')).toBe('LIVE');
  });

  it('conserve les autres conventions existantes', () => {
    expect(normalizeApifootballStatus('')).toBe('NS');
    expect(normalizeApifootballStatus('Cancelled')).toBe('CANC');
    expect(normalizeApifootballStatus('Interrupted')).toBe('INT');
    expect(normalizeApifootballStatus('Pen.')).toBe('PEN');
    expect(normalizeApifootballStatus(null)).toBeNull();
    expect(normalizeApifootballStatus(undefined)).toBeNull();
    expect(normalizeApifootballStatus('FT')).toBe('FT');
  });
});
