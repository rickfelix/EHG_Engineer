/**
 * SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-B (Child A) FR-2 -- lib/fleet/drain-set-registry.js.
 * TS-3: fail-open reader byte-identical to hard-coded DRAIN_SETS fallback.
 * TS-4: assertRegistryTablesExist canary shape.
 * TS-2: seed data 1:1 parity between the migration file and the live DRAIN_SETS constant.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { DRAIN_SETS } = require('../../../lib/fleet/worker-status.cjs');
import {
  resolveRecognizedKinds,
  assertRegistryTablesExist,
  warnIfUndrainedKindViaRegistry,
} from '../../../lib/fleet/drain-set-registry.js';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const MIGRATION_PATH = path.join(REPO_ROOT, 'database/migrations/20260720_role_drain_sets_STAGED.sql');
// QF-20260830-280: reconciliation kinds added AFTER the original seed migration land in their
// own additive follow-up migrations (same INSERT ... ON CONFLICT DO NOTHING pattern), not by
// editing the original file — so this parity check must scan every seed migration, not just one.
const RECONCILIATION_MIGRATION_PATHS = [
  path.join(REPO_ROOT, 'database/migrations/20260830_role_drain_sets_add_parent_completion.sql'),
  path.join(REPO_ROOT, 'database/migrations/20260831_role_drain_sets_add_adam_backpressure_exempt.sql'),
  path.join(REPO_ROOT, 'database/migrations/20260901_role_drain_sets_add_reaper_alerts.sql'),
  // QF-20260903-281: the same six exempt kinds registered for coordinator/solomon/worker —
  // 20260831 covered role='adam' only, leaving three roles unable to drain a correction.
  path.join(REPO_ROOT, 'database/migrations/20260903_role_drain_sets_add_exempt_kinds_remaining_roles.sql'),
  // SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001: the new periodic_liveness_owner_directive
  // DIRECTIVE_KINDS entry, registered for all four roles.
  path.join(REPO_ROOT, 'database/migrations/20260905_role_drain_sets_add_periodic_liveness_owner_directive.sql'),
];

describe('resolveRecognizedKinds (TS-3: fail-open byte-identical to DRAIN_SETS)', () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  afterEach(() => errorSpy.mockClear());

  it('returns byte-identical results to DRAIN_SETS[role] for all 4 known roles when supabase=null', async () => {
    for (const role of ['solomon', 'adam', 'coordinator', 'worker']) {
      const result = await resolveRecognizedKinds({ supabase: null, role });
      expect(result).toEqual([...DRAIN_SETS[role]]);
    }
  });

  it('logs exactly ONE canary line per call when unapplied', async () => {
    errorSpy.mockClear();
    await resolveRecognizedKinds({ supabase: null, role: 'solomon' });
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toContain('role_drain_sets');
    expect(errorSpy.mock.calls[0][0]).toContain('UNAPPLIED');
  });

  it('fails open (with canary) on a query error, e.g. PGRST205 table-not-found', async () => {
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ eq: () =>
      Promise.resolve({ data: null, error: { code: 'PGRST205', message: 'not found' } }) }) }) }) }) };
    const result = await resolveRecognizedKinds({ supabase, role: 'adam' });
    expect(result).toEqual([...DRAIN_SETS.adam]);
  });

  it('never throws on missing role', async () => {
    await expect(resolveRecognizedKinds({ supabase: null, role: undefined })).resolves.toEqual([]);
  });

  it('QF-20260831-769: unions with the fallback instead of narrowing below it when the DB read succeeds but is missing kinds the fallback has (partially-migrated role_drain_sets)', async () => {
    // role_drain_sets has SOME rows for 'adam' but is missing a chairman-gated reconciliation
    // (e.g. 'disposition', present in DRAIN_SETS.adam but not yet seeded live) — this must not
    // silently narrow the recognized set below the JS SSOT.
    const partial = DRAIN_SETS.adam.filter((k) => k !== 'disposition');
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ eq: () =>
      Promise.resolve({ data: partial.map((kind) => ({ kind })), error: null }) }) }) }) }) };
    const result = await resolveRecognizedKinds({ supabase, role: 'adam' });
    expect(result).toEqual(expect.arrayContaining([...DRAIN_SETS.adam]));
    expect(result).toContain('disposition');
  });

  it('QF-20260831-769: still lets the DB ADD a kind beyond the JS fallback (additive, not fallback-only)', async () => {
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ eq: () =>
      Promise.resolve({ data: [...DRAIN_SETS.adam.map((kind) => ({ kind })), { kind: 'brand_new_kind' }], error: null }) }) }) }) }) };
    const result = await resolveRecognizedKinds({ supabase, role: 'adam' });
    expect(result).toContain('brand_new_kind');
  });
});

describe('warnIfUndrainedKindViaRegistry: unrecognized-role guard (adversarial review finding, PR #6331)', () => {
  it('stays SILENT for a role not present in DRAIN_SETS -- matches warnIfUndrainedKind\'s "if (!set) return false" guard', async () => {
    const warn = vi.fn();
    const fired = await warnIfUndrainedKindViaRegistry({
      supabase: null,
      targetRole: 'chairman',
      kind: 'adam_advisory',
      log: warn,
    });
    expect(fired).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it('stays SILENT for a known role with a kind that IS in its DRAIN_SETS entry (guard did not over-suppress)', async () => {
    const warn = vi.fn();
    const fired = await warnIfUndrainedKindViaRegistry({
      supabase: null,
      targetRole: 'solomon',
      kind: 'coordinator_request',
      log: warn,
    });
    expect(fired).toBe(false); // coordinator_request IS in the hard-coded DRAIN_SETS.solomon
    expect(warn).not.toHaveBeenCalled();
  });

  it('WARNs for a known role with a genuinely undrained kind', async () => {
    const warn = vi.fn();
    const fired = await warnIfUndrainedKindViaRegistry({
      supabase: null,
      targetRole: 'worker',
      kind: 'adam_advisory',
      log: warn,
    });
    expect(fired).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe('assertRegistryTablesExist (TS-4: canary shape)', () => {
  it('returns {applied:false, table} on a mocked PGRST205-style error, never throws', async () => {
    const supabase = { from: () => ({ select: () => ({ limit: () =>
      Promise.resolve({ data: null, error: { code: 'PGRST205', message: 'not found' } }) }) }) };
    await expect(assertRegistryTablesExist(supabase)).resolves.toEqual({ applied: false, table: 'role_drain_sets' });
  });

  it('returns {applied:false, table} when supabase is null, never throws', async () => {
    await expect(assertRegistryTablesExist(null)).resolves.toEqual({ applied: false, table: 'role_drain_sets' });
  });

  it('returns {applied:true, table} when the query succeeds', async () => {
    const supabase = { from: () => ({ select: () => ({ limit: () =>
      Promise.resolve({ data: [{ id: 'x' }], error: null }) }) }) };
    await expect(assertRegistryTablesExist(supabase)).resolves.toEqual({ applied: true, table: 'role_drain_sets' });
  });
});

describe('Seed data 1:1 parity with live DRAIN_SETS (TS-2)', () => {
  const migrationText = [MIGRATION_PATH, ...RECONCILIATION_MIGRATION_PATHS]
    .map((p) => readFileSync(p, 'utf8'))
    .join('\n');

  for (const role of ['solomon', 'adam', 'coordinator', 'worker']) {
    it(`every kind in DRAIN_SETS.${role} has a corresponding seed INSERT`, () => {
      for (const kind of DRAIN_SETS[role]) {
        const needle = `('${role}', '${kind}'`;
        expect(migrationText.includes(needle), `missing seed row: ${needle}`).toBe(true);
      }
    });
  }

  it('both R2 reconciliation fixes are present for solomon', () => {
    expect(migrationText).toContain("('solomon', 'adam_advisory',");
    expect(migrationText).toContain("('solomon', 'solomon_systemic_finding',");
  });

  it('total seed row count is exactly 102 (98 prior + 4 reconciliation: periodic_liveness_owner_directive for all four roles, SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001)', () => {
    const seedRowPattern = /^\s*\('(solomon|adam|coordinator|worker)',/gm;
    const matches = migrationText.match(seedRowPattern) || [];
    expect(matches.length).toBe(102);
  });
});
