import type { Meta, StoryObj } from '@storybook/react';
import { MatchCardLive } from './MatchCardLive';

const meta: Meta<typeof MatchCardLive> = {
  title: 'Live/MatchCardLive',
  component: MatchCardLive,
  tags: ['autodocs'],
  args: {
    fixture: {
      providerFixtureId: '789',
      homeTeamName: 'Paris FC',
      awayTeamName: 'Lyon FC',
      scoreHome: 1,
      scoreAway: 2,
      elapsed: 67,
      statusShort: '2H'
    },
    momentum: {
      homePressureIndex: 64,
      awayPressureIndex: 42,
      dominantSide: 'home'
    },
    confidence: 82,
    dataQualityFlags: ['LIVE DATA', 'QUALITY OK'],
    riskFlags: []
  }
};

export default meta;

type Story = StoryObj<typeof MatchCardLive>;

export const Default: Story = {};

export const HighRisk: Story = {
  args: {
    riskFlags: ['RISK FLAGGED'],
    confidence: 45,
    dataQualityFlags: ['STATS STALE']
  }
};
