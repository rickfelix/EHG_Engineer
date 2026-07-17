/**
 * SD-LEO-INFRA-TIME-CRITICAL-SEAL-001 — pure baseline-seal attestation.
 */
import { describe, it, expect } from 'vitest';
import { verifyBaselineSeal, SEAL_SHAPES, SEAL_EFFORTS, SEAL_MODEL } from '../verify-baseline-seal.mjs';

const TASKS = ['FAB5-MECH-01', 'FAB5-R1-01', 'FAB5-R2-01', 'FAB5-R2-02', 'FAB5-R3-01', 'FAB5-R3-02', 'FAB5-R4-01', 'FAB5-R4-02', 'FAB5-R5-01', 'FAB5-R5-02'];
const SHAPE_OF = {
  'FAB5-MECH-01': 'mechanical-baseline', 'FAB5-R1-01': 'R1-compounding',
  'FAB5-R2-01': 'R2-negative-space', 'FAB5-R2-02': 'R2-negative-space',
  'FAB5-R3-01': 'R3-taste', 'FAB5-R3-02': 'R3-taste',
  'FAB5-R4-01': 'R4-coupling', 'FAB5-R4-02': 'R4-coupling',
  'FAB5-R5-01': 'R5-reversal', 'FAB5-R5-02': 'R5-reversal',
};

/** Build a corpus mirroring the real seal: 10 keys + 10 tasks × 3 efforts. */
function buildCorpus({ withTelemetryTiers = ['high'], dropAnswer = 0, dropKeys = 0, dropTaskText = 0 } = {}) {
  const rows = [];
  let droppedTaskText = 0;
  TASKS.slice(0, TASKS.length - dropKeys).forEach((t) => {
    const hasTaskText = droppedTaskText < dropTaskText ? (droppedTaskText++, false) : true;
    rows.push({ metadata: { record_kind: 'answer_key', task_id: t, shape: SHAPE_OF[t], answer_key: 'reality-adjudicated key ' + t, task_text: hasTaskText ? 'task prompt text for ' + t : undefined, content_hash: 'kh_' + t } });
  });
  let dropped = 0;
  TASKS.forEach((t) => {
    SEAL_EFFORTS.forEach((e) => {
      const withTel = withTelemetryTiers.includes(e);
      const m = {
        record_kind: 'sealed_run', task_id: t, shape: SHAPE_OF[t], model_id: SEAL_MODEL, effort: e,
        fable5_answer: (dropped < dropAnswer ? (dropped++, null) : 'fable5 answer for ' + t + '/' + e),
        content_hash: 'rh_' + t + '_' + e,
        tokens: withTel ? 40000 : null, wall_clock_ms: withTel ? 120000 : null,
      };
      rows.push({ metadata: m });
    });
  });
  return rows;
}

describe('verifyBaselineSeal', () => {
  it('SEALED when 10 keys + 30 runs complete, warns on low/medium telemetry gap', () => {
    const r = verifyBaselineSeal(buildCorpus({ withTelemetryTiers: ['high'] }));
    expect(r.verdict).toBe('SEALED');
    expect(r.reasons).toEqual([]);
    expect(r.stats.keys).toBe(10);
    expect(r.stats.runs).toBe(30);
    expect(r.stats.shapes_covered.sort()).toEqual([...SEAL_SHAPES].sort());
    expect(r.stats.telemetry_complete_tiers).toEqual(['high']);
    expect(r.warnings.join(' ')).toMatch(/telemetry missing/);
  });

  it('SEALED with no warnings when all tiers have telemetry', () => {
    const r = verifyBaselineSeal(buildCorpus({ withTelemetryTiers: ['low', 'medium', 'high'] }));
    expect(r.verdict).toBe('SEALED');
    expect(r.warnings).toEqual([]);
    expect(r.stats.telemetry_gap_tiers).toEqual([]);
  });

  it('INCOMPLETE when a sealed run is missing its fable5_answer (the ungeneratable artifact)', () => {
    const r = verifyBaselineSeal(buildCorpus({ dropAnswer: 1 }));
    expect(r.verdict).toBe('INCOMPLETE');
    expect(r.reasons.join(' ')).toMatch(/missing fable5_answer/);
  });

  it('INCOMPLETE when answer keys are missing (count + shape coverage)', () => {
    const r = verifyBaselineSeal(buildCorpus({ dropKeys: 1 }));
    expect(r.verdict).toBe('INCOMPLETE');
    expect(r.reasons.join(' ')).toMatch(/answer_key count 9/);
  });

  it('INCOMPLETE when an answer_key row is missing task_text (SD-LEO-INFRA-TIME-CRITICAL-SEAL-001 LEAD finding: golden-task-loader.mjs requires it)', () => {
    const r = verifyBaselineSeal(buildCorpus({ dropTaskText: 1 }));
    expect(r.verdict).toBe('INCOMPLETE');
    expect(r.reasons.join(' ')).toMatch(/1 answer_key row\(s\) missing task_text/);
  });

  it('INCOMPLETE on a foreign-model run (only Fable-5 answers belong in the seal)', () => {
    const rows = buildCorpus();
    rows.find((x) => x.metadata.record_kind === 'sealed_run').metadata.model_id = 'claude-opus-5';
    const r = verifyBaselineSeal(rows);
    expect(r.verdict).toBe('INCOMPLETE');
    expect(r.reasons.join(' ')).toMatch(/not model claude-fable-5/);
  });

  it('fail-closed on empty input', () => {
    const r = verifyBaselineSeal([]);
    expect(r.verdict).toBe('INCOMPLETE');
  });

  it('redaction regression: sentinel answer_key/task_text/fable5_answer values never appear in the verifier result, SEALED or INCOMPLETE (PLAN-phase SECURITY recommendation)', () => {
    const SENTINEL_KEY = 'SENTINEL-ANSWER-KEY-DO-NOT-LEAK-8f3c9a';
    const SENTINEL_TASK_TEXT = 'SENTINEL-TASK-TEXT-DO-NOT-LEAK-2b7e14';
    const SENTINEL_ANSWER = 'SENTINEL-FABLE5-ANSWER-DO-NOT-LEAK-91da02';

    const sealedRows = buildCorpus();
    sealedRows.forEach((row) => {
      if (row.metadata.record_kind === 'answer_key') {
        row.metadata.answer_key = SENTINEL_KEY;
        row.metadata.task_text = SENTINEL_TASK_TEXT;
      } else {
        row.metadata.fable5_answer = SENTINEL_ANSWER;
      }
    });
    const sealed = verifyBaselineSeal(sealedRows);
    expect(sealed.verdict).toBe('SEALED');
    const sealedJson = JSON.stringify(sealed);
    expect(sealedJson).not.toContain(SENTINEL_KEY);
    expect(sealedJson).not.toContain(SENTINEL_TASK_TEXT);
    expect(sealedJson).not.toContain(SENTINEL_ANSWER);

    // Same check on the INCOMPLETE path (reasons array is human-readable text —
    // must never interpolate the actual sensitive value, only counts/labels).
    const incompleteRows = buildCorpus({ dropAnswer: 1 });
    incompleteRows.forEach((row) => {
      if (row.metadata.record_kind === 'answer_key') {
        row.metadata.answer_key = SENTINEL_KEY;
        row.metadata.task_text = SENTINEL_TASK_TEXT;
      } else if (row.metadata.fable5_answer) {
        row.metadata.fable5_answer = SENTINEL_ANSWER;
      }
    });
    const incomplete = verifyBaselineSeal(incompleteRows);
    expect(incomplete.verdict).toBe('INCOMPLETE');
    const incompleteJson = JSON.stringify(incomplete);
    expect(incompleteJson).not.toContain(SENTINEL_KEY);
    expect(incompleteJson).not.toContain(SENTINEL_TASK_TEXT);
    expect(incompleteJson).not.toContain(SENTINEL_ANSWER);
  });
});
