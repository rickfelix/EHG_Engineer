/**
 * SD-LEO-INFRA-SHADOW-TRIAL-RATIFICATION-001-C — shadow-run replay core:
 * TS-1 identity, TS-2 broken-proposal regression catch (GT-replay), TS-3
 * unknown-class/empty-corpus fall-through, packet-contract fidelity.
 */
import { describe, it, expect } from 'vitest';
import { shadowRun, closurePredicateEvaluator, DEFAULT_EVALUATORS } from '../../../../lib/governance/shadow-trial/shadow-run.mjs';
import { composePrecheckPacket, RECOMMENDATIONS, isCaseResult } from '../../../../lib/governance/shadow-trial/precheck-packet.mjs';
import { EVAL_SET_CORPORA } from '../../../../lib/eval/eval-set-fixtures.mjs';
import { computeFloorBookkeeping } from '../../../../lib/eval/eval-set-loader.mjs';

const cases = EVAL_SET_CORPORA.closure_predicates;
const corpus = {
  artifact_class: 'closure_predicates',
  cases,
  refused: [],
  bookkeeping: computeFloorBookkeeping(cases),
};

const identityProposal = {
  artifact_class: 'closure_predicates',
  target_ref: 'loop_registry:L30',
  proposed_predicate: null, // no change
};

// Century window: every stale edge reads fresh — the classic false-CLOSE degenerate.
const brokenProposal = {
  artifact_class: 'closure_predicates',
  target_ref: 'loop_registry:L30',
  proposed_predicate: { window_seconds: 100 * 365 * 86400 },
};

describe('TS-1 identity replay', () => {
  it('4/4 cases: delta none, regression false, adjudicated outcomes reproduced', () => {
    const run = shadowRun({ proposal: identityProposal, corpus });
    expect(run.fall_through).toBe(false);
    expect(run.results).toHaveLength(4);
    for (const r of run.results) {
      expect(r.delta, r.case_id).toBeNull();
      expect(r.regression, r.case_id).toBe(false);
      expect(r.proposed_verdict, r.case_id).toBe(r.current_verdict);
    }
    const packet = composePrecheckPacket(run.results, { proposalId: 'p-identity' });
    expect(packet.recommendation).toBe(RECOMMENDATIONS.SAFE);
  });

  it('current_verdict is the ADJUDICATED truth, never the naive engine output (known-bad case)', () => {
    const run = shadowRun({ proposal: identityProposal, corpus });
    const cp004 = run.results.find((r) => r.case_id === 'CP-004-known-bad-liveness-only-false-close');
    expect(cp004.current_verdict).toBe('open'); // adjudicated truth; the naive engine says closed
    expect(cp004.regression).toBe(false); // identity proposal owns no pre-existing corpus defect
  });
});

describe('TS-2 broken proposal (GT-replay catch)', () => {
  it('the century-window proposal false-CLOSEs CP-003 and is flagged regression', () => {
    const run = shadowRun({ proposal: brokenProposal, corpus });
    const cp003 = run.results.find((r) => r.case_id === 'CP-003-open-fired-but-edge-stale');
    expect(cp003.proposed_verdict).toBe('closed');
    expect(cp003.delta).toBe('open->closed');
    expect(cp003.regression).toBe(true);
    const packet = composePrecheckPacket(run.results, { proposalId: 'p-broken' });
    expect(packet.recommendation).toBe(RECOMMENDATIONS.REGRESSIONS);
  });

  it('a proposal that FIXES the known-bad is NOT a regression (improvement reads clean)', () => {
    // Narrow window: CP-004's 6h-old liveness edge STILL reads fresh (not a fix for
    // liveness-masquerade), so instead prove via injected evaluator: engine newly
    // agrees with truth on the known-bad -> regression false.
    const fixingEvaluators = {
      ...DEFAULT_EVALUATORS,
      closure_predicates: (evalCase, proposal) => {
        const base = closurePredicateEvaluator(evalCase, proposal ? proposal.proposed_predicate : null);
        if (proposal && evalCase.known_bad) return { engineCurrent: base.engineCurrent, engineProposed: 'open' };
        return base;
      },
    };
    const run = shadowRun({ proposal: brokenProposal, corpus, evaluators: fixingEvaluators });
    const cp004 = run.results.find((r) => r.case_id === 'CP-004-known-bad-liveness-only-false-close');
    expect(cp004.regression).toBe(false); // engine changed TO the adjudicated truth
    expect(cp004.proposed_verdict).toBe('open');
  });

  it('re-breaking a case in a NEW wrong direction flags regression', () => {
    const wrongEvaluators = {
      ...DEFAULT_EVALUATORS,
      closure_predicates: (evalCase) => ({
        engineCurrent: evalCase.engine_verdict_expected,
        engineProposed: 'starved', // wrong for every case whose truth is not starved
      }),
    };
    const run = shadowRun({ proposal: brokenProposal, corpus, evaluators: wrongEvaluators });
    const cp001 = run.results.find((r) => r.case_id === 'CP-001-l30-measured-decline-closed');
    expect(cp001.regression).toBe(true);
    expect(cp001.delta).toBe('closed->starved');
  });
});

describe('TS-3 fail-closed fall-through', () => {
  it('unknown artifact class: no verdict, empty results, explicit reason', () => {
    const run = shadowRun({ proposal: { artifact_class: 'unknown_thing' }, corpus });
    expect(run.fall_through).toBe(true);
    expect(run.results).toEqual([]);
    expect(run.reason).toMatch(/unknown artifact class/);
    // Empty results compose to insufficient_evidence — never a fabricated verdict.
    const packet = composePrecheckPacket(run.results, { proposalId: 'p-x' });
    expect(packet.recommendation).toBe(RECOMMENDATIONS.INSUFFICIENT);
    expect(packet.confidence).toBe(0);
  });

  it('missing/empty/mismatched corpus: fall-through, never fabricated', () => {
    for (const bad of [null, { artifact_class: 'closure_predicates', cases: [] }, { artifact_class: 'other', cases: [{}] }]) {
      const run = shadowRun({ proposal: identityProposal, corpus: bad });
      expect(run.fall_through).toBe(true);
      expect(run.results).toEqual([]);
    }
  });
});

describe('packet-contract fidelity', () => {
  it('every emitted row passes composePrecheckPacket.isCaseResult (no silent drops)', () => {
    const run = shadowRun({ proposal: brokenProposal, corpus });
    for (const r of run.results) expect(isCaseResult(r), r.case_id).toBe(true);
    const packet = composePrecheckPacket(run.results, { proposalId: 'p-b' });
    expect(packet.per_case).toHaveLength(run.results.length);
  });
});

describe('leo_protocol_sections evaluator (experimental pipeline exercise)', () => {
  it('a proposal targeting a sealed known-bad section class flags regression', () => {
    const sCases = EVAL_SET_CORPORA.leo_protocol_sections;
    const sCorpus = { artifact_class: 'leo_protocol_sections', cases: sCases, refused: [], bookkeeping: computeFloorBookkeeping(sCases) };
    const proposal = {
      artifact_class: 'leo_protocol_sections',
      target_ref: 'session_prologue rule 4 (USE PROCESS SCRIPTS)',
      proposed_diff: 'reintroduce the 3/SD + 10/day bypass quota as a generic cap',
    };
    const run = shadowRun({ proposal, corpus: sCorpus });
    const ps001 = run.results.find((r) => r.case_id === 'PS-001-bypass-quota-folklore');
    expect(ps001.regression).toBe(true);
    // Synthetic cases never contribute regressions (pipeline exercise only).
    for (const r of run.results.filter((x) => x.case_id.startsWith('PS-00') && ['PS-003', 'PS-004', 'PS-005'].some((p) => x.case_id.startsWith(p)))) {
      expect(r.regression).toBe(false);
    }
  });
});
