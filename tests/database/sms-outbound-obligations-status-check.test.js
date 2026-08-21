/**
 * sms_outbound_obligations_status_check enum regression test
 * SD-LEO-FIX-SMS-OUTBOUND-WORKER-001 TS-10 / TR-7 (TEST-BLINDNESS)
 *
 * VALIDATION's finding: tests/unit/chairman/sms-outbound-reconcile.test.js's hand-rolled
 * in-memory Supabase mock stores any status value unvalidated -- it does not model the live
 * CHECK constraint at all. A status='void' write (the ORIGINAL, pre-VALIDATION proposal) would
 * have passed every mock-based unit test green while being a live no-op (23514, silently
 * swallowed by this file's pre-existing unchecked-UPDATE pattern -- QF-20260728-870). This test
 * proves a status='canceled' write genuinely survives the LIVE constraint, not just the mock.
 *
 * Approach: follows tests/database/model-usage-log-phase-check.test.js's two-tier pattern --
 * introspect pg_get_constraintdef first; fall back to a tagged probe insert+delete against the
 * real table if the introspection RPC is unavailable. Avoids touching real chairman-SMS rows by
 * tagging the probe with a unique dedupe_key and deleting it unconditionally afterward.
 */

import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

describe('sms_outbound_obligations_status_check enum (SD-LEO-FIX-SMS-OUTBOUND-WORKER-001 TS-10)', () => {
  it("accepts status='canceled' -- the exact value this SD's voidStaleAndCollapseObligations writes", async () => {
    let def = null;
    let introspectError = null;
    try {
      // exec_sql (param sql_text) -- confirmed live in this environment. exec_sql_readonly
      // (the sibling model-usage-log test's RPC name) does not exist here; using the
      // RPC directly confirmed to resolve avoids a guaranteed-fallback first attempt.
      const rpcResult = await supabase.rpc('exec_sql', {
        sql_text: `SELECT pg_get_constraintdef(c.oid) AS def
              FROM pg_constraint c
              JOIN pg_class t ON t.oid = c.conrelid
              WHERE t.relname = 'sms_outbound_obligations'
                AND c.conname = 'sms_outbound_obligations_status_check'`
      });
      if (rpcResult.error) introspectError = rpcResult.error;
      else def = rpcResult.data?.[0]?.result?.[0]?.def ?? null;
    } catch (e) {
      introspectError = e;
    }

    if (def) {
      expect(def, `constraint def should mention 'canceled': ${def}`).toMatch(/canceled/);
      // Locks in the spelling-hazard finding (VAL-1): neither variant spelling is accepted.
      expect(def, `constraint def should NOT accept the double-L spelling: ${def}`).not.toMatch(/cancelled/);
      return;
    }

    // Fallback: RPC unavailable in this environment -- probe INSERT against the real table.
    const probeDedupeKey = 'test-status-check-probe-' + Date.now();
    const probeRow = {
      recipient_phone: '+15550000000',
      kind: 'test_status_check_probe',
      body: 'SD-LEO-FIX-SMS-OUTBOUND-WORKER-001 TS-10 probe row -- safe to delete if found stale.',
      status: 'canceled',
      dedupe_key: probeDedupeKey,
    };
    const { error: insertErr } = await supabase.from('sms_outbound_obligations').insert(probeRow);
    // Cleanup synth probe row regardless of outcome.
    await supabase.from('sms_outbound_obligations').delete().eq('dedupe_key', probeDedupeKey);
    expect(insertErr, `status='canceled' should not raise 23514 (introspection unavailable: ${introspectError?.message}): ${insertErr?.message}`)
      .toBeNull();
  });

  it("rejects an unlisted status value (e.g. 'void') -- proves the mock's silent-acceptance gap is real", async () => {
    const probeDedupeKey = 'test-status-check-reject-probe-' + Date.now();
    const probeRow = {
      recipient_phone: '+15550000000',
      kind: 'test_status_check_probe',
      body: 'SD-LEO-FIX-SMS-OUTBOUND-WORKER-001 TS-10 negative probe -- should be rejected by the CHECK.',
      status: 'void',
      dedupe_key: probeDedupeKey,
    };
    const { error: insertErr } = await supabase.from('sms_outbound_obligations').insert(probeRow);
    await supabase.from('sms_outbound_obligations').delete().eq('dedupe_key', probeDedupeKey);
    expect(insertErr).not.toBeNull();
    expect(insertErr?.code).toBe('23514');
  });
});
