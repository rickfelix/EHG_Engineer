/**
 * FR-1/FR-2/FR-3 — loud truncation + section-aware PRD budgeting for the pre-PLAN critique path.
 * SD-LEO-INFRA-PRE-PLAN-CRITIQUE-PRD-TRUNCATION-001
 */
import { describe, it, expect, vi } from 'vitest';
import { critiquePlanProposal, COULD_NOT_CHECK, _internal } from '../../../lib/eva/devils-advocate.js';
import { findingsFingerprint } from '../../../scripts/modules/handoff/executors/lead-to-plan/gates/pre-plan-critique.js';

const { buildBudgetedPrdText, buildCritiqueUserPrompt, MAX_CRITIQUE_ANALYSIS_CHARS, MAX_ANALYSIS_CHARS, buildUserPrompt, SECTION_BUDGETS } = _internal;

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

  // TESTING (EXEC-phase evidence, MEDIUM finding #3): measured live against 4,344 real PRDs — 26
  // (0.60%) have ONE section over its fixed SECTION_BUDGETS allowance while their 5-section total
  // stays well under MAX_CRITIQUE_ANALYSIS_CHARS. The fast path (skip section budgeting when the
  // raw total already fits) must produce zero truncation for exactly this shape.
  it('does not truncate when one section exceeds its fixed allowance but the raw total is still under the overall cap', () => {
    // acceptance_criteria alone (11,664 chars, matching the largest real specimen measured) far
    // exceeds its 3,000-char fixed budget, but the 5-section total here is nowhere near 64,000.
    const bigAcceptanceCriteria = Array.from({ length: 80 }, (_, i) => `Criterion ${i + 1}: ${'x'.repeat(130)}`);
    const result = buildBudgetedPrdText({ ...UNDER_BUDGET_PRD, acceptance_criteria: bigAcceptanceCriteria });
    expect(JSON.stringify(bigAcceptanceCriteria).length).toBeGreaterThan(SECTION_BUDGETS.acceptance_criteria);
    expect(result.truncated).toBe(false);
    expect(result.text).toContain(bigAcceptanceCriteria[79]); // the LAST criterion survived uncut
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

// FR-4 AC-9 (TESTING EXEC-phase finding #4 — was genuinely uncovered): proves the property at
// the critiquePlanProposal level, not just inside computeContentHash directly — the hash must
// stay STABLE when the provider silently serves a DIFFERENT model than requested (response.model
// != adapter.defaultModel), since T12's whole concern is that hashing response.model would let a
// silent server-side rotation change the hash on byte-identical content and orphan every override.
describe('content_hash stability against response.model rotation (FR-4 AC-9)', () => {
  it('contentHash is identical whether the response reports the requested model or a silently-rotated one', async () => {
    const requested = { prdContent: UNDER_BUDGET_PRD, archContent: 'short', sdContext: {} };
    const adapterRequested = {
      apiKey: 'k',
      defaultModel: 'gpt-5.4',
      complete: vi.fn().mockResolvedValue({ content: JSON.stringify({ findings: [], overall_severity: 'pass' }), model: 'gpt-5.4' }),
    };
    const adapterRotated = {
      apiKey: 'k',
      defaultModel: 'gpt-5.4', // SAME requested model
      complete: vi.fn().mockResolvedValue({ content: JSON.stringify({ findings: [], overall_severity: 'pass' }), model: 'gpt-5.4-rotated-variant' }), // DIFFERENT served model
    };
    const resultA = await critiquePlanProposal(requested, { adapter: adapterRequested, logger: { warn: vi.fn(), error: vi.fn() } });
    const resultB = await critiquePlanProposal(requested, { adapter: adapterRotated, logger: { warn: vi.fn(), error: vi.fn() } });
    expect(resultA.contentHash).toBe(resultB.contentHash);
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
  const base = { prdRawText: 'prd content', archRawText: 'arch content', archLoadStatus: 'ok', model: 'gpt-5.4' };

  it('is stable for identical inputs', () => {
    expect(computeContentHash(base)).toBe(computeContentHash({ ...base }));
  });

  it('changes when prdRawText or archRawText changes', () => {
    const h0 = computeContentHash(base);
    expect(computeContentHash({ ...base, prdRawText: 'different prd' })).not.toBe(h0);
    expect(computeContentHash({ ...base, archRawText: 'different arch' })).not.toBe(h0);
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
  // absence, even though both leave archRawText='' -- archLoadStatus is a distinct hash input.
  it('changes when archLoadStatus differs, even with byte-identical (empty) archRawText', () => {
    const notFound = computeContentHash({ ...base, archRawText: '', archLoadStatus: 'not_found' });
    const loadFailed = computeContentHash({ ...base, archRawText: '', archLoadStatus: 'load_failed' });
    const ok = computeContentHash({ ...base, archRawText: '', archLoadStatus: 'ok' });
    expect(notFound).not.toBe(loadFailed);
    expect(notFound).not.toBe(ok);
    expect(loadFailed).not.toBe(ok);
  });
});

// SECURITY (EXEC-phase evidence SEC-HIGH-1 + re-verification): computeContentHash hashes the
// FULL, pre-truncation content (prdRawText/archRawText), not the truncated/sent pair -- these
// tests prove the property at the level that matters, using content genuinely reviewed vs. not.
// An earlier version of this fix hashed the sent text plus its length (charsTotal); re-verification
// showed that closed only length-CHANGING edits beyond the truncation boundary and left
// length-PRESERVING edits (a same-length date/identifier/threshold swap entirely past the cut)
// still colliding. Hashing full content closes the class outright, not just the length-changing
// subset -- these tests include a length-preserving variant to prove that specifically.
describe('content_hash across the truncation boundary (FR-4 SEC-HIGH-1)', () => {
  it('two functional_requirements arrays with an identical sent prefix but different real content hash differently (length-CHANGING edit)', () => {
    const bigFrsA = Array.from({ length: 500 }, (_, i) => ({ id: `FR-${i + 1}`, description: 'x'.repeat(200) }));
    // Same 500 FR ids (so the [FR ids present: ...] marker length — and therefore the cut point —
    // is identical between A and B) — only the LAST entry's description grows, far past where
    // truncation already occurs among the first ~200 entries.
    const bigFrsB = bigFrsA.map((fr, i) => (i === bigFrsA.length - 1 ? { ...fr, description: 'x'.repeat(200) + ' PLUS AN ENTIRELY NEW TAIL PAST THE CUT' } : fr));

    const a = buildCritiqueUserPrompt({ prdContent: { ...UNDER_BUDGET_PRD, functional_requirements: bigFrsA }, archContent: 'short', sdContext: {} });
    const b = buildCritiqueUserPrompt({ prdContent: { ...UNDER_BUDGET_PRD, functional_requirements: bigFrsB }, archContent: 'short', sdContext: {} });

    expect(a.prdText).toBe(b.prdText); // the sent PREFIX is byte-identical...
    expect(a.prdRawText).not.toBe(b.prdRawText); // ...but the real, full content differs...
    const { computeContentHash } = _internal;
    const hashA = computeContentHash({ prdRawText: a.prdRawText, archRawText: a.archRawText, archLoadStatus: 'ok', model: 'gpt-5.4' });
    const hashB = computeContentHash({ prdRawText: b.prdRawText, archRawText: b.archRawText, archLoadStatus: 'ok', model: 'gpt-5.4' });
    expect(hashA).not.toBe(hashB); // ...so the hash must differ too.
  });

  // The exact class re-verification flagged as still-open under length-only hashing: a
  // SAME-LENGTH swap entirely past the truncation boundary must now ALSO produce a different hash.
  it('a length-PRESERVING edit entirely past the truncation boundary still hashes differently', () => {
    const bigFrsA = Array.from({ length: 500 }, (_, i) => ({ id: `FR-${i + 1}`, description: 'x'.repeat(200) }));
    // Last entry's description is replaced with a DIFFERENT string of the EXACT same length —
    // total charsTotal is identical between A and B; only content past the cut differs.
    const replacement = 'y'.repeat(200);
    expect(replacement.length).toBe('x'.repeat(200).length);
    const bigFrsB = bigFrsA.map((fr, i) => (i === bigFrsA.length - 1 ? { ...fr, description: replacement } : fr));

    const a = buildCritiqueUserPrompt({ prdContent: { ...UNDER_BUDGET_PRD, functional_requirements: bigFrsA }, archContent: 'short', sdContext: {} });
    const b = buildCritiqueUserPrompt({ prdContent: { ...UNDER_BUDGET_PRD, functional_requirements: bigFrsB }, archContent: 'short', sdContext: {} });

    expect(a.prdText).toBe(b.prdText); // sent prefix identical
    expect(a.prdRawText.length).toBe(b.prdRawText.length); // SAME total length — the case a
    // charsTotal-only guard could never distinguish
    expect(a.prdRawText).not.toBe(b.prdRawText); // but real content genuinely differs
    const { computeContentHash } = _internal;
    const hashA = computeContentHash({ prdRawText: a.prdRawText, archRawText: a.archRawText, archLoadStatus: 'ok', model: 'gpt-5.4' });
    const hashB = computeContentHash({ prdRawText: b.prdRawText, archRawText: b.archRawText, archLoadStatus: 'ok', model: 'gpt-5.4' });
    expect(hashA).not.toBe(hashB);
  });

  it('arch content edited entirely past the 64,000-char cap changes the hash even though the sent text is identical', async () => {
    const archA = 'y'.repeat(MAX_CRITIQUE_ANALYSIS_CHARS + 1000);
    const archB = archA + 'ENTIRELY NEW CONTENT PAST THE CUT — must not be invisible to the hash';
    const adapterA = mockAdapter({ findings: [], overall_severity: 'pass' });
    const adapterB = mockAdapter({ findings: [], overall_severity: 'pass' });
    const resultA = await critiquePlanProposal({ prdContent: UNDER_BUDGET_PRD, archContent: archA, sdContext: {} }, { adapter: adapterA, logger: { warn: vi.fn(), error: vi.fn() } });
    const resultB = await critiquePlanProposal({ prdContent: UNDER_BUDGET_PRD, archContent: archB, sdContext: {} }, { adapter: adapterB, logger: { warn: vi.fn(), error: vi.fn() } });
    expect(resultA.contentHash).not.toBe(resultB.contentHash);
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

  // TESTING (EXEC-phase evidence, HIGH finding #2): the cache reads the RAW pre-merge LLM output
  // from metadata.llm_result, never the row's top-level findings/overall_severity (those are the
  // GATE's already-COMBINED result -- reusing them would re-merge invariant findings a second
  // time and re-seed an already-derived severity, compounding on every hit within the TTL).
  it('skips the LLM call on a cache hit and returns the RAW llm_result from metadata, flagged cacheHit', async () => {
    const adapter = mockAdapter({ findings: [], overall_severity: 'pass' }); // would prove a real call happened, if reached
    const hitRow = {
      id: 'cached-row-1',
      // Top-level columns are the gate's COMBINED result (deliberately DIFFERENT from
      // metadata.llm_result below) -- proves the cache reads llm_result, not these.
      model_used: 'gpt-5.4',
      token_usage: { total_tokens: 5 },
      metadata: { llm_result: { findings: [{ severity: 'warn', category: 'other' }], overall_severity: 'warn' } },
    };
    const supabase = makeCacheSupabase(hitRow);
    const result = await critiquePlanProposal(
      { prdContent: UNDER_BUDGET_PRD, archContent: 'short', sdContext: { sd_id: 'sd-1' } },
      { adapter, supabase, logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() } }
    );
    expect(adapter.complete).not.toHaveBeenCalled();
    expect(result.cacheHit).toBe(true);
    expect(result.cacheSourceId).toBe('cached-row-1');
    expect(result.overall_severity).toBe('warn');
    expect(result.findings).toEqual(hitRow.metadata.llm_result.findings);
    expect(result.contentHash).toEqual(expect.any(String));
  });

  it('treats a matching row with no metadata.llm_result as a miss (never returns garbage content)', async () => {
    const adapter = mockAdapter({ findings: [], overall_severity: 'pass' });
    const hitRow = { id: 'old-row-predating-fix', findings: [{ severity: 'block', category: 'x' }], overall_severity: 'block', model_used: 'gpt-5.4', token_usage: null, metadata: null };
    const supabase = makeCacheSupabase(hitRow);
    const result = await critiquePlanProposal(
      { prdContent: UNDER_BUDGET_PRD, archContent: 'short', sdContext: { sd_id: 'sd-1' } },
      { adapter, supabase, logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() } }
    );
    expect(adapter.complete).toHaveBeenCalledTimes(1); // real call happened -- the stale row was correctly ignored
    expect(result.cacheHit).toBeUndefined();
  });

  // TESTING (EXEC-phase re-verification, finding #2 residual): caching a could_not_check result
  // would make a transient LLM-blind outcome STICKY for the full TTL and — because a hit skips
  // adapter.complete entirely — suppress exactly the retry the precheck→execute window exists to
  // allow. A could_not_check row must always fall through to a fresh LLM call, never be reused.
  it('never treats a could_not_check row as a cache hit — always falls through to a fresh LLM call', async () => {
    const adapter = mockAdapter({ findings: [], overall_severity: 'pass' });
    const hitRow = {
      id: 'blind-row-1',
      model_used: null,
      token_usage: null,
      metadata: { llm_result: { findings: [], overall_severity: COULD_NOT_CHECK } },
    };
    const supabase = makeCacheSupabase(hitRow);
    const result = await critiquePlanProposal(
      { prdContent: UNDER_BUDGET_PRD, archContent: 'short', sdContext: { sd_id: 'sd-1' } },
      { adapter, supabase, logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() } }
    );
    expect(adapter.complete).toHaveBeenCalledTimes(1); // the retry actually happened
    expect(result.cacheHit).toBeUndefined();
    expect(result.overall_severity).toBe('pass'); // the fresh call's real result, not the stale blindness
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
