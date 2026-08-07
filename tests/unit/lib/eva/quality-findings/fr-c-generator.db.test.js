/**
 * FR-C′ remediation SD generator — LIVE-DATABASE integration tests.
 *
 * SD: SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-FR-C-001 (original suite)
 * Split out of fr-c-generator.test.js by SD-LEO-FIX-CREDENTIAL-GUARD-INVERSION-001.
 *
 * WHY THIS FILE EXISTS SEPARATELY. These tests INSERT, UPDATE and DELETE rows in
 * strategic_directives_v2, venture_quality_findings, audit_log and feedback. They used to live in
 * a unit-project file, gated on a locally re-derived HAS_REAL_DB — "a URL is set and it isn't the
 * sentinel" — which derived PERMISSION TO WRITE from the mere PRESENCE of credentials. Paired with
 * tests/setup.unit.js applying its sentinel via `||=`, that made this block run exactly when the
 * unit tier's credential guard had FAILED. 11 rows carrying this suite's fc000000- fixture
 * venture_id reached production between 2026-05-04 and 2026-07-07.
 *
 * The `.db.test.js` name is load-bearing, not cosmetic: it routes the file to the `db` vitest
 * project, which vitest.config.js gates on assessDbTarget — so with no explicitly designated
 * non-production target the project resolves to ZERO files and these tests cannot run at all. The
 * unit tier can no longer collect them under any environment, which is the actual guarantee the
 * old skipIf only appeared to provide.
 *
 * The no-DB unit tests from the original file remain in fr-c-generator.test.js.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import {
  readRateLimitFromEnv,
  findOpenSdForCompositeKey,
  generateRemediationSdsForVenture,
  generateRemediationSdsBatch,
  selectPendingFindings,
  isLikelyTestFixture,
  FIXTURE_VENTURE_ID_PREFIX,
  FIXTURE_SIG_PREFIX,
  FR_C_REMEDIATION_SEVERITIES,
  FR_C_OPEN_SD_STATUSES,
} from '../../../../../lib/eva/quality-findings/sd-generator.js';
import { computeFindingHash } from '../../../../../lib/eva/quality-findings/finding-shape.js';
import { describeDb } from '../../../../helpers/db-available.js';


// ============================================================================
// INTEGRATION — gated on an AUTHORISED database target (never on credential presence)
// ============================================================================

describeDb('FR-C generator — integration (authorised DB target only)', () => {
  let supabase;
  let testVentureId;
  let createdSdKeys;
  let createdFindingIds;
  let prevFixtureEnv;

  beforeEach(() => {
    // Integration suite seeds rows that match fixture sentinels (fc000000-
    // venture_id, t-* sigs). Bypass the discriminator here so generator paths
    // can exercise dedup/rate-limit on those rows; production cron never sets
    // this env var (PAT-TEST-FIXTURE-PROMOTION-001).
    prevFixtureEnv = process.env.FR_C_ALLOW_FIXTURE_FINDINGS;
    process.env.FR_C_ALLOW_FIXTURE_FINDINGS = 'true';
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    // Stable per-test venture ID so cleanup can target it. Use a sentinel UUID
    // prefix to make rows easy to recognise in case cleanup misses any.
    testVentureId = 'fc000000-0000-4000-8000-' + Math.random().toString(16).slice(2, 14).padEnd(12, '0');
    createdSdKeys = [];
    createdFindingIds = [];
  });

  // SD-LEO-FIX-FIX-GENERATOR-INTEGRATION-001: a bare DELETE on strategic_directives_v2
  // rolls back atomically (and was silently swallowed by the old try/catch) whenever an
  // AFTER-INSERT governance trigger has wired an FK-RESTRICT/NO-ACTION child row (feedback,
  // sd_verification_results, etc.) onto the test SD -- that's how 20+ fc000000- phantom SDs
  // leaked into the live, self-claimable belt over 2 months. Cancel FIRST: an UPDATE never
  // trips a child FK, so the SD becomes terminal/un-claimable immediately regardless of what
  // child rows exist. cancellation_reason is required by a DB-level guard whenever status
  // transitions to 'cancelled' -- omitting it makes the cancel itself fail (empirically
  // verified 2026-07-04), which would silently defeat this fix.
  async function cancelTestSds(sdKeys) {
    if (!sdKeys.length) return { error: null };
    const { error } = await supabase
      .from('strategic_directives_v2')
      .update({ status: 'cancelled', cancellation_reason: 'test fixture cleanup (fr-c-generator.test.js)' })
      .in('sd_key', sdKeys);
    if (error) {
      console.error(`[fr-c-generator.test] FAILED to cancel test SD(s) ${sdKeys.join(',')}: ${error.message}`);
    }
    return { error };
  }

  afterEach(async () => {
    // Hard-delete is attempted best-effort on top of the cancel above; a failure there is
    // now logged loudly instead of silently swallowed, but no longer matters for safety.
    if (supabase && testVentureId) {
      await cancelTestSds(createdSdKeys);
      const { error: deleteErr } = await supabase.from('strategic_directives_v2').delete().eq('metadata->>venture_id', testVentureId);
      if (deleteErr) {
        console.warn(`[fr-c-generator.test] hard-delete skipped (non-fatal -- SD already cancelled above): ${deleteErr.message}`);
      }
      const { error: findingsErr } = await supabase.from('venture_quality_findings').delete().eq('venture_id', testVentureId);
      if (findingsErr) {
        console.error(`[fr-c-generator.test] FAILED to delete test finding(s) for venture ${testVentureId}: ${findingsErr.message}`);
      }
      try {
        await supabase.from('audit_log').delete().eq('metadata->>venture_id', testVentureId);
      } catch { /* audit_log cleanup is cosmetic only */ }
    }
    if (prevFixtureEnv === undefined) delete process.env.FR_C_ALLOW_FIXTURE_FINDINGS;
    else process.env.FR_C_ALLOW_FIXTURE_FINDINGS = prevFixtureEnv;
  });

  async function seedFinding({ category = 'lint', severity = 'medium', sig = `s-${Date.now()}-${Math.random()}` } = {}) {
    const finding_hash = computeFindingHash({
      venture_id: testVentureId,
      stage_number: 20,
      finding_category: category,
      finding_signature: sig,
    });
    const { data, error } = await supabase
      .from('venture_quality_findings')
      .insert({
        venture_id: testVentureId,
        stage_number: 20,
        finding_category: category,
        severity,
        finding_hash,
        evidence_pointer: { sig },
        status: 'pending',
      })
      .select('id, status, finding_hash')
      .single();
    if (error) throw new Error('seedFinding failed: ' + error.message);
    createdFindingIds.push(data.id);
    return data;
  }

  test('TS-1 round-trip: pending finding → DRAFT SD; finding transitions to sd_filed', async () => {
    const finding = await seedFinding({ category: 'lint', severity: 'medium' });

    const result = await generateRemediationSdsForVenture(testVentureId, { supabase, rateLimit: 20 });

    expect(result.created.length).toBe(1);
    expect(result.appended.length).toBe(0);
    expect(result.skippedRateLimited.length).toBe(0);
    expect(result.errors.length).toBe(0);

    const newKey = result.created[0].sd_key;
    createdSdKeys.push(newKey);

    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, status, current_phase, metadata')
      .eq('sd_key', newKey)
      .single();
    expect(sd.status).toBe('draft');
    expect(sd.current_phase).toBe('LEAD');
    expect(sd.metadata.generated_by).toBe('fr-c-prime-generator');
    expect(sd.metadata.venture_id).toBe(testVentureId);
    expect(sd.metadata.finding_category).toBe('lint');
    expect(sd.metadata.severity).toBe('medium');
    expect(sd.metadata.source_finding_ids).toContain(finding.id);

    const { data: f } = await supabase
      .from('venture_quality_findings')
      .select('status, sd_key, sd_filed_at')
      .eq('id', finding.id)
      .single();
    expect(f.status).toBe('sd_filed');
    expect(f.sd_key).toBe(newKey);
    expect(f.sd_filed_at).not.toBeNull();
  }, 30000);

  test('TS-2 dedup hit: second finding with same triple rolls under existing SD', async () => {
    const a = await seedFinding({ category: 'unit_test', severity: 'high', sig: 'sig-a' });

    const r1 = await generateRemediationSdsForVenture(testVentureId, { supabase, rateLimit: 20 });
    expect(r1.created.length).toBe(1);
    const sdKey = r1.created[0].sd_key;
    createdSdKeys.push(sdKey);

    // Second finding, same (venture, category, severity) triple
    const b = await seedFinding({ category: 'unit_test', severity: 'high', sig: 'sig-b' });

    const r2 = await generateRemediationSdsForVenture(testVentureId, { supabase, rateLimit: 20 });
    expect(r2.created.length).toBe(0);
    expect(r2.appended.length).toBe(1);
    expect(r2.appended[0].sd_key).toBe(sdKey);

    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('metadata')
      .eq('sd_key', sdKey)
      .single();
    expect(sd.metadata.source_finding_ids).toEqual(expect.arrayContaining([a.id, b.id]));

    // SD count for the triple is still 1
    const { data: allSds } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key')
      .eq('metadata->>venture_id', testVentureId)
      .eq('metadata->>finding_category', 'unit_test')
      .eq('metadata->>severity', 'high');
    expect(allSds.length).toBe(1);

    // Audit log shows one dedup_miss + one dedup_hit for this venture
    const { data: audits } = await supabase
      .from('audit_log')
      .select('event_type')
      .eq('metadata->>venture_id', testVentureId)
      .in('event_type', ['dedup_miss', 'dedup_hit']);
    expect(audits.filter((a) => a.event_type === 'dedup_miss').length).toBeGreaterThanOrEqual(1);
    expect(audits.filter((a) => a.event_type === 'dedup_hit').length).toBeGreaterThanOrEqual(1);
  }, 30000);

  test('TS-3 rate-limit ceiling: SDs ≤ ceiling; remaining stay pending; one rate_limit_triggered audit', async () => {
    // Seed 5 findings across distinct triples so dedup doesn't absorb them.
    const triples = [
      { category: 'lint', severity: 'medium' },
      { category: 'unit_test', severity: 'high' },
      { category: 'e2e_test', severity: 'critical' },
      { category: 'secrets', severity: 'medium' },
      { category: 'npm_audit', severity: 'high' },
    ];
    const seeded = [];
    for (const t of triples) {
      seeded.push(await seedFinding({ ...t, sig: `t-${t.category}-${t.severity}` }));
    }

    // Ceiling=2 → only 2 SDs created; remaining 3 findings stay pending.
    const result = await generateRemediationSdsForVenture(testVentureId, { supabase, rateLimit: 2 });
    expect(result.created.length).toBe(2);
    expect(result.skippedRateLimited.length).toBe(3);
    expect(result.errors.length).toBe(0);

    result.created.forEach((c) => createdSdKeys.push(c.sd_key));

    // Verify the 3 unprocessed findings still pending
    const { data: stillPending } = await supabase
      .from('venture_quality_findings')
      .select('id, status')
      .eq('venture_id', testVentureId)
      .eq('status', 'pending');
    expect(stillPending.length).toBe(3);

    // Audit log shows exactly one rate_limit_triggered for this venture
    const { data: audits } = await supabase
      .from('audit_log')
      .select('event_type, metadata')
      .eq('metadata->>venture_id', testVentureId)
      .eq('event_type', 'rate_limit_triggered');
    expect(audits.length).toBe(1);
    expect(audits[0].metadata.ceiling).toBe(2);
  }, 60000);

  test('TS-5 status machine: forward-only enforcement raises on backward transition', async () => {
    const f = await seedFinding({ category: 'capability', severity: 'medium' });

    // Forward: pending → sd_filed
    const { error: e1 } = await supabase
      .from('venture_quality_findings')
      .update({ status: 'sd_filed' })
      .eq('id', f.id);
    expect(e1).toBeNull();

    // Backward: sd_filed → pending should be rejected by the trigger
    const { error: e2 } = await supabase
      .from('venture_quality_findings')
      .update({ status: 'pending' })
      .eq('id', f.id);
    expect(e2).not.toBeNull();
    expect(e2.message).toMatch(/invalid status transition/i);

    // Forward: sd_filed → resolved (resolved_at_v2 auto-populated by trigger)
    const { error: e3 } = await supabase
      .from('venture_quality_findings')
      .update({ status: 'resolved' })
      .eq('id', f.id);
    expect(e3).toBeNull();

    const { data: row } = await supabase
      .from('venture_quality_findings')
      .select('status, sd_filed_at, resolved_at_v2')
      .eq('id', f.id)
      .single();
    expect(row.status).toBe('resolved');
    expect(row.sd_filed_at).not.toBeNull();
    expect(row.resolved_at_v2).not.toBeNull();
    expect(new Date(row.resolved_at_v2).getTime()).toBeGreaterThanOrEqual(new Date(row.sd_filed_at).getTime());

    // Backward from resolved is rejected
    const { error: e4 } = await supabase
      .from('venture_quality_findings')
      .update({ status: 'pending' })
      .eq('id', f.id);
    expect(e4).not.toBeNull();
  }, 30000);

  test('TS-6 (SD-LEO-FIX-FIX-GENERATOR-INTEGRATION-001): a test SD with an FK-blocking child row still becomes cancelled, not left draft', async () => {
    // Reproduces the exact historical leak: a real generator-created SD gets an
    // FK-RESTRICT child (feedback.strategic_directive_id) attached, so a bare DELETE
    // rolls back and the SD would be silently left 'draft' (self-claimable) forever.
    const finding = await seedFinding({ category: 'unit_test', severity: 'high', sig: 'ts6-fk-block' });
    const result = await generateRemediationSdsForVenture(testVentureId, { supabase, rateLimit: 20 });
    expect(result.created.length).toBe(1);
    const sdKey = result.created[0].sd_key;
    createdSdKeys.push(sdKey);

    const { error: fbErr } = await supabase.from('feedback').insert({
      type: 'issue', source_application: 'EHG_Engineer', source_type: 'manual_feedback',
      title: 'TS-6 blocking feedback row', category: 'harness_backlog',
      strategic_directive_id: sdKey,
    });
    expect(fbErr).toBeNull();

    // Old behavior (pre-fix): this bare delete fails with an FK-RESTRICT violation,
    // and the SD is left in 'draft' -- reproducing the historical leak exactly.
    const { error: bareDeleteErr } = await supabase.from('strategic_directives_v2').delete().eq('sd_key', sdKey);
    expect(bareDeleteErr).not.toBeNull();
    expect(bareDeleteErr.message).toMatch(/foreign key constraint/i);
    const { data: stillDraft } = await supabase.from('strategic_directives_v2').select('status').eq('sd_key', sdKey).single();
    expect(stillDraft.status).toBe('draft');

    // New behavior (this fix): cancelTestSds succeeds despite the blocking child row.
    const { error: cancelErr } = await cancelTestSds([sdKey]);
    expect(cancelErr).toBeNull();
    const { data: afterCancel } = await supabase.from('strategic_directives_v2').select('status').eq('sd_key', sdKey).single();
    expect(afterCancel.status).toBe('cancelled');

    // Clean up the blocking row so the real afterEach's hard-delete can fully succeed.
    await supabase.from('feedback').delete().eq('strategic_directive_id', sdKey);
  }, 30000);
});
