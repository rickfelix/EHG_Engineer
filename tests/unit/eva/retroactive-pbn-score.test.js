/**
 * SD-FDBK-FIX-VENTURE-CRACK-GATE-001 FR-6 (TS-10) — retroactive PBN scorer.
 * Pins: UUID-only targeting (no name lookup), safe write via the narrow RPC (never a JS
 * metadata spread), skip-if-already-scored, and a real (throw-on-unmocked) supabase fake.
 */
import { describe, it, expect, vi } from 'vitest';
import { parseArgs, buildBriefFromVenture, retroactivelyScoreVenture } from '../../../scripts/eva/retroactive-pbn-score.mjs';

const ALTIFYAI_ID = '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9';

function makeSupabase({ venture, rpcError = null } = {}) {
  const rpcCalls = [];
  return {
    rpcCalls,
    from: vi.fn((table) => {
      if (table !== 'ventures') throw new Error(`unmocked table: ${table}`);
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: venture, error: null }) }) }) };
    }),
    rpc: vi.fn((fnName, args) => {
      if (fnName !== 'set_venture_pbn_verdict_stage_zero') throw new Error(`unmocked rpc: ${fnName}`);
      rpcCalls.push(args);
      return Promise.resolve({ data: null, error: rpcError });
    }),
  };
}

describe('parseArgs', () => {
  it('parses --venture-id and --dry-run', () => {
    expect(parseArgs(['node', 's', '--venture-id', ALTIFYAI_ID, '--dry-run'])).toEqual({ ventureId: ALTIFYAI_ID, dryRun: true, help: false });
  });

  it('ADVERSARIAL REVIEW FIX (PR2): rejects a flag value that looks like another flag, via the shared cli-flag-parser rather than a hand-rolled argv[++i]', () => {
    const result = parseArgs(['node', 's', '--venture-id', '--dry-run']);
    expect(result.parseError).toMatch(/requires a value/);
    expect(result.ventureId).toBeNull();
  });
});

describe('buildBriefFromVenture', () => {
  it('maps venture fields into the pbn-scoring.js brief shape', () => {
    const venture = { id: ALTIFYAI_ID, name: 'AltifyAI', description: 'Enterprises struggle with image metadata', metadata: { thesis: { x: 1 }, stage_zero: { solution: 'AI tagging', target_market: 'enterprise' } } };
    const brief = buildBriefFromVenture(venture);
    expect(brief).toEqual({ name: 'AltifyAI', problem_statement: 'Enterprises struggle with image metadata', solution: 'AI tagging', target_market: 'enterprise', thesis: { x: 1 } });
  });

  it('degrades gracefully (nulls, not throws) when metadata/stage_zero is absent', () => {
    const brief = buildBriefFromVenture({ id: 'x', name: 'Y', description: null, metadata: null });
    expect(brief.solution).toBeNull();
    expect(brief.thesis).toBeNull();
  });
});

describe('retroactivelyScoreVenture', () => {
  it('rejects a non-UUID venture id (no name-based lookup exists)', async () => {
    const supabase = makeSupabase({});
    await expect(retroactivelyScoreVenture(supabase, 'MarketLens')).rejects.toThrow(/UUID/);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('skips (does not re-score) a venture that already has a pbn_verdict', async () => {
    const venture = { id: ALTIFYAI_ID, name: 'AltifyAI', description: 'd', metadata: { stage_zero: { pbn_verdict: { verdict: 'PASS' } } } };
    const supabase = makeSupabase({ venture });
    const result = await retroactivelyScoreVenture(supabase, ALTIFYAI_ID);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('pbn_verdict_already_present');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('scores an unscored venture and writes via the narrow RPC with the exact venture id (never a JS metadata spread)', async () => {
    const venture = { id: ALTIFYAI_ID, name: 'AltifyAI', description: 'd', metadata: { stage_zero: { solution: 's' } } };
    const supabase = makeSupabase({ venture });
    const scorePbnBuckets = vi.fn().mockResolvedValue({
      proven: { mechanic: 'x', citations: [{ source: 's', measured: 'm', reference: 'r' }], coverage: true },
      better: { hypothesis: 'h', friction_point: 'f', citations: [{ source: 's', measured: 'm', reference: 'r' }], coverage: true },
      new: { wedge: 'w', wedge_count: 1, coverage: true },
    });
    const buildPbnVerdict = vi.fn().mockReturnValue({ verdict: 'PASS', proven: {}, better: {}, new: {}, measured_at: '2026-08-17T00:00:00Z', rule_trace: [] });

    const result = await retroactivelyScoreVenture(supabase, ALTIFYAI_ID, { scorePbnBuckets, buildPbnVerdict });

    expect(result.skipped).toBe(false);
    expect(result.verdict).toBe('PASS');
    expect(supabase.rpcCalls).toHaveLength(1);
    expect(supabase.rpcCalls[0].p_venture_id).toBe(ALTIFYAI_ID);
    expect(supabase.rpcCalls[0].p_pbn_verdict.verdict).toBe('PASS');
  });

  it('surfaces (does not swallow) an RPC write error', async () => {
    const venture = { id: ALTIFYAI_ID, name: 'AltifyAI', description: 'd', metadata: {} };
    const supabase = makeSupabase({ venture, rpcError: { message: 'permission denied' } });
    const scorePbnBuckets = vi.fn().mockResolvedValue({ proven: {}, better: {}, new: {} });
    const buildPbnVerdict = vi.fn().mockReturnValue({ verdict: 'REJECT' });
    await expect(retroactivelyScoreVenture(supabase, ALTIFYAI_ID, { scorePbnBuckets, buildPbnVerdict })).rejects.toThrow('permission denied');
  });

  it('independent sweep finding: preserves the RPC error .code on the re-thrown error, so a caller\'s isMissingFunctionError(err) can still detect a PGRST202/42883 shape', async () => {
    const venture = { id: ALTIFYAI_ID, name: 'AltifyAI', description: 'd', metadata: {} };
    const supabase = makeSupabase({ venture, rpcError: { message: 'Could not find the function public.set_venture_pbn_verdict_stage_zero in the schema cache', code: 'PGRST202' } });
    const scorePbnBuckets = vi.fn().mockResolvedValue({ proven: {}, better: {}, new: {} });
    const buildPbnVerdict = vi.fn().mockReturnValue({ verdict: 'REJECT' });
    try {
      await retroactivelyScoreVenture(supabase, ALTIFYAI_ID, { scorePbnBuckets, buildPbnVerdict });
      throw new Error('expected retroactivelyScoreVenture to throw');
    } catch (err) {
      expect(err.code).toBe('PGRST202');
    }
  });

  // SECURITY finding (EXEC-TO-PLAN review, F1): the persisted verdict must be sanitized -- never
  // the raw buildPbnVerdict() output -- reopening the exact canary-content-leak class
  // SD-LEO-FEAT-PROVEN-BETTER-NEW-001's SECURITY F1 already fixed once for the primary write path.
  it('SECURITY F1: sanitizes the verdict (strips a chairman-identity-shaped string from a free-text field) before writing it via the RPC', async () => {
    const venture = { id: ALTIFYAI_ID, name: 'AltifyAI', description: 'd', metadata: {} };
    const supabase = makeSupabase({ venture });
    const scorePbnBuckets = vi.fn().mockResolvedValue({ proven: {}, better: {}, new: {} });
    const buildPbnVerdict = vi.fn().mockReturnValue({
      verdict: 'PASS',
      proven: { mechanic: 'contact rick@example.com for details', citations: [] },
      better: { hypothesis: 'h', friction_point: 'f', citations: [] },
      new: { wedge: 'w' },
    });

    await retroactivelyScoreVenture(supabase, ALTIFYAI_ID, { scorePbnBuckets, buildPbnVerdict });

    expect(supabase.rpcCalls[0].p_pbn_verdict.proven.mechanic).not.toContain('rick@example.com');
  });

  // SECURITY finding (EXEC-TO-PLAN review, F2): a genuine scoring failure must never become a
  // permanent, uncorrectable REJECT verdict -- set_venture_pbn_verdict_stage_zero's own
  // already-scored guard means a written REJECT could never be overwritten by a later successful
  // re-score. Automated across the whole portfolio (FR-1's Job 5), a silent write-through here
  // would permanently and silently REJECT every venture scored during an LLM outage window.
  it('SECURITY F2: a scoring_error skips the write entirely (never persists a fabricated REJECT), and is distinguishable from a genuine already-scored skip', async () => {
    const venture = { id: ALTIFYAI_ID, name: 'AltifyAI', description: 'd', metadata: {} };
    const supabase = makeSupabase({ venture });
    const scorePbnBuckets = vi.fn().mockResolvedValue({ proven: {}, better: {}, new: {}, scoring_error: 'LLM timeout' });
    const buildPbnVerdict = vi.fn().mockReturnValue({ verdict: 'REJECT', scoring_error: 'LLM timeout', proven: {}, better: {}, new: {} });

    const result = await retroactivelyScoreVenture(supabase, ALTIFYAI_ID, { scorePbnBuckets, buildPbnVerdict });

    expect(result).toEqual({ skipped: true, reason: 'scoring_error', ventureId: ALTIFYAI_ID, detail: 'LLM timeout' });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
