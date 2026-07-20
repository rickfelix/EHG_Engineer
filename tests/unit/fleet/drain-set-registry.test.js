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
import { resolveRecognizedKinds, assertRegistryTablesExist } from '../../../lib/fleet/drain-set-registry.js';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const MIGRATION_PATH = path.join(REPO_ROOT, 'database/migrations/20260720_role_drain_sets_STAGED.sql');

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
  const migrationText = readFileSync(MIGRATION_PATH, 'utf8');

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
});
