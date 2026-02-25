import { useQuery } from '@tanstack/react-query';
import { fetchLiveFixtures } from '../api/live';
import { useUiControlsStore } from '../state/uiControls';

type LiveFixturesResponse = Awaited<ReturnType<typeof fetchLiveFixtures>>;

export const useLiveFixtures = (params?: Parameters<typeof fetchLiveFixtures>[0]) => {
  const intervalMs = useUiControlsStore((s) => s.liveRefreshIntervalMs);

  return useQuery<LiveFixturesResponse>({
    queryKey: ['live-fixtures', params],
    queryFn: () => fetchLiveFixtures(params),
    staleTime: 5000,
    gcTime: 1000 * 60,
    refetchInterval: intervalMs > 0 ? intervalMs : false,
    refetchIntervalInBackground: false,
  });
};

// Export constant for the default interval (used by countdown display)
export const DEFAULT_LIVE_REFRESH_INTERVAL_MS = 30_000;
