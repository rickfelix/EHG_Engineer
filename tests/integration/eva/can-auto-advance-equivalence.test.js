/**
 * Equivalence test: pre-refactor _canAutoAdvance vs post-refactor RPC.
 *
 * SD-LEO-REFAC-GATE-AUTO-ADVANCE-001 FR-6 / TESTING #3.
 *
 * Imports the FROZEN pre-refactor logic from
 * tests/fixtures/can-auto-advance-pre-refactor.snapshot.js and asserts the
 * SECURITY DEFINER RPC `can_auto_advance` produces identical verdicts across
 * a table-driven scenario matrix covering all 4 governance layers.
 *
 * If you change the snapshot file after the body swap, this test becomes a
 * tautology — DO NOT EDIT tests/fixtures/can-auto-advance-pre-refactor.snapshot.js.
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { preRefactorCanAutoAdvanceVerdict } from '../../fixtures/can-auto-advance-pre-refactor.snapshot.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// Same V2 stage_config snapshot used by the unit test.
const V2 = [
  { stage_number: 1,  gate_type: 'none',      review_mode: 'auto'   },
  { stage_number: 2,  gate_type: 'none',      review_mode: 'auto'   },
  { stage_number: 3,  gate_type: 'kill',      review_mode: 'auto'   },
  { stage_number: 4,  gate_type: 'none',      review_mode: 'auto'   },
  { stage_number: 5,  gate_type: 'kill',      review_mode: 'auto'   },
  { stage_number: 6,  gate_type: 'none',      review_mode: 'auto'   },
  { stage_number: 7,  gate_type: 'none',      review_mode: 'review' },
  { stage_number: 8,  gate_type: 'none',      review_mode: 'review' },
  { stage_number: 9,  gate_type: 'none',      review_mode: 'review' },
  { stage_number: 10, gate_type: 'promotion', review_mode: 'auto'   },
  { stage_number: 11, gate_type: 'none',      review_mode: 'review' },
  { stage_number: 12, gate_type: 'none',      review_mode: 'auto'   },
  { stage_number: 13, gate_type: 'kill',      review_mode: 'auto'   },
  { stage_number: 14, gate_type: 'none',      review_mode: 'auto'   },
  { stage_number: 15, gate_type: 'none',      review_mode: 'auto'   },
  { stage_number: 16, gate_type: 'promotion', review_mode: 'auto'   },
  { stage_number: 17, gate_type: 'promotion', review_mode: 'auto'   },
  { stage_number: 18, gate_type: 'promotion', review_mode: 'auto'   },
  { stage_number: 19, gate_type: 'promotion', review_mode: 'auto'   },
  { stage_number: 20, gate_type: 'none',      review_mode: 'auto'   },
  { stage_number: 21, gate_type: 'none',      review_mode: 'auto'   },
  { stage_number: 22, gate_type: 'none',      review_mode: 'auto'   },
  { stage_number: 23, gate_type: 'kill',      review_mode: 'auto'   },
  { stage_number: 24, gate_type: 'promotion', review_mode: 'auto'   },
  { stage_number: 25, gate_type: 'promotion', review_mode: 'auto'   },
  { stage_number: 26, gate_type: 'none',      review_mode: 'auto'   },
];

// Mirror gov.isBlocking / gov.isReview for snapshot calls.
function makeGov() {
  const kp = new Set(V2.filter(s => s.gate_type === 'kill' || s.gate_type === 'promotion').map(s => s.stage_number));
  const rv = new Set(V2.filter(s => s.review_mode === 'review').map(s => s.stage_number));
  return {
    isBlocking: (n) => kp.has(n),
    isReview: (n) => rv.has(n),
  };
}

// Resolve the current chairman_dashboard_config row (RPC reads this directly).
async function readCdc() {
  const { data } = await supabase
    .from('chairman_dashboard_config')
    .select('global_auto_proceed, stage_overrides')
    .eq('config_key', 'default')
    .maybeSingle();
  return data;
}

const SKIP = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(SKIP)('can_auto_advance RPC == pre-refactor frozen snapshot', () => {
  let cdc;
  const gov = makeGov();

  beforeAll(async () => {
    cdc = await readCdc();
    expect(cdc).toBeTruthy();
  });

  // 26 stages × current live config = 26 cases. Snapshot reads the same CDC row
  // the RPC reads, so the comparison reflects production state truthfully.
  test.each(V2.map(s => [s.stage_number, s.gate_type, s.review_mode]))(
    'S%i (gate=%s, review=%s) — RPC matches snapshot',
    async (stageNumber) => {
      const expectedVerdict = await preRefactorCanAutoAdvanceVerdict(stageNumber, { cdcRow: cdc, gov });
      const { data, error } = await supabase.rpc('can_auto_advance', { p_stage_number: stageNumber });
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(1);
      const rpcVerdict = { can: data[0].can, reason: data[0].reason, layer: data[0].layer };
      expect(rpcVerdict).toEqual(expectedVerdict);
    }
  );

  test('RPC contract shape: returns array with one {can, reason, layer}', async () => {
    const { data, error } = await supabase.rpc('can_auto_advance', { p_stage_number: 6 });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(1);
    expect(Object.keys(data[0]).sort()).toEqual(['can', 'layer', 'reason']);
    expect(typeof data[0].can).toBe('boolean');
    expect(typeof data[0].reason).toBe('string');
  });

  test('Out-of-range stage_number returns stage_not_found', async () => {
    const { data, error } = await supabase.rpc('can_auto_advance', { p_stage_number: 999 });
    expect(error).toBeNull();
    expect(data[0]).toEqual({ can: false, reason: 'stage_not_found', layer: 0 });
  });

  test('NameSignal witness — S11 returns review_default_pause layer=4', async () => {
    const { data } = await supabase.rpc('can_auto_advance', { p_stage_number: 11 });
    expect(data[0]).toMatchObject({ can: false, reason: 'review_default_pause', layer: 4 });
  });

  test('Hard-gate-stages drift witness — S16 returns kill_promotion_gate layer=2', async () => {
    const { data } = await supabase.rpc('can_auto_advance', { p_stage_number: 16 });
    expect(data[0]).toMatchObject({ can: false, reason: 'kill_promotion_gate', layer: 2 });
  });

  test('S8 opt-in witness — returns approved (stage_overrides.stage_8.auto_proceed=true)', async () => {
    const { data } = await supabase.rpc('can_auto_advance', { p_stage_number: 8 });
    expect(data[0]).toMatchObject({ can: true, reason: 'approved' });
  });
});
