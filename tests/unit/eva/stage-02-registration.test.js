/**
 * SD-FDBK-INFRA-TRUTH-DEMAND-THESIS-001 (TS-2) — the producer is registered where dispatch ACTUALLY
 * happens, and the decoy registry is proven to be a decoy.
 *
 * *** REGISTERING IN THE WRONG PLACE WOULD SHIP A PRODUCER THAT EXISTS AND NEVER RUNS — WHICH IS
 * EXACTLY THE DEFECT THIS SD EXISTS TO END, REPRODUCED BY ITS OWN FIX. ***
 * There are two registries. `TEMPLATE.analysisStep` in stage-templates/stage-NN.js is resolved by
 * glob discovery and called by both the manual engine and the daemon. `analysis-steps/index.js`
 * getAnalysisStep() is the other one, and it has ZERO callers outside its own definition file — its
 * stage-21 mapping is provably not the S21 producer that runs in production.
 *
 * So this file asserts BOTH directions. Asserting only that the real one works would pass equally
 * well on a codebase where someone had *also* wired the decoy and believed it did something.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import TEMPLATE from '../../../lib/eva/stage-templates/stage-02.js';
import { ARTIFACT_TYPE_BY_STAGE, ARTIFACT_TYPES } from '../../../lib/eva/artifact-types.js';

describe('TS-2: registration is on the live dispatch path', () => {
  it('stage-02 TEMPLATE.analysisStep is a function — the path the engine actually calls', () => {
    expect(typeof TEMPLATE.analysisStep).toBe('function');
  });

  it('analysisStep is WRAPPED, not the bare stage-2 function — the wiring is what is under test', async () => {
    /**
     * *** THE FIRST VERSION OF THIS TEST CALLED THE REAL TEMPLATE AND TIMED OUT AT 60 SECONDS,
     * BECAUSE analyzeStage02 MAKES A LIVE LLM CALL. *** A unit test doing network I/O is slow,
     * flaky, and — worse — its failure mode is indistinguishable from a provider outage, so a real
     * regression here would have been dismissed as "the LLM was down".
     *
     * The wiring claim does not need the network. It is: stage-02's analysisStep is NOT the bare
     * analyzeStage02, and the wrapper composes it with the thesis attachment. Comparing identity
     * against the unwrapped import proves exactly that, and fails the moment someone reverts
     * `TEMPLATE.analysisStep = analyzeStage02`. The co-emission BEHAVIOUR is covered without a
     * network in stage-02-demand-thesis.test.js.
     */
    const { analyzeStage02 } = await import('../../../lib/eva/stage-templates/analysis-steps/stage-02-multi-persona.js');
    expect(TEMPLATE.analysisStep).not.toBe(analyzeStage02);

    const src = readFileSync('lib/eva/stage-templates/stage-02.js', 'utf8');
    expect(src).toContain('attachDemandThesisArtifact');
    expect(src).toContain('analyzeStage02(ctx)');
  });

  it('NEGATIVE CONTROL: the decoy registry has no callers, so registering there would be inert', () => {
    // Text-level, deliberately: the claim is about REACHABILITY, and the cheapest honest evidence is
    // that nothing outside the file names getAnalysisStep. If that ever changes, this test should be
    // revisited rather than silently trusted.
    const decoy = readFileSync('lib/eva/stage-templates/analysis-steps/index.js', 'utf8');
    expect(decoy).toContain('getAnalysisStep');
    // The thesis producer must NOT be registered there — if someone adds it, this fails and they
    // are pointed at stage-02.js instead.
    expect(decoy).not.toMatch(/stage-02-demand-thesis|attachDemandThesisArtifact/);
  });
});

describe('TS-2: ARTIFACT_TYPE_BY_STAGE[2] ordering is load-bearing', () => {
  it('includes the thesis type, so the type is reachable by a writer', () => {
    expect(ARTIFACT_TYPE_BY_STAGE[2]).toContain(ARTIFACT_TYPES.TRUTH_DEMAND_THESIS);
  });

  it('keeps TRUTH_AI_CRITIQUE FIRST — [0] is the stage canonical persist type', () => {
    /**
     * Every consumer reads [0]: stage-execution-engine.js:414 and :699, eva-orchestrator.js:544.
     * Prepending the thesis would silently retype EVERY stage-2 artifact to truth_demand_thesis —
     * a data-corrupting change with no error, produced by an edit that looks like reordering a list.
     */
    expect(ARTIFACT_TYPE_BY_STAGE[2][0]).toBe(ARTIFACT_TYPES.TRUTH_AI_CRITIQUE);
  });
});
