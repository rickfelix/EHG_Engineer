// Worktree-local vitest config: the root config excludes **/.worktrees/** (so the main
// repo's runner never scans worktrees), which also blocks running tests FROM a worktree.
// This override scopes to the SD's own test files. Not used by CI (root config wins there).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/org/**/*.test.mjs'],
    exclude: ['**/node_modules/**'],
  },
});
