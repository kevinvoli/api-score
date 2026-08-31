import {
  isPartitionMarket,
  mapApifootballOddsEntry,
} from './apifootball-odds.mapper';
import { APIFOOTBALL_ODDS_SAMPLE } from './__fixtures__/apifootball-odds.sample';

describe('mapApifootballOddsEntry', () => {
  it('extrait le marché 1X2', () => {
    const groups = mapApifootballOddsEntry(APIFOOTBALL_ODDS_SAMPLE[0]);

    expect(groups.get('1X2')).toEqual([
      { outcome: 'HOME', oddValue: 1.48 },
      { outcome: 'DRAW', oddValue: 3.2 },
      { outcome: 'AWAY', oddValue: 8.2 },
    ]);
  });

  it('extrait la double chance', () => {
    const groups = mapApifootballOddsEntry(APIFOOTBALL_ODDS_SAMPLE[0]);

    expect(groups.get('DOUBLE_CHANCE')).toEqual([
      { outcome: 'HOME_DRAW', oddValue: 1.01 },
      { outcome: 'HOME_AWAY', oddValue: 1.25 },
      { outcome: 'DRAW_AWAY', oddValue: 2.5 },
    ]);
  });

  it('extrait une ligne Over/Under', () => {
    const groups = mapApifootballOddsEntry(APIFOOTBALL_ODDS_SAMPLE[0]);

    expect(groups.get('OU_1.5')).toEqual([
      { outcome: 'OVER', oddValue: 1.55 },
      { outcome: 'UNDER', oddValue: 2.15 },
    ]);
  });

  it('extrait une paire de handicap asiatique complète', () => {
    const groups = mapApifootballOddsEntry(APIFOOTBALL_ODDS_SAMPLE[0]);

    expect(groups.get('AH_-1')).toEqual([
      { outcome: 'HOME', oddValue: 1.91 },
      { outcome: 'AWAY', oddValue: 1.8 },
    ]);
  });

  it('ignore silencieusement les champs vides (BTTS non proposé)', () => {
    const groups = mapApifootballOddsEntry(APIFOOTBALL_ODDS_SAMPLE[0]);

    expect(groups.has('BTTS')).toBe(false);
  });

  it('extrait BTTS quand proposé', () => {
    const groups = mapApifootballOddsEntry(APIFOOTBALL_ODDS_SAMPLE[1]);

    expect(groups.get('BTTS')).toEqual([
      { outcome: 'YES', oddValue: 2.62 },
      { outcome: 'NO', oddValue: 1.4 },
    ]);
  });

  it('ah+0.5 (paire impossible côté apifootball) ne produit ni crash ni ligne aberrante : seul HOME est présent, jamais AWAY', () => {
    const groups = mapApifootballOddsEntry(APIFOOTBALL_ODDS_SAMPLE[1]);

    expect(groups.get('AH_+0.5')).toEqual([
      { outcome: 'HOME', oddValue: 2.05 },
    ]);
  });
});

describe('isPartitionMarket', () => {
  it('1X2, OU, AH et BTTS sont des partitions', () => {
    expect(isPartitionMarket('1X2')).toBe(true);
    expect(isPartitionMarket('OU_2.5')).toBe(true);
    expect(isPartitionMarket('AH_-1')).toBe(true);
    expect(isPartitionMarket('BTTS')).toBe(true);
  });

  it("la double chance n'est pas une partition", () => {
    expect(isPartitionMarket('DOUBLE_CHANCE')).toBe(false);
  });
});
