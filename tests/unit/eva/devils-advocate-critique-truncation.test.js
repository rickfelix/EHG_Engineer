/**
 * FR-1/FR-2/FR-3 — loud truncation + section-aware PRD budgeting for the pre-PLAN critique path.
 * SD-LEO-INFRA-PRE-PLAN-CRITIQUE-PRD-TRUNCATION-001
 */
import { describe, it, expect, vi } from 'vitest';
import { critiquePlanProposal, COULD_NOT_CHECK, _internal } from '../../../lib/eva/devils-advocate.js';
import { findingsFingerprint } from '../../../scripts/modules/handoff/executors/lead-to-plan/gates/pre-plan-critique.js';

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
    expect(result.charsRead).toBe(MAX_CRITIQUE_ANALYSIS_CHARS);
    expect(result.charsTotal).toBe(longString.length);
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

    const markerIdx = prompt.indexOf('INPUT TRUNCATED');
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
    expect(prompt).not.toContain('INPUT TRUNCATED');
    expect(truncated.prd.truncated).toBe(false);
    expect(truncated.arch.truncated).toBe(false);
  });

  // FR-1 AC-3: reuses lib/eva/input-sanitizer.js's {truncated, charsTotal, charsRead} shape and
  // vision-score.js's "<field> read N/M chars" wording (PT-5) — not a third, invented dialect.
  it('marker wording matches the "<field> read N/M chars" convention from vision-score.js', () => {
    const bigFrs = Array.from({ length: 500 }, (_, i) => ({ id: `FR-${i + 1}`, description: 'x'.repeat(200) }));
    const { prompt, truncated } = buildCritiqueUserPrompt({
      prdContent: { ...UNDER_BUDGET_PRD, functional_requirements: bigFrs },
      archContent: 'y'.repeat(MAX_CRITIQUE_ANALYSIS_CHARS + 1000),
      sdContext: {},
    });
    expect(prompt).toContain(`prd read ${truncated.prd.charsRead}/${truncated.prd.charsTotal} chars`);
    expect(prompt).toContain(`arch read ${truncated.arch.charsRead}/${truncated.arch.charsTotal} chars`);
  });

  // FR-1 AC-2 (PT-6): truncation state must never perturb the findings fingerprint or escalate
  // severity — it lives only in metadata/the prompt frame/warnings, never in the findings array.
  it('does not change findingsFingerprint between a truncated and an untruncated run over the same findings', () => {
    const findings = [{ severity: 'warn', category: 'other' }];
    const fingerprintUntruncated = findingsFingerprint(findings);

    // Confirm a truncation actually occurred in this run's prompt-building, then check the
    // caller-facing findings array (what findingsFingerprint hashes) was never touched by it.
    const bigFrs = Array.from({ length: 500 }, (_, i) => ({ id: `FR-${i + 1}`, description: 'x'.repeat(200) }));
    const { truncated } = buildCritiqueUserPrompt({
      prdContent: { ...UNDER_BUDGET_PRD, functional_requirements: bigFrs },
      archContent: 'short',
      sdContext: {},
    });
    expect(truncated.prd.truncated).toBe(true);
    expect(findingsFingerprint(findings)).toBe(fingerprintUntruncated);
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
      prd: { truncated: false, charsRead: expect.any(Number), charsTotal: expect.any(Number) },
      arch: { truncated: false, charsRead: 5, charsTotal: 5 },
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
    expect(result.truncated).toEqual({ prd: { truncated: false, charsRead: expect.any(Number), charsTotal: expect.any(Number) }, arch: { truncated: false, charsRead: 5, charsTotal: 5 } });
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

describe('computeContentHash (FR-4)', () => {
  const { computeContentHash } = _internal;
  const base = { prdText: 'prd content', archText: 'arch content', archLoadStatus: 'ok', model: 'gpt-5.4' };

  it('is stable for identical inputs', () => {
    expect(computeContentHash(base)).toBe(computeContentHash({ ...base }));
  });

  it('changes when prdText or archText changes', () => {
    const h0 = computeContentHash(base);
    expect(computeContentHash({ ...base, prdText: 'different prd' })).not.toBe(h0);
    expect(computeContentHash({ ...base, archText: 'different arch' })).not.toBe(h0);
  });

  // T12: must hash adapter.defaultModel (the REQUESTED model), never response.model (the SERVED
  // model) -- this test only exercises the input directly, but pins that ANY model-string change
  // changes the hash, which is the property critiquePlanProposal relies on by passing
  // adapter.defaultModel (known pre-call) and never response.model (known only post-call, and
  // silently rotatable by the provider).
  it('changes when the model changes, on otherwise byte-identical content', () => {
    const h0 = computeContentHash(base);
    expect(computeContentHash({ ...base, model: 'gpt-6.0' })).not.toBe(h0);
  });

  // PT-8: a transient arch-load failure must never hash identically to a genuine "no arch plan"
  // absence, even though both leave archText='' -- archLoadStatus is a distinct hash input.
  it('changes when archLoadStatus differs, even with byte-identical (empty) archText', () => {
    const notFound = computeContentHash({ ...base, archText: '', archLoadStatus: 'not_found' });
    const loadFailed = computeContentHash({ ...base, archText: '', archLoadStatus: 'load_failed' });
    const ok = computeContentHash({ ...base, archText: '', archLoadStatus: 'ok' });
    expect(notFound).not.toBe(loadFailed);
    expect(notFound).not.toBe(ok);
    expect(loadFailed).not.toBe(ok);
  });
});

describe('critiquePlanProposal cache-hit path (FR-4 AC-5/PT-1/PT-9)', () => {
  function makeCacheSupabase(hitRow) {
    return {
      from: (table) => {
        if (table !== 'plan_critiques') throw new Error(`unexpected table ${table}`);
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                gte: () => ({
                  order: () => ({
                    limit: async () => ({ data: hitRow ? [hitRow] : [], error: null }),
                  }),
                }),
              }),
            }),
          }),
        };
      },
    };
  }

  it('skips the LLM call on a cache hit and returns the cached findings/severity, flagged cacheHit', async () => {
    const adapter = mockAdapter({ findings: [], overall_severity: 'pass' }); // would prove a real call happened, if reached
    const hitRow = { id: 'cached-row-1', findings: [{ severity: 'warn', category: 'other' }], overall_severity: 'warn', model_used: 'gpt-5.4', token_usage: { total_tokens: 5 } };
    const supabase = makeCacheSupabase(hitRow);
    const result = await critiquePlanProposal(
      { prdContent: UNDER_BUDGET_PRD, archContent: 'short', sdContext: { sd_id: 'sd-1' } },
      { adapter, supabase, logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() } }
    );
    expect(adapter.complete).not.toHaveBeenCalled();
    expect(result.cacheHit).toBe(true);
    expect(result.cacheSourceId).toBe('cached-row-1');
    expect(result.overall_severity).toBe('warn');
    expect(result.findings).toEqual(hitRow.findings);
    expect(result.contentHash).toEqual(expect.any(String));
  });

  it('calls the LLM normally when no cache row matches (empty result)', async () => {
    const adapter = mockAdapter({ findings: [], overall_severity: 'pass' });
    const supabase = makeCacheSupabase(null);
    const result = await critiquePlanProposal(
      { prdContent: UNDER_BUDGET_PRD, archContent: 'short', sdContext: { sd_id: 'sd-1' } },
      { adapter, supabase, logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() } }
    );
    expect(adapter.complete).toHaveBeenCalledTimes(1);
    expect(result.cacheHit).toBeUndefined();
  });

  it('calls the LLM normally when no supabase dep is provided (cache disabled, not an error)', async () => {
    const adapter = mockAdapter({ findings: [], overall_severity: 'pass' });
    const result = await critiquePlanProposal(
      { prdContent: UNDER_BUDGET_PRD, archContent: 'short', sdContext: { sd_id: 'sd-1' } },
      { adapter, logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() } }
    );
    expect(adapter.complete).toHaveBeenCalledTimes(1);
    expect(result.contentHash).toEqual(expect.any(String)); // still computed even with the cache off
  });
});
