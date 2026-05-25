/**
 * SD-FDBK-ENH-GATE2-AWARE-SECTION-001 — N/A-aware Section C (Data Flow Alignment).
 *
 * When an SD has a genuinely zero database footprint (no SD-matched migration files
 * AND no database query signals in its diff), Section C is Not Applicable and earns
 * full credit (25/25) — instead of the ~13/25 partial (C1 no-DB-query 5/10 + crude
 * C2/C3 string heuristics) that dragged zero-DB frontend feature SDs to a RED GATE2
 * verdict (regressed SD-S17S19-LANDINGFIRST-BUILD-TRIM-ORCH-001-C). Mirrors the
 * Section B fix shipped in PR #3911. Any DB signal — or a detection error — falls
 * through to normal C1/C2/C3 scoring (conservative). Existing exemptions keep
 * precedence (the new check sits after them).
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

// Section C resolves the SD via the canonical resolver inside an exemption block.
// Stub it to "no match" so the non-EHG_Engineer tests fall through cleanly to the
// new detectDatabaseScope check (the resolver is orthogonal to the N/A logic).
vi.mock('../../../scripts/lib/sd-id-resolver.js', () => ({
  resolveSdInputOrNull: async () => ({ sd: null }),
}));

const { validateDataFlowAlignment } = await import(
  '../../../scripts/modules/implementation-fidelity/sections/data-flow-alignment.js'
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

// Section C never reaches a live DB in the zero-DB / signal paths (mocked utils and
// a stubbed resolver), but the signature requires a supabase arg. Minimal stub.
function makeSupabase() {
  const chain = {
    from: () => chain,
    select: () => Promise.resolve({ data: [], error: null }),
    eq: () => chain,
  };
  return chain;
}

describe('GATE2 Section C — N/A-aware data flow alignment (SD-...-AWARE-SECTION-001)', () => {
  // A fake repo path (no migration dirs on disk → hasMigrations=false) so detection
  // keys purely on the git-diff signal.
  beforeEach(() => { h.repos = ['/fake/repo']; h.gitDiff = ''; h.throwRepos = false; });

  it('zero DB footprint (no migrations, no queries) → Section C N/A, full credit 25/25', async () => {
    h.gitDiff = 'diff --git a/src/components/Foo.tsx b/src/components/Foo.tsx\n+ const x = 1;';
    const v = makeValidation();
    await validateDataFlowAlignment('SD-TEST-001', null, null, v, makeSupabase());

    expect(v.gate_scores.data_flow_alignment).toBe(25);
    expect(v.details.data_flow_alignment.applicable).toBe(false);
    expect(v.details.data_flow_alignment.reason).toMatch(/Not applicable.*zero database footprint/i);
  });

  it('diff with supabase .from() → NOT N/A, falls through to normal scoring', async () => {
    h.gitDiff = 'diff --git a/x.js b/x.js\n+ const { data } = await supabase.from("ventures").select("*");';
    const v = makeValidation();
    await validateDataFlowAlignment('SD-TEST-001', null, null, v, makeSupabase());

    // The N/A early-return must NOT have fired.
    expect(v.details.data_flow_alignment.applicable).not.toBe(false);
  });

  it('diff with supabase .rpc() → NOT N/A (client DB call counts as a query)', async () => {
    h.gitDiff = '+ await supabase.rpc("delete_venture", { p_venture_id: id });';
    const v = makeValidation();
    await validateDataFlowAlignment('SD-TEST-001', null, null, v, makeSupabase());
    expect(v.details.data_flow_alignment.applicable).not.toBe(false);
  });

  it('diff with SQL DDL (CREATE TABLE) → NOT N/A', async () => {
    h.gitDiff = '+ CREATE TABLE public.things (id uuid primary key);';
    const v = makeValidation();
    await validateDataFlowAlignment('SD-TEST-001', null, null, v, makeSupabase());
    expect(v.details.data_flow_alignment.applicable).not.toBe(false);
  });

  it('conservative: a scope-detection error does NOT grant the N/A pass', async () => {
    h.throwRepos = true; // detectDatabaseScope catch → {hasMigrations:true, hasQueries:true}
    const v = makeValidation();
    await validateDataFlowAlignment('SD-TEST-001', null, null, v, makeSupabase());
    expect(v.details.data_flow_alignment.applicable).not.toBe(false);
  });

  it('preserves the existing EHG_Engineer backend-only exemption (fires before the N/A check)', async () => {
    const v = makeValidation({ target_application: 'EHG_Engineer' });
    await validateDataFlowAlignment('SD-TEST-001', null, null, v, makeSupabase());

    expect(v.gate_scores.data_flow_alignment).toBe(25);
    expect(v.details.data_flow_alignment.skipped).toBe(true);
    expect(v.details.data_flow_alignment.reason).toMatch(/backend-only/i);
    // The pre-existing exemption uses skipped:true, NOT the new applicable:false marker.
    expect(v.details.data_flow_alignment.applicable).toBeUndefined();
  });
});
