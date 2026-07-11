#!/usr/bin/env node
/**
 * SD-LEO-INFRA-HARNESS-BACKLOG-S1-ENUMERATION-SWEEP-001
 *
 * One-time enumeration sweep of the LEGACY (pre-drain-policy) non-witness
 * `feedback` rows with category='harness_backlog'. SD-LEO-INFRA-HARNESS-BACKLOG-
 * DRAIN-POLICY-001 fixed the write-time flow going forward but explicitly left this
 * backlog undispositioned (live paginated count at LEAD time: 3,154 rows — NOT the
 * ~2,396 the SD text estimated; this script always drives off a live COUNT, never a
 * constant).
 *
 * Five passes per row, in order, first-match-wins:
 *   1. Sibling-SD denylist  — rows already claimed by SHIP-WITNESS-TRIO-001
 *   2. Dedup-by-done-state  — checkFeedbackPremiseLiveness; only a FILE-CORROBORATED
 *      STALE result (confidence_score>=0.9) auto-closes. An ILIKE-only match holds
 *      for review — never auto-closed (see lib/eva/premise-liveness.js's fileMatch
 *      distinction). deps.nowMs is ALWAYS injected — premise-liveness.js's
 *      cutoffISO() silently defaults to a hardcoded 2026-06-23 base otherwise.
 *   3. Fingerprint promotion — survivors are grouped (lib/shared/content-fingerprint.cjs)
 *      and 3+-occurrence groups promote to a QF via scripts/create-quick-fix.js,
 *      budget-capped per run (default 15; excess groups are deferred, not dropped).
 *   4. Archive-reclassify   — stale (>30d) singleton (group size 1) survivors are
 *      RECLASSIFIED category harness_backlog -> informational_note + archived_at set,
 *      never scripts/feedback-age-out.mjs (which stays scoped to informational_note
 *      only, by LEAD-phase design decision) and never a DELETE.
 *   5. kept_actionable       — everything else: still genuinely open, no disposition
 *      possible this run.
 *
 * Every disposition (including held_for_review) stamps metadata.s1_sweep_disposition
 * in the SAME write, and the enumeration excludes already-stamped rows — a resumed
 * run after interruption never re-processes or double-promotes.
 *
 * Fold-ins (separate passes, same script): 42 unpromoted high-priority retro action
 * items (via scripts/promote-retro-action-items.mjs's exact call shape, unwindowed);
 * 9 remaining flag_review-severity feedback rows via
 * `scripts/chairman-decisions.mjs decide flag_review:<id> defer --rationale <citation>`
 * ONLY — decision-queue.mjs's constitutional rule is "nothing auto-decides"; `defer`
 * is the one decision that records evidence without approving/rejecting on the
 * chairman's behalf, so it is the only automatable outcome for this fold-in.
 *
 * Usage:
 *   node scripts/one-off/s1-backlog-sweep.mjs --dry-run [default]
 *   node scripts/one-off/s1-backlog-sweep.mjs --apply [--max-promotions N] [--json]
 *   node scripts/one-off/s1-backlog-sweep.mjs --apply --since <ISO>   # bounded re-run pass
 */
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { groupByFingerprint, shouldPromote } from '../../lib/shared/content-fingerprint.cjs';
import { checkFeedbackPremiseLiveness } from '../../lib/eva/feedback-premise-adapter.js';

export const PAGE_SIZE = 1000;
export const PROMOTION_THRESHOLD = 3;
export const DEFAULT_MAX_PROMOTIONS = 15;
export const SINGLETON_STALE_DAYS = 30;
export const WIDENED_COMPLETED_DAYS = 180;
export const WIDENED_RECENT_DAYS = 30;
export const FINGERPRINT_TYPE = 'harness_backlog_legacy_sweep';

/** SD-EHG-.../SHIP-WITNESS-TRIO-001 already claims these 3 rows as closing in its own scope (FR-7). */
export const SIBLING_CLAIMED_IDS = Object.freeze(['b119bba1', 'a50dd499', '98e6619a']);

export function parseArgs(argv) {
  const args = { dryRun: true, json: false, maxPromotions: DEFAULT_MAX_PROMOTIONS, since: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.dryRun = false;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--json') args.json = true;
    else if (a === '--max-promotions') args.maxPromotions = parseInt(argv[++i], 10) || DEFAULT_MAX_PROMOTIONS;
    else if (a === '--since') args.since = argv[++i] || null;
  }
  return args;
}

function buildSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key);
}

/**
 * FR-1 — paginated enumeration + COUNT(*) reconciliation. Never a single-shot
 * .select() (PostgREST's implicit db-max-rows=1000 silently truncates it).
 * @returns {Promise<{rows: Array<object>, liveCount: number}>}
 */
export async function fetchAllOpenRows(supabase, { since = null, pageSize = PAGE_SIZE } = {}) {
  let query = supabase
    .from('feedback')
    .select('id', { count: 'exact', head: true })
    .eq('category', 'harness_backlog')
    .is('archived_at', null)
    .not('status', 'in', '(resolved,wont_fix,duplicate,invalid,shipped)')
    .is('metadata->>s1_sweep_disposition', null);
  if (since) query = query.gte('created_at', since);
  const { count: liveCount, error: countError } = await query;
  if (countError) throw new Error(`COUNT(*) failed: ${countError.message}`);

  const rows = [];
  let from = 0;
  for (;;) {
    let page = supabase
      .from('feedback')
      .select('id, title, description, severity, priority, status, created_at, metadata')
      .eq('category', 'harness_backlog')
      .is('archived_at', null)
      .not('status', 'in', '(resolved,wont_fix,duplicate,invalid,shipped)')
      .is('metadata->>s1_sweep_disposition', null)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (since) page = page.gte('created_at', since);
    const { data, error } = await page;
    if (error) throw new Error(`Page fetch failed at offset ${from}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  if (rows.length !== liveCount) {
    throw new Error(`PAGINATION_MISMATCH: enumerated ${rows.length} rows but COUNT(*) reports ${liveCount} — refusing to proceed on a possibly-truncated set`);
  }
  return { rows, liveCount };
}

/**
 * FR-2 — dedup-by-done-state for one row. ALWAYS injects nowMs + widened windows.
 * Only a file-corroborated STALE result (confidence_score>=0.9) closes; an
 * ILIKE-only match (confidence_score<0.9) holds for review.
 * @returns {Promise<{outcome:'closed'|'held_for_review', citation?:string, evidence:string[]}>}
 */
export async function classifyDoneState(row, { supabase, git, nowMs = Date.now() } = {}) {
  const result = await checkFeedbackPremiseLiveness(row, {
    supabase,
    git,
    nowMs,
    completedDays: WIDENED_COMPLETED_DAYS,
    recentDays: WIDENED_RECENT_DAYS,
  });
  if (result.status === 'STALE' && result.confidence_score >= 0.9) {
    return { outcome: 'closed', citation: result.evidence.join('; '), evidence: result.evidence };
  }
  if (result.status === 'STALE') {
    // ILIKE-only match: real signal, not yet corroborated enough to auto-close.
    return { outcome: 'held_for_review', evidence: result.evidence };
  }
  return { outcome: 'survivor', evidence: result.evidence };
}

/**
 * FR-3 — fingerprint-cluster the survivor set and select which groups to promote,
 * respecting the per-run budget. Pure (no I/O); the caller performs the actual
 * create-quick-fix.js shell-outs.
 */
export function selectPromotableGroups(survivorRows, { threshold = PROMOTION_THRESHOLD, maxPromotions = DEFAULT_MAX_PROMOTIONS } = {}) {
  const groups = groupByFingerprint(survivorRows, (r) => ({
    type: FINGERPRINT_TYPE,
    body: `${r.title || ''}\n${r.description || ''}`,
    groupKey: r.id,
    severity: r.severity,
    timestamp: r.created_at,
  }));

  const eligible = [...groups.values()].filter((g) => shouldPromote(g, threshold));
  const toPromote = eligible.slice(0, maxPromotions);
  const deferred = eligible.slice(maxPromotions);
  const promotedIds = new Set(toPromote.flatMap((g) => g.rows.map((r) => r.id)));
  const singletons = [...groups.values()].filter((g) => g.groupKeys.size === 1 && !promotedIds.has(g.rows[0].id));

  return { groups, toPromote, deferred, singletons };
}

/** FR-5 — is a singleton survivor row stale enough to archive-reclassify? */
export function isStaleSingleton(row, { nowMs = Date.now(), staleDays = SINGLETON_STALE_DAYS } = {}) {
  const ageMs = nowMs - new Date(row.created_at).getTime();
  return ageMs > staleDays * 24 * 3600 * 1000;
}

/** Static self-check (TS-6): this module must never call .delete( against feedback. Guards the source at require-time. */
export function assertNoDeleteCalls(sourceText) {
  if (/\.from\(\s*['"]feedback['"]\s*\)[^;]*\.delete\(/s.test(sourceText)) {
    throw new Error('SAFETY: a .delete( call against feedback was found in the sweep source — refusing to run');
  }
}

async function stampDisposition(supabase, row, disposition) {
  await supabase
    .from('feedback')
    .update({ metadata: { ...(row.metadata || {}), s1_sweep_disposition: { ...disposition, decided_at: new Date().toISOString() } } })
    .eq('id', row.id);
}

async function closeWithCitation(supabase, row, citation) {
  await supabase
    .from('feedback')
    .update({
      status: 'resolved',
      resolution_type: 'S1_SWEEP_DEDUP',
      resolution_notes: `S1 sweep dedup-by-done-state: ${citation}`,
      resolved_at: new Date().toISOString(),
      metadata: { ...(row.metadata || {}), s1_sweep_disposition: { outcome: 'closed_with_citation', citation, decided_at: new Date().toISOString() } },
    })
    .eq('id', row.id);
}

async function archiveReclassify(supabase, row) {
  await supabase
    .from('feedback')
    .update({
      category: 'informational_note',
      archived_at: new Date().toISOString(),
      resolution_notes: 'S1 sweep: stale informational singleton, no recurrence, no shipped-fix citation available',
      metadata: { ...(row.metadata || {}), s1_sweep_disposition: { outcome: 'archived_via_reclassify', decided_at: new Date().toISOString() } },
    })
    .eq('id', row.id);
}

function promoteGroup(group) {
  const sourceIds = group.rows.map((r) => r.id);
  const title = `[S1 sweep x${sourceIds.length}] ${(group.sample_body.split('\n')[0] || group.fingerprint).slice(0, 90)}`;
  const description = `Auto-promoted by the S1 legacy-backlog sweep from ${sourceIds.length} harness_backlog occurrences sharing fingerprint ${group.fingerprint}. Source feedback row ids: ${sourceIds.join(', ')}.`;
  execFileSync('node', [
    'scripts/create-quick-fix.js',
    '--title', title,
    '--type', 'bug',
    '--severity', group.max_severity,
    '--description', description,
    '--feedback-id', sourceIds.join(','),
  ], { stdio: 'inherit' });
  return { title, sourceIds };
}

/** FR-4(a) — retro action-item fold-in: promote-retro-action-items.mjs's shape, unwindowed. */
export async function foldInRetroActionItems(supabase, { dryRun = true } = {}) {
  const { data: retros, error } = await supabase
    .from('retrospectives')
    .select('id, sd_id, title, action_items, target_application, metadata')
    .not('action_items', 'is', null);
  if (error) throw new Error(`retro fold-in select failed: ${error.message}`);

  let promoted = 0, skipped = 0, noHighPriority = 0;
  for (const retro of retros || []) {
    if (retro.metadata?.action_items_promoted) { skipped++; continue; }
    const items = Array.isArray(retro.action_items) ? retro.action_items : [];
    const highPriority = items.filter((i) => i && i.priority === 'high');
    if (highPriority.length === 0) { noHighPriority++; continue; }

    if (dryRun) { console.log(`[RETRO DRY-RUN] would promote retro=${retro.id} (${highPriority.length} high-priority items)`); continue; }

    const title = `[Retro action items] ${retro.sd_id || retro.title || retro.id}`.slice(0, 100);
    const description = [
      `Auto-promoted by S1 sweep from ${highPriority.length} high-priority action item(s) in retrospective ${retro.id} (SD ${retro.sd_id || 'n/a'}).`,
      ...highPriority.map((i, idx) => `${idx + 1}. ${i.item || i.action || '(no text)'} (owner: ${i.owner || 'unassigned'})`),
    ].join('\n');
    const cliArgs = ['scripts/create-quick-fix.js', '--title', title, '--type', 'bug', '--severity', 'medium', '--description', description];
    if (retro.target_application) cliArgs.push('--target-application', retro.target_application);
    try {
      execFileSync('node', cliArgs, { stdio: 'inherit' });
      await supabase.from('retrospectives').update({ metadata: { ...(retro.metadata || {}), action_items_promoted: true, action_items_promoted_at: new Date().toISOString() } }).eq('id', retro.id);
      promoted++;
    } catch (e) {
      console.error(`  [RETRO_PROMOTE_FAILED] retro ${retro.id}: ${e.message}`);
    }
  }
  return { promoted, skipped, noHighPriority };
}

/** FR-4(b) — flag_review fold-in. DEFER ONLY — decision-queue.mjs: "nothing auto-decides". */
export async function foldInFlagReviewRows(supabase, { dryRun = true, nowMs = Date.now() } = {}) {
  const { data: rows, error } = await supabase
    .from('feedback')
    .select('id, title, description, category, severity, status, created_at, metadata')
    .in('severity', ['critical', 'high'])
    .is('resolved_at', null)
    .not('status', 'in', '(resolved,wont_fix)')
    .is('metadata->>s1_sweep_disposition', null);
  if (error) throw new Error(`flag_review fold-in select failed: ${error.message}`);

  let deferred = 0, left = 0;
  for (const row of rows || []) {
    const result = await checkFeedbackPremiseLiveness(row, { supabase, nowMs, completedDays: WIDENED_COMPLETED_DAYS, recentDays: WIDENED_RECENT_DAYS });
    if (result.status !== 'STALE' || result.confidence_score < 0.9) { left++; continue; }

    const citation = result.evidence.join('; ');
    if (dryRun) { console.log(`[FLAG_REVIEW DRY-RUN] would defer flag_review:${row.id} citing: ${citation}`); deferred++; continue; }

    try {
      execFileSync('node', ['scripts/chairman-decisions.mjs', 'decide', `flag_review:${row.id}`, 'defer', '--rationale', `S1 sweep dedup-by-done-state: ${citation}`], { stdio: 'inherit' });
      await stampDisposition(supabase, row, { outcome: 'flag_review_deferred_with_citation', citation });
      deferred++;
    } catch (e) {
      console.error(`  [FLAG_REVIEW_DEFER_FAILED] ${row.id}: ${e.message}`);
    }
  }
  return { deferred, left };
}

export async function runSweep(argv, deps = {}) {
  const args = parseArgs(argv);
  const supabase = deps.supabase || buildSupabase();
  const nowMs = deps.nowMs ?? Date.now();
  const git = deps.git;

  const { rows, liveCount } = await fetchAllOpenRows(supabase, { since: args.since });

  const ledger = {
    live_count: liveCount,
    closed_with_citation: 0,
    held_for_review: 0,
    promoted_to_qf: [],
    archived_via_reclassify: 0,
    kept_actionable: 0,
    closed_by_sibling_sd: 0,
    deferred_over_budget: 0,
  };

  const survivors = [];
  for (const row of rows) {
    if (SIBLING_CLAIMED_IDS.includes(row.id)) {
      ledger.closed_by_sibling_sd++;
      if (!args.dryRun) await stampDisposition(supabase, row, { outcome: 'closed_by_sibling_sd' });
      continue;
    }

    const classification = await classifyDoneState(row, { supabase, git, nowMs });
    if (classification.outcome === 'closed') {
      ledger.closed_with_citation++;
      if (!args.dryRun) await closeWithCitation(supabase, row, classification.citation);
      continue;
    }
    if (classification.outcome === 'held_for_review') {
      ledger.held_for_review++;
      if (!args.dryRun) await stampDisposition(supabase, row, { outcome: 'held_for_review', evidence: classification.evidence.join('; ') });
      continue;
    }
    survivors.push(row);
  }

  const { toPromote, deferred, singletons } = selectPromotableGroups(survivors, { maxPromotions: args.maxPromotions });
  ledger.deferred_over_budget = deferred.reduce((n, g) => n + g.rows.length, 0);

  for (const group of toPromote) {
    if (args.dryRun) {
      console.log(`[PROMOTE DRY-RUN] fingerprint=${group.fingerprint.slice(0, 12)} occurrences=${group.rows.length}`);
      ledger.promoted_to_qf.push({ fingerprint: group.fingerprint, count: group.rows.length, dryRun: true });
      continue;
    }
    try {
      const { title } = promoteGroup(group);
      const stampedAt = new Date().toISOString();
      for (const row of group.rows) {
        await supabase.from('feedback').update({
          metadata: { ...(row.metadata || {}), promoted_to_qf: true, promoted_at: stampedAt, promoted_fingerprint: group.fingerprint, s1_sweep_disposition: { outcome: 'promoted_to_qf', decided_at: stampedAt } },
        }).eq('id', row.id);
      }
      ledger.promoted_to_qf.push({ fingerprint: group.fingerprint, count: group.rows.length, title });
    } catch (e) {
      console.error(`[PROMOTE_FAILED] fingerprint=${group.fingerprint.slice(0, 12)}: ${e.message}`);
    }
  }

  const promotedSurvivorIds = new Set(toPromote.flatMap((g) => g.rows.map((r) => r.id)));
  for (const row of survivors) {
    if (promotedSurvivorIds.has(row.id)) continue;
    const singleton = singletons.some((g) => g.rows[0].id === row.id);
    if (singleton && isStaleSingleton(row, { nowMs })) {
      ledger.archived_via_reclassify++;
      if (!args.dryRun) await archiveReclassify(supabase, row);
    } else {
      ledger.kept_actionable++;
      if (!args.dryRun) await stampDisposition(supabase, row, { outcome: 'kept_actionable' });
    }
  }

  const accountedFor = ledger.closed_with_citation + ledger.held_for_review + ledger.promoted_to_qf.reduce((n, p) => n + p.count, 0)
    + ledger.archived_via_reclassify + ledger.kept_actionable + ledger.closed_by_sibling_sd + ledger.deferred_over_budget;
  if (accountedFor !== liveCount) {
    throw new Error(`LEDGER_MISMATCH: accounted for ${accountedFor} of ${liveCount} rows`);
  }

  const retroFoldIn = await foldInRetroActionItems(supabase, { dryRun: args.dryRun });
  const flagReviewFoldIn = await foldInFlagReviewRows(supabase, { dryRun: args.dryRun, nowMs });

  return { ledger, retroFoldIn, flagReviewFoldIn, dryRun: args.dryRun };
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  runSweep(process.argv)
    .then((result) => {
      if (process.argv.includes('--json')) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log('\n=== S1 BACKLOG SWEEP LEDGER ===');
        console.log(JSON.stringify(result.ledger, null, 2));
        console.log('Retro fold-in:', JSON.stringify(result.retroFoldIn));
        console.log('Flag-review fold-in:', JSON.stringify(result.flagReviewFoldIn));
        console.log(result.dryRun ? '\n[DRY RUN] no writes performed.' : '\n[APPLIED] writes committed.');
      }
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error('SWEEP_FATAL:', err.message);
      process.exitCode = 1;
    });
}
