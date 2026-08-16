#!/usr/bin/env node
/**
 * SD-LEO-INFRA-STALE-QF-DISPOSITION-SWEEP-001
 *
 * Coordinator-owned, dry-run-by-default sweep for open, unclaimed quick_fixes rows sitting
 * past the STALE_QF_DAYS auto-start fence (lib/fleet/qf-auto-start.cjs) with no verifier,
 * owner, or expiry. Three pre-existing mechanisms (qf-auto-start's fence, clear-stale-qf-claims,
 * orphan-qf-reaper) all only touch claimed/PR-having rows -- none of them ever disposition an
 * unclaimed open row. This script closes that gap.
 *
 * Pipeline, in order:
 *   1. FR-3 dedupe-first — cluster past-fence candidates by content fingerprint
 *      (lib/shared/content-fingerprint.cjs). All but the survivor of each multi-row cluster
 *      close disposition='duplicate_of' BEFORE any citation check runs on the survivor. Rows
 *      with no extractable content get their own QF-id-keyed singleton fingerprint (empty-body
 *      guard) so they never falsely collide into one cluster.
 *   2. FR-4 citation check (lib/eva/quick-fix-citation-checker.js) — exactly two deterministic,
 *      no-LLM signals: a named test that runs PASS/FAIL, or a single non-range cited file that
 *      is completely absent. ABSENT -> premise_resolved. STILL_PRESENT -> FR-5. Everything else
 *      (no citation, ambiguous citation, cross-repo target, checker error) -> INCONCLUSIVE ->
 *      premise_unverified_stale, preserved via one feedback row (lib/governance/emit-feedback.js).
 *   3. FR-5 — STILL_PRESENT survivors, throttled to <= deps.seatCount per run (oldest
 *      high-severity-first; the rest are left untouched for a future run): <=3 extracted paths
 *      -> re_verified (status stays 'open', verified_at stamped); >3 -> promoted (status
 *      becomes 'escalated', reusing the existing escalation infrastructure).
 *   4. FR-7 TTL re-lapse — a previously re_verified row nobody picked up within
 *      REVERIFIED_TTL_DAYS ages back out to premise_unverified_stale.
 *
 * Closing dispositions (premise_resolved/premise_unverified_stale/duplicate_of) transition
 * status to the already-existing, already-excluded CHECK value 'closed'; promoted transitions
 * to the already-existing 'escalated'. 7 of 8 belt/gauge readers cataloged at LEAD phase need
 * ZERO code change as a result -- the 8th (qf-auto-start.cjs's age computation) was given one
 * narrow, explicitly-scoped edit (FR-6) so re_verified rows actually re-enter auto-start via
 * verified_at.
 *
 * Dry-run BY DEFAULT (mirrors scripts/feedback-fingerprint-promoter.mjs's convention). --apply
 * refuses until (a) the staged migration's disposition columns exist live (FR-2) and (b)
 * --h2-confirmed=<ISO-date> is supplied, attesting the coordinator's one-time two-sided
 * verification pass has already run (FR-8) -- a coordinator PROCEDURE, not sweep code.
 *
 * The chairman-facing count line is composed and returned, never sent from inside this script
 * -- scripts/adam-chairman-sms.mjs is invoked separately, coordinator-triggered only.
 *
 * Usage:
 *   node scripts/coordinator-stale-qf-disposition-sweep.mjs [--dry-run]         # default
 *   node scripts/coordinator-stale-qf-disposition-sweep.mjs --apply --h2-confirmed=2026-08-16
 *   node scripts/coordinator-stale-qf-disposition-sweep.mjs --seat-count 3 --json
 */
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { normalize, severityRank, groupByFingerprint } from '../lib/shared/content-fingerprint.cjs';
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';
// SD-LEO-INFRA-REPO-WIDE-TIMEZONE-001: default-import-then-destructure, mirroring the proven
// ESM-imports-CJS pattern in scripts/modules/sd-next/display/quick-fixes.js (not a direct named
// import) -- the established-safe shape for this specific file.
import pgTimestamp from '../lib/time/pg-timestamp.cjs';
const { pgTimestampMs } = pgTimestamp;
import qfAutoStartCjs from '../lib/fleet/qf-auto-start.cjs';
const { STALE_QF_DAYS } = qfAutoStartCjs;
import { checkQuickFixCitation, OUTCOMES } from '../lib/eva/quick-fix-citation-checker.js';
import { emitFeedback } from '../lib/governance/emit-feedback.js';

export const SWEEP_ACTOR = 'coordinator-stale-qf-disposition-sweep';
export const FINGERPRINT_TYPE = 'quick_fix_stale_disposition_sweep';
export const REVERIFIED_FILE_THRESHOLD = 3; // <=N extracted paths -> re_verified, >N -> promoted
export const REVERIFIED_TTL_DAYS = 30;
export const DEFAULT_SEAT_COUNT = 3; // TR-5 fallback when neither deps.seatCount nor --seat-count nor a live claude_sessions read is available
const PAGE_SIZE = 1000;

// Columns that only exist after the staged migration (FR-1) is applied. Every OTHER column
// referenced below (title, description, severity, escalation_reason, etc.) is pre-existing.
const POST_MIGRATION_COLUMNS = 'disposition, disposition_reason_code, disposed_at, disposed_by, verified_at, duplicate_of_id';
const BASE_CANDIDATE_COLUMNS = 'id, status, title, description, steps_to_reproduce, expected_behavior, actual_behavior, severity, type, created_at, started_at, target_application, claiming_session_id, pr_url, commit_sha, escalation_reason, escalated_to_sd_id';

export function parseArgs(argv) {
  const args = { apply: false, json: false, h2Confirmed: null, seatCount: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--dry-run') args.apply = false;
    else if (a === '--json') args.json = true;
    else if (a.startsWith('--h2-confirmed=')) args.h2Confirmed = a.slice('--h2-confirmed='.length) || null;
    else if (a === '--seat-count') args.seatCount = parseInt(argv[++i], 10) || null;
  }
  return args;
}

function buildSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key);
}

// FR-2: a missing COLUMN (not a missing table) returns 42703 on SELECT or PGRST204 on
// INSERT/UPDATE -- a THIRD, different code neither tableAbsent() nor isSchemaCacheMiss()
// recognizes (both target PGRST205/42P01, missing-TABLE codes; measured live,
// isSchemaCacheMiss() returns false against a real 42703 -- fails OPEN, the wrong direction for
// a write guard). This predicate must not conflate "column absent" with "any error".
export function isColumnAbsentError(error) {
  if (!error) return false;
  if (error.code === '42703' || error.code === 'PGRST204') return true;
  const msg = error.message || '';
  return /column .* does not exist/i.test(msg) || /Could not find the '.*' column/i.test(msg);
}

/**
 * @returns {Promise<boolean>} true if the FR-1 disposition columns exist live. Throws on any
 *   OTHER error (e.g. 42501 permission-denied) -- never silently treated as "absent" or
 *   "present" (FR-2 AC: must not conflate column-absent with any-error).
 */
export async function ensureDispositionColumnsExist(supabase) {
  const { error } = await supabase.from('quick_fixes').select('disposition').limit(1);
  if (!error) return true;
  if (isColumnAbsentError(error)) return false;
  throw error;
}

/**
 * FR-7 TTL clock: the most recent of verified_at, started_at, created_at (what SQL's
 * variadic-max expression would compute), done JS-side instead via pgTimestampMs on each
 * column then Math.max()'d over the FINITE candidates only.
 *
 * CORRECTED vs. the PRD's own stated edge-case reasoning ("Math.max() over null/undefined
 * coerces to 0"): pgTimestampMs() returns NaN (never 0/null) for an absent/unparseable
 * timestamp, and Math.max() with ANY NaN argument returns NaN -- so an unfiltered
 * Math.max(pgTimestampMs(a), pgTimestampMs(b), pgTimestampMs(c)) would silently break to NaN
 * whenever verified_at/started_at are null (the common case), and nowMs - NaN > ttlMs is always
 * false, meaning a stale row would NEVER be detected as TTL-expired -- the opposite of the
 * PRD's intended "maximally stale" outcome. Filtering to Number.isFinite BEFORE Math.max fixes
 * this: the common case (verified_at/started_at null) correctly falls back to created_at's real
 * (finite) age, which is never "artificially fresh" since it is the row's true, unmodified age.
 * The fully-degenerate all-null case (should not occur live -- created_at is NOT NULL) returns
 * -Infinity, which reads as infinitely stale under any TTL comparison.
 */
export function staleClockMs(row, nowMs) {
  const candidates = [row?.verified_at, row?.started_at, row?.created_at]
    .map((v) => (v ? pgTimestampMs(v) : NaN))
    .filter(Number.isFinite);
  if (candidates.length === 0) return -Infinity;
  return Math.max(...candidates);
}

// Static self-check (mirrors s1-backlog-sweep.mjs's assertNoDeleteCalls): this module must never
// compute the TTL clock via a raw SQL variadic-max expression (FR-7's tz-naive/aware mismatch
// guard -- created_at/started_at are naive, verified_at is timestamptz; that SQL expression
// resolves naive operands through the session TimeZone GUC, measured 4h skew). The forbidden
// token is assembled at runtime below so this comment block itself never contains the literal
// pattern the regex scans for -- a prior version of this exact guard tripped over its own
// docstring (STUCK100's regex-self-match class), which is why the token is split here.
const RAW_SQL_MAX_TOKEN = ['GREAT', 'EST'].join('') + '\\s*\\(';
export function assertNoRawGreatest(sourceText) {
  if (new RegExp(RAW_SQL_MAX_TOKEN).test(sourceText)) {
    throw new Error('SAFETY: a raw SQL variadic-max call was found in the sweep source — refusing to run');
  }
}

/** FR-3 dedupe fingerprint body: target file(s) + normalized symptom + expected/actual. */
function dedupeFingerprintBody(qf) {
  return [qf.target_application, qf.title, qf.description, qf.expected_behavior, qf.actual_behavior]
    .filter(Boolean)
    .join('\n');
}

/** FR-4 premise blob: SAME field composition the citation checker itself joins internally. */
function premiseBlob(qf) {
  return [qf.title, qf.description, qf.steps_to_reproduce, qf.expected_behavior, qf.actual_behavior]
    .filter(Boolean)
    .join('\n');
}

function fingerprintExtract(qf) {
  const body = dedupeFingerprintBody(qf);
  // Empty-body guard (FR-3, mandatory): 25/170 live rows normalize to an EMPTY fingerprint
  // input and would otherwise all hash identically for the same `type`, collapsing into one
  // false cluster. Fingerprinting on the row's own unique id instead guarantees a singleton --
  // normalize(id) is non-empty and unique per row, so it can never collide with another
  // empty-body row or with a real content-based cluster.
  const isEmpty = normalize(body) === '';
  return {
    type: FINGERPRINT_TYPE,
    body: isEmpty ? qf.id : body,
    groupKey: qf.id,
    severity: qf.severity,
    timestamp: qf.created_at,
  };
}

/** Highest severity first; ties broken by oldest created_at. Shared by FR-3 (survivor pick) and FR-7 (batching cap ordering) -- both describe the same "priority" concept. */
function priorityCompare(a, b) {
  const sevDiff = severityRank(b.severity) - severityRank(a.severity);
  if (sevDiff !== 0) return sevDiff;
  const aMs = pgTimestampMs(a.created_at);
  const bMs = pgTimestampMs(b.created_at);
  return (Number.isFinite(aMs) ? aMs : Infinity) - (Number.isFinite(bMs) ? bMs : Infinity);
}

/**
 * FR-3, pure: cluster `rows` by content fingerprint and return { survivors, duplicateClosures }.
 * duplicateClosures = [{ loser, survivorId }]. A singleton group's sole row is itself a survivor.
 */
export function selectDuplicateClosures(rows) {
  const groups = groupByFingerprint(rows, fingerprintExtract);
  const survivors = [];
  const duplicateClosures = [];
  for (const group of groups.values()) {
    const sorted = [...group.rows].sort(priorityCompare);
    const survivor = sorted[0];
    survivors.push(survivor);
    for (const loser of sorted.slice(1)) {
      duplicateClosures.push({ loser, survivorId: survivor.id });
    }
  }
  return { survivors, duplicateClosures };
}

/**
 * FR-7 batching cap, pure: given the STILL_PRESENT candidates (each already carrying its
 * citation-check result), return { toDispose, deferred } where toDispose.length <= seatCount,
 * oldest-high-severity-first (priorityCompare). `deferred` rows are left untouched this run.
 */
export function applyBatchingCap(stillPresentCandidates, seatCount) {
  const sorted = [...stillPresentCandidates].sort((a, b) => priorityCompare(a.qf, b.qf));
  const cap = Number.isFinite(seatCount) && seatCount > 0 ? seatCount : 0;
  return { toDispose: sorted.slice(0, cap), deferred: sorted.slice(cap) };
}

export function composeChairmanLine(counts) {
  const { duplicates = 0, unverifiedStale = 0, reVerified = 0, promoted = 0, resolved = 0 } = counts;
  return `${duplicates} duplicates, ${unverifiedStale} unverified-stale, ${reVerified} re-verified, ${promoted} promoted, ${resolved} resolved`;
}

async function defaultSeatCount(supabase, nowMs) {
  try {
    const cutoff = new Date(nowMs - 30 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from('claude_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .gte('heartbeat_at', cutoff);
    if (error || typeof count !== 'number' || !Number.isFinite(count) || count < 1) {
      return DEFAULT_SEAT_COUNT;
    }
    return count;
  } catch {
    return DEFAULT_SEAT_COUNT;
  }
}

async function fetchPastFenceCandidates(supabase, { columnsExist, nowMs }) {
  const columns = columnsExist ? `${BASE_CANDIDATE_COLUMNS}, ${POST_MIGRATION_COLUMNS}` : BASE_CANDIDATE_COLUMNS;
  const applyFilters = (q) => {
    let out = q.eq('status', 'open').is('claiming_session_id', null).is('pr_url', null).is('commit_sha', null);
    if (columnsExist) out = out.is('disposition', null);
    return out;
  };
  const { count: liveCount, error: countError } = await applyFilters(
    supabase.from('quick_fixes').select('id', { count: 'exact', head: true })
  );
  if (countError) throw new Error(`COUNT(*) failed: ${countError.message}`);

  const rows = await fetchAllPaginated(
    () => applyFilters(supabase.from('quick_fixes').select(columns)).order('id', { ascending: true }),
    { pageSize: PAGE_SIZE }
  );
  if (rows.length !== liveCount) {
    throw new Error(`PAGINATION_MISMATCH: enumerated ${rows.length} rows but COUNT(*) reports ${liveCount} — refusing to proceed on a possibly-truncated set`);
  }

  // Client-side age filter (past-fence = age >= STALE_QF_DAYS). Deliberately NOT a server-side
  // WHERE on created_at: keeping ALL date arithmetic in one JS path, driven by injected nowMs,
  // is what makes the whole pipeline deterministic and unit-testable (TR-4).
  const fenceMs = STALE_QF_DAYS * 24 * 3600 * 1000;
  return rows.filter((r) => {
    const createdMs = pgTimestampMs(r.created_at);
    return Number.isFinite(createdMs) && (nowMs - createdMs) >= fenceMs;
  });
}

async function closeDuplicate(supabase, qf, survivorId, nowMs) {
  const { error } = await supabase.from('quick_fixes').update({
    disposition: 'duplicate_of',
    duplicate_of_id: survivorId,
    disposed_at: new Date(nowMs).toISOString(),
    disposed_by: SWEEP_ACTOR,
    status: 'closed',
  }).eq('id', qf.id);
  if (error) throw new Error(`closeDuplicate(${qf.id}): ${error.message}`);
}

async function closePremiseResolved(supabase, qf, reasonCode, nowMs) {
  const { error } = await supabase.from('quick_fixes').update({
    disposition: 'premise_resolved',
    disposition_reason_code: reasonCode,
    disposed_at: new Date(nowMs).toISOString(),
    disposed_by: SWEEP_ACTOR,
    status: 'closed',
  }).eq('id', qf.id);
  if (error) throw new Error(`closePremiseResolved(${qf.id}): ${error.message}`);
}

async function closePremiseUnverifiedStale(supabase, qf, nowMs) {
  const premiseText = premiseBlob(qf) || '(no premise text recorded)';
  await emitFeedback({
    supabase,
    title: `[Unverified premise] ${qf.title || qf.id}`.slice(0, 120),
    description: premiseText,
    category: 'harness_backlog',
    severity: qf.severity || 'medium',
    // status:'resolved' is the ACTUAL exclusion lever -- scripts/feedback-fingerprint-promoter.mjs's
    // own candidate query filters `.or('status.is.null,status.not.in.(resolved,invalid)')` and
    // never inspects metadata for this purpose, so a metadata-only marker would NOT have excluded
    // this row from re-promotion. 'resolved' also fits semantically: this row is a closed,
    // historical trace of a disposition decision, not a fresh open item.
    status: 'resolved',
    dedup_key: `stale-qf-disposition-sweep:${qf.id}`,
    metadata: {
      premise_unverified_stale_source_qf_id: qf.id,
      stale_qf_disposition_sweep: true,
    },
  });
  const { error } = await supabase.from('quick_fixes').update({
    disposition: 'premise_unverified_stale',
    disposed_at: new Date(nowMs).toISOString(),
    disposed_by: SWEEP_ACTOR,
    status: 'closed',
  }).eq('id', qf.id);
  if (error) throw new Error(`closePremiseUnverifiedStale(${qf.id}): ${error.message}`);
}

async function markReVerified(supabase, qf, reasonCode, nowMs) {
  const { error } = await supabase.from('quick_fixes').update({
    disposition: 're_verified',
    disposition_reason_code: reasonCode,
    verified_at: new Date(nowMs).toISOString(),
    disposed_at: new Date(nowMs).toISOString(),
    disposed_by: SWEEP_ACTOR,
    // status intentionally unchanged -- stays 'open'.
  }).eq('id', qf.id);
  if (error) throw new Error(`markReVerified(${qf.id}): ${error.message}`);
}

async function markPromoted(supabase, qf, reasonCode, pathCount, nowMs) {
  const { error } = await supabase.from('quick_fixes').update({
    disposition: 'promoted',
    disposition_reason_code: reasonCode,
    verified_at: new Date(nowMs).toISOString(),
    disposed_at: new Date(nowMs).toISOString(),
    disposed_by: SWEEP_ACTOR,
    status: 'escalated',
    escalation_reason: `Auto-promoted by ${SWEEP_ACTOR}: citation check confirmed the premise is STILL PRESENT with ${pathCount} distinct extracted path(s), exceeding the ${REVERIFIED_FILE_THRESHOLD}-path re_verified threshold. ${reasonCode}.`,
  }).eq('id', qf.id);
  if (error) throw new Error(`markPromoted(${qf.id}): ${error.message}`);
}

async function runTtlRelapsePass(supabase, { nowMs, columnsExist, apply }) {
  if (!columnsExist) return { relapsed: 0 };
  const { data: rows, error } = await supabase
    .from('quick_fixes')
    .select(`${BASE_CANDIDATE_COLUMNS}, ${POST_MIGRATION_COLUMNS}`)
    .eq('disposition', 're_verified');
  if (error) throw new Error(`TTL relapse select failed: ${error.message}`);

  let relapsed = 0;
  const ttlMs = REVERIFIED_TTL_DAYS * 24 * 3600 * 1000;
  for (const row of rows || []) {
    const clock = staleClockMs(row, nowMs);
    if (nowMs - clock > ttlMs) {
      relapsed++;
      if (apply) await closePremiseUnverifiedStale(supabase, row, nowMs);
    }
  }
  return { relapsed };
}

export async function runSweep(argv, deps = {}) {
  const args = parseArgs(argv);
  const supabase = deps.supabase || buildSupabase();
  const nowMs = deps.nowMs ?? Date.now();

  const columnsExist = await ensureDispositionColumnsExist(supabase);
  if (args.apply) {
    if (!columnsExist) {
      throw new Error('DISPOSITION_COLUMNS_NOT_YET_APPLIED: quick_fixes.disposition and related columns do not exist yet — run the staged migration via the chairman-ceremony handshake before --apply. Dry-run remains available.');
    }
    if (!args.h2Confirmed) {
      throw new Error('H2_NOT_CONFIRMED: --apply requires --h2-confirmed=<ISO-date>, attesting the coordinator has completed the one-time two-sided verification pass (FR-8). Refusing to write.');
    }
    // SECURITY sub-agent finding, EXEC-TO-PLAN (LOW severity): a non-empty check alone accepts
    // any string, so a typo'd or placeholder value would still pass the attestation gate. Require
    // a plain YYYY-MM-DD prefix -- still not proof the pass genuinely happened (that's a
    // coordinator procedure, not something code can verify), but it closes the "any string at
    // all" gap cheaply.
    if (!/^\d{4}-\d{2}-\d{2}/.test(args.h2Confirmed)) {
      throw new Error(`H2_NOT_CONFIRMED: --h2-confirmed must start with a plain YYYY-MM-DD date, got: ${args.h2Confirmed}`);
    }
  }

  const seatCount = deps.seatCount ?? args.seatCount ?? (await defaultSeatCount(supabase, nowMs));

  const candidates = await fetchPastFenceCandidates(supabase, { columnsExist, nowMs });

  const counts = { duplicates: 0, unverifiedStale: 0, reVerified: 0, promoted: 0, resolved: 0, deferredOverSeatCount: 0 };

  // FR-3: dedupe strictly before any citation check.
  const { survivors, duplicateClosures } = selectDuplicateClosures(candidates);
  for (const { loser, survivorId } of duplicateClosures) {
    counts.duplicates++;
    if (args.apply) await closeDuplicate(supabase, loser, survivorId, nowMs);
  }

  // FR-4: citation check every survivor.
  const stillPresent = [];
  for (const qf of survivors) {
    const result = checkQuickFixCitation(qf, { repoRoot: deps.repoRoot, runTest: deps.runTest });
    if (result.outcome === OUTCOMES.ABSENT) {
      counts.resolved++;
      if (args.apply) await closePremiseResolved(supabase, qf, result.reasonCode, nowMs);
    } else if (result.outcome === OUTCOMES.STILL_PRESENT) {
      stillPresent.push({ qf, result });
    } else {
      counts.unverifiedStale++;
      if (args.apply) await closePremiseUnverifiedStale(supabase, qf, nowMs);
    }
  }

  // FR-5 + FR-7 batching cap: throttle STILL_PRESENT dispositions to <= seatCount per run.
  const { toDispose, deferred } = applyBatchingCap(stillPresent, seatCount);
  counts.deferredOverSeatCount = deferred.length;
  for (const { qf, result } of toDispose) {
    if (result.extractedPathCount <= REVERIFIED_FILE_THRESHOLD) {
      counts.reVerified++;
      if (args.apply) await markReVerified(supabase, qf, result.reasonCode, nowMs);
    } else {
      counts.promoted++;
      if (args.apply) await markPromoted(supabase, qf, result.reasonCode, result.extractedPathCount, nowMs);
    }
  }

  // FR-7 TTL re-lapse: previously re_verified rows nobody picked up within the TTL window. These
  // are sourced from a SEPARATE query (disposition='re_verified'), not from `candidates` above --
  // folded into the chairman-facing unverifiedStale count (a relapsed row genuinely IS
  // unverified-stale as of this run) but tracked separately in `relapsedCount` so a caller
  // reconciling against candidateCount uses the right population (TESTING sub-agent finding,
  // EXEC-TO-PLAN: the naive sum-of-counts === candidateCount identity silently excludes both
  // deferredOverSeatCount and relapsed rows).
  const { relapsed } = await runTtlRelapsePass(supabase, { nowMs, columnsExist, apply: args.apply });
  counts.unverifiedStale += relapsed;

  const chairmanLine = composeChairmanLine(counts);

  return {
    counts, chairmanLine, columnsExist, seatCount, apply: args.apply,
    candidateCount: candidates.length, relapsedCount: relapsed,
  };
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  runSweep(process.argv)
    .then((result) => {
      if (process.argv.includes('--json')) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log('\n=== STALE QF DISPOSITION SWEEP ===');
        console.log(result.chairmanLine);
        console.log(JSON.stringify(result.counts, null, 2));
        console.log(result.apply ? '\n[APPLIED] writes committed.' : '\n[DRY RUN] no writes performed.');
      }
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error('SWEEP_FATAL:', err.message);
      process.exitCode = 1;
    });
}
