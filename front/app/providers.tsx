'use client';

import { ReactNode, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ProviderExplorerProvider } from '../lib/providerExplorerContext';

const defaultQueryOptions = {
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
};

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient(defaultQueryOptions));

  return (
    <QueryClientProvider client={queryClient}>
      <ProviderExplorerProvider>{children}</ProviderExplorerProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
