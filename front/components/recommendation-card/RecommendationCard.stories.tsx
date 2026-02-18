import type { Meta, StoryObj } from '@storybook/react';
import { RecommendationCard } from './RecommendationCard';

const meta: Meta<typeof RecommendationCard> = {
  title: 'Live/RecommendationCard',
  component: RecommendationCard,
  tags: ['autodocs'],
  args: {
    recommendation: {
      id: 'rec-1',
      marketType: 'Match Winner',
      fixtureId: '123',
      selection: 'Paris FC (Home)',
      currentOdd: 2.15,
      minAcceptableOdd: 2.0,
      edgePct: 8.2,
      confidenceScore: 88,
      reasons: ['Momentum part en faveur', 'Statistiques home dominantes', 'Value edge confirmé'],
      riskFlags: [],
      status: 'ACTIVE'
    }
  }
};

export default meta;

type Story = StoryObj<typeof RecommendationCard>;

export const Default: Story = {};

export const Risky: Story = {
  args: {
    recommendation: {
      ...meta.args?.recommendation,
      id: 'rec-2',
      status: 'REJECTED',
      confidenceScore: 52,
      riskFlags: ['Stade humide', 'Market drift']
    }
  }
};
