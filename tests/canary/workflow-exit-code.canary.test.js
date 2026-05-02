import { describe, it, expect } from 'vitest';

/**
 * Canary regression test for SD-LEO-INFRA-VITEST-EXITS-61S-001 FR-3.
 *
 * Default: skipped. Activate by setting CANARY_TEST=1 in the env.
 *
 * When activated, the test deliberately fails. The contract being verified
 * is that .github/workflows/test-coverage.yml exits 1 AND that the JSON
 * reporter records `# fail 1` — proving the workflow correctly distinguishes
 * real test failures from the silent teardown class this SD addresses.
 *
 * NEVER commit a workflow change that sets CANARY_TEST=1 on a merge path.
 */
const CANARY_ON = process.env.CANARY_TEST === '1';

describe('canary: workflow exit code on real failure', () => {
  it.skipIf(!CANARY_ON)('deliberately fails when CANARY_TEST=1 to prove CI exits 1', () => {
    expect(true).toBe(false);
  });
});
