#!/usr/bin/env node
/**
 * Populate strategic_directives_v2.worktree_commit_pin for existing rows.
 *
 * Part of SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-B (FR-3). Requires
 * database/chairman-gated/20260906_strategic_directives_worktree_commit_pin.sql to have been
 * applied first (the worktree_commit_pin column must exist) — this script exits early,
 * non-fatally, if it does not.
 *
 * SCOPE (TR-4): operates ONLY on `worktree_path IS NOT NULL AND worktree_commit_pin IS NULL` — a
 * cheap, plain-column, indexed-by-default filter. Never a jsonb::text scan (a prior attempt at a
 * related-but-different class timed out at 27k-38k rows on exactly that pattern).
 *
 * TARGETED, NOT A MASS REWRITE (db-expert measurement, 2026-09-07): of ~2,493 non-null
 * worktree_path rows, 92.7% are status=completed SDs whose worktrees were reaped long ago — for
 * those, a HISTORICAL:<path> sentinel carries zero information over NULL (per FR-2's own AC:
 * "never fabricated"). So: EXACT/APPROXIMATE pins are written for ANY row where the FR-2 resolver
 * can recover one; a HISTORICAL sentinel is written ONLY for status IN (active, in_progress,
 * pending_approval) or a currently-claimed row (claiming_session_id IS NOT NULL) — for a
 * status=completed row where no pin is recoverable, the row is reported but SKIPPED (left NULL).
 *
 * POPULATES, NEVER OVERWRITES: the query itself only selects rows where worktree_commit_pin IS
 * NULL, so a re-run can only act on rows a prior run has not already touched — idempotent by
 * construction, not by a separate audit-trail-then-compare step.
 *
 * Usage:
 *   node scripts/one-off/reconcile-worktree-commit-pin.mjs            (dry-run, default)
 *   node scripts/one-off/reconcile-worktree-commit-pin.mjs --execute  (apply)
 */
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { resolveWorktreePathTier, TIER } from '../../lib/git/commit-pin-resolver.mjs';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const EXECUTE = process.argv.includes('--execute');
const PAGE_SIZE = 500;
const OPEN_STATUSES = new Set(['active', 'in_progress', 'pending_approval']);

async function fetchCandidates(supabase) {
  const all = [];
  let page = 0;
  while (true) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, status, claiming_session_id, worktree_path, worktree_commit_pin, updated_at, created_at')
      .not('worktree_path', 'is', null)
      .is('worktree_commit_pin', null)
      .range(from, to);

    if (error) throw new Error(`Failed to query candidates (page ${page}): ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    page += 1;
  }
  return all;
}

async function checkColumnExists(supabase) {
  // SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-A's client factory THROWS on a genuine schema-drift
  // 42703 (undefined_column) rather than returning it as a normal {error} tuple — must catch,
  // not branch on error.code.
  try {
    await supabase.from('strategic_directives_v2').select('worktree_commit_pin').limit(1);
    return true;
  } catch (err) {
    if (/42703|does not exist/.test(err.message)) return false;
    throw err; // a different failure (connectivity, auth) must not be misreported as "column absent"
  }
}

function isOperationallyLive(row) {
  return OPEN_STATUSES.has(row.status) || row.claiming_session_id != null;
}

async function classifyOne(row) {
  try {
    // No recorded sha exists anywhere for these legacy rows (worktree_path has always been a
    // bare path — see FR-1's migration header). recordedAt is a best-effort reconstruction bound:
    // updated_at is the last time ANYTHING on the row changed, which may postdate the worktree's
    // real removal — but lastCommitTouchingBefore only ever returns a real, git-verified commit
    // at or before that bound (never fabricated), so a loose bound can only make the search
    // window wider, never produce an incorrect-but-plausible-looking answer.
    const pin = await resolveWorktreePathTier(
      { path: row.worktree_path, recordedSha: null, recordedAt: row.updated_at || row.created_at || null },
      {}
    );
    return { row, pin, error: null };
  } catch (err) {
    return { row, pin: null, error: err.message };
  }
}

async function main() {
  const supabase = await createSupabaseServiceClient();

  console.error(`[reconcile-worktree-commit-pin] starting ${EXECUTE ? '(EXECUTE)' : '(DRY RUN)'}`);
  const startedAt = Date.now();

  const columnExists = await checkColumnExists(supabase);
  if (!columnExists) {
    console.error('[reconcile-worktree-commit-pin] worktree_commit_pin column does not exist yet — apply FR-1\'s migration first. Exiting non-fatally.');
    return;
  }

  const candidates = await fetchCandidates(supabase);
  console.error(`[reconcile-worktree-commit-pin] found ${candidates.length} candidate rows (worktree_path set, worktree_commit_pin null)`);

  if (candidates.length === 0) {
    console.error('[reconcile-worktree-commit-pin] nothing to do (idempotent re-run)');
    return;
  }

  const tally = { [TIER.EXACT]: 0, [TIER.APPROXIMATE]: 0, historicalWritten: 0, historicalSkippedCompleted: 0, unclassifiable: 0 };
  const toWrite = [];

  for (const row of candidates) {
    const { pin, error } = await classifyOne(row);
    if (error || !pin) {
      tally.unclassifiable += 1;
      continue;
    }
    if (pin.tier === TIER.HISTORICAL) {
      if (isOperationallyLive(row)) {
        tally.historicalWritten += 1;
        toWrite.push({ row, pin });
      } else {
        tally.historicalSkippedCompleted += 1;
      }
      continue;
    }
    tally[pin.tier] += 1;
    toWrite.push({ row, pin });
  }

  console.error('[reconcile-worktree-commit-pin] tier breakdown (before any write):');
  console.error(`  EXACT:                        ${tally[TIER.EXACT]}`);
  console.error(`  APPROXIMATE:                  ${tally[TIER.APPROXIMATE]}`);
  console.error(`  HISTORICAL (written, live):   ${tally.historicalWritten}`);
  console.error(`  HISTORICAL (skipped, dead):   ${tally.historicalSkippedCompleted}`);
  console.error(`  unclassifiable (left NULL):   ${tally.unclassifiable}`);
  console.error(`  total to write:               ${toWrite.length}`);

  if (!EXECUTE) {
    for (const { row, pin } of toWrite.slice(0, 10)) {
      console.error(`  - ${row.sd_key} [${row.status}] -> ${pin.tier}: ${pin.value}`);
    }
    if (toWrite.length > 10) console.error(`  ... and ${toWrite.length - 10} more`);
    console.error('[reconcile-worktree-commit-pin] dry-run complete; no writes performed');
    return;
  }

  let written = 0;
  let failed = 0;
  for (const { row, pin } of toWrite) {
    const { error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update({ worktree_commit_pin: pin.value })
      .eq('id', row.id)
      .is('worktree_commit_pin', null); // refuse if another writer populated it between query and update
    if (updateError) {
      failed += 1;
      console.error(`[reconcile-worktree-commit-pin] FAILED ${row.sd_key}: ${updateError.message}`);
    } else {
      written += 1;
    }
  }

  const elapsedMs = Date.now() - startedAt;
  console.error(`[reconcile-worktree-commit-pin] complete: written=${written} failed=${failed} elapsed_ms=${elapsedMs}`);
  if (failed > 0) process.exit(1);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(`[reconcile-worktree-commit-pin] fatal: ${err.message}`);
    process.exit(1);
  });
}
