/**
 * SD-REFILL-000XFP8B — CLAIM_FIX must never adopt a NON-UUID session as a claim owner.
 *
 * Witnessed: the stale-session-sweep CLAIM_FIX path set
 * strategic_directives_v2.claiming_session_id = 'test-claim-refuse-caller' (a non-UUID test
 * session id) on a REAL SD. That specific id is caught by the existing isFixtureSession guard
 * (it matches the ^test- positive marker), but isFixtureSession is positive-markers-ONLY — a
 * non-`test-`-prefixed bad/synthetic session id would slip through and drive a CLAIM_FIX
 * re-assert, stamping claiming_session_id with a non-worker id.
 *
 * Defense-in-depth: a REAL fleet worker ALWAYS has a full 8-4-4-4-12 UUID session_id
 * (SessionStart hook generates UUIDs). The fix gates the CLAIM_FIX loop on
 * isFullUuid(s.session_id) — anything that is not a full UUID can never be a legitimate claim
 * owner, so the sweep bilaterally releases its stale sd_key instead of re-asserting.
 *
 * Static source-pins (the orphan/claim-fix logic is inline in main() — the cron entry point —
 * matching the stale-session-sweep-claim-safety.test.js guard convention).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../');
const SOURCE = readFileSync(resolve(REPO_ROOT, 'scripts/stale-session-sweep.cjs'), 'utf8');

describe('SD-REFILL-000XFP8B: CLAIM_FIX rejects non-UUID session ids (defense-in-depth)', () => {
  it('isFullUuid is imported from the dispatch SSOT (same shape-check the coordinator uses)', () => {
    // Reuse the canonical pure helper, do not re-declare a parallel regex.
    expect(SOURCE).toMatch(/require\(\s*['"`]\.\.\/lib\/coordinator\/dispatch\.cjs['"`]\s*\)/);
    expect(SOURCE).toMatch(/isFullUuid/);
  });

  it('the CLAIM_FIX loop short-circuits when the session id is not a full UUID', () => {
    expect(SOURCE).toMatch(/if\s*\(\s*!isFullUuid\(s\.session_id\)\s*\)/);
  });

  it('a non-UUID session is bilaterally released (sd_key nulled) with a distinct reason', () => {
    const idx = SOURCE.indexOf('SWEEP_NON_UUID_SESSION_CLAIM_FIX');
    expect(idx).toBeGreaterThan(0);
    // The guard nulls the session's stale sd_key (the bilateral release).
    const region = SOURCE.slice(idx - 400, idx + 400);
    expect(region).toMatch(/sd_key:\s*null/);
  });

  it('it ALSO clears the SD-side claim only when the SD still points at this session (race guard)', () => {
    const idx = SOURCE.indexOf('SWEEP_NON_UUID_SESSION_CLAIM_FIX');
    const region = SOURCE.slice(idx, idx + 600);
    expect(region).toMatch(/sd\.claiming_session_id === s\.session_id/);
    expect(region).toMatch(/claiming_session_id:\s*null,\s*active_session_id:\s*null,\s*is_working_on:\s*false/);
  });

  it('the non-UUID guard sits BEFORE the terminal / eligibility / re-assert branches', () => {
    const uuidGuard = SOURCE.indexOf('!isFullUuid(s.session_id)');
    const reassert = SOURCE.indexOf('CLAIM_FIX: set claiming_session_id on');
    expect(uuidGuard).toBeGreaterThan(0);
    expect(reassert).toBeGreaterThan(uuidGuard);
  });
});
