/**
 * SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001 Phase 4: claim-validity-gate.js
 * sd_key drift fallthrough (FR-2 consumer side).
 *
 * Mirrors stale-heartbeat auto-release pattern (lines ~250-277 of the gate).
 * Verdict-distinct telemetry: reason='sd_key_drift' vs stale/released/missing.
 * Expanded return shape includes released_owner_session + released_owner_sd_key
 * (AC-2.6).
 */

import { describe, it, expect } from 'vitest';
import { shouldReleaseStaleOwner } from '../../lib/claim-validity-gate.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GATE_PATH = resolve(__dirname, '../..', 'lib/claim-validity-gate.js');
const src = readFileSync(GATE_PATH, 'utf8');

// ── Imports ──────────────────────────────────────────────────────────────

describe('claim-validity-gate.js imports detectSdKeyDrift from canonical re-export', () => {
  it('imports detectSdKeyDrift from ./claim-lifecycle-release.mjs (sibling-parity, single source)', () => {
    expect(src).toMatch(/import\s*\{\s*detectSdKeyDrift\s*\}\s*from\s*['"]\.\/claim-lifecycle-release\.mjs['"]/);
  });
});

// ── owner SELECT now includes sd_key column ──────────────────────────────

describe('owner SELECT projection includes sd_key column (FR-2 input)', () => {
  it('SELECT projection lists status, is_alive, AND sd_key', () => {
    // Pin the column list — sd_key is the FR-2 input. SD-LEO-INFRA-CLAIM-SILENCE-CONSUME-VERIFY-001
    // appended expected_silence_until (SEAM 1), so allow trailing columns after sd_key.
    expect(src).toMatch(/\.select\(['"]status, is_alive, sd_key[^'"]*['"]\)/);
  });
});

// ── Drift detection + auto-release fallthrough ───────────────────────────

describe('FR-2 fallthrough: sd_key drift triggers auto-release alongside ownerIsDead (AC-2.1)', () => {
  it('detectSdKeyDrift is invoked with (owner, sdKey) and verdict captured in sdKeyDriftVerdict', () => {
    expect(src).toMatch(/sdKeyDriftVerdict\s*=\s*detectSdKeyDrift\(owner,\s*sdKey\)/);
  });

  it('ownerHasSdKeyDrifted boolean derives from verdict === drift', () => {
    expect(src).toMatch(/ownerHasSdKeyDrifted\s*=\s*sdKeyDriftVerdict\s*===\s*['"]drift['"]/);
  });

  it('auto-release decision goes through shouldReleaseStaleOwner with drift + dead + silence + pid-alive', () => {
    // SD-LEO-INFRA-CLAIM-SILENCE-CONSUME-VERIFY-001 (SEAM 1) gated the dead-owner arm on
    // !ownerIsSilenced (drift still releases unconditionally). SD-REFILL-00C7GXJS refactored the
    // inline condition into the pure shouldReleaseStaleOwner() and ADDED the !ownerPidAlive escape
    // (a busy worker mid Task() sub-agent call has a live PID and must not be reaped). The release is
    // now driven by that helper; the pure function still encodes drift-always / (dead && !silenced && !pid-alive).
    // SD-LEO-INFRA-PARKED-WORKER-CLAIM-LAPSE-001 FR-3 added a 5th signal, ownerSdKeyMissing, so
    // an AMBIGUOUS drift (owner.sd_key === null) can be distinguished from a genuine one (owner
    // moved to another SD). The semantic this test pins — the auto-release decision routes through
    // shouldReleaseStaleOwner carrying the liveness signals — is unchanged and now stronger.
    // SD-LEO-INFRA-PARKED-WORKER-CLAIM-LAPSE-001 FR-1 (2nd pass): this assertion previously pinned
    // the ENTIRE `if (...)` including its opening paren, so it broke when the release site gained a
    // fail-closed `!ownerLookupFailed &&` conjunct — a correct change (a discarded owner-lookup
    // error was letting a failed query read as "owner is dead" and reap a LIVE claim). This is the
    // 5th syntax pin in this repo to fail on a correct edit. Re-aimed at the SEMANTIC: the release
    // decision routes through shouldReleaseStaleOwner carrying all five liveness signals. Any
    // ADDITIONAL guard in front of it is by definition more conservative and must not fail here.
    expect(src).toMatch(/shouldReleaseStaleOwner\(\s*\{\s*ownerHasSdKeyDrifted,\s*ownerIsDead,\s*ownerIsSilenced,\s*ownerPidAlive,\s*ownerSdKeyMissing\s*\}\s*\)/);
    // …and the release is still gated by an `if`, not evaluated for side effects.
    expect(src).toMatch(/if\s*\([^)]*shouldReleaseStaleOwner\(/);
    // FR-1: an ERRORED owner lookup must suppress the release (a failed query is not an answer).
    expect(src).toMatch(/!ownerLookupFailed\s*&&\s*shouldReleaseStaleOwner/);
    expect(src).toMatch(/const ownerLookupFailed = Boolean\(ownerErr\)/);
    expect(src).toMatch(/function shouldReleaseStaleOwner/);
    // FR-3: the drift arm is now a BLOCK, not a bare `return true` — it releases unconditionally
    // only when the owner is verifiably on ANOTHER sd_key, and requires a negative liveness signal
    // when the sd_key is merely null (the ambiguous case that was evicting live owners).
    expect(src).toMatch(/if\s*\(\s*ownerHasSdKeyDrifted\s*\)\s*\{/);
    expect(src).toMatch(/if\s*\(\s*!ownerSdKeyMissing\s*\)\s*return true;/);
    expect(src).toMatch(/Boolean\(ownerIsDead\)\s*&&\s*!ownerIsSilenced\s*&&\s*!ownerPidAlive/);
  });

  it('release reason is "sd_key_drift" when drift triggers (NOT stale/released/missing)', () => {
    expect(src).toMatch(/releaseReason\s*=\s*ownerIsDead/);
    expect(src).toMatch(/['"]sd_key_drift['"]/);
  });
});

// ── AC-2.6: expanded return shape ────────────────────────────────────────

describe('AC-2.6: expanded return shape carries drift telemetry forward', () => {
  it('return object includes reason, released_owner_session, released_owner_sd_key', () => {
    // Pin all three keys appear in the return literal.
    const releaseBlockMatch = src.match(/return\s*\{[\s\S]*?ownership:\s*['"]unclaimed['"],[\s\S]*?reason:[\s\S]*?released_owner_session:[\s\S]*?released_owner_sd_key:[\s\S]*?\}/);
    expect(releaseBlockMatch).toBeTruthy();
  });

  it('released_owner_session value is sd.claiming_session_id (the prior owner)', () => {
    expect(src).toMatch(/released_owner_session:\s*sd\.claiming_session_id/);
  });

  it('released_owner_sd_key value is owner?.sd_key (nullable)', () => {
    expect(src).toMatch(/released_owner_sd_key:\s*owner\?\.sd_key/);
  });
});

// ── Console.warn emits drift verdict for telemetry queries ───────────────

describe('telemetry: console.warn emits sd_key_drift verdict (audit trail)', () => {
  it('warn message mentions both releaseReason AND sd_key_drift verdict', () => {
    const warnIdx = src.indexOf('Auto-released orphaned claim on');
    expect(warnIdx).toBeGreaterThan(0);
    const slice = src.slice(warnIdx, warnIdx + 400);
    expect(slice).toMatch(/reason=\$\{releaseReason\}/);
    expect(slice).toMatch(/sd_key_drift=\$\{sdKeyDriftVerdict\}/);
    expect(slice).toMatch(/owner\.sd_key=\$\{owner\?\.sd_key/);
  });
});

// ── Backward compat: stale-heartbeat path still works ────────────────────

describe('backward compat: stale-heartbeat path preserved (no regression)', () => {
  it('ownerIsDead delegates to ownerIsDeadByLiveness (SD-LEO-INFRA-CLAIM-VALIDITY-ISALIVE-LAG-001 FR-1: is_alive now gated on heartbeat staleness; missing + status stale/released preserved)', () => {
    // The inline 4-condition predicate was replaced by the pure ownerIsDeadByLiveness helper,
    // which trusts heartbeat_at over the lagging is_alive column (is_alive===false => dead ONLY
    // when the heartbeat is ALSO stale). The helper preserves the missing-owner + lifecycle-status
    // dead signals (fail-open), so the prior conditions still hold for those cases.
    expect(src).toMatch(/ownerIsDead\s*=\s*ownerIsDeadByLiveness\(owner,\s*Date\.now\(\)\)/);
    expect(src).toMatch(/if\s*\(!owner\)\s*return true;/);
    expect(src).toMatch(/owner\.status\s*===\s*['"]stale['"]\s*\|\|\s*owner\.status\s*===\s*['"]released['"]/);
    expect(src).toMatch(/owner\.is_alive\s*===\s*false\)\s*return isHeartbeatStale/);
  });

  it('foreign_claim throw still fires when neither ownerIsDead NOR ownerHasSdKeyDrifted', () => {
    // The throw block should still be present.
    expect(src).toMatch(/throw new ClaimIdentityError\(\{[\s\S]*?reason:\s*['"]foreign_claim['"]/);
  });

  it('SIBLING RELEASE SITE 2/4 (file_claim_locks co-clear) preserved — CROSS-HOST FR-5 invariant', () => {
    expect(src).toMatch(/SIBLING RELEASE SITE 2\/4/);
    expect(src).toMatch(/releaseClaimsByHolder/);
  });
});

// ── Cross-cutting guard ─────────────────────────────────────────────────

describe('cross-cutting: no claim_version usage (validation-agent P1)', () => {
  it('active code does NOT introduce claim_version (Option B compare-and-set lives in lifecycle helper)', () => {
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(codeOnly).not.toMatch(/claim_version/);
  });
});

/**
 * SD-LEO-INFRA-PARKED-WORKER-CLAIM-LAPSE-001 FR-3 (TS-2 / TS-3) — behavioural, against the REAL
 * exported predicate (no mocks: shouldReleaseStaleOwner is pure).
 *
 * Drift used to release UNCONDITIONALLY, which made this a liveness-free claim steal: any path
 * that nulled the session-side sd_key evicted a LIVE, heartbeating, PID-alive, silence-armed
 * owner. But 'drift' covers two materially different situations, and collapsing them is what
 * caused the harm — so these tests pin BOTH directions. Over-correcting here would be a claim
 * leak that starves the belt, which TS-3 exists to prevent.
 */
describe('FR-3: sd_key drift must not evict a live owner (TS-2/TS-3)', () => {
  it('TS-2: a NULL sd_key does NOT release a PID-alive owner', () => {
    expect(shouldReleaseStaleOwner({ ownerHasSdKeyDrifted: true, ownerSdKeyMissing: true, ownerPidAlive: true, ownerIsDead: true })).toBe(false);
  });

  it('TS-2: a NULL sd_key does NOT release a silence-armed owner', () => {
    expect(shouldReleaseStaleOwner({ ownerHasSdKeyDrifted: true, ownerSdKeyMissing: true, ownerIsSilenced: true, ownerIsDead: true })).toBe(false);
  });

  it('TS-3: a NULL sd_key STILL releases an owner with no liveness signal (no claim leak)', () => {
    expect(shouldReleaseStaleOwner({ ownerHasSdKeyDrifted: true, ownerSdKeyMissing: true, ownerPidAlive: false, ownerIsSilenced: false })).toBe(true);
  });

  it('TS-3: an owner verifiably on ANOTHER sd_key still releases unconditionally — the genuine signal is preserved', () => {
    expect(shouldReleaseStaleOwner({ ownerHasSdKeyDrifted: true, ownerSdKeyMissing: false, ownerPidAlive: true, ownerIsSilenced: true })).toBe(true);
  });

  it('the non-drift dead-owner path is unchanged (silence and pid-alive still suppress)', () => {
    expect(shouldReleaseStaleOwner({ ownerIsDead: true })).toBe(true);
    expect(shouldReleaseStaleOwner({ ownerIsDead: true, ownerIsSilenced: true })).toBe(false);
    expect(shouldReleaseStaleOwner({ ownerIsDead: true, ownerPidAlive: true })).toBe(false);
    expect(shouldReleaseStaleOwner({ ownerIsDead: false })).toBe(false);
  });

  it('the call site distinguishes a null sd_key from a moved one', () => {
    expect(src).toMatch(/const ownerSdKeyMissing = Boolean\(owner\) && !owner\.sd_key/);
  });
});
