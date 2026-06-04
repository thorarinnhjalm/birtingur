import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 20000,
    include: ['tests/**/*.test.ts'],
    // Tests share a single Firestore emulator and several files wipe the whole
    // database in beforeEach (helpers/emulator.ts). Running files in parallel
    // lets one file's clear() delete another file's data mid-test, causing
    // flaky 404s. Force sequential file execution to keep emulator state isolated.
    fileParallelism: false,
    env: {
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      GCLOUD_PROJECT: 'ada-test',
    },
  },
});
