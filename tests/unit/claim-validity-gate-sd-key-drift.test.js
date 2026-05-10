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
    // Pin the column list literal — sd_key is the new addition vs prior projection.
    expect(src).toMatch(/\.select\(['"]status, is_alive, sd_key['"]\)/);
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

  it('auto-release condition includes both ownerIsDead AND ownerHasSdKeyDrifted (logical OR)', () => {
    expect(src).toMatch(/if\s*\(\s*ownerIsDead\s*\|\|\s*ownerHasSdKeyDrifted\s*\)/);
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
  it('ownerIsDead boolean retains its 4-condition definition (status stale/released, is_alive false, missing)', () => {
    expect(src).toMatch(/ownerIsDead\s*=\s*!owner\s*\|\|\s*owner\.status\s*===\s*['"]stale['"]\s*\|\|\s*owner\.status\s*===\s*['"]released['"]\s*\|\|\s*owner\.is_alive\s*===\s*false/);
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
