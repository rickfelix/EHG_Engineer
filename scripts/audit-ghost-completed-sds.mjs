#!/usr/bin/env node

/**
 * Audit Ghost-Completed SDs
 *
 * SD: SD-FDBK-INFRA-ATOMIC-REVERT-HELPER-001
 * Pattern: PAT-GHOST-COMPLETION-PARTIAL-REVERT-001
 *
 * Reports SDs flagged by v_sd_completion_integrity as ghost-completed
 * (status='completed' AND no accepted LEAD-FINAL-APPROVAL/BYPASS-COMPLETION
 * SPH row AND sd_type is not in the exempt list).
 *
 * Default mode: READ-ONLY. Prints a table with sd_key, sd_type, age_days,
 * lfa_rejected_count, lfa_last_attempted_at.
 *
 * --execute mode: applies revertSD() to each ghost SD AFTER explicit TTY
 * confirmation. Non-TTY callers must pass --force-yes (exit 2 otherwise).
 *
 * --filter <sd_type>: narrows to ghosts of the given sd_type. Value must be
 * in CANONICAL_SD_TYPES (lib/sd-type-enum.js) or script exits with code 3.
 *
 * --json: outputs a JSON array on stdout instead of a table.
 *
 * Exit codes:
 *   0 — success (or read-only success)
 *   1 — Supabase error
 *   2 — [INTERACTIVE_CONFIRM_REQUIRED] (--execute in non-TTY without --force-yes)
 *   3 — [INVALID_FILTER] (--filter value not in CANONICAL_SD_TYPES)
 *
 * Operator playbook:
 *   1. Run without flags to review the report.
 *   2. Use --filter to scope to a particular sd_type (e.g., --filter feature).
 *   3. Use --json for machine-parseable output.
 *   4. Use --execute (TTY only, will prompt) to bulk-revert. Be deliberate —
 *      RCA confirmed ~2027 ghost SDs exist; mass-revert is high blast radius.
 *      Use after thorough dry-run review only.
 */

import readline from 'node:readline/promises';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { CANONICAL_SD_TYPES } from '../lib/sd-type-enum.js';
import { revertSD } from '../lib/sd/revert.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 (real bug, already live): this
// audit's own docstring documents ~2027 ghost SDs — already past the PostgREST 1000-row cap —
// so the prior unranged read here was silently truncating the ghost-SD denominator. Paginate.
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

/**
 * Drain undici's keep-alive HTTP socket pool before process.exit. Without this,
 * Windows libuv asserts on src\win\async.c:76 when process.exit races with
 * in-flight socket teardown, producing STATUS_STACK_BUFFER_OVERRUN (0xC0000409).
 * Same pattern as scripts/hooks/pre-tool-enforce.cjs auditAndExit (QF-20260510-170/148).
 */
async function safeExit(code) {
  try {
    const undici = await import('undici');
    if (undici && typeof undici.getGlobalDispatcher === 'function') {
      const d = undici.getGlobalDispatcher();
      if (d && typeof d.destroy === 'function') {
        await Promise.race([
          d.destroy(),
          new Promise(resolve => setTimeout(resolve, 200)),
        ]).catch(() => {});
      }
    }
  } catch { /* fail-open: undici unavailable means no pool to drain */ }
  // Quick-fix QF-20260611-123: process.exit discards unflushed stdout on async
  // (Linux pipe) streams — a 317KB --json payload was truncated mid-string in CI.
  // An empty write's callback fires only after all previously queued writes drain.
  await new Promise((resolve) => process.stdout.write('', () => resolve()));
  await new Promise((resolve) => process.stderr.write('', () => resolve()));
  process.exit(code);
}

function parseArgs(argv) {
  const args = { execute: false, force_yes: false, json: false, filter: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--execute') args.execute = true;
    else if (a === '--force-yes') args.force_yes = true;
    else if (a === '--json') args.json = true;
    else if (a === '--filter') args.filter = argv[++i] || null;
    else if (a.startsWith('--filter=')) args.filter = a.slice('--filter='.length);
  }
  return args;
}

function daysSince(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function pad(str, n) {
  const s = String(str ?? '-');
  if (s.length >= n) return s.slice(0, n - 1) + '…';
  return s.padEnd(n);
}

async function fetchGhosts(supabase, filter) {
  const buildQuery = () => {
    let q = supabase
      .from('v_sd_completion_integrity')
      .select('id, sd_key, sd_type, status, updated_at, created_at, lfa_rejected_count, lfa_last_attempted_at')
      .eq('is_ghost_completed', true);
    if (filter) q = q.eq('sd_type', filter);
    return q.order('id', { ascending: true }); // unique tiebreaker (FR-6)
  };
  try {
    return await fetchAllPaginated(buildQuery);
  } catch (e) {
    const err = new Error(`[v_sd_completion_integrity] query failed: ${e.message}`);
    err.cause = e;
    throw err;
  }
}

function printJson(rows) {
  process.stdout.write(JSON.stringify(rows, null, 2));
  process.stdout.write('\n');
}

function printTable(rows) {
  if (rows.length === 0) {
    console.log('No ghost-completed SDs detected.');
    return;
  }
  console.log('');
  console.log('Ghost-Completed SDs (status=completed, no accepted LEAD-FINAL-APPROVAL / BYPASS-COMPLETION)');
  console.log('Source: v_sd_completion_integrity (sd_phase_handoffs canonical evidence)');
  console.log('');
  console.log(pad('SD_KEY', 50) + pad('TYPE', 18) + pad('AGE_DAYS', 10) + pad('LFA_REJECTED', 14) + pad('LFA_LAST_ATTEMPT', 24));
  console.log('-'.repeat(116));
  for (const r of rows) {
    console.log(
      pad(r.sd_key, 50) +
      pad(r.sd_type || 'null', 18) +
      pad(daysSince(r.updated_at) ?? '-', 10) +
      pad(r.lfa_rejected_count ?? 0, 14) +
      pad(r.lfa_last_attempted_at ?? '-', 24)
    );
  }
  console.log('-'.repeat(116));
  console.log(`Total: ${rows.length} ghost-completed SD(s)`);
}

async function confirmExecute(rows, forceYes) {
  if (forceYes) return true;
  if (!process.stdin.isTTY) {
    return false;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`\n--execute will revert ${rows.length} SD(s) to status=draft + current_phase=LEAD. Type 'yes' to confirm: `);
    return /^(y|yes)$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

async function applyReverts(supabase, rows) {
  const reason = `Bulk-revert via scripts/audit-ghost-completed-sds.mjs (PAT-GHOST-COMPLETION-PARTIAL-REVERT-001 remediation)`;
  let updated = 0, idempotent = 0, failed = 0;
  for (let i = 0; i < rows.length; i += 10) {
    const batch = rows.slice(i, i + 10);
    for (const row of batch) {
      try {
        const res = await revertSD(row.id, reason, { supabase });
        if (res.updated) updated++;
        if (res.was_idempotent) idempotent++;
      } catch (e) {
        failed++;
        console.error(`  ✗ ${row.sd_key}: ${e.message}`);
      }
    }
    console.log(`  batch ${Math.min(i + 10, rows.length)}/${rows.length} (updated=${updated} idempotent=${idempotent} failed=${failed})`);
  }
  return { updated, idempotent, failed };
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.filter && !CANONICAL_SD_TYPES.has(args.filter)) {
    console.error(`[INVALID_FILTER] sd_type "${args.filter}" not in CANONICAL_SD_TYPES.`);
    console.error(`Valid values: ${[...CANONICAL_SD_TYPES].join(', ')}`);
    await safeExit(3);
    return;
  }

  const supabase = createSupabaseServiceClient();

  let rows;
  try {
    rows = await fetchGhosts(supabase, args.filter);
  } catch (e) {
    console.error(e.message);
    await safeExit(1);
    return;
  }

  if (args.json) {
    printJson(rows);
  } else {
    printTable(rows);
  }

  if (!args.execute) {
    return;
  }

  if (rows.length === 0) {
    console.log('\nNo rows to revert.');
    return;
  }

  const ok = await confirmExecute(rows, args.force_yes);
  if (!ok) {
    if (!process.stdin.isTTY && !args.force_yes) {
      console.error('\n[INTERACTIVE_CONFIRM_REQUIRED] --execute requires either a TTY for confirmation or --force-yes flag.');
      await safeExit(2);
      return;
    }
    console.log('\nAborted.');
    return;
  }

  console.log('\nApplying revertSD() to each ghost SD...');
  const result = await applyReverts(supabase, rows);
  console.log(`\nDone: updated=${result.updated} idempotent=${result.idempotent} failed=${result.failed}`);
  if (result.failed > 0) await safeExit(1);
}

main()
  .then(() => safeExit(0))
  .catch(async (e) => {
    console.error('Unexpected error:', e);
    await safeExit(1);
  });
