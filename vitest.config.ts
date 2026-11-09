import { defineConfig } from 'vitest/config';
// @ts-expect-error - plain ESM helper without type declarations
import { cacheDir } from './scripts/cacheDir.mjs';

// One `vitest run` covers every package (Requirement 44.1). Caches live outside OneDrive.
export default defineConfig({
  cacheDir: cacheDir('vite-root') as string,
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'sim',
          root: './packages/sim',
          environment: 'node',
          testTimeout: 180_000,
          include: ['test/**/*.test.ts'],
          setupFiles: ['../../scripts/fcSetup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'shared',
          root: './packages/shared',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          setupFiles: ['../../scripts/fcSetup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'web',
          root: './apps/web',
          environment: 'happy-dom',
          include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
          setupFiles: ['../../scripts/fcSetup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'server',
          root: './apps/server',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          setupFiles: ['../../scripts/fcSetup.ts'],
        },
      },
    ],
  },
});
