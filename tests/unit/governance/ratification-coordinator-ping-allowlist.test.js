/**
 * SD-LEO-INFRA-CHAIRMAN-RATIFICATION-LEDGER-001 FR-3 / US-003 AC4 / TS-13.
 *
 * The coordinator leg deliberately does NOT add a QUIET_TICK_RATIFICATION_STALE allowlist token
 * (unlike Adam's — see scripts/adam-startup-check.mjs). Instead it reuses the pre-existing
 * QUIET_TICK_PING actionable token, already allowlisted in scripts/coordinator-startup-check.mjs's
 * STANDARD_LOOPS 'quiet-tick' entry. That substitution is real (verified: coordinator-quiet-tick.mjs
 * emits `QUIET_TICK_PING=ratification-stale ...`) but was otherwise UNPINNED — an editor narrowing
 * the coordinator's PING allowlist, or renaming the emitted token, would silently break FR-3's
 * coordinator leg with no test catching it (VALIDATION finding, PLAN_VERIFICATION evidence row
 * 17cd65d3-f3bc-45e1-8949-7e7632e55237).
 *
 * Source-pin, not an import: coordinator-startup-check.mjs is a prompt-string module unsafe to
 * import for its side effects the same way adam-quiet-tick's helpers are; a plain string-content
 * assertion is exactly this repo's established SRC-PIN convention for this class of file
 * (see scripts/adam-startup-check.mjs's own NO-OP-gate coverage precedent).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');

describe('coordinator QUIET_TICK_PING reuse for ratification staleness', () => {
  it('coordinator-quiet-tick.mjs emits the QUIET_TICK_PING=ratification-stale line', () => {
    const src = readFileSync(resolve(REPO_ROOT, 'scripts/coordinator-quiet-tick.mjs'), 'utf8');
    expect(src).toContain('QUIET_TICK_PING=ratification-stale');
  });

  it('coordinator-startup-check.mjs still allowlists QUIET_TICK_PING as an actionable (non-NO-OP) token', () => {
    const src = readFileSync(resolve(REPO_ROOT, 'scripts/coordinator-startup-check.mjs'), 'utf8');
    // Anchored to the quiet-tick loop's own NO-OP-gate sentence so a rewrite elsewhere in the file
    // (e.g. an unrelated QUIET_TICK_PING mention) can't false-pass this pin.
    const noOpGateMatch = src.match(/If the output contains NO ([^,]*?), this turn is a NO-OP/);
    expect(noOpGateMatch, 'coordinator-startup-check.mjs NO-OP gate sentence not found — file structure changed, re-anchor this pin').toBeTruthy();
    expect(noOpGateMatch[1]).toContain('QUIET_TICK_PING');
  });
});
