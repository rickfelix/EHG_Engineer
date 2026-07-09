/**
 * QF-20260709-968: CLAIM_FIX must not overwrite an authoritative (coordinator-directed,
 * still-alive) claiming_session_id with a stale worker self-report sd_key binding.
 *
 * Prior behavior: CLAIM_FIX unconditionally re-asserted claiming_session_id = s.session_id
 * whenever it differed from the SD's current claim, silently reverting any directed
 * reassignment while the displaced worker was still heartbeating. Fix: when the current
 * claim-holder is alive (per CLAIM_HOLDING_STATUSES), clear the stale self-report binding
 * instead of overwriting the claim.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../');
const SOURCE = readFileSync(resolve(REPO_ROOT, 'scripts/stale-session-sweep.cjs'), 'utf8');

describe('QF-20260709-968 — CLAIM_FIX authoritative-claim-wins', () => {
  it('checks CLAIM_HOLDING_STATUSES on the current claim-holder before re-asserting', () => {
    const fnStart = SOURCE.indexOf('QF-20260709-968');
    expect(fnStart, 'QF-20260709-968 branch not found').toBeGreaterThan(-1);
    const window = SOURCE.slice(fnStart, fnStart + 1500);
    expect(window).toMatch(/classified\.find\(c => c\.session_id === sd\.claiming_session_id\)/);
    expect(window).toMatch(/CLAIM_HOLDING_STATUSES\.has\(holder\.status\)/);
  });

  it('the new stale-binding release reason is wired', () => {
    expect(SOURCE).toContain('SWEEP_STALE_BINDING_CLAIM_FIX');
  });

  it('the stale-binding release only clears claude_sessions, never touches strategic_directives_v2', () => {
    const anchor = SOURCE.indexOf('SWEEP_STALE_BINDING_CLAIM_FIX');
    const window = SOURCE.slice(anchor - 400, anchor + 50);
    expect(window).toMatch(/\.from\(\s*['"]claude_sessions['"]\s*\)/);
    expect(window).not.toMatch(/\.from\(\s*['"]strategic_directives_v2['"]\s*\)/);
  });
});
