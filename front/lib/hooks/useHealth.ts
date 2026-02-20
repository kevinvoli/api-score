import { useQuery } from '@tanstack/react-query';
import { fetchHealth } from '../api/monitoring';

export const useHealth = () =>
  useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    staleTime: 10000,
  });
