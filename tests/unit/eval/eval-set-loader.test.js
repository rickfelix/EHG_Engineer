/**
 * SD-LEO-INFRA-SHADOW-TRIAL-RATIFICATION-001-B — eval-set loader: floor
 * bookkeeping (TS-2), tamper refusal (TS-3), system_events fallback (TS-6),
 * hash determinism, and the known-bad closure replay (TS-4).
 */
import { describe, it, expect } from 'vitest';
import {
  evalCaseHash,
  computeFloorBookkeeping,
  loadEvalSet,
} from '../../../lib/eval/eval-set-loader.mjs';
import { EVAL_SET_CLASSES, EVAL_SET_CORPORA } from '../../../lib/eval/eval-set-fixtures.mjs';
import { evaluateLoopClosure } from '../../../lib/loop-governance/closure-engine.js';

/** Sealed-row factory mirroring seal-eval-set.mjs metadata shape. */
function sealedRow(evalCase, { tamper = false, id } = {}) {
  const content_hash = evalCaseHash(evalCase);
  const sealed = tamper ? { ...evalCase, adjudication_evidence: 'TAMPERED' } : evalCase;
  return {
    id: id || `row-${evalCase.case_id}`,
    metadata: {
      record_kind: 'eval_case',
      artifact_class: 'closure_predicates',
      case_id: evalCase.case_id,
      content_hash,
      synthetic: evalCase.synthetic === true,
      known_bad: evalCase.known_bad === true,
      case: sealed,
    },
  };
}

/** Table-keyed supabase stub; failures stub the .eq() thenable, never throw. */
function stubDb({ feedback, feedbackError = null, events = [], eventsError = null } = {}) {
  return {
    from(table) {
      const result = table === 'feedback'
        ? { data: feedback, error: feedbackError }
        : { data: events, error: eventsError };
      return { select: () => ({ eq: () => Promise.resolve(result) }) };
    },
  };
}

describe('evalCaseHash determinism', () => {
  it('is stable under key reordering (canonical sorted-key serialization)', () => {
    const c = EVAL_SET_CORPORA.closure_predicates[0];
    const reorder = (v) => {
      if (v === null || typeof v !== 'object' || Array.isArray(v)) return v;
      const out = {};
      for (const k of Object.keys(v).reverse()) out[k] = reorder(v[k]);
      return out;
    };
    expect(evalCaseHash(reorder(c))).toBe(evalCaseHash(c));
  });
  it('is full sha256 hex (child A diffHash semantics)', () => {
    expect(evalCaseHash(EVAL_SET_CORPORA.closure_predicates[0])).toMatch(/^[0-9a-f]{64}$/);
  });
  it('changes when hashed content changes', () => {
    const c = EVAL_SET_CORPORA.closure_predicates[0];
    expect(evalCaseHash({ ...c, adjudicated_status: 'open' })).not.toBe(evalCaseHash(c));
  });
});

describe('GT-floor bookkeeping (TS-2)', () => {
  it('closure_predicates corpus meets the floor with zero synthetic', () => {
    const b = computeFloorBookkeeping(EVAL_SET_CORPORA.closure_predicates);
    expect(b).toEqual({ real_count: 4, synthetic_count: 0, known_bad_present: true, floor_met: true, experimental: false });
  });
  it('leo_protocol_sections corpus is experimental — synthetic never counts toward the floor', () => {
    const b = computeFloorBookkeeping(EVAL_SET_CORPORA.leo_protocol_sections);
    expect(b.real_count).toBe(2);
    expect(b.synthetic_count).toBe(3);
    expect(b.floor_met).toBe(false);
    expect(b.experimental).toBe(true);
  });
  it('synthetic known-bads do not satisfy the known-bad requirement', () => {
    const cases = [
      { case_id: 'a', synthetic: false }, { case_id: 'b', synthetic: false }, { case_id: 'c', synthetic: false },
      { case_id: 'd', synthetic: true, known_bad: true },
    ];
    expect(computeFloorBookkeeping(cases).floor_met).toBe(false);
  });
});

describe('loadEvalSet (TS-3, TS-6)', () => {
  const corpus = EVAL_SET_CORPORA.closure_predicates;

  it('loads sealed cases from feedback and reports floor bookkeeping', async () => {
    const db = stubDb({ feedback: corpus.map((c) => sealedRow(c)) });
    const r = await loadEvalSet(db, 'closure_predicates');
    expect(r.cases).toHaveLength(4);
    expect(r.refused).toHaveLength(0);
    expect(r.bookkeeping.floor_met).toBe(true);
  });

  it('refuses a tampered case with EVAL_CASE_HASH_MISMATCH; untampered still load (TS-3)', async () => {
    const rows = corpus.map((c, i) => sealedRow(c, { tamper: i === 0 }));
    const r = await loadEvalSet(stubDb({ feedback: rows }), 'closure_predicates');
    expect(r.refused).toHaveLength(1);
    expect(r.refused[0].error).toBe('EVAL_CASE_HASH_MISMATCH');
    expect(r.cases).toHaveLength(3);
  });

  it('falls back to the system_events mirror when feedback errors (TS-6)', async () => {
    const events = corpus.map((c) => ({ id: `ev-${c.case_id}`, payload: sealedRow(c).metadata }));
    const db = stubDb({ feedback: null, feedbackError: { message: 'boom' }, events });
    const r = await loadEvalSet(db, 'closure_predicates');
    expect(r.cases).toHaveLength(4);
  });

  it('throws a generic error when both stores fail', async () => {
    const db = stubDb({ feedback: null, feedbackError: { message: 'a' }, events: null, eventsError: { message: 'b' } });
    await expect(loadEvalSet(db, 'closure_predicates')).rejects.toThrow(/unavailable from both stores/);
  });

  it('rejects unknown classes', async () => {
    await expect(loadEvalSet(stubDb({}), 'nope')).rejects.toThrow(/unknown artifact class/);
  });
});

describe('known-bad false-CLOSE replay (TS-4)', () => {
  it('every closure case replays through evaluateLoopClosure at its pinned now', () => {
    for (const c of EVAL_SET_CORPORA.closure_predicates) {
      const { status } = evaluateLoopClosure(c.loop, c.evidence, new Date(c.now));
      expect(status, c.case_id).toBe(c.engine_verdict_expected);
    }
  });
  it('the known-bad case is the engine-vs-adjudication mismatch by design', () => {
    const kb = EVAL_SET_CORPORA.closure_predicates.find((c) => c.known_bad);
    expect(kb.engine_verdict_expected).toBe('closed');
    expect(kb.adjudicated_status).toBe('open');
  });
  it('non-known-bad cases agree with their adjudication', () => {
    for (const c of EVAL_SET_CORPORA.closure_predicates.filter((c) => !c.known_bad)) {
      expect(c.engine_verdict_expected, c.case_id).toBe(c.adjudicated_status);
    }
  });
});

describe('class registry', () => {
  it('registers exactly the two child-A artifact classes with distinct categories', () => {
    expect(Object.keys(EVAL_SET_CLASSES).sort()).toEqual(['closure_predicates', 'leo_protocol_sections']);
    expect(EVAL_SET_CLASSES.closure_predicates.category).not.toBe(EVAL_SET_CLASSES.leo_protocol_sections.category);
  });
});
