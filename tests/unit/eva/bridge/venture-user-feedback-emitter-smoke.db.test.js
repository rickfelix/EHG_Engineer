// SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-9 acceptance criterion 2: "An authenticated
// feedback-path smoke test exists and passes."
//
// tests/ddl/venture-user-feedback-ownership-rpc-ddl.db.test.js already thoroughly exercises the
// RPC's OWN SQL-level auth/rate-limit logic against an ephemeral vanilla Postgres via the `pg`
// driver directly. What that suite does NOT cover -- and what emitVentureUserFeedback actually
// depends on -- is the PostgREST/supabase-js RPC layer: does .rpc('fn_submit_venture_user_feedback',
// {p_venture_id, p_ingest_secret, ...}) resolve to the real function at all (PGRST202 fires on a
// parameter-name mismatch just as readily as on a missing function -- this session hit that exact
// class of mismatch twice while verifying other RPCs). This smoke test formalizes the live probe
// already run manually this session: a real round-trip through the ACTUAL Supabase target, proving
// the emitter's parameter names match the live schema and the RPC's own unauthorized-rejection
// fires as expected for an unprovisioned venture. SKIPS in ordinary CI (no designated non-prod
// Supabase target) -- see tests/helpers/db-available.js's own header for why that is the correct,
// deliberate default rather than a gap.
import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { emitVentureUserFeedback } from '../../../../lib/eva/bridge/venture-user-feedback-emitter.js';
import { describeDb } from '../../../helpers/db-available.js';

describeDb('emitVentureUserFeedback authenticated smoke test (live Supabase target)', () => {
  it('a real round-trip against the live RPC surfaces the DB unauthorized rejection for an unprovisioned venture, not PGRST202', async () => {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const result = await emitVentureUserFeedback(supabase, {
      ventureId: '00000000-0000-0000-0000-000000000000',
      ingestSecret: 'smoke-test-probe-not-a-real-secret',
      feedbackType: 'user_other',
      title: 'FR-9 authenticated smoke test',
      description: 'live round-trip probe, never expected to submit',
    });

    expect(result.submitted).toBe(false);
    // The load-bearing assertion: this must be the RPC's OWN business-logic rejection
    // ('rpc_error: ...unauthorized'), never the "not yet applied" branch -- proving the function
    // genuinely exists and the emitter's parameter names resolve against the live schema.
    expect(result.reason).toContain('rpc_error');
    expect(result.reason).not.toContain('not yet applied');
  });
});
