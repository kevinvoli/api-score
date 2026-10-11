import { defineConfig } from 'vitest/config';

export default defineConfig({
  // tsconfig garde `jsx: preserve` pour Next.js ; les tests de composants (*.test.tsx) ont
  // besoin d'une transformation JSX explicite.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules', '.next'],
  },
});
