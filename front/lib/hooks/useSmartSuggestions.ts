import { useQuery } from '@tanstack/react-query';
import { fetchSmartSuggestions } from '../api/smartSuggestions';

export const useSmartSuggestions = () =>
  useQuery({
    queryKey: ['smart-suggestions'],
    queryFn: fetchSmartSuggestions,
    staleTime: 15_000,   // rafraîchit toutes les 15s (même rythme que le live)
    gcTime:    60_000,
  });
