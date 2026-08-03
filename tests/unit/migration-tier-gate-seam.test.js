// SD-LEO-INFRA-TIER-GATE-FLAG-001 (FR-4, FR-7) — the INTEGRATION SEAM.
//
// WHY THIS FILE EXISTS. The harm suite asserts partitionByTierGate in isolation, and the
// reader suites assert tierGateEnabled in isolation. Nothing asserted that
// checkPendingMigrations actually WIRES THEM TOGETHER — so an adversarial review found
// three separate sabotages that left all 53 other cases GREEN:
//
//   1. `if (gateOn)` -> `if (false)`            — the gate is fully disarmed, TIER-2
//                                                 DROP TABLE flows into auto-apply.
//   2. `gate_enabled: gateOn === true` -> the old env re-derivation (FR-4 reverted).
//   3. dropping the `await` on tierGateEnabled() — gate still holds (a Promise is truthy,
//      which is the fail-closed-by-construction design working), BUT `gateOn === true` is
//      then false, so the audit row reports gate_enabled=false while the gate was ON —
//      exactly the audit-disagrees-with-decision defect FR-4 exists to prevent.
//
// Extracting the partition made the harm assertable but moved the untested seam UP one
// level rather than closing it — the same defect class this SD is about, committed by the
// instrument built to detect it. These cases pin the seam itself.
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const tmp = mkdtempSync(path.join(tmpdir(), 'tier-seam-'));
const DESTRUCTIVE = path.join(tmp, 'drop_ventures.sql');
writeFileSync(DESTRUCTIVE, 'DROP TABLE public.ventures;', 'utf8');
afterAll(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ } });

// Drive discovery through checkUncommittedManualUpdates, whose git call is the only
// injectable entry point. An ABSOLUTE path is used so classifyPendingTiers reads our
// fixture rather than resolving against PROJECT_ROOT.
const gitPorcelain = `?? ${DESTRUCTIVE.replace(/\\/g, '/')}`;
vi.mock('child_process', () => ({
  exec: (_cmd, _opts, cb) => {
    const done = typeof _opts === 'function' ? _opts : cb;
    done(null, { stdout: gitPorcelain, stderr: '' });
  }
}));

// The gate verdict is the variable under test; mock the flag read, not the SUT.
const evaluateFlag = vi.fn();
vi.mock('../../lib/feature-flags/index.js', () => ({
  evaluateFlag: (...a) => evaluateFlag(...a),
  clearCache: () => {}
}));

// Nothing here may touch a real database.
vi.mock('../../lib/supabase-connection.js', () => ({ createDatabaseClient: () => { throw new Error('no db in unit tests'); } }));

const auditRows = [];
const supabaseStub = {
  from: (table) => ({
    insert: async (rows) => { if (table === 'audit_log') auditRows.push(...rows); return { data: null, error: null }; },
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) })
  })
};

const { checkPendingMigrations } = await import('../../scripts/modules/handoff/pre-checks/pending-migrations-check.js');

const ORIGINAL = process.env.LEO_MIGRATION_TIER_GATE;
beforeEach(() => {
  vi.clearAllMocks();
  auditRows.length = 0;
  delete process.env.LEO_MIGRATION_TIER_GATE;
  delete process.env.LEO_MIGRATION_TIER_GATE_FORCE_ON;
});
afterAll(() => {
  if (ORIGINAL === undefined) delete process.env.LEO_MIGRATION_TIER_GATE;
  else process.env.LEO_MIGRATION_TIER_GATE = ORIGINAL;
});

const SD = { sd_key: 'SD-SEAM-TEST-001', id: 'seam-test' };
const gateOn = () => evaluateFlag.mockResolvedValue({ enabled: false, reason: 'flag_not_found' });
const gateOff = () => evaluateFlag.mockResolvedValue({ enabled: true, reason: 'no_policy_default_enabled' });

describe('the gate is actually WIRED — checkPendingMigrations honours the verdict', () => {
  it('gate ON: a DROP TABLE is DEFERRED and never auto-applied', async () => {
    gateOn();
    const result = await checkPendingMigrations(supabaseStub, SD, { autoExecute: true });

    // Sabotage `if (gateOn)` -> `if (false)` and this assertion fails: with the branch
    // skipped, tierDeferredFiles is never populated and the file stays eligible.
    expect(result.tierDeferredFiles ?? []).toContain(DESTRUCTIVE.replace(/\\/g, '/'));
    expect(result.executionAttempted).toBe(false);
  });

  it('DISCRIMINATES — gate OFF: the same file is NOT deferred', async () => {
    // Without this half, a partition that deferred everything unconditionally would
    // satisfy the case above while proving nothing about the gate.
    gateOff();
    const result = await checkPendingMigrations(supabaseStub, SD, { autoExecute: false });
    expect(result.tierDeferredFiles ?? []).toHaveLength(0);
  });
});

describe('FR-4 — the audit row reports the verdict actually used', () => {
  it('gate ON => audit gate_enabled === true', async () => {
    gateOn();
    await checkPendingMigrations(supabaseStub, SD, { autoExecute: false });
    const row = auditRows.find(r => r.event_type === 'MIGRATION_TIER_CLASSIFICATION');
    expect(row).toBeDefined();
    // Reverting FR-4 to the env re-derivation fails here: the ambient legacy var is
    // stripped above, so the old expression would yield false while the gate was ON.
    expect(row.metadata.gate_enabled).toBe(true);
  });

  it('gate OFF => audit gate_enabled === false', async () => {
    gateOff();
    await checkPendingMigrations(supabaseStub, SD, { autoExecute: false });
    const row = auditRows.find(r => r.event_type === 'MIGRATION_TIER_CLASSIFICATION');
    expect(row.metadata.gate_enabled).toBe(false);
  });

  it('gate_enabled is a strict boolean — a dropped await cannot serialise as a Promise', async () => {
    gateOn();
    await checkPendingMigrations(supabaseStub, SD, { autoExecute: false });
    const row = auditRows.find(r => r.event_type === 'MIGRATION_TIER_CLASSIFICATION');
    expect(typeof row.metadata.gate_enabled).toBe('boolean');
  });
});
