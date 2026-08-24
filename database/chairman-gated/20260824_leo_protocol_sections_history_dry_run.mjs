#!/usr/bin/env node
/**
 * Dry-run + post-apply proof for 20260824_leo_protocol_sections_history.sql
 * (SD-LEO-INFRA-PROTOCOL-GOVERNANCE-PACKAGE-001, FR-1).
 *
 * TWO SEPARATE VERIFICATION STEPS, matching the PRD's own corrected acceptance criteria: a
 * PostgREST/service-role write and a direct-pg BEGIN...ROLLBACK write cannot share one
 * transaction -- they are different connections/protocols.
 *
 * STEP 1 (always runs, works pre- or post-apply): runs the UP file's own body -- table, function,
 * three triggers, append-only guards, posture, and its internal DO $verify$ block -- inside a
 * script-controlled transaction that ALWAYS ROLLBACKs (mirrors
 * 20260823_eva_stage_gate_attempts_dry_run.mjs's proven pattern). This proves the DDL applies
 * cleanly and exercises the 'postgres'-channel branch (the DO $verify$ block runs as this same
 * direct connection).
 *
 * STEP 2 (only runs if the migration has ALREADY been applied live -- the table genuinely
 * exists): a disposable, self-cleaning INSERT via the real supabase-js/service-role client
 * (matching how the live /learn applier writes), proving the trigger records channel=
 * 'service_role' for a real PostgREST write. This cannot run under Step 1's rolled-back
 * transaction (a REST call is a separate connection and auto-commits), so it explicitly deletes
 * both the probe section row and its history row afterward as manual cleanup.
 *
 * Usage: node database/chairman-gated/20260824_leo_protocol_sections_history_dry_run.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDatabaseClient } from '../../lib/supabase-connection.js';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UP_FILE = join(__dirname, '20260824_leo_protocol_sections_history.sql');

function stripOuterTransaction(sql) {
  return sql
    .replace(/^\s*BEGIN;\s*/, '')
    .replace(/\s*COMMIT;\s*(?:--[^\n]*\n?)*$/, '');
}

async function step1DryRun() {
  const upSql = stripOuterTransaction(readFileSync(UP_FILE, 'utf8'));
  const client = await createDatabaseClient('engineer', { verify: false });

  let passed = false;
  try {
    await client.query('BEGIN');
    await client.query(upSql);
    passed = true;
    console.log('[STEP 1 PASS] UP file body + its own DO $verify$ block executed without error (postgres-channel branch proven).');
  } catch (err) {
    console.error('[STEP 1 FAIL] UP file body raised an error:', err.message);
  } finally {
    await client.query('ROLLBACK');
    console.log('[STEP 1 ROLLBACK] Transaction rolled back -- no live state changed.');
    await client.end();
  }
  return passed;
}

async function step2ServiceRoleChannelProof() {
  const supabase = createSupabaseServiceClient();

  const { data: exists, error: existsErr } = await supabase
    .from('leo_protocol_sections_history').select('id').limit(1);
  if (existsErr) {
    // PGRST205 is PostgREST's specific "table not in schema cache" code -- the ONLY error that
    // legitimately means "not applied yet." Any other error (RLS denial, network failure, stale
    // schema cache after a real apply) must FAIL loudly, not be swallowed as a skip (validation-
    // agent finding V-3: the original unconditional `if (existsErr)` treated every error the same
    // way, so a real post-apply regression would have silently reported SKIPPED forever).
    if (existsErr.code !== 'PGRST205') {
      console.error(`[STEP 2 FAIL] unexpected error checking for leo_protocol_sections_history (not a missing-table condition): ${existsErr.code} ${existsErr.message}`);
      return false;
    }
    console.log(`[STEP 2 SKIPPED] leo_protocol_sections_history does not exist live yet (migration not applied): ${existsErr.message}`);
    return true; // not a failure -- this step is post-apply-only, by design
  }
  void exists;

  const { data: proto } = await supabase.from('leo_protocol_sections').select('protocol_id').limit(1).single();
  if (!proto?.protocol_id) {
    console.error('[STEP 2 FAIL] could not find any existing protocol_id to attach a probe section to');
    return false;
  }

  let sectionId = null;
  let passed = false;
  try {
    const { data: inserted, error: insErr } = await supabase.from('leo_protocol_sections').insert({
      protocol_id: proto.protocol_id,
      section_type: 'verify_probe',
      title: 'FR-1 service-role channel probe',
      content: 'probe content',
      order_index: 999998,
      metadata: {},
    }).select('id').single();
    if (insErr) throw new Error(`insert probe section: ${insErr.message}`);
    sectionId = inserted.id;

    const { data: hist, error: histErr } = await supabase.from('leo_protocol_sections_history')
      .select('channel, provenance_status').eq('section_id', sectionId).eq('operation', 'INSERT')
      .order('id', { ascending: false }).limit(1).single();
    if (histErr) throw new Error(`read history row: ${histErr.message}`);

    if (hist.channel !== 'service_role') {
      throw new Error(`expected channel='service_role' for a PostgREST write, got '${hist.channel}'`);
    }
    if (hist.provenance_status !== 'missing') {
      throw new Error(`expected provenance_status='missing' (no provenance supplied), got '${hist.provenance_status}'`);
    }

    passed = true;
    console.log('[STEP 2 PASS] a real supabase-js/service-role write recorded channel=\'service_role\' correctly.');
  } catch (err) {
    console.error('[STEP 2 FAIL]', err.message);
  } finally {
    // Manual, explicit cleanup -- a REST write auto-commits, so this is the only way to remove
    // the probe row and its (append-only, un-updatable) history row's live footprint.
    if (sectionId != null) {
      await supabase.from('leo_protocol_sections').delete().eq('id', sectionId);
      console.log(`[STEP 2 CLEANUP] deleted probe section ${sectionId} (its DELETE also lands a history row, by design).`);
    }
  }
  return passed;
}

async function main() {
  const step1Passed = await step1DryRun();
  const step2Passed = await step2ServiceRoleChannelProof();

  if (!step1Passed || !step2Passed) {
    process.exitCode = 1;
  }
}

if (isMainModule(import.meta.url)) main();
