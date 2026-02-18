import type { Meta, StoryObj } from '@storybook/react';
import { SystemStatusPill } from './SystemStatusPill';

const meta: Meta<typeof SystemStatusPill> = {
  title: 'Core/SystemStatusPill',
  component: SystemStatusPill,
  tags: ['autodocs'],
  args: {
    message: 'Live ingestion OK',
    status: 'Healthy',
    traceId: 'abc123'
  }
};

export default meta;

type Story = StoryObj<typeof SystemStatusPill>;

export const Healthy: Story = {};

export const Degraded: Story = {
  args: {
    status: 'Degraded',
    message: 'Provider rate limit',
    traceId: 'trace-456'
  }
};

export const Syncing: Story = {
  args: {
    status: 'Syncing',
    message: 'Fixtures synchronisation',
    traceId: 'sync-789'
  }
};
