/**
 * Data Loaders for SD-Next
 * Part of SD-LEO-REFACTOR-SD-NEXT-001
 */

import { execSync } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { parseHarnessBacklog } from './harness-backlog-parser.js';
// SD-LEO-INFRA-EXCLUDE-CHAIRMAN-GATED-001: canonical chairman-gated-hold predicate (CJS
// module; ESM default-import interop). Shared with worker-checkin + the coordinator dashboard.
import qfGatedHold from '../../../lib/fleet/qf-gated-hold.cjs';
const { isChairmanGatedQF } = qfGatedHold;
// SD-LEO-FIX-FIXTURE-PREFIX-EXCLUSION-001: canonical fixture-exclusion predicates —
// ZZZ_/UAT/TEST fixture rows must not render as real queue/tree/QF work.
import { isFixtureSdKey, isFixtureQf } from '../../../lib/governance/fixture-exclusion.mjs';

/**
 * Log a query failure with structured context for diagnostics.
 * Writes to stderr to avoid polluting display output.
 *
 * @param {string} source - Function/query name that failed
 * @param {Object} error - Supabase error object
 * @param {Object} [context] - Additional context (table, filters)
 */
function logQueryFailure(source, error, context = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    source,
    error: error?.message || String(error),
    code: error?.code || null,
    ...context
  };
  process.stderr.write(`[sd-next:query-failure] ${JSON.stringify(entry)}\n`);
}

/**
 * Load active baseline and its items
 *
 * @param {Object} supabase - Supabase client
 * @returns {Promise<{baseline: Object|null, items: Array, actuals: Object}>}
 */
export async function loadActiveBaseline(supabase) {
  const { data: baseline, error } = await supabase
    .from('sd_execution_baselines')
    .select('*')
    .eq('is_active', true)
    .single();

  if (error || !baseline) {
    return { baseline: null, items: [], actuals: {} };
  }

  // Load baseline items
  const { data: items } = await supabase
    .from('sd_baseline_items')
    .select('*')
    .eq('baseline_id', baseline.id)
    .order('sequence_rank');

  // Load actuals
  const { data: actuals } = await supabase
    .from('sd_execution_actuals')
    .select('*')
    .eq('baseline_id', baseline.id);

  const actualsMap = {};
  if (actuals) {
    actuals.forEach(a => actualsMap[a.sd_id] = a);
  }

  return {
    baseline,
    items: items || [],
    actuals: actualsMap
  };
}

/**
 * Load recent git activity for SD references
 *
 * @param {Object} supabase - Supabase client
 * @param {string} cwd - Current working directory
 * @returns {Promise<Array>} Array of {sd_id, commits, updated_at}
 */
export async function loadRecentActivity(supabase, cwd) {
  const recentActivity = [];

  // Method 1: Check git commits for SD references (last 7 days)
  try {
    const gitLog = execSync(
      'git log --oneline --since="7 days ago" --format="%s"',
      { encoding: 'utf8', cwd, stdio: ['pipe', 'pipe', 'ignore'] }
    );

    const sdPattern = /SD-[A-Z0-9-]+/g;
    const matches = gitLog.match(sdPattern) || [];
    const sdCounts = {};

    matches.forEach(sd => {
      sdCounts[sd] = (sdCounts[sd] || 0) + 1;
    });

    // Sort by frequency
    Object.entries(sdCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([sd, count]) => {
        recentActivity.push({ sd_id: sd, commits: count });
      });

  } catch {
    // Git not available or error - continue with database fallback
  }

  // Method 2: Check updated_at on SDs (fallback/supplement)
  const { data: recentSDs } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, updated_at')
    .eq('is_active', true)
    .in('status', ['draft', 'active', 'in_progress'])
    .order('updated_at', { ascending: false })
    .limit(5);

  if (recentSDs) {
    recentSDs.forEach(sd => {
      if (!recentActivity.find(a => a.sd_id === sd.sd_key)) {
        recentActivity.push({
          sd_id: sd.sd_key,
          commits: 0,
          updated_at: sd.updated_at
        });
      }
    });
  }

  return recentActivity;
}

/**
 * Load blocking conflicts
 *
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Array>} Array of conflict objects
 */
export async function loadConflicts(supabase) {
  const { data: conflicts } = await supabase
    .from('sd_conflict_matrix')
    .select('*')
    .is('resolved_at', null)
    .eq('conflict_severity', 'blocking');

  return conflicts || [];
}

/**
 * Load pending SD proposals (LEO Protocol v4.4)
 *
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Array>} Array of proposal objects
 */
export async function loadPendingProposals(supabase) {
  try {
    const { data: proposals, error } = await supabase
      .from('sd_proposals')
      .select('*')
      .eq('status', 'pending')
      .order('urgency_level', { ascending: true }) // critical first
      .order('confidence_score', { ascending: false })
      .limit(5);

    if (error) {
      // Table may not exist yet - non-fatal
      return [];
    }

    return proposals || [];
  } catch {
    // Non-fatal - proposals are optional
    return [];
  }
}

/**
 * Load SD hierarchy for parent-child tree display
 *
 * @param {Object} supabase - Supabase client
 * @returns {Promise<{allSDs: Map, sdHierarchy: Map}>}
 */
export async function loadSDHierarchy(supabase) {
  const allSDs = new Map();
  const sdHierarchy = new Map();

  try {
    const { data: sds } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, parent_sd_id, status, current_phase, progress_percentage, dependencies, is_working_on, metadata, priority, target_application, governance_metadata')
      .eq('is_active', true)
      .order('created_at')
      .limit(1000);

    if (!sds) return { allSDs, sdHierarchy };

    // SD-LEO-FIX-FIXTURE-PREFIX-EXCLUSION-001: unambiguously-keyed fixture SDs (ZZZ_ /
    // dunder prefixes, named e2e families, epoch-stamped generator keys like
    // TEST-F3-RACE-1784287684096-bl1) leaked into the queue tree as real work. Filter at
    // the single load point for the hierarchy instead of per display site. PRECISION-FIRST
    // (adversarial-review, PR #6186): prefix-only keys like SD-TEST-MRO18ZP0 are NOT
    // excluded — they are indistinguishable from the real SD-TEST-MANAGEMENT/TEST-MGMT
    // family, and excluding a real SD silently drops it from every allSDs consumer, which
    // is far worse than a fixture slightly padding the tree.
    const realSds = sds.filter((sd) => !isFixtureSdKey(sd.sd_key, sd.metadata));

    // Build lookup map and hierarchy
    for (const sd of realSds) {
      const sdId = sd.sd_key || sd.id;
      allSDs.set(sdId, sd);
      allSDs.set(sd.id, sd); // Also map by UUID

      if (sd.parent_sd_id) {
        if (!sdHierarchy.has(sd.parent_sd_id)) {
          sdHierarchy.set(sd.parent_sd_id, []);
        }
        sdHierarchy.get(sd.parent_sd_id).push(sd);
      }
    }
  } catch {
    // Non-fatal - continue without hierarchy
  }

  return { allSDs, sdHierarchy };
}

/**
 * Load OKR scorecard and vision
 *
 * @param {Object} supabase - Supabase client
 * @returns {Promise<{vision: Object|null, scorecard: Array}>}
 */
export async function loadOKRScorecard(supabase) {
  try {
    // Load active vision — canonical chairman-approved eva_vision_documents L1
    // (SD-LEO-ORCH-ADAM-PLAN-KEEPER-001-E: repointed off dormant strategic_vision).
    // Stable-key resolve; map vision_key -> code and the one-line takeaway section
    // -> statement (display.js renders vision.code + vision.statement.substring).
    const { data: visionDoc } = await supabase
      .from('eva_vision_documents')
      .select('id, vision_key, status, statement:sections->>part_xii_the_final_oneline_takeaway')
      .eq('vision_key', 'VISION-EHG-L1-001')
      .eq('status', 'active')
      .eq('chairman_approved', true)
      .single();
    const vision = visionDoc
      ? {
          id: visionDoc.id,
          status: visionDoc.status,
          code: visionDoc.vision_key,
          // Strip the markdown blockquote/bold wrapper + trailing rule.
          statement: String(visionDoc.statement || '')
            .replace(/\*\*/g, '')
            .replace(/^[>\s]+/, '')
            .replace(/\n+\s*---\s*$/, '')
            .trim()
        }
      : null;

    // Load OKR scorecard
    const { data: scorecard, error } = await supabase
      .from('v_okr_scorecard')
      .select('*')
      .order('sequence');

    if (error) {
      // View may not exist yet - non-fatal
      return { vision, scorecard: [] };
    }

    const okrScorecard = scorecard || [];

    // Load key results with details for each objective
    for (const obj of okrScorecard) {
      const { data: krs } = await supabase
        .from('key_results')
        .select('code, title, current_value, target_value, unit, status, baseline_value, direction')
        .eq('objective_id', obj.objective_id)
        .eq('is_active', true)
        .order('sequence');

      obj.key_results = krs || [];
    }

    return { vision, scorecard: okrScorecard };
  } catch {
    // Non-fatal - OKRs are optional
    return { vision: null, scorecard: [] };
  }
}

/**
 * Load vision scores from eva_vision_scores, aggregated per SD.
 * Computes average of last 3 runs per SD and 30-day trend direction.
 * Returns empty Map on any error (graceful degradation).
 *
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Map<string, {avg: number, trend: string, count: number}>>}
 */
export async function loadVisionScores(supabase) {
  const result = new Map();
  try {
    const { data, error } = await supabase
      .from('eva_vision_scores')
      .select('sd_id, total_score, scored_at')
      .order('scored_at', { ascending: false })
      .limit(5000);

    if (error) {
      logQueryFailure('loadVisionScores', error, { table: 'eva_vision_scores' });
      return result;
    }
    if (!data || data.length === 0) return result;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Group rows by sd_id (already sorted descending by scored_at)
    const bySD = new Map();
    for (const row of data) {
      if (!row.sd_id) continue;
      if (!bySD.has(row.sd_id)) bySD.set(row.sd_id, []);
      bySD.get(row.sd_id).push(row);
    }

    // Compute avg of last 3 runs and 30-day trend per SD
    for (const [sdId, rows] of bySD) {
      const recent = rows.slice(0, 3);
      const avg = Math.round(
        recent.reduce((sum, r) => sum + r.total_score, 0) / recent.length
      );

      // Trend: compare current avg vs avg of scores older than 30 days
      const baseline = rows.filter(r => new Date(r.scored_at) < thirtyDaysAgo);
      let trend = '→';
      if (baseline.length > 0) {
        const baselineAvg = baseline.reduce((sum, r) => sum + r.total_score, 0) / baseline.length;
        if (avg - baselineAvg >= 5) trend = '▲';
        else if (baselineAvg - avg >= 5) trend = '▼';
      }

      result.set(sdId, { avg, trend, count: recent.length });
    }
  } catch {
    // Non-fatal — vision scores are optional display data
  }
  return result;
}

/**
 * Load open quick fixes for display in the SD queue.
 *
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Array>} Array of quick fix objects
 */
export async function loadOpenQuickFixes(supabase) {
  try {
    // Race-safety: exclude rows where pr_url or commit_sha are populated. A parallel session
    // populates those fields the moment complete-quick-fix.js begins, ~30-90s before status flips
    // to 'completed'. Filtering on status alone surfaces phantom QFs during the merge window.
    // factory_lane is a staged, not-yet-applied column
    // (database/migrations/20260713_quick_fixes_factory_lane.sql) -- see
    // scripts/worker-checkin.cjs selfClaimQuickFix() for the identical fail-soft
    // rationale. SD-FDBK-FIX-DISPATCH-ELIGIBILITY-HONOR-001: without this, the
    // sd:next recommendation path (classifyQuickFixes -> topStartableQF) can't see
    // factory_lane and would still emit AUTO_PROCEED_ACTION:qf_start for a
    // coordinator-dispatch-only QF -- the same bug class this SD fixes, via the
    // recommendation path instead of the automated self-claim loop (adversarial
    // review finding, /ship deep-tier pass). The pragma below MUST stay on the
    // same physical line as .select( -- schema-reference-extract.mjs's pragmaAt()
    // only checks the line containing the .select( match itself (RCA'd during
    // this SD's own round-2 adversarial review after the pragma-on-its-own-line
    // form above silently failed to suppress the lint).
    const { data, error } = await supabase
      .from('quick_fixes')
      .select('id, title, type, severity, status, estimated_loc, description, created_at, target_application, claiming_session_id, pr_url, commit_sha, not_before, factory_lane, owner, release_condition') // schema-lint-disable-line: factory_lane staged, see comment above
      .in('status', ['open', 'in_progress'])
      .is('pr_url', null)
      .is('commit_sha', null)
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) {
      logQueryFailure('loadOpenQuickFixes', error, { table: 'quick_fixes' });
      return [];
    }

    // SD-LEO-INFRA-EXCLUDE-CHAIRMAN-GATED-001: chairman-gated holds (owner='chairman' +
    // release_condition — the QF-508/QF-970 class) are false open work for the worker-facing
    // lane: every idle worker re-discovers them and re-concludes "blocked on chairman".
    // Excluded here (Track C display + AUTO_PROCEED_ACTION source); they remain visible on
    // the coordinator surface (fleet-dashboard CHAIRMAN-GATED section) until released via
    // scripts/release-chairman-gated-qf.js. Shared predicate — never re-derive inline.
    // SD-LEO-FIX-FIXTURE-PREFIX-EXCLUSION-001: fixture-titled QFs excluded alongside
    // chairman-gated holds — neither is real open work for the Track C lane.
    return (data || []).filter((qf) => !isChairmanGatedQF(qf) && !isFixtureQf(qf));
  } catch {
    return [];
  }
}

// In-memory PR-state cache for fleet-mode deduplication within a single process run.
// Keyed by pr_url → { state, statusCheckRollup, fetchedAt }. 60s TTL.
// SD-LEO-INFRA-LIFECYCLE-RECONCILIATION-ORPHAN-001 (FR2)
const PR_STATE_CACHE = new Map();
const PR_STATE_TTL_MS = 60_000;

function getCachedPrState(prUrl) {
  const entry = PR_STATE_CACHE.get(prUrl);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > PR_STATE_TTL_MS) {
    PR_STATE_CACHE.delete(prUrl);
    return null;
  }
  return entry;
}

function setCachedPrState(prUrl, state) {
  PR_STATE_CACHE.set(prUrl, { ...state, fetchedAt: Date.now() });
}

/**
 * @internal — exported for unit test visibility only.
 */
export function __resetPrStateCacheForTests() {
  PR_STATE_CACHE.clear();
}

function parsePrNumberFromUrl(prUrl) {
  if (!prUrl || typeof prUrl !== 'string') return null;
  const match = prUrl.match(/\/pull\/(\d+)(?:\D|$)/);
  return match ? Number(match[1]) : null;
}

function fetchPrStateViaGh(prNumber, execSyncImpl) {
  try {
    const raw = execSyncImpl(`gh pr view ${prNumber} --json state,statusCheckRollup,mergeCommit`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10_000,
    });
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function allChecksGreen(statusCheckRollup) {
  if (!Array.isArray(statusCheckRollup) || statusCheckRollup.length === 0) return false;
  return statusCheckRollup.every((c) => c.conclusion === 'SUCCESS');
}

/**
 * Load QFs whose PRs are OPEN and CI-green — candidates to emit
 * AUTO_PROCEED_ACTION:qf_merge instead of qf_start.
 *
 * SD-LEO-INFRA-LIFECYCLE-RECONCILIATION-ORPHAN-001 (FR2)
 *
 * Complement to loadOpenQuickFixes: that function hides any row with a
 * populated pr_url (QF-20260423-380's pre-merge-race filter). This function
 * reads the same pool but returns ONLY rows with populated pr_url where the
 * PR is OPEN and all CI checks succeeded.
 *
 * Rows whose PRs are MERGED are omitted — the orphan-qf-reaper script
 * (scripts/orphan-qf-reaper.mjs, FR1) flips their status=completed within
 * its safety window; they drop out naturally on the next sd:next run.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} [deps] - Injected dependencies for testability
 * @param {Function} [deps.execSync] - Defaults to child_process.execSync
 * @returns {Promise<Array>} QF rows with ready_to_merge=true and pr_number resolved
 */
export async function loadReadyToMergeQuickFixes(supabase, deps = {}) {
  try {
    const { data, error } = await supabase
      .from('quick_fixes')
      .select('id, title, type, severity, status, estimated_loc, description, created_at, target_application, claiming_session_id, pr_url, commit_sha')
      .in('status', ['open', 'in_progress'])
      .not('pr_url', 'is', null)
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) {
      logQueryFailure('loadReadyToMergeQuickFixes', error, { table: 'quick_fixes' });
      return [];
    }

    if (!data || data.length === 0) return [];

    let execSyncImpl = deps.execSync;
    if (!execSyncImpl) {
      const mod = await import('node:child_process');
      execSyncImpl = mod.execSync;
    }

    const ready = [];
    for (const qf of data) {
      const prNumber = parsePrNumberFromUrl(qf.pr_url);
      if (!prNumber) continue;

      let prState = getCachedPrState(qf.pr_url);
      if (!prState) {
        const fetched = fetchPrStateViaGh(prNumber, execSyncImpl);
        if (!fetched) continue;
        prState = { state: fetched.state, statusCheckRollup: fetched.statusCheckRollup };
        setCachedPrState(qf.pr_url, prState);
      }

      if (prState.state !== 'OPEN') continue;
      if (!allChecksGreen(prState.statusCheckRollup)) continue;

      ready.push({ ...qf, ready_to_merge: true, pr_number: prNumber });
    }

    return ready;
  } catch {
    return [];
  }
}

/**
 * Re-triage open quick fixes to detect tier drift (e.g., QFs that should be escalated to SDs).
 * Uses the existing runTriageGate() with a non-interactive source so no gate prompt is shown.
 *
 * @param {Array} quickFixes - Array of quick fix objects from loadOpenQuickFixes
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Map<string, import('../triage-gate.js').TriageResult>>}
 */
export async function triageQuickFixes(quickFixes, supabase) {
  const results = new Map();
  if (!quickFixes || quickFixes.length === 0) return results;

  let runTriageGate;
  try {
    const mod = await import('../triage-gate.js');
    runTriageGate = mod.runTriageGate;
  } catch {
    return results;
  }

  for (const qf of quickFixes) {
    try {
      const triageResult = await runTriageGate({
        title: qf.title || '',
        description: qf.description || '',
        type: qf.type || 'bug',
        source: 'sd-next-display',
      }, supabase);
      results.set(qf.id, triageResult);
    } catch {
      // Individual triage failure — skip, will fall back to stored tier
    }
  }

  return results;
}

/**
 * Load unscheduled roadmap items (architecture phases without a scheduled SD).
 * Queries v_plan_of_record_remainder where source_type='architecture_phase' and
 * remainder_state is an open state (promotable_now, gated_on_chairman, or
 * in_flight_or_sequence_blocked).
 *
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Array>} Array of unscheduled roadmap item objects
 */
export async function loadUnscheduledRoadmapItems(supabase) {
  try {
    // SD-LEO-INFRA-PLAN-OF-RECORD-REMAINDER-VIEW-001: repointed from an unscoped
    // roadmap_wave_items read to v_plan_of_record_remainder (approved-wave-only,
    // stamped remainder_state). Filtering on remainder_state IN (promotable_now,
    // gated_on_chairman, in_flight_or_sequence_blocked) instead of the old
    // promoted_to_sd_key IS NULL check is also a correctness fix: an explicitly
    // dropped/declined item can have promoted_to_sd_key IS NULL too, but is
    // void (not actually "unscheduled" work needing attention) -- the old filter
    // wrongly surfaced those.
    const { data, error } = await supabase
      .from('v_plan_of_record_remainder')
      .select('id, title, source_type, source_id, promoted_to_sd_key, metadata, created_at')
      .eq('source_type', 'architecture_phase')
      .in('remainder_state', ['promotable_now', 'gated_on_chairman', 'in_flight_or_sequence_blocked'])
      .order('created_at', { ascending: true })
      .limit(20);

    if (error) {
      logQueryFailure('loadUnscheduledRoadmapItems', error, { table: 'v_plan_of_record_remainder' });
      return [];
    }

    return data || [];
  } catch {
    // Non-fatal — roadmap awareness is optional
    return [];
  }
}

/**
 * Count how many baseline items have non-completed SDs
 *
 * @param {Object} supabase - Supabase client
 * @param {Array} baselineItems - Baseline items to check
 * @returns {Promise<number>} Count of actionable items
 */
export async function countActionableBaselineItems(supabase, baselineItems) {
  if (!baselineItems || !baselineItems.length) return 0;

  const sdIds = baselineItems.map(item => item.sd_id);

  // Batch query: fetch all baseline SDs in one call
  const { data: sds } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, id, status, is_active')
    .or(`sd_key.in.(${sdIds.join(',')}),id.in.(${sdIds.join(',')})`)
    .limit(sdIds.length * 2);

  if (!sds) return 0;

  // Build lookup by both sd_key and id
  const sdMap = new Map();
  for (const sd of sds) {
    sdMap.set(sd.sd_key, sd);
    sdMap.set(sd.id, sd);
  }

  let actionableCount = 0;
  for (const sdId of sdIds) {
    const sd = sdMap.get(sdId);
    if (sd && sd.is_active && sd.status !== 'completed' && sd.status !== 'cancelled') {
      actionableCount++;
    }
  }
  return actionableCount;
}

/**
 * Load actionable feedback items for display in sd:next.
 * Queries feedback table for untriaged (new) items, ordered by severity then age.
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object[]} Feedback items with id, title, status, priority, severity, category, created_at
 */
export async function loadFeedbackItems(supabase) {
  try {
    const { data, error } = await supabase
      .from('feedback')
      .select('id, title, status, priority, severity, category, created_at')
      .eq('status', 'new')
      .order('severity', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(10);

    if (error) {
      logQueryFailure('loadFeedbackItems', error, { table: 'feedback' });
      return [];
    }
    return data || [];
  } catch (err) {
    // Table may not exist in all environments
    return [];
  }
}

/**
 * Harness-backlog loader cache (SD-LEO-INFRA-SURFACE-HARNESS-BACKLOG-001).
 * Keyed by absolute filePath; entry shape:
 *   { mtimeMs: number, expiresAt: number, result: HarnessBacklogParseResult }
 * 60s TTL upper bound; mtime-mismatch invalidates earlier.
 *
 * Cache applies ONLY to the legacy markdown fallback path. The DB-canonical
 * path issues one query per sd:next invocation (low frequency, no cache needed).
 */
const HARNESS_BACKLOG_TTL_MS = 60_000;
const _harnessBacklogCache = new Map();

/**
 * Load harness backlog for the sd:next HARNESS BACKLOG section.
 *
 * QF-20260509-818: DB-canonical reader. Migration commit c11354c0 (2026-04-29)
 * moved the harness backlog from `docs/harness-backlog.md` to the `feedback`
 * table (category='harness_backlog'). The writer (`scripts/log-harness-bug.js`)
 * and the `assist-engine.js` consumer were updated; this reader was not until
 * QF-20260509-818 closed the 14th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001.
 *
 * Default behavior: query the feedback table.
 * Fallback: when `LEGACY_HARNESS_BACKLOG_FALLBACK=1` is set in the env OR no
 * supabase client is supplied, parse the legacy markdown file. The fallback
 * exists for emergency rollback and out-of-band tooling that has no DB access.
 *
 * @param {Object|null} [supabase]  Supabase client (preferred; enables DB path)
 * @param {Object} [opts]
 * @param {string} [opts.filePath]  Override markdown path (legacy/fallback only)
 * @returns {Promise<{ count:number, oldestAgeDays:number, items:Array, fileMissing:boolean, error:string|null }>}
 */
export async function loadHarnessBacklog(supabase, opts = {}) {
  const useFallback = process.env.LEGACY_HARNESS_BACKLOG_FALLBACK === '1' || !supabase;
  if (useFallback) {
    return _loadHarnessBacklogFromMarkdown(opts.filePath);
  }
  return _loadHarnessBacklogFromDB(supabase);
}

/**
 * QF-20260509-818: DB-canonical loader. Queries the `feedback` table for
 * `category='harness_backlog' AND status='new'`, mapping each row into the
 * shape consumed by `displayHarnessBacklog`.
 *
 * Mapping: `created_at.slice(0,10)` → date, `title` → symptom,
 *          `metadata.source_location ?? null` → source.
 * @private
 */
async function _loadHarnessBacklogFromDB(supabase) {
  try {
    const { data, error } = await supabase
      .from('feedback')
      .select('id, title, created_at, metadata')
      .eq('category', 'harness_backlog')
      .eq('status', 'new')
      .order('created_at', { ascending: true });
    if (error) {
      logQueryFailure('loadHarnessBacklog.db', error, { table: 'feedback' });
      return { count: 0, oldestAgeDays: 0, items: [], fileMissing: false, error: error.message };
    }
    const nowMs = Date.now();
    const items = (data || []).map((row) => {
      const date = (row.created_at || '').slice(0, 10);
      const itemMs = Date.parse(`${date}T00:00:00Z`);
      const ageDays = Number.isFinite(itemMs)
        ? Math.max(0, Math.floor((nowMs - itemMs) / 86400000))
        : 0;
      return {
        date,
        symptom: row.title || '',
        source: row.metadata?.source_location ?? null,
        ageDays,
      };
    });
    const oldestAgeDays = items.reduce((max, item) => Math.max(max, item.ageDays), 0);
    return { count: items.length, oldestAgeDays, items, fileMissing: false, error: null };
  } catch (err) {
    return {
      count: 0,
      oldestAgeDays: 0,
      items: [],
      fileMissing: false,
      error: err?.message || String(err),
    };
  }
}

/**
 * Legacy markdown loader (pre-QF-20260509-818). Read-only filesystem access
 * with mtime-keyed in-memory cache. Retained behind LEGACY_HARNESS_BACKLOG_FALLBACK=1
 * for emergency rollback. Exported so existing tests can target it directly.
 *
 * @param {string} [filePath]  Absolute path to harness-backlog.md.
 *                             Defaults to <cwd>/docs/harness-backlog.md.
 */
export async function _loadHarnessBacklogFromMarkdown(filePath) {
  const resolvedPath = filePath
    ?? process.env.HARNESS_BACKLOG_PATH
    ?? path.resolve(process.cwd(), 'docs', 'harness-backlog.md');

  try {
    const stat = await fs.stat(resolvedPath).catch(() => null);
    if (!stat) {
      return { count: 0, oldestAgeDays: 0, items: [], fileMissing: true, error: null };
    }
    const cached = _harnessBacklogCache.get(resolvedPath);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.expiresAt > Date.now()) {
      return cached.result;
    }
    const content = await fs.readFile(resolvedPath, 'utf8');
    const parsed = parseHarnessBacklog(content);
    const result = { ...parsed, fileMissing: false, error: null };
    _harnessBacklogCache.set(resolvedPath, {
      mtimeMs: stat.mtimeMs,
      expiresAt: Date.now() + HARNESS_BACKLOG_TTL_MS,
      result,
    });
    return result;
  } catch (err) {
    return {
      count: 0,
      oldestAgeDays: 0,
      items: [],
      fileMissing: false,
      error: err?.message || String(err),
    };
  }
}

/** Test-only: clear the legacy markdown loader cache. */
export function _clearHarnessBacklogCache() {
  _harnessBacklogCache.clear();
}
