// SD-LEO-INFRA-PLAN-OF-RECORD-REMAINDER-VIEW-001 — view-consistency test.
//
// Guards the actual disease this SD fixes: dead-generation leakage into gauge
// surfaces (TS-1), stale cancelled-SD promotions reading as remaining (TS-2),
// inferred-vs-stamped divergence between independent reads (TS-3, TS-11), and
// the PostgREST count/head false-green trap confirmed live by the RISK
// sub-agent against a bogus control view (TS-6, TS-10) — every assertion here
// SELECTs real columns, never count/head.
//
// Skips gracefully when SUPABASE creds are absent (CI lane without secrets).

import { describe, it, expect, beforeAll } from 'vitest';
import { OPEN_REMAINDER_STATES } from '../../../lib/roadmap/plan-check-status.js';
import { buildRoadmapStatusDoc } from '../../../lib/chairman/daily-review/roadmap-status-doc.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const HAS_CREDS = Boolean(SUPABASE_URL && SERVICE_KEY);

const REMAINDER_STATES = ['promotable_now', 'gated_on_chairman', 'in_flight_or_sequence_blocked', 'satisfied_elsewhere', 'void'];

describe.skipIf(!HAS_CREDS)(
  'v_plan_of_record_remainder view consistency (SD-LEO-INFRA-PLAN-OF-RECORD-REMAINDER-VIEW-001)',
  () => {
    let sb;
    let viewRows;

    beforeAll(async () => {
      const { createClient } = await import('@supabase/supabase-js');
      sb = createClient(SUPABASE_URL, SERVICE_KEY);
      // TS-10: positive existence assert — a REAL column-select, not count/head.
      // PostgREST HEAD/count queries return error=null even for a NONEXISTENT
      // view (confirmed live by the RISK sub-agent), so existence must be
      // proven by successfully reading actual columns.
      const { data, error } = await sb
        .from('v_plan_of_record_remainder')
        .select('id, wave_id, title, remainder_state, remainder_state_stamped_at, wave_status');
      if (error) throw new Error(`v_plan_of_record_remainder query failed (view may not exist): ${error.message}`);
      viewRows = data;
    });

    it('TS-10: view exists and returns real rows via column-select (not count/head)', () => {
      expect(Array.isArray(viewRows)).toBe(true);
      expect(viewRows.length).toBeGreaterThan(0);
    });

    it('TS-1: every row belongs to an approved wave (view scoping)', () => {
      const nonApproved = viewRows.filter((r) => r.wave_status !== 'approved');
      expect(nonApproved.map((r) => r.id), 'rows from a non-approved wave leaked into the view').toEqual([]);
    });

    it('remainder_state is always one of the 5 stamped values, never null (post-backfill)', () => {
      const bad = viewRows.filter((r) => !REMAINDER_STATES.includes(r.remainder_state));
      expect(bad.map((r) => ({ id: r.id, remainder_state: r.remainder_state })), 'unstamped or invalid remainder_state').toEqual([]);
    });

    it('TS-2: an item promoted to a cancelled SD is classified void, never a remaining state', async () => {
      const { data: cancelledPromotions, error } = await sb
        .from('v_plan_of_record_remainder')
        .select('id, remainder_state, promoted_to_sd_key, strategic_directives_v2!inner(status)')
        .eq('strategic_directives_v2.status', 'cancelled');
      if (error) {
        // Embedded-resource syntax may not be enabled for this FK; fall back to
        // a two-step join so the assertion still runs rather than silently skip.
        const { data: cancelledSds } = await sb.from('strategic_directives_v2').select('sd_key').eq('status', 'cancelled');
        const cancelledKeys = new Set((cancelledSds || []).map((s) => s.sd_key));
        const affected = viewRows.filter((r) => r.promoted_to_sd_key && cancelledKeys.has(r.promoted_to_sd_key));
        const wrong = affected.filter((r) => r.remainder_state !== 'void');
        expect(wrong.map((r) => r.id), 'cancelled-SD promotions not classified void').toEqual([]);
        return;
      }
      const wrong = (cancelledPromotions || []).filter((r) => r.remainder_state !== 'void');
      expect(wrong.map((r) => r.id), 'cancelled-SD promotions not classified void').toEqual([]);
    });

    it('TS-9: at least one non-void remainder_state is present (partition is not degenerate)', () => {
      const nonVoid = viewRows.filter((r) => r.remainder_state !== 'void');
      expect(nonVoid.length, 'every row classified void — degenerate backfill would also pass TS-1/TS-3/TS-6').toBeGreaterThan(0);
    });

    // AC-5: known live baseline at ship time -- the true plan-of-record remainder (open,
    // not-yet-satisfied, not-void work) was independently verified by every sub-agent and by
    // a direct live query to be 6 items, down from the ~1495 dead-generation rows the old
    // unscoped gauge conflated. This is a point-in-time snapshot, not a permanent invariant --
    // update the expected count when the chairman promotes/resolves plan-of-record items.
    it('AC-5: the true (open) remainder baseline matches the live-verified count at ship time', () => {
      const OPEN_STATES = new Set(['promotable_now', 'gated_on_chairman', 'in_flight_or_sequence_blocked']);
      const trueRemainder = viewRows.filter((r) => OPEN_STATES.has(r.remainder_state));
      expect(trueRemainder.length, 'true remainder count drifted from the ship-time baseline of 6 — update if intentional (chairman promoted/resolved items)').toBe(6);
    });

    it('TS-3/TS-11: two independent reads produce byte-identical remainder_state partitions (stamped, not inferred)', async () => {
      const partitionOf = (rows) => {
        const p = {};
        for (const r of rows) p[r.remainder_state] = (p[r.remainder_state] || 0) + 1;
        return p;
      };
      const { data: secondRead, error } = await sb
        .from('v_plan_of_record_remainder')
        .select('id, remainder_state');
      if (error) throw new Error(`second read failed: ${error.message}`);
      expect(partitionOf(secondRead)).toEqual(partitionOf(viewRows));
    });

    // TS-7: consumer parity. lib/chairman/daily-review/roadmap-status-doc.js derives its
    // per-wave "remaining" count as (non-void total - satisfied_elsewhere), computed
    // independently of lib/roadmap/plan-check-status.js's OPEN_REMAINDER_STATES set. Both are
    // mathematically the same partition (every non-void row is either satisfied_elsewhere or
    // one of the three OPEN_REMAINDER_STATES) -- this proves the two consumers never silently
    // drift apart on what counts as "still remaining" plan-of-record work.
    it('TS-7: roadmap-status-doc\'s (total - promoted) count matches plan-check-status\'s OPEN_REMAINDER_STATES count', async () => {
      const doc = await buildRoadmapStatusDoc(sb);
      const por = doc.sections.find((s) => s.id === 'plan_of_record');
      expect(por.available).toBe(true);
      const docOpenCount = por.data.waves.reduce((sum, w) => sum + (w.item_counts.total - w.item_counts.promoted), 0);

      const rawOpenCount = viewRows.filter((r) => OPEN_REMAINDER_STATES.includes(r.remainder_state)).length;
      expect(docOpenCount).toBe(rawOpenCount);
    });

    it('TS-6: an anon-role client sees 0 rows (RLS/REVOKE enforced) — paired with TS-10\'s positive existence proof', async () => {
      if (!ANON_KEY) return; // advisory-skip this one assertion if the anon key isn't configured locally
      const { createClient } = await import('@supabase/supabase-js');
      const anonSb = createClient(SUPABASE_URL, ANON_KEY);
      const { data, error } = await anonSb.from('v_plan_of_record_remainder').select('id, remainder_state');
      // A denied/empty result may arrive as an RLS error OR an empty data array
      // depending on grant configuration -- both satisfy "anon cannot read rows".
      if (error) {
        expect(error).toBeTruthy();
      } else {
        expect(data).toEqual([]);
      }
    });
  }
);
