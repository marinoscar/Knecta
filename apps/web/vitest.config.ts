import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { createRequire } from 'module';

// Use createRequire to obtain a CJS-compatible require() in this ESM context.
// resolvePackage() locates packages dynamically so that the config works
// correctly regardless of directory depth — both in the main checkout
// (apps/web is 2 levels deep) and in git worktrees (4 levels deep).
const require = createRequire(import.meta.url);
const reactDir = resolve(require.resolve('react/package.json'), '..');
const reactDomDir = resolve(require.resolve('react-dom/package.json'), '..');
const testingLibReactDir = resolve(
  require.resolve('@testing-library/react/package.json'),
  '..',
);

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist'],
    env: {
      VITE_API_BASE_URL: 'http://localhost:3000/api',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules',
        'src/__tests__',
        '**/*.d.ts',
        '**/*.config.*',
        'src/main.tsx',
      ],
      thresholds: {
        lines: 70,
        branches: 70,
        functions: 70,
        statements: 70,
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      // Force single React instance in the monorepo test environment.
      // Pinning all imports to the resolved package location ensures that
      // @testing-library/react and application code share the same React,
      // regardless of whether running from the main checkout or a worktree.
      'react': reactDir,
      'react-dom': reactDomDir,
      '@testing-library/react': testingLibReactDir,
    },
    dedupe: ['react', 'react-dom', '@testing-library/react'],
  },
});
