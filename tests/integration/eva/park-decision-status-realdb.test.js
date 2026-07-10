/**
 * REAL, DB-backed regression test for the park_venture_decision RPC.
 *
 * QF-20260710-291 (console-assessment finding #2, Alpha-3 ledger PR #5828; Solomon
 * ruling 28f557f7): parking a pending chairman decision terminalized it as
 * status='approved' (decision='pause') — semantically corrupt authority state, the
 * parked-path sibling of the Delta-C1 forged-approval class removed from the ready
 * path by SD-LEO-INFRA-STAGE0-CHAIRMAN-DECISION-AUTHORITY-001. Concretely dangerous:
 * the Stage-0 activation consumer treats status='approved' on a lifecycle_stage=0
 * stage_gate row as an authentic approval — a chairman clicking "Park" would have
 * ACTIVATED the venture he parked.
 *
 * The fixed RPC terminates a park as status='cancelled' (decision='pause', rationale
 * preserved). This test proves the round-trip against the REAL function: a parked
 * pending decision never yields status='approved'. A mocked unit test cannot catch
 * this — the defect lives in the SQL function body, not in JS.
 *
 * Uses real Supabase service-role connection (requires .env). Skipped if no real DB.
 * Creates a disposable venture + decision; all rows cleaned up in afterAll.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { describeDb } from '../../helpers/db-available.js';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const ts = Date.now();
let ventureId;
let decisionId;

describeDb('park_venture_decision RPC (real DB) — QF-20260710-291', () => {
  beforeAll(async () => {
    const { data: venture, error: vErr } = await supabase
      .from('ventures')
      .insert({
        name: `__e2e_park_status_${ts}__`,
        problem_statement: 'Disposable venture for QF-20260710-291 park-status regression',
        current_lifecycle_stage: 1,
        is_demo: true,
        status: 'paused',
      })
      .select('id')
      .single();
    if (vErr) throw new Error(`Failed to create venture: ${vErr.message}`);
    ventureId = venture.id;

    const { data: decision, error: dErr } = await supabase
      .from('chairman_decisions')
      .insert({
        venture_id: ventureId,
        lifecycle_stage: 0,
        status: 'pending',
        decision: 'pending',
        decision_type: 'stage_gate',
        summary: 'QF-20260710-291 regression fixture',
      })
      .select('id')
      .single();
    if (dErr) throw new Error(`Failed to create decision: ${dErr.message}`);
    decisionId = decision.id;
  });

  afterAll(async () => {
    if (decisionId) await supabase.from('chairman_decisions').delete().eq('id', decisionId);
    if (ventureId) await supabase.from('ventures').delete().eq('id', ventureId);
  });

  it('a parked pending decision terminates as cancelled — NEVER approved', async () => {
    const { data, error } = await supabase.rpc('park_venture_decision', {
      p_decision_id: decisionId,
      p_park_type: 'nursery',
      p_reason: 'QF-20260710-291 regression park',
    });
    expect(error).toBeNull();
    expect(data?.success).toBe(true);

    const { data: row } = await supabase
      .from('chairman_decisions')
      .select('status, decision, rationale')
      .eq('id', decisionId)
      .single();
    expect(row.status).not.toBe('approved'); // the corrupt-authority shape, pinned out
    expect(row.status).toBe('cancelled');
    expect(row.decision).toBe('pause');
    expect(row.rationale).toBe('QF-20260710-291 regression park');
  });

  it('no parked-as-approved rows remain anywhere (Solomon clause 2 backfill holds)', async () => {
    const { count, error } = await supabase
      .from('chairman_decisions')
      .select('id', { count: 'exact', head: true })
      .eq('decision', 'pause')
      .eq('status', 'approved');
    expect(error).toBeNull();
    expect(count).toBe(0);
  });
});
