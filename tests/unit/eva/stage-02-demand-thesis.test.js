/**
 * SD-FDBK-INFRA-TRUTH-DEMAND-THESIS-001 (TS-6, FR-4, FR-5) — the producer refuses more often than it
 * produces, and the refusals are the part under test.
 *
 * MEASURED: of 118 ventures at stage >= 2, ONE has a staged thesis and 117 do not. So "no evidence
 * yet" is the DOMINANT path, and the failure that matters is not a crash — it is a plausible
 * six-claim thesis written to satisfy the S21 gate, which passes every structural check while
 * fabricating the evidence. These cases exist to make that outcome impossible to reach by accident.
 */
import { describe, it, expect } from 'vitest';
import {
  decideDemandThesisAction,
  attachDemandThesisArtifact
} from '../../../lib/eva/stage-templates/analysis-steps/stage-02-demand-thesis.js';

function validThesis() {
  return {
    claims: {
      WHO: { statement: 'Solopreneur', falsified_by: 'nobody signs up', evidence_grade: 'E1' },
      PAIN: { statement: 'research is slow', falsified_by: 'users say it is fast', evidence_grade: 'E1' },
      ALTERNATIVES: { statement: 'spreadsheets', falsified_by: 'an incumbent already solves it', evidence_grade: 'E2' },
      CHANNEL: { channels: ['SEO'], falsified_by: 'no qualified traffic', evidence_grade: 'E1' },
      WTP: { price_point: '$29', falsified_by: 'nobody converts', evidence_grade: 'E1-anchor / E0-elicitation' },
      KILL_CRITERIA: { kills: [{ criterion: 'dies below 10 signups', threshold: '< 10 / 14 days' }] }
    }
  };
}
const staged = (thesis = validThesis()) => ({ demand_thesis_staged: { thesis, reason: 'promote verbatim' } });

describe('TS-6: no staged thesis -> REFUSE, never author one', () => {
  it('refuses and NAMES the missing evidence', () => {
    const d = decideDemandThesisAction({ ventureMetadata: {}, typePending: false });
    expect(d.action).toBe('refuse');
    expect(d.reason).toContain('NO_ADJUDICATED_THESIS');
    // A refusal that does not say what would satisfy it is just a failure.
    expect(d.reason).toMatch(/author-not-adjudicator|adjudicated by a separate reviewer/);
    expect(d.artifact).toBeUndefined();
  });

  it('emits NO artifact — the killing mutation is any branch that fabricates one', () => {
    const out = attachDemandThesisArtifact({ analysis: 'x' }, { ventureMetadata: null, typePending: false });
    // No typed artifacts[] is emitted at all on a non-promote path, so the engine keeps its normal
    // single-artifact route for truth_ai_critique. Emitting an empty array would be harmless today
    // (consumers check length > 0) but would signal an intent to co-emit that does not exist.
    expect(out.artifacts).toBeUndefined();
    expect(out.demand_thesis.action).toBe('refuse');
    // Stage 2 still completes — a venture without a thesis is not a broken venture.
    expect(out.analysis).toBe('x');
  });

  it('is TOTAL across malformed metadata', () => {
    for (const md of [null, undefined, 42, 'x', {}, { demand_thesis_staged: null }, { demand_thesis_staged: {} }]) {
      expect(() => decideDemandThesisAction({ ventureMetadata: md, typePending: false })).not.toThrow();
      expect(decideDemandThesisAction({ ventureMetadata: md, typePending: false }).action).toBe('refuse');
    }
  });
});

describe('the four defects the EXEC sub-agents found in this producer', () => {
  it('CHECK_FAILED is distinguished from GENUINELY ABSENT', async () => {
    // A systemic DB blip must not read as "no venture in the fleet has a thesis". Same
    // absence-mistaken-for-a-verdict error this SD is about, which I reproduced in my own fail-soft.
    const { CHECK_FAILED } = await import('../../../lib/eva/stage-templates/analysis-steps/stage-02-demand-thesis.js');
    const d = decideDemandThesisAction({ ventureMetadata: CHECK_FAILED, typePending: false });
    expect(d.action).toBe('refuse');
    expect(d.reason).toContain('THESIS_CHECK_FAILED');
    expect(d.reason).toMatch(/UNKNOWN/);
    // And it must NOT claim absence.
    expect(d.reason).not.toContain('NO_ADJUDICATED_THESIS');
  });

  it('co-emission does NOT drop stage 2 own artifact', () => {
    /**
     * *** THIS WAS SILENT DATA LOSS. *** Both consumers treat a non-empty typed artifacts[] as
     * EXCLUSIVE, so appending only the thesis meant truth_ai_critique — stage 2's actual job — was
     * never written. The stage would have reported success while losing its primary output. Dormant
     * only because the DDL gate makes promote unreachable; it fires on the first post-migration run.
     */
    const out = attachDemandThesisArtifact(
      { critiques: ['a'], compositeScore: 7 },
      { ventureMetadata: staged(), typePending: false }
    );
    expect(out.artifacts.map((a) => a.artifactType))
      .toEqual(['truth_ai_critique', 'truth_demand_thesis']);
    expect(out.artifacts[0].payload.compositeScore).toBe(7);
  });

  it('claims no faithfulness guarantee it cannot compute — the field is GONE', () => {
    /**
     * *** I SHIPPED A FALSE 'faithful: true' THREE TIMES BEFORE DELETING IT. ***
     * v1 compared the source to itself. v2 compared a shallow-spread payload to the source — the
     * SAME REFERENCE. v3 added a basis string my own mutation defeated by hardcoding it. Each
     * rewrite made the claim look more computed while remaining exactly as vacuous.
     *
     * Through this function the payload is ALWAYS a verbatim spread, so a key-set comparison can
     * never fail: the branch is unreachable by construction and no test can force it. So the
     * computed-looking boolean is gone, replaced by a statement about HOW the artifact was built —
     * verifiable by reading the code rather than by trusting a flag.
     */
    const md = staged();
    const d = decideDemandThesisAction({ ventureMetadata: md, typePending: false });
    expect(d.action).toBe('promote');
    // No fabricated guarantee.
    expect(d.artifact.payload.provenance.faithful).toBeUndefined();
    expect(d.artifact.payload.provenance.faithful_basis).toBeUndefined();
    // An honest, checkable statement instead.
    expect(d.artifact.payload.provenance.promotion_method).toBe('verbatim_spread');
    // And the thing that claim asserts is TRUE: the promoted claims are the adjudicated object.
    expect(d.artifact.payload.claims).toBe(md.demand_thesis_staged.thesis.claims);
  });

  it('an unrecognised gate-file shape is treated as PENDING, not permitted', async () => {
    const { isArtifactTypePendingChairmanGate } = await import('../../../lib/eva/stage-templates/analysis-steps/stage-02-demand-thesis.js');
    // Valid JSON, no `allow` key — previously fell through to "not pending" and would have attempted
    // a write that raises 23514 fleet-wide.
    const { writeFileSync, mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'gate-'));
    const p = join(dir, 'g.json');
    writeFileSync(p, JSON.stringify({ _doc: 'no allow key here' }));
    expect(isArtifactTypePendingChairmanGate('truth_demand_thesis', { gatePath: p })).toBe(true);
    writeFileSync(p, JSON.stringify({ allow: { truth_demand_thesis: 'x' } }));
    expect(isArtifactTypePendingChairmanGate('truth_demand_thesis', { gatePath: p })).toBe(true);
    writeFileSync(p, JSON.stringify({ allow: {} }));
    expect(isArtifactTypePendingChairmanGate('truth_demand_thesis', { gatePath: p })).toBe(false);
  });
});

describe('FR-3: a staged thesis that fails the bar is ESCALATED, not repaired', () => {
  it('refuses and lists the violations rather than filling the gap', () => {
    const bad = validThesis();
    delete bad.claims.PAIN.falsified_by;
    const d = decideDemandThesisAction({ ventureMetadata: staged(bad), typePending: false });
    expect(d.action).toBe('refuse');
    expect(d.reason).toContain('STAGED_THESIS_NOT_FALSIFIABLE');
    expect(d.violations.map((v) => v.code)).toContain('NOT_FALSIFIABLE');
    // The point: it did NOT promote a repaired version. Quietly improving a source is
    // indistinguishable from fabricating it.
    expect(d.artifact).toBeUndefined();
  });
});

describe('FR-5: the write cannot succeed yet, so DEFER rather than break stage 2', () => {
  it('defers with the migration named, and does not emit', () => {
    const d = decideDemandThesisAction({ ventureMetadata: staged(), typePending: true });
    expect(d.action).toBe('defer');
    expect(d.reason).toContain('DDL_PENDING');
    expect(d.reason).toContain('20260716_add_truth_demand_thesis_artifact_type.sql');
    // Deferral is not failure — says so explicitly, because a reader seeing "not produced" would
    // otherwise assume the thesis was rejected.
    expect(d.reason).toMatch(/deferral, not a failure/);
  });

  it('a deferral would otherwise raise 23514 on EVERY stage-2 run — 117 ventures, not one', () => {
    const out = attachDemandThesisArtifact({ analysis: 'x' }, { ventureMetadata: staged(), typePending: true });
    // No typed artifacts[] is emitted at all on a non-promote path, so the engine keeps its normal
    // single-artifact route for truth_ai_critique. Emitting an empty array would be harmless today
    // (consumers check length > 0) but would signal an intent to co-emit that does not exist.
    expect(out.artifacts).toBeUndefined();
    expect(out.demand_thesis.action).toBe('defer');
  });
});

describe('FR-4: promotion is verbatim, with provenance', () => {
  it('promotes once the gate clears, carrying the source on the payload', () => {
    const d = decideDemandThesisAction({ ventureMetadata: staged(), typePending: false });
    expect(d.action).toBe('promote');
    expect(d.artifact.artifactType).toBe('truth_demand_thesis');
    expect(d.artifact.payload.claims).toEqual(validThesis().claims);
    expect(d.artifact.payload.provenance).toMatchObject({
      source: 'ventures.metadata.demand_thesis_staged',
      promoted_verbatim: true,
      promotion_method: 'verbatim_spread'
    });
  });

  it('co-emits via the typed-array contract the engine already detects', () => {
    const out = attachDemandThesisArtifact(
      { analysis: 'x', artifacts: [{ artifactType: 'truth_ai_critique', payload: {}, source: 'analysis-step:stage-02' }] },
      { ventureMetadata: staged(), typePending: false }
    );
    expect(out.artifacts).toHaveLength(2);
    expect(out.artifacts.map((a) => a.artifactType)).toEqual(['truth_ai_critique', 'truth_demand_thesis']);
    // Stage 2's existing output is untouched — co-emission, not replacement.
    expect(out.artifacts[0].payload).toEqual({});
  });

  it('NEGATIVE CONTROL: promote is reachable, so the refusals above are choices not dead ends', () => {
    // Without this, every assertion in this file could be satisfied by a producer that refuses
    // unconditionally — which would pass while delivering nothing.
    expect(decideDemandThesisAction({ ventureMetadata: staged(), typePending: false }).action).toBe('promote');
  });
});
