/**
 * FR-1/FR-2/FR-3 — loud truncation + section-aware PRD budgeting for the pre-PLAN critique path.
 * SD-LEO-INFRA-PRE-PLAN-CRITIQUE-PRD-TRUNCATION-001
 */
import { describe, it, expect, vi } from 'vitest';
import { critiquePlanProposal, COULD_NOT_CHECK, _internal } from '../../../lib/eva/devils-advocate.js';

const { buildBudgetedPrdText, buildCritiqueUserPrompt, MAX_CRITIQUE_ANALYSIS_CHARS, MAX_ANALYSIS_CHARS, buildUserPrompt } = _internal;

function mockAdapter(content) {
  return { apiKey: 'test-key', complete: vi.fn().mockResolvedValue({ content: JSON.stringify(content), model: 'gpt-5.4', usage: { total_tokens: 1 } }) };
}

const UNDER_BUDGET_PRD = {
  executive_summary: 'short summary',
  functional_requirements: [{ id: 'FR-1', description: 'small' }],
  acceptance_criteria: ['one criterion'],
  test_scenarios: [{ id: 'TS-1' }],
  risks: [],
};

describe('buildBudgetedPrdText (FR-2)', () => {
  it('does not truncate a PRD whose sections are all under budget', () => {
    const result = buildBudgetedPrdText(UNDER_BUDGET_PRD);
    expect(result.truncated).toBe(false);
    expect(result.text).toContain('FR-1');
    expect(result.text).toContain('EXECUTIVE_SUMMARY:');
  });

  it('preserves the full FR id list when functional_requirements overflows its remainder', () => {
    const bigFrs = Array.from({ length: 500 }, (_, i) => ({ id: `FR-${i + 1}`, description: 'x'.repeat(200) }));
    const result = buildBudgetedPrdText({ ...UNDER_BUDGET_PRD, functional_requirements: bigFrs });
    expect(result.truncated).toBe(true);
    expect(result.text).toContain('[FR ids present: FR-1, FR-2,');
    expect(result.text).toContain('FR-500');
  });

  it('never reports a small section as truncated when only functional_requirements overflows', () => {
    const bigFrs = Array.from({ length: 500 }, (_, i) => ({ id: `FR-${i + 1}`, description: 'x'.repeat(200) }));
    const result = buildBudgetedPrdText({ ...UNDER_BUDGET_PRD, functional_requirements: bigFrs });
    // acceptance_criteria/test_scenarios/risks/executive_summary are all far under their fixed
    // budgets here — only the FR remainder overflows.
    expect(result.text).toContain('ACCEPTANCE_CRITERIA:\n["one criterion"]');
  });

  it('falls back to a flat cut for a plain-string caller (legacy/back-compat)', () => {
    const longString = 'x'.repeat(MAX_CRITIQUE_ANALYSIS_CHARS + 500);
    const result = buildBudgetedPrdText(longString);
    expect(result.truncated).toBe(true);
    expect(result.shown).toBe(MAX_CRITIQUE_ANALYSIS_CHARS);
    expect(result.total).toBe(longString.length);
  });

  it('treats null/undefined as an empty, non-truncated string', () => {
    expect(buildBudgetedPrdText(null).truncated).toBe(false);
    expect(buildBudgetedPrdText(undefined).truncated).toBe(false);
  });
});

describe('buildCritiqueUserPrompt (FR-1)', () => {
  it('places the truncation marker in the trusted frame, never inside the untrusted delimiters', () => {
    const bigFrs = Array.from({ length: 500 }, (_, i) => ({ id: `FR-${i + 1}`, description: 'x'.repeat(200) }));
    const { prompt, truncated } = buildCritiqueUserPrompt({
      prdContent: { ...UNDER_BUDGET_PRD, functional_requirements: bigFrs },
      archContent: 'short arch',
      sdContext: { sd_key: 'SD-TEST-001', title: 'Test' },
    });
    expect(truncated.prd.truncated).toBe(true);
    expect(truncated.arch.truncated).toBe(false);

    const markerIdx = prompt.indexOf('[TRUNCATED:');
    const prdBeginIdx = prompt.indexOf('===PRD_CONTENT_BEGIN');
    expect(markerIdx).toBeGreaterThan(-1);
    expect(markerIdx).toBeLessThan(prdBeginIdx); // marker is BEFORE the untrusted fence opens
  });

  it('reports independent prd/arch truncation flags — arch over budget, prd under budget', () => {
    const { truncated } = buildCritiqueUserPrompt({
      prdContent: UNDER_BUDGET_PRD,
      archContent: 'y'.repeat(MAX_CRITIQUE_ANALYSIS_CHARS + 1000),
      sdContext: {},
    });
    expect(truncated.prd.truncated).toBe(false);
    expect(truncated.arch.truncated).toBe(true);
  });

  it('emits no truncation marker when nothing is cut', () => {
    const { prompt, truncated } = buildCritiqueUserPrompt({ prdContent: UNDER_BUDGET_PRD, archContent: 'short', sdContext: {} });
    expect(prompt).not.toContain('[TRUNCATED:');
    expect(truncated.prd.truncated).toBe(false);
    expect(truncated.arch.truncated).toBe(false);
  });
});

describe('critiquePlanProposal truncated return contract (FR-1)', () => {
  it('threads the real {prd, arch} breakdown through on a normal LLM response', async () => {
    const adapter = mockAdapter({ findings: [], overall_severity: 'pass' });
    const result = await critiquePlanProposal(
      { prdContent: UNDER_BUDGET_PRD, archContent: 'short', sdContext: {} },
      { adapter, logger: { warn: vi.fn(), error: vi.fn() } }
    );
    expect(result.truncated).toEqual({
      prd: { truncated: false, shown: expect.any(Number), total: expect.any(Number) },
      arch: { truncated: false, shown: 5, total: 5 },
    });
  });

  it('couldNotCheckResult defaults truncated to null (not measured) — the contract for could-not-check paths that fail before the prompt is built (e.g. no API key)', () => {
    const result = _internal.couldNotCheckResult({ reason: 'OPENAI_API_KEY not configured' });
    expect(result.overall_severity).toBe(COULD_NOT_CHECK);
    expect(result.truncated).toBeNull();
  });

  it('still reports the real truncated breakdown on a malformed-JSON COULD_NOT_CHECK path (prompt was built)', async () => {
    const adapter = { apiKey: 'k', complete: vi.fn().mockResolvedValue({ content: 'not json', model: 'gpt-5.4' }) };
    const result = await critiquePlanProposal(
      { prdContent: UNDER_BUDGET_PRD, archContent: 'short', sdContext: {} },
      { adapter, logger: { warn: vi.fn(), error: vi.fn() } }
    );
    expect(result.overall_severity).toBe(COULD_NOT_CHECK);
    expect(result.truncated).toEqual({ prd: { truncated: false, shown: expect.any(Number), total: expect.any(Number) }, arch: { truncated: false, shown: 5, total: 5 } });
  });
});

describe('regression pin — unrelated kill/promotion path is untouched (FR-3 AC-3 / TS-7)', () => {
  it('MAX_ANALYSIS_CHARS stays 8000 and buildUserPrompt still cuts stageOutput at that boundary', () => {
    expect(MAX_ANALYSIS_CHARS).toBe(8000);
    const bigStageOutput = { data: 'z'.repeat(9000) };
    const prompt = buildUserPrompt({ stageId: 3, gateType: 'kill', gateResult: {}, ventureContext: {}, stageOutput: bigStageOutput });
    // The serialized stageOutput fed into the kill-gate prompt is still cut at MAX_ANALYSIS_CHARS —
    // never at the new, larger MAX_CRITIQUE_ANALYSIS_CHARS.
    const serialized = JSON.stringify(bigStageOutput);
    expect(prompt).toContain(serialized.substring(0, MAX_ANALYSIS_CHARS));
    expect(prompt).not.toContain(serialized.substring(0, MAX_ANALYSIS_CHARS + 1));
  });
});
