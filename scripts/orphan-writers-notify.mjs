#!/usr/bin/env node
/**
 * Orphan-writers notifier (SD-LEO-INFRA-ORPHAN-WRITERS-REGISTRY-001, FR-4 + FR-4a).
 *
 * Raises an adam_advisory when a registered ORPHAN_ENTRIES predicate has been ORPHANED for
 * two consecutive windows (wired-but-blind / no-stamper-wired entries), or immediately on
 * first observation for a shipped-but-not-applied latch (FR-4a — a boolean latch cannot
 * flap, so debouncing it is meaningless, per TESTING sub-agent finding F-6).
 *
 * TESTING sub-agent finding F-1: lib/periodic-liveness/ladder-escalation.mjs
 * incrementConsecutiveMiss is NOT reusable here — its RPC is scoped to
 * periodic_process_registry rows with last_state='OVERDUE' and silently returns count:0
 * (no error) for any other state, which would ship this SD's own defect class (a write
 * that succeeds and feeds nothing). Consecutive-miss state is tracked instead via the
 * EXISTING canonical `feedback` writer (lib/governance/emit-feedback.js),
 * category='orphan_writer_miss', one row per (entry_id, run) — NOT a new table.
 *
 * Usage: node scripts/orphan-writers-notify.mjs
 */
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { emitFeedback } from '../lib/governance/emit-feedback.js';
import { evaluateEntry } from './orphan-writers-count.mjs';
import { ORPHAN_ENTRIES } from '../lib/governance/orphan-writers-registry.js';
import { isMainModule } from '../lib/utils/is-main-module.js';

// SECURITY sub-agent finding, EXEC-TO-PLAN: a cwd-relative path silently drops the advisory
// (fail-soft) when invoked from a different working directory. Resolve from this file's own
// location instead — this SD's own defect class is a write that succeeds and feeds nothing.
const ADAM_ADVISORY_SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'adam-advisory.cjs');

const MISS_CATEGORY = 'orphan_writer_miss';
const CONSECUTIVE_THRESHOLD = 2;

/**
 * Delete all tracked miss rows for an entry — called on PASS (the streak is broken) and
 * after firing an advisory (so the NEXT advisory requires another full CONSECUTIVE_THRESHOLD
 * streak, rather than re-firing on every subsequent run while still orphaned — TESTING F-2).
 */
async function resetMissStreak(supabase, entryId) {
  const { error } = await supabase.from('feedback').delete().eq('category', MISS_CATEGORY).eq('metadata->>entry_id', entryId);
  if (error) throw error;
}

/**
 * Record a miss row for this entry and return how many consecutive misses (including this
 * one) have been recorded for it since the last reset (a PASS or a prior advisory fire).
 */
async function recordMissAndCountConsecutive(supabase, entryId) {
  // dedup_key includes the run timestamp so consecutive windows on the same day each get
  // their own row — emitFeedback's dedup_hash is keyed on (day, description, dedup_key),
  // and description is identical across runs by design (it names the entry, not the run).
  const runStamp = new Date().toISOString();
  await emitFeedback({
    supabase,
    title: `orphan-writer miss: ${entryId}`,
    description: `Predicate for orphan-writers-registry entry "${entryId}" returned empty/ORPHANED on this run.`,
    type: 'enhancement',
    category: MISS_CATEGORY,
    severity: 'low',
    metadata: { entry_id: entryId, run_stamp: runStamp },
    dedup_key: `${entryId}::${runStamp}`,
  });

  const { count, error } = await supabase
    .from('feedback')
    .select('id', { count: 'exact', head: true })
    .eq('category', MISS_CATEGORY)
    .eq('metadata->>entry_id', entryId);
  if (error) throw error;
  return count || 0;
}

function sendAdvisory(body) {
  if (!process.env.CLAUDE_SESSION_ID) {
    console.warn(`[orphan-writers-notify] CLAUDE_SESSION_ID not set — advisory not sent (fail-soft): ${body}`);
    return { sent: false, reason: 'no_session_id' };
  }
  try {
    execFileSync('node', [ADAM_ADVISORY_SCRIPT, 'send', body, '--kind', 'adam_advisory'], { stdio: 'pipe' });
    return { sent: true };
  } catch (err) {
    console.warn(`[orphan-writers-notify] adam-advisory send failed (fail-soft): ${err.message}`);
    return { sent: false, reason: err.message };
  }
}

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const advisoriesSent = [];

  for (const entry of ORPHAN_ENTRIES) {
    const evaluation = await evaluateEntry(supabase, entry);
    const isLatch = entry.predicate?.latch === true;

    if (isLatch) {
      // FR-4a: single-fire, no debounce, on the first observed false.
      if (evaluation.verdict === 'MANUAL_CHECK_REQUIRED' || evaluation.verdict === 'ORPHANED') {
        const body = `orphan-writers-registry: shipped-but-not-applied specimen "${entry.id}" (writer: ${JSON.stringify(entry.writer)}, reader: ${JSON.stringify(entry.reader)}) has not been confirmed applied. Predicate: ${entry.predicate.description}`;
        advisoriesSent.push({ entry_id: entry.id, ...sendAdvisory(body) });
      }
      continue;
    }

    if (evaluation.verdict === 'ORPHANED' || evaluation.verdict === 'NO_CONSUMER' || evaluation.verdict === 'NO_CLOSING_PATH') {
      const consecutiveCount = await recordMissAndCountConsecutive(supabase, entry.id);
      if (consecutiveCount >= CONSECUTIVE_THRESHOLD) {
        const body = `orphan-writers-registry: "${entry.id}" (entry_type=${entry.entry_type}) has been orphaned for ${consecutiveCount} consecutive windows. Writer: ${JSON.stringify(entry.writer || entry.refs_drain_descriptor)}. Reader: ${JSON.stringify(entry.reader || 'see DRAIN_DESCRIPTORS')}.`;
        advisoriesSent.push({ entry_id: entry.id, ...sendAdvisory(body) });
        // Reset the streak after firing so a persisting orphan re-escalates every
        // CONSECUTIVE_THRESHOLD windows rather than spamming an advisory on every run.
        await resetMissStreak(supabase, entry.id);
      }
    } else {
      // PASS (or any non-miss verdict): the streak is broken — clear tracked misses.
      await resetMissStreak(supabase, entry.id);
    }
  }

  console.log(JSON.stringify({ advisories_sent: advisoriesSent }, null, 2));
  return advisoriesSent;
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { recordMissAndCountConsecutive, resetMissStreak, sendAdvisory };
