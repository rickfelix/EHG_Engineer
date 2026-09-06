/**
 * SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-A — shared provenance module.
 *
 * Pins: content-hash determinism and mismatch detection; the full normalisePhase mapping table
 * (all 12 live-observed spellings plus an unmapped case); pre-cutover rows never graded absent
 * regardless of other fields; each of the four missing-field cases named individually.
 */
import { describe, it, expect } from 'vitest';
import {
  computeContentHash,
  normalisePhase,
  gradeProvenance,
  PRODUCER_ALLOWLIST,
  PROVENANCE_CUTOVER_AT,
  HANDOFF_TYPE_TO_PHASE,
} from './evidence-provenance.js';

describe('computeContentHash', () => {
  it('is deterministic for the same payload content', () => {
    const payload = { verdict: 'PASS', confidence: 90, critical_issues: [], warnings: [], recommendations: [], detailed_analysis: 'x', summary: 'ok' };
    expect(computeContentHash({ ...payload })).toBe(computeContentHash({ ...payload }));
  });

  it('key order does not affect the hash', () => {
    const a = { verdict: 'PASS', confidence: 90 };
    const b = { confidence: 90, verdict: 'PASS' };
    expect(computeContentHash(a)).toBe(computeContentHash(b));
  });

  it('a one-character change in detailed_analysis changes the hash', () => {
    const base = { verdict: 'PASS', confidence: 90, detailed_analysis: 'analysis text' };
    const changed = { ...base, detailed_analysis: 'analysis textX' };
    expect(computeContentHash(base)).not.toBe(computeContentHash(changed));
  });

  it('missing fields default consistently so a partial payload still hashes deterministically', () => {
    expect(computeContentHash({ verdict: 'PASS' })).toBe(computeContentHash({ verdict: 'PASS' }));
  });
});

describe('normalisePhase', () => {
  const cases = [
    ['LEAD', 'LEAD'],
    ['LEAD_TO_PLAN', 'LEAD'],
    ['LEAD-TO-PLAN', 'LEAD'], // SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-D FR-D2: was missing, hyphenated form
    ['LEAD_FINAL', 'LEAD'],
    ['PLAN', 'PLAN'], // SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-D FR-D2: was missing, bare spelling
    ['PLAN_TO_EXEC', 'PLAN'],
    ['PLAN-TO-EXEC', 'PLAN'], // SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-D FR-D2: was missing, hyphenated form
    ['PLAN_TO_LEAD', 'PLAN'],
    ['PLAN-TO-LEAD', 'PLAN'],
    ['PLAN_VERIFICATION', 'PLAN'],
    ['PLAN_PRD', 'PLAN'],
    ['EXEC', 'EXEC'],
    ['EXEC_TO_PLAN', 'EXEC'],
    ['EXEC-TO-PLAN', 'EXEC'], // SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-D FR-D2: was missing, hyphenated form
    ['EXEC_IMPLEMENTATION', 'EXEC'],
  ];
  for (const [input, expected] of cases) {
    it(`maps ${input} -> ${expected}`, () => {
      expect(normalisePhase(input)).toBe(expected);
    });
  }

  it('maps the unmappable "orchestrated" spelling to null', () => {
    expect(normalisePhase('orchestrated')).toBeNull();
  });

  it('maps null to null', () => {
    expect(normalisePhase(null)).toBeNull();
  });

  it('maps an unlisted spelling to null', () => {
    expect(normalisePhase('SOME_FUTURE_SPELLING')).toBeNull();
  });
});

describe('HANDOFF_TYPE_TO_PHASE', () => {
  it('covers the 4 handoff types subagent-evidence-gate.js runs at, plus LEAD-FINAL-APPROVAL (SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-D FR-D2)', () => {
    expect(HANDOFF_TYPE_TO_PHASE).toEqual({
      'LEAD-TO-PLAN': 'LEAD',
      'PLAN-TO-EXEC': 'PLAN',
      'EXEC-TO-PLAN': 'EXEC',
      'PLAN-TO-LEAD': 'PLAN',
      'LEAD-FINAL-APPROVAL': 'LEAD',
    });
  });
});

describe('PRODUCER_ALLOWLIST', () => {
  it('excludes the DB default \'manual\'', () => {
    expect(PRODUCER_ALLOWLIST).not.toContain('manual');
  });
  it('includes both known real writers', () => {
    expect(PRODUCER_ALLOWLIST).toEqual(expect.arrayContaining(['sub_agent_executor', 'task_hook']));
  });
});

describe('gradeProvenance', () => {
  const preCutoverRow = { created_at: '2020-01-01T00:00:00.000Z' };
  const postCutoverBase = {
    created_at: new Date(Date.parse(PROVENANCE_CUTOVER_AT) + 1000).toISOString(),
    source: 'sub_agent_executor',
    invocation_id: 'inv-1',
    session_id: 'sess-1',
    verdict: 'PASS',
    confidence: 90,
    critical_issues: [],
    warnings: [],
    recommendations: [],
    detailed_analysis: 'x',
    summary: 'ok',
  };
  function withValidHash(row) {
    return { ...row, content_hash: computeContentHash(row) };
  }

  it('a fully-provenanced post-cutover row is never absent', () => {
    const row = withValidHash(postCutoverBase);
    expect(gradeProvenance(row)).toEqual({ absent: false, preCutover: false });
  });

  it('a pre-cutover row is never absent regardless of missing fields', () => {
    expect(gradeProvenance(preCutoverRow)).toEqual({ absent: false, preCutover: true });
  });

  it('missing source -> absent, missingField=source', () => {
    const row = withValidHash({ ...postCutoverBase, source: null });
    expect(gradeProvenance(row)).toMatchObject({ absent: true, missingField: 'source' });
  });

  it('source=\'manual\' -> absent, missingField=source (excluded from the allowlist)', () => {
    const row = withValidHash({ ...postCutoverBase, source: 'manual' });
    expect(gradeProvenance(row)).toMatchObject({ absent: true, missingField: 'source' });
  });

  it('missing invocation_id -> absent, missingField=invocation_id', () => {
    const row = withValidHash({ ...postCutoverBase, invocation_id: null });
    expect(gradeProvenance(row)).toMatchObject({ absent: true, missingField: 'invocation_id' });
  });

  it('missing session_id -> absent, missingField=session_id', () => {
    const row = withValidHash({ ...postCutoverBase, session_id: null });
    expect(gradeProvenance(row)).toMatchObject({ absent: true, missingField: 'session_id' });
  });

  it('missing content_hash -> absent, missingField=content_hash', () => {
    const row = { ...postCutoverBase, content_hash: null };
    expect(gradeProvenance(row)).toMatchObject({ absent: true, missingField: 'content_hash' });
  });

  it('a content_hash that does not match the row\'s own payload -> absent, missingField=content_hash_mismatch', () => {
    const row = { ...postCutoverBase, content_hash: 'deadbeef'.repeat(8) };
    expect(gradeProvenance(row)).toMatchObject({ absent: true, missingField: 'content_hash_mismatch' });
  });

  it('a row from a phase that does not match expectedPhase is out-of-window absent', () => {
    const row = withValidHash({ ...postCutoverBase, phase: 'LEAD' });
    expect(gradeProvenance(row, { expectedPhase: 'EXEC' })).toMatchObject({ absent: true, missingField: 'phase' });
  });

  it('a row whose phase matches expectedPhase (after normalisation) is not window-absent', () => {
    const row = withValidHash({ ...postCutoverBase, phase: 'EXEC_TO_PLAN' });
    expect(gradeProvenance(row, { expectedPhase: 'EXEC' })).toEqual({ absent: false, preCutover: false });
  });

  it('when expectedPhase is not passed at all, phase is not checked', () => {
    const row = withValidHash({ ...postCutoverBase, phase: 'orchestrated' });
    expect(gradeProvenance(row)).toEqual({ absent: false, preCutover: false });
  });
});
