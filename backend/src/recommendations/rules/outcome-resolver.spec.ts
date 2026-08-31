import {
  FinalMatchState,
  ResolvableBet,
  resolveOutcome,
} from './outcome-resolver';

function bet(marketType: string, isHomeTeam = true): ResolvableBet {
  return { marketType, isHomeTeam };
}

function state(overrides: Partial<FinalMatchState> = {}): FinalMatchState {
  return {
    statusShort: 'FT',
    scoreHome: 0,
    scoreAway: 0,
    htScoreHome: 0,
    htScoreAway: 0,
    ...overrides,
  };
}

describe('resolveOutcome()', () => {
  describe('Buts 1ère mi-temps', () => {
    it('WON dès un but en live pendant la 1H', () => {
      const s = state({ statusShort: '1H', scoreHome: 1, htScoreHome: null });
      expect(resolveOutcome(bet('Buts 1ère mi-temps'), s)).toBe('WON');
    });

    it('null pendant la 1H sans but (pas de LOST anticipé)', () => {
      const s = state({ statusShort: '1H', scoreHome: 0, htScoreHome: null });
      expect(resolveOutcome(bet('Buts 1ère mi-temps'), s)).toBeNull();
    });

    it('LOST une fois la mi-temps passée avec HT=0', () => {
      const s = state({ statusShort: 'HT', htScoreHome: 0 });
      expect(resolveOutcome(bet('Buts 1ère mi-temps'), s)).toBe('LOST');
    });

    it('WON après la mi-temps si HT>0, côté extérieur', () => {
      const s = state({ statusShort: 'FT', htScoreAway: 2 });
      expect(resolveOutcome(bet('Buts 1ère mi-temps', false), s)).toBe('WON');
    });

    it('null si le score HT est manquant après la mi-temps', () => {
      const s = state({ statusShort: 'FT', htScoreHome: null });
      expect(resolveOutcome(bet('Buts 1ère mi-temps'), s)).toBeNull();
    });
  });

  describe('Buts match', () => {
    it('WON immédiat dès que l’équipe a marqué, match en cours', () => {
      const s = state({ statusShort: '2H', scoreHome: 1 });
      expect(resolveOutcome(bet('Buts match'), s)).toBe('WON');
    });

    it('LOST seulement au coup de sifflet final avec score 0', () => {
      expect(
        resolveOutcome(bet('Buts match'), state({ statusShort: '2H' })),
      ).toBeNull();
      expect(
        resolveOutcome(bet('Buts match'), state({ statusShort: 'FT' })),
      ).toBe('LOST');
    });
  });

  describe('Buts 2ème mi-temps', () => {
    it('WON dès un but en 2MT (score courant − score HT > 0)', () => {
      const s = state({ statusShort: '2H', scoreHome: 2, htScoreHome: 1 });
      expect(resolveOutcome(bet('Buts 2ème mi-temps'), s)).toBe('WON');
    });

    it('null en 2H tant que rien n’est marqué depuis la MT', () => {
      const s = state({ statusShort: '2H', scoreHome: 1, htScoreHome: 1 });
      expect(resolveOutcome(bet('Buts 2ème mi-temps'), s)).toBeNull();
    });

    it('LOST au coup de sifflet final sans but en 2MT', () => {
      const s = state({ statusShort: 'FT', scoreHome: 1, htScoreHome: 1 });
      expect(resolveOutcome(bet('Buts 2ème mi-temps'), s)).toBe('LOST');
    });

    it('HT inconnu : WON si match fini avec score > 0, sinon indécidable', () => {
      const fini = state({
        statusShort: 'FT',
        scoreHome: 1,
        htScoreHome: null,
      });
      expect(resolveOutcome(bet('Buts 2ème mi-temps'), fini)).toBe('WON');

      const enCours = state({
        statusShort: '2H',
        scoreHome: 1,
        htScoreHome: null,
      });
      expect(resolveOutcome(bet('Buts 2ème mi-temps'), enCours)).toBeNull();
    });
  });

  describe('statuts particuliers', () => {
    it.each(['CANC', 'PST', 'INT', 'SUSP', 'ABD', 'TBD', 'WO'])(
      'statut void %s → LOST quel que soit le marché',
      (statusShort) => {
        const s = state({ statusShort, scoreHome: 3 });
        expect(resolveOutcome(bet('Buts match'), s)).toBe('LOST');
        expect(resolveOutcome(bet('Buts 1ère mi-temps'), s)).toBe('LOST');
        expect(resolveOutcome(bet('Buts 2ème mi-temps'), s)).toBe('LOST');
      },
    );

    it('marché inconnu → null', () => {
      expect(resolveOutcome(bet('1X2'), state())).toBeNull();
    });

    it('statut non décidable (NS) → null', () => {
      const s = state({ statusShort: 'NS', scoreHome: null, scoreAway: null });
      expect(resolveOutcome(bet('Buts match'), s)).toBeNull();
    });
  });
});
