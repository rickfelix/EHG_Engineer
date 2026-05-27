// QF-20260526-279: prevent regression of the inverse-negation STALE/DEAD render
// at scripts/stale-session-sweep.cjs:L1385. The prior filter
//   s.status !== 'ACTIVE' && s.status !== 'ALIVE_NO_HEARTBEAT'
// missed ALIVE_SOURCE_SIDE, so a session in that state was rendered in BOTH
// the ACTIVE WORKERS list and the STALE/DEAD list (cosmetic dup, 7th witness
// of PAT-LEO-INFRA-WCA-001 / writer-consumer asymmetry).
//
// Static-pattern test mirrors create-quick-fix-insert-order.test.js — much
// cheaper than mocking classifySessions + the full sweep render path.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../../../scripts/stale-session-sweep.cjs');

describe('QF-20260526-279: STALE/DEAD render consumes CLAIM_HOLDING_STATUSES', () => {
  const code = fs.readFileSync(SRC, 'utf8');

  it('the stale filter does not use the prior inverse-negation pattern', () => {
    // Must not contain the exact buggy expression that omitted ALIVE_SOURCE_SIDE.
    expect(code).not.toMatch(
      /s\.status\s*!==\s*['"]ACTIVE['"]\s*&&\s*s\.status\s*!==\s*['"]ALIVE_NO_HEARTBEAT['"]/,
    );
  });

  it('the stale filter routes through CLAIM_HOLDING_STATUSES (single SSOT)', () => {
    // The `const stale = classified.filter(...)` line must reference the shared set.
    const staleAssignRe = /const\s+stale\s*=\s*classified\.filter\([^)]*CLAIM_HOLDING_STATUSES\.has/;
    expect(code).toMatch(staleAssignRe);
  });

  it('CLAIM_HOLDING_STATUSES is imported from the lib/claim/ SSOT', () => {
    expect(code).toMatch(/require\(\s*['"]\.\.\/lib\/claim\/holding-statuses\.cjs['"]\s*\)/);
    expect(code).toMatch(/CLAIM_HOLDING_STATUSES/);
  });
});
