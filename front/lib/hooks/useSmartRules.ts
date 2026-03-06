import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchSmartRules, updateSmartRules, SmartRulesConfig } from '../api/smartRules';

const QUERY_KEY = ['smart-rules-config'];

export const useSmartRules = () =>
  useQuery({
    queryKey: QUERY_KEY,
    queryFn:  fetchSmartRules,
    staleTime: 0,
  });

export const useUpdateSmartRules = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: SmartRulesConfig) => updateSmartRules(config),
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEY, data);
    },
  });
};
