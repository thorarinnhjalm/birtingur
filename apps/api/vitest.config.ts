import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 20000,
    include: ['tests/**/*.test.ts'],
    env: {
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      GCLOUD_PROJECT: 'ada-test',
    },
  },
});
