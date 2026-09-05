
import base from '../../vitest.config.js';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    projects: undefined,
    setupFiles: ['./tests/setup.db.js'],
    include: ["tests/fixtures/db-tier-canary/bypass-attempt.canaryspec.mjs"],
    passWithNoTests: false,
  },
});
