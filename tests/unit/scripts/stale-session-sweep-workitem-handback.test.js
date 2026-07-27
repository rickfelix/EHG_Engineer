/**
 * SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-1b slice 2
 *
 * stale-session-sweep.cjs CLAIM_BOUNDARY_PROBE now delegates its work-item handback to the
 * shared lib/fleet/release-work-item.mjs helper. This site WAS the "exactly ONE release path"
 * the SD names — the only place the reset existed.
 *
 * Static source assertions, matching the convention already used by
 * stale-session-sweep-claim-safety.test.js: the sweep is a large CJS script with a
 * module-scoped supabase client, so its QA-mutation invariants are pinned against the source
 * rather than by executing a tick.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = path.resolve(HERE, '../../../scripts/stale-session-sweep.cjs');
const SOURCE = readFileSync(SOURCE_PATH, 'utf8');

describe('FR-1b slice 2 — the sweep delegates its work-item handback to the shared helper', () => {
  it('calls releaseWorkItemOnSessionEnd from the shared module', () => {
    expect(SOURCE).toMatch(/require\(|await import\(\s*['"]\.\.\/lib\/fleet\/release-work-item\.mjs['"]\s*\)/);
    expect(SOURCE).toMatch(/releaseWorkItemOnSessionEnd\(\s*\n?\s*supabase,\s*releasedSd,\s*['"]CLAIM_BOUNDARY_PROBE['"]/);
  });

  it('THE DUPLICATE IS GONE — no inline quick_fixes status reset remains in the sweep', () => {
    // The whole point of FR-1 is one implementation. If an inline
    // `quick_fixes ... update({status:'open'})` reappears here, two copies of the predicate
    // exist again and they will drift.
    const inlineQfReopen = /from\(\s*['"]quick_fixes['"]\s*\)\s*\.update\(\s*\{\s*status:\s*['"]open['"]/;
    expect(SOURCE).not.toMatch(inlineQfReopen);
  });

  it('IS NOT GATED BY LEO_RELEASE_WORKITEM_RESET — the flag must never disable live protection', () => {
    // The flag exists to gate ADDING the reset to the fifteen paths that never had it.
    // This site already had the behaviour, so gating it would mean the default-OFF flag
    // silently switches off fleet protection that works today.
    // Assert the absence of GATING, not the absence of the NAME — the comment above the
    // call deliberately explains why the flag is not applied here, so a bare string search
    // would fail on its own rationale.
    expect(SOURCE).not.toMatch(/isReleaseWorkItemResetEnabled\s*\(/);
    expect(SOURCE).not.toMatch(/process\.env\.LEO_RELEASE_WORKITEM_RESET/);
  });

  it('surfaces a handback failure as a sweep warning rather than swallowing it', () => {
    expect(SOURCE).toMatch(/work-item handback failed/);
  });

  it('the remaining resetSdPhaseOnRelease call sites are untouched by this slice', () => {
    // Slice 2 converts ONLY the CLAIM_BOUNDARY_PROBE site. The sweep's other three
    // phase-reset callers still route through resetSdPhaseOnRelease; converging them is a
    // later slice, tracked in the FR-1b ledger. Pinned so the count cannot drift silently.
    const calls = SOURCE.match(/await resetSdPhaseOnRelease\(/g) || [];
    expect(calls).toHaveLength(3);
  });
});
