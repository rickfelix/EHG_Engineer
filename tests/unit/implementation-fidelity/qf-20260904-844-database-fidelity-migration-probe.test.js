/**
 * QF-20260904-844 — Gate 2 database-fidelity migration probe selected
 * schema_migrations.version,name and relied on a 42703 probe-and-fallback
 * (inspecting error1.message for "column ... does not exist") that the
 * SCHEMA-TRUTH-001-A throw-on-42703 default client makes unreachable -- the
 * client throws before the fallback branch ever runs, aborting
 * verifyMigrationExecution and scoring the section 0.
 *
 * Fix: this probe creates its own client via
 * createSupabaseServiceClient({ throwOnSchemaDrift: false }) -- a deliberate,
 * reviewed schema-shape probe, same pattern as
 * lib/eva/bridge/venture-provisioner.js:441-447. Nothing else in the section
 * changes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ mode: 'version_name_ok' }));

vi.mock('../../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: vi.fn((opts) => {
    expect(opts).toEqual({ throwOnSchemaDrift: false });
    return {
      from(table) {
        expect(table).toBe('schema_migrations');
        return {
          select(colsStr) {
            if (colsStr === 'version, name') {
              if (h.mode === 'version_name_ok') {
                return Promise.resolve({ data: [{ version: '1', name: 'init' }], error: null });
              }
              // Simulate the real pre-fix 42703 shape this probe was designed to detect.
              return Promise.resolve({
                data: null,
                error: { code: '42703', message: 'column schema_migrations.version does not exist' },
              });
            }
            if (colsStr === '*') {
              expect(h.mode).toBe('version_name_missing_falls_back_to_star');
              return Promise.resolve({ data: [{ id: 1 }], error: null });
            }
            throw new Error(`unexpected select: ${colsStr}`);
          },
        };
      },
    };
  }),
}));

const { verifyMigrationExecution } = await import(
  '../../../scripts/modules/implementation-fidelity/sections/database-fidelity.js'
);

function makeValidation() {
  return { passed: true, score: 0, issues: [], warnings: [], details: {}, gate_scores: {} };
}

describe('QF-20260904-844: database-fidelity migration probe survives a throw-on-42703 default client', () => {
  beforeEach(() => { h.mode = 'version_name_ok'; });

  it('does not throw against a default (throwOnSchemaDrift-style) supabase param -- the probe uses its own opted-out client', async () => {
    // The `supabase` param passed in here is intentionally a client that would throw if
    // touched for schema_migrations -- proving the probe never routes this query through it.
    const passedInSupabase = {
      from: () => { throw new Error('the passed-in supabase must never be used for schema_migrations'); },
    };
    const sectionDetails = {};
    const validation = makeValidation();

    await expect(
      verifyMigrationExecution([], 'sd-x', sectionDetails, validation, passedInSupabase)
    ).resolves.not.toThrow();
  });

  it('falls back to select(*) when the probe client reports 42703 on version,name (fixture: legacy schema_migrations shape)', async () => {
    h.mode = 'version_name_missing_falls_back_to_star';
    const sectionDetails = {};
    const validation = makeValidation();
    const passedInSupabase = { from: () => { throw new Error('unused'); } };

    const score = await verifyMigrationExecution([], 'sd-x', sectionDetails, validation, passedInSupabase);

    expect(typeof score).toBe('number');
  });

  it('proceeds normally when version,name schema_migrations succeeds directly (fixture: current schema shape)', async () => {
    h.mode = 'version_name_ok';
    const sectionDetails = {};
    const validation = makeValidation();
    const passedInSupabase = { from: () => { throw new Error('unused'); } };

    const score = await verifyMigrationExecution([], 'sd-x', sectionDetails, validation, passedInSupabase);

    expect(typeof score).toBe('number');
  });
});
