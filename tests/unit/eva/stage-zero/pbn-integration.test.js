/**
 * Unit tests: PBN orchestration module — SD-LEO-FEAT-PROVEN-BETTER-NEW-001.
 * Covers sanitizePbnVerdictForPersistence (TR-7/C1, direct — this is the security-sub-agent
 * -mandated content-bounding guard and must never be exercised only indirectly via mocks),
 * runPbnGate (scoring + gating orchestration), and recordPbnEvaluation (TR-5 wiring).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  sanitizePbnVerdictForPersistence,
  runPbnGate,
  recordPbnEvaluation,
} from '../../../../lib/eva/stage-zero/pbn-integration.js';

describe('sanitizePbnVerdictForPersistence (TR-7/C1)', () => {
  it('strips an email address from a citation field', () => {
    const verdict = {
      proven: { citations: [{ source: 'chairman rick@example.com noted this', measured: 'x', reference: 'r' }], coverage: true },
      better: { citations: [], coverage: false },
      new: { wedge_count: 1 },
      verdict: 'PASS',
      rule_trace: [],
    };
    const sanitized = sanitizePbnVerdictForPersistence(verdict);
    expect(sanitized.proven.citations[0].source).not.toContain('rick@example.com');
    expect(sanitized.proven.citations[0].source).toContain('[REDACTED_EMAIL]');
  });

  it('strips a UUID (internal identifier) from a citation field', () => {
    const verdict = {
      proven: { citations: [{ source: 's', measured: 'sd row 47472599-654a-4b15-89a7-055f02ea3e8e confirmed it', reference: 'r' }], coverage: true },
      better: { citations: [], coverage: false },
      new: { wedge_count: 1 },
      verdict: 'PASS',
      rule_trace: [],
    };
    const sanitized = sanitizePbnVerdictForPersistence(verdict);
    expect(sanitized.proven.citations[0].measured).not.toContain('47472599-654a-4b15-89a7-055f02ea3e8e');
    expect(sanitized.proven.citations[0].measured).toContain('[REDACTED_ID]');
  });

  it('strips an SD key from a citation field', () => {
    const verdict = {
      proven: { citations: [{ source: 's', measured: 'm', reference: 'per SD-LEO-FEAT-PROVEN-BETTER-NEW-001 analysis' }], coverage: true },
      better: { citations: [], coverage: false },
      new: { wedge_count: 1 },
      verdict: 'PASS',
      rule_trace: [],
    };
    const sanitized = sanitizePbnVerdictForPersistence(verdict);
    expect(sanitized.proven.citations[0].reference).not.toContain('SD-LEO-FEAT-PROVEN-BETTER-NEW-001');
    expect(sanitized.proven.citations[0].reference).toContain('[REDACTED_SD_KEY]');
  });

  it('sanitizes BOTH proven and better bucket citations independently', () => {
    const verdict = {
      proven: { citations: [{ source: 'a@b.com', measured: 'm', reference: 'r' }], coverage: true },
      better: { citations: [{ source: 's', measured: 'c@d.com', reference: 'r' }], coverage: true },
      new: { wedge_count: 1 },
      verdict: 'PASS',
      rule_trace: [],
    };
    const sanitized = sanitizePbnVerdictForPersistence(verdict);
    expect(sanitized.proven.citations[0].source).toContain('[REDACTED_EMAIL]');
    expect(sanitized.better.citations[0].measured).toContain('[REDACTED_EMAIL]');
  });

  it('leaves a clean, real market-referent citation untouched', () => {
    const verdict = {
      proven: { citations: [{ source: 'Category leader X', measured: 'public revenue disclosure', reference: 'https://example.test/x' }], coverage: true },
      better: { citations: [], coverage: false },
      new: { wedge_count: 1 },
      verdict: 'PASS',
      rule_trace: [],
    };
    const sanitized = sanitizePbnVerdictForPersistence(verdict);
    expect(sanitized.proven.citations[0]).toEqual(verdict.proven.citations[0]);
  });

  // SECURITY EXEC-TO-PLAN F2: the ORIGINAL version of this test held a fixture with nothing
  // redactable in rule_trace, so it could not distinguish "untouched" from "nothing to touch" —
  // this fixture embeds a real canary (email) in a rule_trace detail string, which sanitize
  // must NOT redact (it is code-authored, but a fixture that could never fail proves nothing).
  it('leaves rule_trace completely untouched even when it happens to contain canary-shaped text (code-authored, never LLM echo)', () => {
    const verdict = {
      proven: { citations: [], coverage: false },
      better: { citations: [], coverage: false },
      new: { wedge_count: 0 },
      verdict: 'REJECT',
      rule_trace: [{ rule_id: 'EMPTY_PROVEN', fired: true, detail: 'contact rick@example.com re: SD-LEO-FEAT-PROVEN-BETTER-NEW-001' }],
    };
    const sanitized = sanitizePbnVerdictForPersistence(verdict);
    expect(sanitized.rule_trace).toEqual(verdict.rule_trace);
    expect(sanitized.rule_trace[0].detail).toContain('rick@example.com');
  });

  it('handles empty citation arrays without throwing', () => {
    const verdict = { proven: { citations: [], coverage: false }, better: { citations: [], coverage: false }, new: { wedge_count: 0 }, verdict: 'REJECT', rule_trace: [] };
    expect(() => sanitizePbnVerdictForPersistence(verdict)).not.toThrow();
  });

  // SECURITY EXEC-TO-PLAN F1: the ORIGINAL sanitizer covered citations only (1 of 7 LLM-
  // authored leaves) — proven.mechanic, better.hypothesis, better.friction_point and new.wedge
  // all leaked a canary unredacted. These pin the fix; each must independently fail if the
  // corresponding field regresses to unsanitized.
  it('sanitizes proven.mechanic (was leaking — F1)', () => {
    const verdict = { proven: { mechanic: 'contact rick@example.com', citations: [], coverage: false }, better: { citations: [], coverage: false }, new: { wedge_count: 0 }, verdict: 'REJECT', rule_trace: [] };
    expect(sanitizePbnVerdictForPersistence(verdict).proven.mechanic).not.toContain('rick@example.com');
  });
  it('sanitizes better.hypothesis and better.friction_point (was leaking — F1)', () => {
    const verdict = {
      proven: { citations: [], coverage: false },
      better: { hypothesis: 'per rick@example.com', friction_point: 'row 47472599-654a-4b15-89a7-055f02ea3e8e', citations: [], coverage: false },
      new: { wedge_count: 0 }, verdict: 'REJECT', rule_trace: [],
    };
    const sanitized = sanitizePbnVerdictForPersistence(verdict);
    expect(sanitized.better.hypothesis).not.toContain('rick@example.com');
    expect(sanitized.better.friction_point).not.toContain('47472599-654a-4b15-89a7-055f02ea3e8e');
  });
  it('sanitizes new.wedge (was leaking — F1)', () => {
    const verdict = { proven: { citations: [], coverage: false }, better: { citations: [], coverage: false }, new: { wedge: 'per SD-LEO-FEAT-PROVEN-BETTER-NEW-001', wedge_count: 1 }, verdict: 'PASS', rule_trace: [] };
    expect(sanitizePbnVerdictForPersistence(verdict).new.wedge).not.toContain('SD-LEO-FEAT-PROVEN-BETTER-NEW-001');
  });
  it('drops an LLM-invented extra key inside a citation object rather than passing it through (was leaking — F1 spread-is-a-denylist)', () => {
    const verdict = {
      proven: { citations: [{ source: 'Category leader X', measured: 'Public revenue disclosure', reference: 'r', internal_note: 'rick@example.com' }], coverage: true },
      better: { citations: [], coverage: false }, new: { wedge_count: 1 }, verdict: 'PASS', rule_trace: [],
    };
    const sanitized = sanitizePbnVerdictForPersistence(verdict);
    expect(sanitized.proven.citations[0]).not.toHaveProperty('internal_note');
    expect(Object.keys(sanitized.proven.citations[0]).sort()).toEqual(['measured', 'reference', 'source']);
  });
  it('nulls out a citation.reference that is an object instead of passing it through unredacted (was leaking — F1)', () => {
    const verdict = {
      proven: { citations: [{ source: 'Category leader X', measured: 'Public revenue disclosure', reference: { url: 'rick@example.com' } }], coverage: true },
      better: { citations: [], coverage: false }, new: { wedge_count: 1 }, verdict: 'PASS', rule_trace: [],
    };
    const sanitized = sanitizePbnVerdictForPersistence(verdict);
    expect(sanitized.proven.citations[0].reference).toBeNull();
  });
  it('drops a bare string standing in for a citation object rather than passing it through (was leaking — F1)', () => {
    const verdict = {
      proven: { citations: ['rick@example.com is the contact'], coverage: true },
      better: { citations: [], coverage: false }, new: { wedge_count: 1 }, verdict: 'PASS', rule_trace: [],
    };
    const sanitized = sanitizePbnVerdictForPersistence(verdict);
    expect(sanitized.proven.citations[0]).toBeNull();
  });
});

describe('runPbnGate (orchestration: score -> gate -> sanitize)', () => {
  it('scores via the injected LLM client, gates the result, and returns a sanitized verdict', async () => {
    const content = JSON.stringify({
      proven: { mechanic: 'incumbent', citations: [{ source: 'Category leader X', measured: 'Public revenue disclosure, FY2025 10-K', reference: 'https://example.test' }], coverage: true },
      better: { hypothesis: 'h', citations: [], coverage: false },
      new: { wedge: 'w', wedge_count: 1, coverage: true },
    });
    const llmClient = { complete: vi.fn().mockResolvedValue({ content }) };

    const verdict = await runPbnGate({ name: 'Idea', problem_statement: 'p', solution: 's' }, { llmClient, logger: { error: vi.fn() }, now: '2026-08-15T00:00:00.000Z' });

    expect(verdict.verdict).toBe('PASS');
    expect(verdict.measured_at).toBe('2026-08-15T00:00:00.000Z');
    expect(llmClient.complete).toHaveBeenCalledTimes(1);
  });

  it('a scorer that fails closed still produces a valid, gated REJECT verdict end-to-end', async () => {
    const llmClient = { complete: vi.fn().mockRejectedValue(new Error('down')) };
    const verdict = await runPbnGate({ name: 'Idea' }, { llmClient, logger: { error: vi.fn() } });
    expect(verdict.verdict).toBe('REJECT');
    expect(verdict.rule_trace.some((r) => r.rule_id === 'EMPTY_PROVEN')).toBe(true);
  });

  it('sanitizes injected-identifier citations end-to-end (LLM hallucinates a UUID)', async () => {
    const content = JSON.stringify({
      proven: { citations: [{ source: 'ref', measured: 'row 47472599-654a-4b15-89a7-055f02ea3e8e', reference: 'https://example.test' }], coverage: true },
      better: { citations: [], coverage: false },
      new: { wedge_count: 1 },
    });
    const llmClient = { complete: vi.fn().mockResolvedValue({ content }) };
    const verdict = await runPbnGate({ name: 'Idea' }, { llmClient, logger: { error: vi.fn() } });
    expect(verdict.proven.citations[0].measured).not.toContain('47472599-654a-4b15-89a7-055f02ea3e8e');
  });
});

describe('recordPbnEvaluation (TR-5 wiring)', () => {
  it('calls recordNurseryEvaluation with triggerType=manual, evaluatedBy=pbn_gate', async () => {
    const insertSpy = vi.fn().mockReturnValue({ select: () => ({ single: async () => ({ data: { id: 'eval-1' }, error: null }) }) });
    const supabase = { from: (table) => (table === 'nursery_evaluation_log' ? { insert: insertSpy } : {}) };
    const verdict = { verdict: 'REJECT', proven: { coverage: false }, new: { wedge_count: 0 }, measured_at: '2026-08-15T00:00:00.000Z', rule_trace: [] };

    await recordPbnEvaluation('nursery-1', verdict, { supabase, logger: { log: vi.fn() } });

    expect(insertSpy).toHaveBeenCalledTimes(1);
    const row = insertSpy.mock.calls[0][0];
    expect(row.nursery_id).toBe('nursery-1');
    expect(row.trigger_type).toBe('manual');
    expect(row.evaluated_by).toBe('pbn_gate');
    expect(row.trigger_details).toEqual(verdict);
  });

  // T2-F5 (TESTING sub-agent, EXEC-TO-PLAN): the prior version of this test's TITLE claimed
  // skipAdvance=true but never asserted it. skipAdvance gates a SEPARATE call
  // (advanceNurserySchedule, which touches venture_nursery) — proven here by giving
  // venture_nursery a spy and asserting it is NEVER touched: a PBN score is not a scheduled
  // re-evaluation event (module docblock), so recordPbnEvaluation must not reschedule one.
  it('passes skipAdvance=true through to recordNurseryEvaluation — a PBN score never reschedules venture_nursery', async () => {
    const insertSpy = vi.fn().mockReturnValue({ select: () => ({ single: async () => ({ data: { id: 'eval-1' }, error: null }) }) });
    const nurserySpy = vi.fn();
    const supabase = {
      from: (table) => {
        if (table === 'nursery_evaluation_log') return { insert: insertSpy };
        if (table === 'venture_nursery') return { update: nurserySpy, select: nurserySpy };
        return {};
      },
    };
    const verdict = { verdict: 'PASS', proven: { coverage: true }, new: { wedge_count: 1 }, measured_at: '2026-08-15T00:00:00.000Z', rule_trace: [] };

    await recordPbnEvaluation('nursery-1', verdict, { supabase, logger: { log: vi.fn() } });

    expect(nurserySpy).not.toHaveBeenCalled();
  });

  it('propagates an error when nurseryId is missing (recordNurseryEvaluation\'s own contract)', async () => {
    const verdict = { verdict: 'PASS', proven: { coverage: true }, new: { wedge_count: 1 } };
    await expect(recordPbnEvaluation(null, verdict, { supabase: {}, logger: { log: vi.fn() } }))
      .rejects.toThrow('nurseryId is required');
  });
});
