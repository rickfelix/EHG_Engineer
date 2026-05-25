/**
 * SD-FDBK-ENH-GATE2-FIDELITY-AWARE-001 — N/A-aware Section B (Database
 * Implementation Fidelity).
 *
 * When an SD has a genuinely zero database footprint (no SD-matched migration
 * files AND no database query signals in its diff), Section B is Not Applicable
 * and earns full credit (35/35) — instead of the ~18-19/35 partial that dragged
 * frontend-only feature SDs to a RED GATE2 verdict (regressed
 * SD-SINGLEVENTURE-AND-BULK-DELETE-ORCH-001-C). Any DB signal falls through to
 * normal scoring (conservative).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Hoisted holder so the vi.mock factory can read per-test git-diff content.
const h = vi.hoisted(() => ({ repos: [], gitDiff: '', throwRepos: false }));

vi.mock('../../../scripts/modules/implementation-fidelity/utils/index.js', () => ({
  getSDSearchTerms: async () => ['SD-TEST-001'],
  detectImplementationRepos: async () => {
    if (h.throwRepos) throw new Error('repo detection boom');
    return h.repos;
  },
  gitLogForSD: async () => h.gitDiff,
}));

const { validateDatabaseFidelity } = await import(
  '../../../scripts/modules/implementation-fidelity/sections/database-fidelity.js'
);

function makeValidation({ sd_type = 'feature', target_application = 'EHG' } = {}) {
  return {
    passed: true,
    score: 0,
    issues: [],
    warnings: [],
    details: { sd_type, target_application },
    gate_scores: {},
  };
}

// Section B never reaches a live DB in the zero-DB / no-migration paths, but the
// signature requires a supabase arg. Provide a minimal chainable stub.
function makeSupabase() {
  const chain = {
    from: () => chain,
    select: () => Promise.resolve({ data: [], error: null }),
    eq: () => chain,
  };
  return chain;
}

const DB_ANALYSIS = { tables: ['noop'] }; // truthy → passes the !databaseAnalysis early-return

describe('GATE2 Section B — N/A-aware database fidelity (SD-...-FIDELITY-AWARE-001)', () => {
  // A fake repo path (no migration dirs on disk → hasMigrations=false) so the diff
  // scan actually runs and detection keys purely on the git-diff signal.
  beforeEach(() => { h.repos = ['/fake/repo']; h.gitDiff = ''; h.throwRepos = false; });

  it('zero DB footprint (no migrations, no queries) → Section B N/A, full credit 35/35', async () => {
    h.gitDiff = 'diff --git a/src/components/Foo.tsx b/src/components/Foo.tsx\n+ const x = 1;';
    const v = makeValidation();
    await validateDatabaseFidelity('SD-TEST-001', DB_ANALYSIS, v, makeSupabase());

    expect(v.gate_scores.database_fidelity).toBe(35);
    expect(v.details.database_fidelity.applicable).toBe(false);
    expect(v.details.database_fidelity.reason).toMatch(/Not applicable.*zero database footprint/i);
  });

  it('diff with supabase .from() → NOT N/A, falls through to normal scoring', async () => {
    h.gitDiff = 'diff --git a/x.js b/x.js\n+ const { data } = await supabase.from("ventures").select("*");';
    const v = makeValidation();
    await validateDatabaseFidelity('SD-TEST-001', DB_ANALYSIS, v, makeSupabase());

    // The N/A early-return must NOT have fired.
    expect(v.details.database_fidelity.applicable).not.toBe(false);
  });

  it('diff with supabase .rpc() → NOT N/A (client DB call counts as a query)', async () => {
    h.gitDiff = '+ await supabase.rpc("delete_venture", { p_venture_id: id });';
    const v = makeValidation();
    await validateDatabaseFidelity('SD-TEST-001', DB_ANALYSIS, v, makeSupabase());
    expect(v.details.database_fidelity.applicable).not.toBe(false);
  });

  it('diff with SQL DDL (CREATE TABLE) → NOT N/A', async () => {
    h.gitDiff = '+ CREATE TABLE public.things (id uuid primary key);';
    const v = makeValidation();
    await validateDatabaseFidelity('SD-TEST-001', DB_ANALYSIS, v, makeSupabase());
    expect(v.details.database_fidelity.applicable).not.toBe(false);
  });

  it('conservative: a scope-detection error does NOT grant the N/A pass', async () => {
    h.throwRepos = true; // detectDatabaseScope catch → {hasMigrations:true, hasQueries:true}
    const v = makeValidation();
    await validateDatabaseFidelity('SD-TEST-001', DB_ANALYSIS, v, makeSupabase());
    expect(v.details.database_fidelity.applicable).not.toBe(false);
  });

  it('preserves the existing 18/35 partial when no DATABASE analysis is present (unchanged path)', async () => {
    const v = makeValidation();
    await validateDatabaseFidelity('SD-TEST-001', null, v, makeSupabase());
    expect(v.gate_scores.database_fidelity).toBe(18);
    // The !databaseAnalysis path returns before the N/A block — no applicable marker.
    expect(v.details.database_fidelity).toBeUndefined();
  });
});
