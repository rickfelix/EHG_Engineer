// SD-LEO-INFRA-FLEET-WIDE-AUDIT-001 -- fleet-wide venture design-pass classifier.
// classifyVenture() tests are pure (no IO); the runAudit() filter test below uses a
// hand-rolled fake supabase client (no live DB), per repo convention for DB-touching logic.
import { describe, it, expect } from 'vitest';
import { classifyVenture, runAudit } from '../../../scripts/audit-venture-design-pass.mjs';

describe('classifyVenture', () => {
  // TS-1: MarketLens -- realized, no design evidence
  it('realized + no design evidence => realized_defect', () => {
    const v = classifyVenture({ hasBuildArtifact: true, commitCount: 52, repoExists: true, structuralUi: false, stitchCount: 0, designFidelityScore: null });
    expect(v).toEqual({ build_state: 'realized', design_pass: 'no', evidence_basis: 'none', disposition: 'realized_defect' });
  });

  // TS-2: Market Modeling SaaS -- never built, empty repo
  it('no build artifact + zero commits => latent_at_risk, not realized_defect', () => {
    const v = classifyVenture({ hasBuildArtifact: false, commitCount: 0, repoExists: true, structuralUi: false, stitchCount: 0, designFidelityScore: null });
    expect(v.build_state).toBe('latent');
    expect(v.disposition).toBe('latent_at_risk');
    expect(v.disposition).not.toBe('realized_defect');
  });

  // TS-3: DataDistill-class -- venture_type is not part of the input at all; structural UI alone flips the verdict
  it('realized + structural site-UI directory => realized_design_pass_confirmed regardless of any "backend" label', () => {
    const v = classifyVenture({ hasBuildArtifact: true, commitCount: 29, repoExists: true, structuralUi: true, stitchCount: 0, designFidelityScore: null });
    expect(v.design_pass).toBe('yes');
    expect(v.evidence_basis).toBe('structural_ui');
    expect(v.disposition).toBe('realized_design_pass_confirmed');
  });

  // TS-4: CronLinter-class -- realized, cancelled, no design evidence
  it('realized + no design evidence + cancelled venture still classifies as realized_defect (is_cancelled is separate from disposition)', () => {
    const v = classifyVenture({ hasBuildArtifact: true, commitCount: 48, repoExists: true, structuralUi: false, stitchCount: 0, designFidelityScore: null });
    expect(v.disposition).toBe('realized_defect');
    // is_cancelled is applied by the caller (runAudit) from ventures.status, not by classifyVenture itself.
  });

  // TS-5: Canvas AI-class -- repo entirely absent, no build artifact. This is a DIFFERENT
  // evidentiary state from Market Modeling SaaS (TS-2: repo confirmed present with zero
  // commits) -- an absent directory cannot confirm whether the venture was never built or was
  // built and later removed, so it must NOT be silently defaulted to either realized_defect
  // OR latent_at_risk (PLAN_VERIFICATION row a549d94f caught an earlier version of this test
  // asserting the wrong, implementation-conformed expectation instead of the PRD's own spec).
  it('no build artifact + repo directory absent => insufficient_evidence, not guessed as latent_at_risk', () => {
    const v = classifyVenture({ hasBuildArtifact: false, commitCount: null, repoExists: false, structuralUi: false, stitchCount: 0, designFidelityScore: null });
    expect(v.build_state).toBe('insufficient_evidence');
    expect(v.disposition).toBe('insufficient_evidence');
    expect(v.disposition).not.toBe('latent_at_risk');
  });

  it('build artifact recorded but real committed code exists with no artifact => flagged as insufficient_evidence, not guessed', () => {
    const v = classifyVenture({ hasBuildArtifact: false, commitCount: 5, repoExists: true, structuralUi: false, stitchCount: 0, designFidelityScore: null });
    expect(v.build_state).toBe('insufficient_evidence');
    expect(v.disposition).toBe('insufficient_evidence');
  });

  // TS-6 (s17_approved exclusion): s17_approved is not even an input to this function -- structural
  // proof that it cannot influence the verdict, since hasBuildArtifact/structuralUi/stitchCount/
  // designFidelityScore are the only signals classifyVenture accepts.
  it('s17_approved has no code path into classifyVenture at all', () => {
    const fnSource = classifyVenture.toString();
    expect(fnSource).not.toMatch(/s17_approved/);
  });

  // TS-7: a completed child SD can never flip design_pass, because classifyVenture has no
  // child-SD input at all -- the fix for the TESTING-caught MarketLens-inversion bug is that
  // this signal was removed from the function's input surface entirely, not merely deprioritized.
  it('classifyVenture accepts no child-SD-linked input, so a completed child SD structurally cannot override design_pass', () => {
    const v = classifyVenture({ hasBuildArtifact: true, commitCount: 52, repoExists: true, structuralUi: false, stitchCount: 0, designFidelityScore: null, completedChildSd: true });
    expect(v.design_pass).toBe('no'); // the extraneous completedChildSd input is silently ignored
    expect(v.disposition).toBe('realized_defect');
  });

  // TS-8: synthetic fixtures proving the stitch/score positive paths work even though no live
  // venture currently exercises them.
  it('stitch_artifact evidence produces design_pass=yes with evidence_basis=stitch_artifact', () => {
    const v = classifyVenture({ hasBuildArtifact: true, commitCount: 10, repoExists: true, structuralUi: false, stitchCount: 1, designFidelityScore: null });
    expect(v).toMatchObject({ design_pass: 'yes', evidence_basis: 'stitch_artifact', disposition: 'realized_design_pass_confirmed' });
  });

  it('a non-null design_fidelity_score produces design_pass=yes with evidence_basis=design_fidelity_score', () => {
    const v = classifyVenture({ hasBuildArtifact: true, commitCount: 10, repoExists: true, structuralUi: false, stitchCount: 0, designFidelityScore: 0.82 });
    expect(v).toMatchObject({ design_pass: 'yes', evidence_basis: 'design_fidelity_score', disposition: 'realized_design_pass_confirmed' });
  });

  it('design_fidelity_score takes priority over stitch/structural evidence in evidence_basis reporting', () => {
    const v = classifyVenture({ hasBuildArtifact: true, commitCount: 10, repoExists: true, structuralUi: true, stitchCount: 1, designFidelityScore: 0.9 });
    expect(v.evidence_basis).toBe('design_fidelity_score');
  });
});

// TS-9/TS-10: fake supabase client covering ventures, applications (incl. the orphaned-rows
// query), venture_artifacts, and strategic_directives_v2 (remediation_status lookup).
function fakeSupabase({ ventureRows = [], orphanedApps = [] } = {}) {
  return {
    from(table) {
      if (table === 'ventures') {
        // FR-6 batch 9 (SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001): the read now paginates
        // via fetchAllPaginated, which calls .order() (chainable) then .range() (terminal)
        // instead of awaiting .eq() directly — extend the chain, same filtering logic.
        return {
          select: () => ({
            eq: (col, val) => {
              const filtered = ventureRows.filter((v) => v[col] === val);
              const chain = { order: () => chain, range: () => Promise.resolve({ data: filtered, error: null }) };
              return chain;
            },
          }),
        };
      }
      if (table === 'applications') {
        return {
          select: () => ({
            // bare await supabase.from('applications').select(...) -- no local_path anywhere
            then: (resolve) => resolve({ data: [], error: null }),
            is: (col, val) => Promise.resolve({ data: val === null ? orphanedApps : [], error: null }),
          }),
        };
      }
      if (table === 'venture_artifacts') {
        return {
          select: () => ({
            eq: () => ({
              in: () => Promise.resolve({ data: [], error: null }),
              like: () => Promise.resolve({ count: 0, error: null }),
            }),
          }),
        };
      }
      if (table === 'strategic_directives_v2') {
        return { select: () => ({ eq: () => ({ not: () => Promise.resolve({ data: [], error: null }) }) }) };
      }
      throw new Error(`unexpected table in fakeSupabase: ${table}`);
    },
  };
}

describe('runAudit venture filter (TS-9)', () => {
  it('returns exactly the leo_bridge-tagged ventures, excluding non-matching build_model rows', async () => {
    const ventureRows = [
      { id: '1', name: 'MarketLens', status: 'active', build_model: 'leo_bridge' },
      { id: '2', name: 'CronLinter', status: 'cancelled', build_model: 'leo_bridge' },
      { id: '3', name: 'DataDistill', status: 'active', build_model: 'leo_bridge' },
      { id: '4', name: 'CronGenius', status: 'cancelled', build_model: 'leo_bridge' },
      { id: '5', name: 'Market Modeling SaaS', status: 'active', build_model: 'leo_bridge' },
      { id: '6', name: 'Canvas AI', status: 'cancelled', build_model: 'leo_bridge' },
      { id: '7', name: 'Seeded Repo Venture', status: 'active', build_model: 'seeded_repo' },
      { id: '8', name: 'Untyped Venture', status: 'active', build_model: null },
    ];
    const { results } = await runAudit({ supabase: fakeSupabase({ ventureRows }), dryRun: true });
    const names = results.map((r) => r.venture_name).sort();
    expect(names).toEqual(['Canvas AI', 'CronGenius', 'CronLinter', 'DataDistill', 'Market Modeling SaaS', 'MarketLens']);
    expect(names).not.toContain('Seeded Repo Venture');
    expect(names).not.toContain('Untyped Venture');
  });
});

// TS-10: orphaned applications rows (no linked venture) must surface separately, never merged
// into or silently dropped from the ventures ledger.
describe('runAudit orphaned applications (TS-10)', () => {
  it('surfaces venture_id=NULL applications rows in a separate result set', async () => {
    const orphanedApps = [
      { name: 'Cron Canary', local_path: 'C:/Users/rickf/Projects/_EHG/cron-canary' },
      { name: 'PrivacyPatrol AI', local_path: 'C:/Users/rickf/Projects/_EHG/privacypatrol-ai' },
    ];
    const { results, orphanedApplications } = await runAudit({ supabase: fakeSupabase({ ventureRows: [], orphanedApps }), dryRun: true });
    expect(results).toEqual([]); // no ventures in this fixture -- proves the two result sets are independent
    expect(orphanedApplications.map((a) => a.name).sort()).toEqual(['Cron Canary', 'PrivacyPatrol AI']);
  });
});
