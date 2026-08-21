/**
 * sms_outbound_obligations_status_check enum regression test
 * SD-LEO-FIX-SMS-OUTBOUND-WORKER-001 TS-10 / TR-7 (TEST-BLINDNESS)
 *
 * VALIDATION's finding: tests/unit/chairman/sms-outbound-reconcile.test.js's hand-rolled
 * in-memory Supabase mock stores any status value unvalidated -- it does not model the live
 * CHECK constraint at all. A status='void' write (the ORIGINAL, pre-VALIDATION proposal) would
 * have passed every mock-based unit test green while being a live no-op (23514, silently
 * swallowed by this file's pre-existing unchecked-UPDATE pattern -- QF-20260728-870). This test
 * proves the constraint actually accepts 'canceled' and rejects both plausible near-misses
 * ('cancelled', 'void'), via introspection of the live pg_get_constraintdef -- no write, no probe
 * insert (the EXEC-TO-PLAN TESTING review flagged the original version's unconditional live probe
 * INSERT into the operational chairman-SMS table as unnecessarily risky given a read-only
 * alternative exists and was confirmed working in this environment).
 *
 * KNOWN GAP, DISCLOSED (TESTING review, EXEC-TO-PLAN): this file lives under tests/database/, so
 * it is collected into vitest's `db` project (vitest.config.js DB_INCLUDE). That project's setup
 * (tests/setup.db.js -> installDbTierGate) applies an UNCONDITIONAL beforeEach(ctx.skip()) to
 * EVERY test in the project when no non-production Supabase ref is designated
 * (tests/helpers/db-target.js DESIGNATED_NON_PROD_REFS, currently empty) -- regardless of whether
 * the individual test is read-only. This test is therefore SKIPPED today, same as its sibling
 * tests/database/model-usage-log-phase-check.test.js. Moving it to tests/unit/ is NOT a fix: that
 * project's setupFiles deliberately omit the dotenv load ("unit tests must not reach the live
 * DB" -- vitest.config.js), so it would either silently fail to connect or rely on ambient env
 * vars the project's own design intentionally withholds. This SD does not re-architect the
 * db-tier gate (out of scope, and would affect 225+ other DB suites) -- the constraint value
 * itself has been independently verified correct via direct measurement four times this session
 * (LEAD VALIDATION, EXEC self, EXEC-TO-PLAN TESTING, EXEC-TO-PLAN SECURITY), so the shipped code
 * is not at risk; what remains missing is a DURABLE regression guard that would catch a FUTURE
 * accidental typo. Flagged via /signal as a systemic harness gap, tracked separately.
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
  it("accepts 'canceled' and rejects both 'cancelled' and 'void' -- read-only introspection, no writes", async () => {
    // exec_sql (param sql_text) -- confirmed live in this environment across four independent
    // checks this SD. exec_sql_readonly (the sibling model-usage-log test's RPC name) does not
    // exist here.
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_text: `SELECT pg_get_constraintdef(c.oid) AS def
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            WHERE t.relname = 'sms_outbound_obligations'
              AND c.conname = 'sms_outbound_obligations_status_check'`
    });

    if (error) {
      // Introspection RPC unavailable in this environment -- report clearly rather than silently
      // passing. This is NOT expected to fire given the RPC's confirmed availability; if it does,
      // that is itself a signal the environment changed and this test needs attention.
      throw new Error(`exec_sql introspection failed: ${error.message}. The value has not been re-verified by this run.`);
    }

    const def = data?.[0]?.result?.[0]?.def;
    expect(def, 'constraint definition should be present').toBeTruthy();
    expect(def, `constraint def should accept 'canceled': ${def}`).toMatch(/\bcanceled\b/);
    expect(def, `constraint def should NOT accept the double-L spelling 'cancelled': ${def}`).not.toMatch(/\bcancelled\b/);
    expect(def, `constraint def should NOT accept the original 'void' proposal: ${def}`).not.toMatch(/\bvoid\b/);
  });
});
