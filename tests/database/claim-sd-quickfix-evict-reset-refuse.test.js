/**
 * SD-LEO-INFRA-FIX-CLAIM-EVICTION-001 (FR-1, FR-2, FR-6) — claim_sd's quick_fixes claim-switch
 * eviction branch must:
 *   (FR-1) reset the evicted row's status to 'open' in the SAME UPDATE that clears
 *          claiming_session_id, instead of leaving it status='in_progress' with no claimant.
 *   (FR-2) REFUSE the whole claim-switch (touch nothing) when the evicted row carries a
 *          non-null pr_url or commit_sha -- mid-CI, real work in flight.
 *   (FR-6) emit a distinguishable session_lifecycle_events row for each of the two outcomes
 *          above (CLAIM_SWITCH_QF_EVICTED_RESET_OPEN / CLAIM_SWITCH_REFUSED_MID_CI).
 *
 * The fix ships in database/migrations/20260913_claim_sd_quickfix_evict_reset_refuse.sql, a
 * CREATE OR REPLACE FUNCTION against a SECURITY DEFINER function called by every fleet worker's
 * every check-in -- chairman-gated for apply (scripts/apply-migration.js's --prod-deploy path
 * requires a human-issued, <1h, single-use token; no delegated-apply path covers a function-body
 * rewrite). EXEC cannot and must not self-apply it. These tests therefore PROBE whether the
 * migration has landed (via lib/migration-audit-reader.js's hasBeenApplied, the same audit ledger
 * apply-migration.js writes to) and skip the real assertions — `if (!migrationApplied) return;`,
 * mirroring this same test family's existing `if (!targetQfId) return;` idiom in
 * tests/database/claim-sd-qf-live-peer-guard.test.js — until a chairman applies it. Once applied,
 * these tests activate with no further change needed.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const MIGRATION_PATH = 'database/migrations/20260913_claim_sd_quickfix_evict_reset_refuse.sql';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

const RUN_SUFFIX = `${process.pid}-${Date.now().toString(36)}`;
const SESSION = `test-evict-reset-refuse-${RUN_SUFFIX}`;
const OTHER_SESSION = `test-evict-reset-refuse-peer-${RUN_SUFFIX}`;

let migrationApplied = false;
let evictedQfId = null;
let targetQfId = null;

describe.skipIf(!HAS_REAL_DB)('claim_sd quick_fixes evict-reset / refuse-mid-CI (SD-LEO-INFRA-FIX-CLAIM-EVICTION-001)', () => {
  beforeAll(async () => {
    try {
      const { hasBeenApplied } = await import('../../lib/migration-audit-reader.js');
      const sql = readFileSync(path.join(repoRoot, MIGRATION_PATH), 'utf8');
      const sha256 = createHash('sha256').update(sql, 'utf8').digest('hex');
      migrationApplied = await hasBeenApplied(MIGRATION_PATH, sha256);
    } catch {
      migrationApplied = false; // audit ledger unreadable in this env -- treat as not-yet-applied
    }
    if (!migrationApplied) return;

    await supabase.from('quick_fixes').delete().like('id', 'QF-TESTEVICTRR-%');
    evictedQfId = `QF-TESTEVICTRR-EVICTED-${RUN_SUFFIX}`.toUpperCase().slice(0, 40);
    targetQfId = `QF-TESTEVICTRR-TARGET-${RUN_SUFFIX}`.toUpperCase().slice(0, 40);
    for (const id of [evictedQfId, targetQfId]) {
      await supabase.from('quick_fixes').insert({
        id, title: 'TEST FIXTURE (SD-LEO-INFRA-FIX-CLAIM-EVICTION-001): safe to delete',
        type: 'bug', severity: 'low',
        description: 'Scratch QF created by tests/database/claim-sd-quickfix-evict-reset-refuse.test.js; deleted in afterAll.',
        status: 'open',
      });
    }
    await supabase.from('claude_sessions').upsert(
      { session_id: SESSION, status: 'active', heartbeat_at: new Date().toISOString(), sd_key: null },
      { onConflict: 'session_id' });
  });

  afterAll(async () => {
    if (!migrationApplied) return;
    if (evictedQfId) await supabase.from('quick_fixes').delete().eq('id', evictedQfId);
    if (targetQfId) await supabase.from('quick_fixes').delete().eq('id', targetQfId);
    await supabase.from('claude_sessions').delete().eq('session_id', SESSION);
  });

  async function resetEvicted(overrides = {}) {
    await supabase.from('quick_fixes').update({
      claiming_session_id: SESSION, status: 'in_progress', pr_url: null, commit_sha: null, ...overrides,
    }).eq('id', evictedQfId);
    await supabase.from('quick_fixes').update({ claiming_session_id: null, status: 'open' }).eq('id', targetQfId);
    await supabase.from('claude_sessions').update({ sd_key: evictedQfId }).eq('session_id', SESSION);
  }

  it('(FR-1) resets the evicted quick_fixes row to status=open in the same eviction, and (FR-6) emits a distinguishable audit event', async () => {
    if (!migrationApplied) return;
    await resetEvicted();
    const before = Date.now();
    const { data } = await supabase.rpc('claim_sd', { p_sd_id: targetQfId, p_session_id: SESSION, p_track: null });
    expect(data?.success).toBe(true);

    const { data: evicted } = await supabase.from('quick_fixes')
      .select('status, claiming_session_id').eq('id', evictedQfId).maybeSingle();
    expect(evicted?.status).toBe('open');
    expect(evicted?.claiming_session_id).toBeNull();

    const { data: events } = await supabase.from('session_lifecycle_events')
      .select('event_type, metadata, created_at')
      .eq('event_type', 'CLAIM_SWITCH_QF_EVICTED_RESET_OPEN')
      .gte('created_at', new Date(before - 5000).toISOString())
      .order('created_at', { ascending: false }).limit(5);
    const match = (events || []).find((e) => e.metadata?.evicted_sd_key === evictedQfId);
    expect(match).toBeTruthy();
  });

  it('(FR-2) REFUSES the claim-switch when the evicted row carries a pr_url, touching nothing', async () => {
    if (!migrationApplied) return;
    await resetEvicted({ pr_url: 'https://github.com/example/pr/1' });
    const before = Date.now();
    const { data } = await supabase.rpc('claim_sd', { p_sd_id: targetQfId, p_session_id: SESSION, p_track: null });
    expect(data?.success).toBe(false);
    expect(data?.error).toBe('claim_switch_refused_mid_ci');

    // Untouched: still claimed by SESSION, still in_progress, pr_url still set.
    const { data: evicted } = await supabase.from('quick_fixes')
      .select('status, claiming_session_id, pr_url').eq('id', evictedQfId).maybeSingle();
    expect(evicted?.status).toBe('in_progress');
    expect(evicted?.claiming_session_id).toBe(SESSION);
    expect(evicted?.pr_url).toBeTruthy();

    // The NEW claim was never granted either -- the caller's session-side sd_key is unchanged.
    const { data: sess } = await supabase.from('claude_sessions').select('sd_key').eq('session_id', SESSION).maybeSingle();
    expect(sess?.sd_key).toBe(evictedQfId);

    const { data: events } = await supabase.from('session_lifecycle_events')
      .select('event_type, metadata, created_at')
      .eq('event_type', 'CLAIM_SWITCH_REFUSED_MID_CI')
      .gte('created_at', new Date(before - 5000).toISOString())
      .order('created_at', { ascending: false }).limit(5);
    const match = (events || []).find((e) => e.metadata?.evicted_sd_key === evictedQfId);
    expect(match).toBeTruthy();
    expect(match.metadata.pr_url_present).toBe(true);
  });

  it('(FR-2) REFUSES identically when the evicted row carries only a commit_sha (no pr_url)', async () => {
    if (!migrationApplied) return;
    await resetEvicted({ commit_sha: 'deadbeef' });
    const { data } = await supabase.rpc('claim_sd', { p_sd_id: targetQfId, p_session_id: SESSION, p_track: null });
    expect(data?.success).toBe(false);
    expect(data?.error).toBe('claim_switch_refused_mid_ci');
    const { data: evicted } = await supabase.from('quick_fixes')
      .select('status, claiming_session_id').eq('id', evictedQfId).maybeSingle();
    expect(evicted?.status).toBe('in_progress');
    expect(evicted?.claiming_session_id).toBe(SESSION);
  });

  it('the strategic_directives_v2 eviction branch is unchanged: an SD-side claim-switch still just clears (no status literal to reset)', async () => {
    if (!migrationApplied) return;
    // This is a negative/scope-boundary check -- the quick_fixes-only scope decision (LEAD
    // correction, evidence 5d196f47-4555-4f50-998d-101d38a2ccef) relies on strategic_directives_v2
    // having no 'open' status value, confirmed via a live schema-constraint read rather than trust.
    const { data: statusConstraint } = await supabase.rpc('exec_sql', {
      sql_text: "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'strategic_directives_v2'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%status%'",
    });
    const defs = (statusConstraint?.[0]?.result || []).map((r) => r.def).join(' | ');
    expect(defs).not.toMatch(/'open'/);
  });
});
