// SD-LEO-INFRA-FLEET-WIDE-AUDIT-001 -- fleet-wide venture design-pass classifier.
// Pure-function tests against classifyVenture(); no DB/filesystem IO.
import { describe, it, expect } from 'vitest';
import { classifyVenture } from '../../../scripts/audit-venture-design-pass.mjs';

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

  // TS-5: Canvas AI-class -- repo entirely absent, no build artifact
  it('no build artifact + repo absent (commitCount null) => latent_at_risk, not guessed', () => {
    const v = classifyVenture({ hasBuildArtifact: false, commitCount: null, repoExists: false, structuralUi: false, stitchCount: 0, designFidelityScore: null });
    expect(v.build_state).toBe('latent');
    expect(v.disposition).toBe('latent_at_risk');
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
