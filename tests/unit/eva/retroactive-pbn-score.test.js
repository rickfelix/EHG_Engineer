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
});
