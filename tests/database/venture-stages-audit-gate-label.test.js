/**
 * SD-FDBK-FIX-GOVERNANCE-GAP-VENTURE-001
 * The venture_stages_audit trigger (fn_venture_stages_audit_trigger) must record
 * gate_label changes — a chairman-gate-control column that was previously omitted
 * (gate_type and review_mode were audited; gate_label was not), so chairman gate
 * decisions left no audit trail.
 *
 * Live-DB integration test, gated like the other tests/database suites so CI skips
 * cleanly without real credentials. It mutates one stage's gate_label, asserts a
 * venture_stages_audit row is written by the trigger, then restores the original
 * value (net-zero).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

// A gate stage that carries a gate_label in the seeded data.
const STAGE = 17;

describe.skipIf(!HAS_REAL_DB)('venture_stages_audit tracks gate_label (SD-FDBK-FIX-GOVERNANCE-GAP-VENTURE-001)', () => {
  let original;

  afterAll(async () => {
    if (original !== undefined) {
      await supabase.from('venture_stages').update({ gate_label: original }).eq('stage_number', STAGE);
    }
  });

  it('writes a venture_stages_audit row when gate_label changes, with correct old/new values', async () => {
    const { data: before, error: be } = await supabase
      .from('venture_stages').select('gate_label').eq('stage_number', STAGE).single();
    expect(be).toBeNull();
    original = before.gate_label;

    const marker = (original || '') + ' [AUDIT-TEST]';
    const ts = new Date().toISOString();

    const { error: ue } = await supabase
      .from('venture_stages').update({ gate_label: marker }).eq('stage_number', STAGE);
    expect(ue).toBeNull();

    const { data: rows, error: ae } = await supabase
      .from('venture_stages_audit')
      .select('changed_column, old_value, new_value, changed_at')
      .eq('stage_number', STAGE).eq('changed_column', 'gate_label')
      .gte('changed_at', ts).order('changed_at', { ascending: false }).limit(1);
    expect(ae).toBeNull();
    expect(rows && rows.length).toBe(1);
    expect(rows[0].old_value).toBe(original);
    expect(rows[0].new_value).toBe(marker);

    // restore (also handled in afterAll as a backstop)
    const { error: re } = await supabase
      .from('venture_stages').update({ gate_label: original }).eq('stage_number', STAGE);
    expect(re).toBeNull();
  });
});
