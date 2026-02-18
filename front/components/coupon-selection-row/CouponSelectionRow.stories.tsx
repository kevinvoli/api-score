import type { Meta, StoryObj } from '@storybook/react';
import { CouponSelectionRow } from './CouponSelectionRow';

const meta: Meta<typeof CouponSelectionRow> = {
  title: 'Coupon/CouponSelectionRow',
  component: CouponSelectionRow,
  tags: ['autodocs']
};

export default meta;

type Story = StoryObj<typeof CouponSelectionRow>;

export const Default: Story = {
  args: {
    selection: 'Paris FC (Home)',
    marketType: 'Match Winner',
    odd: 2.15,
    edgePct: 8.2,
    confidence: 88,
    riskFlags: [],
    correlation: 'low'
  }
};

export const Correlated: Story = {
  args: {
    selection: 'Goals Over 2.5',
    marketType: 'Over/Under',
    odd: 1.65,
    edgePct: 6.1,
    confidence: 74,
    riskFlags: ['Strong correlation'],
    correlation: 'high'
  }
};
