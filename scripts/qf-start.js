#!/usr/bin/env node
/**
 * QF Start — atomically claim a quick-fix and begin work.
 * SD-FDBK-INFRA-CLAIM-VISIBILITY-ATOMIC-001
 *
 * The QF counterpart of sd-start.js. Routes through the existing QF-aware
 * claim_sd RPC (advisory xact lock; sets quick_fixes.claiming_session_id +
 * status=in_progress + claude_sessions.sd_key=<QF-ID> in one transaction), so:
 *   - two sessions can never be routed to the same QF (the 2026-06-12
 *     QF-20260611-123 duplicate-fix incident class), and
 *   - a QF-holding worker is visible as BUSY to fleet-dashboard /
 *     capacity-forecast / the sweep (their idle test is claude_sessions.sd_key).
 *
 * Usage: CLAUDE_SESSION_ID=<id> node scripts/qf-start.js <QF-ID>
 * Exit codes: 0 claimed; 2 usage; 3 claim refused (holder info printed); 1 error.
 */

import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
import { createRequire } from 'node:module';
import { repoUnfitReason } from '../lib/fleet/qf-repo-fitness.js';

// SD-LEO-INFRA-EXCLUDE-CHAIRMAN-GATED-001: canonical chairman-gated-hold predicate (CJS).
const { isChairmanGatedQF } = createRequire(import.meta.url)('../lib/fleet/qf-gated-hold.cjs');

dotenv.config();

/**
 * Drain undici's keep-alive socket pool before process.exit — without this,
 * Windows libuv asserts (src\win\async.c:76) when exit races socket teardown
 * and the process dies 127 instead of the intended code (QF-20260510-170 class).
 */
async function safeExit(code) {
  try {
    const undici = await import('undici');
    const d = undici.getGlobalDispatcher?.();
    if (d?.destroy) await Promise.race([d.destroy(), new Promise((r) => setTimeout(r, 200))]).catch(() => {});
  } catch { /* no pool to drain */ }
  process.exit(code);
}

async function main() {
  const qfId = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!qfId || !/^QF-/i.test(qfId)) {
    console.error('Usage: node scripts/qf-start.js <QF-ID>   (id must start with QF-)');
    process.exit(2);
  }
  const sessionId = process.env.CLAUDE_SESSION_ID;
  if (!sessionId) {
    console.error('CLAUDE_SESSION_ID env var required (set by the SessionStart hook).');
    process.exit(2);
  }

  const supabase = createSupabaseServiceClient();

  const unfitReason = await repoUnfitReason(supabase, qfId);
  if (unfitReason) {
    console.error(`✗ Quick-fix ${qfId} NOT claimed: ${unfitReason}`);
    await safeExit(3);
  }

  // SD-LEO-INFRA-EXCLUDE-CHAIRMAN-GATED-001 (adversarial-review fix, PR #6178): enforce the
  // chairman-gated hold at the CLAIM boundary too — the discovery-lane exclusions alone left
  // this path able to claim a gated QF by explicit id and start chairman-gated work without
  // release. Fail-open on read error (never wedge ungated claims on a DB hiccup).
  try {
    const { data: holdRow } = await supabase
      .from('quick_fixes').select('owner, release_condition').eq('id', qfId).maybeSingle();
    if (holdRow && isChairmanGatedQF(holdRow)) {
      console.error(`✗ Quick-fix ${qfId} NOT claimed: CHAIRMAN-GATED hold`);
      console.error(`  release condition: ${String(holdRow.release_condition).replace(/\n/g, ' ').slice(0, 160)}`);
      console.error(`  Release first: node scripts/release-chairman-gated-qf.js ${qfId} --reason "<why>"`);
      await safeExit(3);
    }
  } catch { /* fail-open — the gate must never wedge ungated claims */ }

  const { data, error } = await supabase.rpc('claim_sd', {
    p_sd_id: qfId,
    p_session_id: sessionId,
    p_track: null,
  });
  if (error) {
    console.error(`claim_sd failed: ${error.message}`);
    await safeExit(1);
  }
  if (!data?.success) {
    console.error(`✗ Quick-fix ${qfId} NOT claimed: ${data?.error || 'unknown'}`);
    if (data?.claimed_by) {
      console.error(`  Held by session ${data.claimed_by}` +
        (data.heartbeat_age_seconds != null ? ` (heartbeat ${data.heartbeat_age_seconds}s ago)` : ''));
      console.error('  Pick a different QF — never duplicate in-flight work.');
    }
    if (data?.message) console.error(`  ${data.message}`);
    await safeExit(3);
  }

  console.log(`✓ Quick-fix ${qfId} claimed (session ${sessionId})`);
  console.log(`  Branch convention: qf/${qfId}`);
  console.log(`  Complete with: node scripts/complete-quick-fix.js ${qfId} --pr-url <url>`);
  console.log('');

  // Delegate the details display to the existing canonical reader.
  const out = spawnSync(process.execPath, ['scripts/read-quick-fix.js', qfId], {
    encoding: 'utf8',
    stdio: 'inherit',
  });
  await safeExit(0); // claim succeeded; display failure is non-fatal
}

main().catch(async (e) => { console.error(e?.message || e); await safeExit(1); });
