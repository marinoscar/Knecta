import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

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
      // The worktree has a separate node_modules tree which causes duplicate
      // React instances. Pin all imports to the root monorepo's single copy
      // so that @testing-library/react and application code share the same React.
      'react': resolve(__dirname, '../../../../node_modules/react'),
      'react-dom': resolve(__dirname, '../../../../node_modules/react-dom'),
      '@testing-library/react': resolve(
        __dirname,
        '../../../../node_modules/@testing-library/react',
      ),
    },
    dedupe: ['react', 'react-dom', '@testing-library/react'],
  },
});
