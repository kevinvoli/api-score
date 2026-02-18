import type { Meta, StoryObj } from '@storybook/react';
import { MatchCardLive } from '../components/match-card-live/MatchCardLive';
import { RecommendationCard } from '../components/recommendation-card/RecommendationCard';
import { SystemStatusPill } from '../components/system-status-pill/SystemStatusPill';
import { sampleLiveFixture, sampleRecommendations } from '../mocks/mockData';

const meta: Meta = {
  title: 'Pages/LiveCommandCenter',
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div
        style={{
          display: 'grid',
          gap: '16px',
          gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 1.5fr)',
          padding: '24px'
        }}
      >
        <Story />
      </div>
    )
  ]
};

export default meta;

export const LiveView: StoryObj = {
  render: () => (
    <>
      <div>
        <SystemStatusPill status="Healthy" message="Live ingestion OK" traceId="sync-123" />
        <MatchCardLive
          fixture={{
            ...sampleLiveFixture,
            homeTeamName: sampleLiveFixture.homeTeamName,
            awayTeamName: sampleLiveFixture.awayTeamName
          }}
          momentum={{
            homePressureIndex: 58,
            awayPressureIndex: 45,
            dominantSide: 'home'
          }}
          confidence={84}
          dataQualityFlags={['DATA LIVE', 'QUALITY OK']}
          riskFlags={[]}
          onAnalyze={() => console.log('Analyser')}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {sampleRecommendations.map((recommendation) => (
          <RecommendationCard
            key={recommendation.id}
            recommendation={{
              ...recommendation,
              minAcceptableOdd: recommendation.minAcceptableOdd,
              status: 'ACTIVE'
            }}
            onAddCoupon={() => undefined}
          />
        ))}
      </div>
    </>
  )
};
