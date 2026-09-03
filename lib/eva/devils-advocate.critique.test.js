/**
 * Unit tests for critiquePlanProposal
 * SD-LEO-INFRA-PRE-PLAN-ADVERSARIAL-001 (original)
 * SD-LEO-INFRA-SYSTEMATIZE-COMPLETENESS-CRITIC-001 (FR-3): every could-not-run path
 * returns COULD_NOT_CHECK, never 'pass'. The earlier version of this suite ASSERTED the
 * fail-open defect (malformed JSON → pass) — the tests below are the two-sided
 * replacement: genuine pass still passes, blindness reports blindness.
 */
import { describe, it, expect, vi } from 'vitest';
import { critiquePlanProposal, COULD_NOT_CHECK, _internal } from './devils-advocate.js';

const fakeOpenAIAdapter = (response) => ({
  apiKey: 'test-key',
  complete: vi.fn().mockResolvedValue(response),
});

const quietLogger = () => ({ warn: vi.fn(), error: vi.fn(), log: vi.fn() });

describe('critiquePlanProposal', () => {
  it('returns pass severity on a known-good fixture (direction 1: real pass still passes)', async () => {
    const adapter = fakeOpenAIAdapter({
      content: JSON.stringify({ findings: [], overall_severity: 'pass' }),
      model: 'gpt-4o-mini',
      usage: { input_tokens: 100, output_tokens: 20 },
    });

    const result = await critiquePlanProposal(
      { prdContent: 'PRD: coherent fixture', archContent: 'ARCH: clear', sdContext: { sd_key: 'SD-TEST-001', title: 'Test' } },
      { adapter, logger: quietLogger() }
    );

    expect(result.overall_severity).toBe('pass');
    expect(result.findings).toEqual([]);
    expect(result.model_used).toBe('gpt-4o-mini');
    expect(result.token_usage).toBeTruthy();
  });

  it('escalates overall_severity when findings present but LLM said pass', async () => {
    const adapter = fakeOpenAIAdapter({
      content: JSON.stringify({
        findings: [{ severity: 'warn', category: 'contradiction', message: 'AC contradicts US', location: 'PRD §2', suggested_fix: 'rewrite AC' }],
        overall_severity: 'pass',
      }),
      model: 'gpt-4o-mini',
    });

    const result = await critiquePlanProposal(
      { prdContent: 'bad', archContent: '', sdContext: {} },
      { adapter, logger: quietLogger() }
    );

    expect(result.overall_severity).toBe('warn');
    expect(result.findings).toHaveLength(1);
  });

  it('returns COULD_NOT_CHECK when LLM output is malformed JSON (direction 2: blindness is not pass)', async () => {
    const adapter = fakeOpenAIAdapter({
      content: 'not valid json at all',
      model: 'gpt-4o-mini',
    });

    const logger = quietLogger();
    const result = await critiquePlanProposal(
      { prdContent: 'x', archContent: 'y', sdContext: {} },
      { adapter, logger }
    );

    expect(result.overall_severity).toBe(COULD_NOT_CHECK);
    expect(result.overall_severity).not.toBe('pass');
    expect(result.fallback_reason).toMatch(/JSON parse failed|No JSON/);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('returns COULD_NOT_CHECK when the LLM call rejects', async () => {
    const adapter = { apiKey: 'test-key', complete: vi.fn().mockRejectedValue(new Error('socket hang up')) };
    const result = await critiquePlanProposal(
      { prdContent: 'x', archContent: '', sdContext: {} },
      { adapter, logger: quietLogger() }
    );
    expect(result.overall_severity).toBe(COULD_NOT_CHECK);
    expect(result.fallback_reason).toMatch(/socket hang up/);
  });

  it('returns COULD_NOT_CHECK on an unusable overall_severity with no findings (residual LOW-1)', async () => {
    const adapter = fakeOpenAIAdapter({
      content: JSON.stringify({ findings: [], overall_severity: 'banana' }),
      model: 'gpt-4o-mini',
    });
    const result = await critiquePlanProposal(
      { prdContent: 'x', archContent: '', sdContext: {} },
      { adapter, logger: quietLogger() }
    );
    expect(result.overall_severity).toBe(COULD_NOT_CHECK);
    expect(result.fallback_reason).toMatch(/unusable overall_severity/);
  });

  it('derives severity from findings when overall_severity is unusable but findings exist', async () => {
    const adapter = fakeOpenAIAdapter({
      content: JSON.stringify({
        findings: [{ severity: 'block', category: 'contradiction', message: 'x', location: 'PRD' }],
        overall_severity: 'banana',
      }),
      model: 'gpt-4o-mini',
    });
    const result = await critiquePlanProposal(
      { prdContent: 'x', archContent: '', sdContext: {} },
      { adapter, logger: quietLogger() }
    );
    expect(result.overall_severity).toBe('block');
  });

  it('empty-content LLM response parses to pass (fast adapter sanity)', async () => {
    const adapter = { apiKey: 'test-key', complete: () => Promise.resolve({ content: '{}' }) };
    const result = await critiquePlanProposal(
      { prdContent: '', archContent: '', sdContext: {} },
      { adapter, logger: quietLogger() }
    );
    // '{}' parses: findings=[], severity defaults to pass — a REAL parse, not a fallback.
    expect(result.overall_severity).toBe('pass');
    expect(result.fallback_reason ?? null).toBeNull();
  });

  it('system prompt reports coverage, never completeness (FR-3a)', () => {
    const prompt = _internal.buildCritiqueSystemPrompt();
    // The measured defect: pass was defined as "no findings — the plan is coherent and complete".
    expect(prompt).not.toMatch(/coherent and complete/i);
    expect(prompt).toMatch(/never completeness|not that the plan is complete/i);
  });

  it('exposes timeout and helpers via _internal', () => {
    expect(_internal.CRITIQUE_TIMEOUT_MS).toBe(90_000);
    expect(_internal.parseCritiqueResponse).toBeTypeOf('function');
    expect(_internal.couldNotCheckResult).toBeTypeOf('function');
    expect(_internal.couldNotCheckResult({ reason: 'x' }).overall_severity).toBe(COULD_NOT_CHECK);
  });

  // SD-LEO-INFRA-CRITIQUE-GATE-NON-001 (VALIDATION sub-agent finding, LEAD-TO-PLAN): the 3
  // live-LLM-run discrimination pins in pre-plan-critique.test.js are recorded snapshots, not a
  // live CI call — so a regression to the system prompt's decision-authority rubric (the half of
  // this fix the file itself documents as "doing most of the real-world work") would leave every
  // pinned aggregation test green while the underlying calibration silently reverted. This is a
  // cheap source-pin contract on the prompt text itself, closing that blind spot without needing
  // a live LLM call in CI.
  it('system prompt anchors "block" to decision-authority cost and restricts its category (SD-LEO-INFRA-CRITIQUE-GATE-NON-001)', () => {
    const prompt = _internal.buildCritiqueSystemPrompt();
    expect(prompt).toMatch(/DECISION-AUTHORITY COST/i);
    expect(prompt).toMatch(/PLAN\/EXEC cannot resolve unilaterally/i);
    expect(prompt).toMatch(/category MUST be "contradiction" or\s+"missing_rollback"/i);
    expect(prompt).toMatch(/Do not use category "other" for a\s+"block"-severity finding/i);
    // The old, unanchored rubric this replaced must be genuinely gone, not merely supplemented.
    expect(prompt).not.toMatch(/fundamental contradictions or missing acceptance criteria that make the plan untestable/i);
  });
});
