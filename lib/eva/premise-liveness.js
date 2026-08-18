/**
 * Premise-liveness checker (SD-LEO-INFRA-PREMISE-LIVENESS-GATE-SOURCING-001)
 *
 * Deterministic (NO LLM/embedding) re-verification of a diagnostic / retro-mined
 * SD premise BEFORE the SD is materialized. EVA retro-mining counts recurrence
 * over a FIXED 30-day lookback from NOW; when a fix ships mid-window the count
 * stays inflated and a diagnostic SD materializes for a premise that is already
 * dead. This checker re-runs two cheap signals at SOURCE time:
 *
 *   (a) RECENT-WINDOW RECOUNT — how many rejections cite the gate/cluster in the
 *       last ~7d (vs the 30d that generated the finding).
 *   (b) ALREADY-SHIPPED-FIX — a completed SD (completion_date within ~14d) or a
 *       git commit touching the gate file/keyword, reusing the proven
 *       kr-reality-checker pattern (completed-SD ilike + git log --since).
 *
 * Verdict matrix (fail-OPEN — only a PROVABLY dead premise is ever STALE):
 *   - STALE  → recent recount ~0 AND a shipped fix found     → recommendation ARCHIVE
 *   - LIVE   → recent recount >= threshold                   → recommendation PROCEED
 *   - LIVE   → ambiguous (no gate/cluster identifier)        → PROCEED + warn (NEVER STALE)
 *   - LIVE   → in-between / uncertain / any error            → HOLD_FOR_REVIEW (still creates)
 *
 * All deps are injectable (supabase, git runner) so the function is unit-testable
 * without DB or git access.
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/** lib/eva/ -> project root is two levels up. */
const PROJECT_ROOT = path.resolve(__dirname, '../../');

export const RECENT_DAYS_DEFAULT = 7;
export const COMPLETED_DAYS_DEFAULT = 14;
/** recent rejections >= this in the recent window ⇒ clearly LIVE. */
export const LIVE_RECENT_THRESHOLD = 3;

/** Default git runner: returns trimmed stdout, '' on any failure (best-effort). */
function defaultGit(argsString) {
  try {
    return execSync(`git ${argsString}`, { encoding: 'utf-8', timeout: 8000 }).trim();
  } catch {
    return '';
  }
}

/** ISO timestamp `days` before `now` (now injectable for tests). */
function cutoffISO(days, nowMs) {
  const base = typeof nowMs === 'number' ? nowMs : Date.parse('2026-06-23T00:00:00Z');
  return new Date(base - days * 24 * 60 * 60 * 1000).toISOString();
}

/** The token a premise is keyed on — gate name preferred, else cluster reason. */
function premiseToken(descriptor) {
  return (descriptor.gate_name || descriptor.cluster_reason || '').trim();
}

/**
 * SD-FDBK-ENH-AUTO-APPLY-MIGRATION-001 FR-5. A referenced file is a database migration
 * when it lives under one of the three dirs the auto-apply/drift-guard pipeline scans
 * (scripts/modules/handoff/pre-checks/pending-migrations-check.js: migrationDirs).
 */
export function isMigrationPath(file) {
  return /^(database\/migrations|database\/manual-updates|supabase\/migrations)\//.test(String(file || ''));
}

/**
 * Default live-state prober: lazily imports probeDeclaredObjectsExist from
 * pending-migrations-check.js (a pg-backed check) so premise-liveness.js itself stays
 * DB-connection-free until a migration-path file is actually being corroborated.
 * Injectable via deps.probeLiveState for tests (never touches pg in unit tests).
 */
async function defaultProbeLiveState(relFile) {
  const { probeDeclaredObjectsExist } = await import(
    '../../scripts/modules/handoff/pre-checks/pending-migrations-check.js'
  );
  const abs = path.isAbsolute(relFile) ? relFile : path.join(PROJECT_ROOT, relFile);
  return probeDeclaredObjectsExist(abs);
}

/**
 * SD-LEO-INFRA-SIGNAL-PROMOTION-RESOLUTION-CHECK-001 (FR-2): make a token safe to interpolate
 * into a PostgREST `.or()` filter.
 *
 * PostgREST parses `.or(a.ilike.%x%,b.ilike.%x%)` as a comma-separated logic tree, so a token
 * containing a comma or an unbalanced parenthesis silently produces "failed to parse logic tree"
 * rather than a match. Tokens here are worker prose (feedback.title.slice(0,80), measured avg 117
 * chars before truncation), so those characters are common, not exotic — this broke the lookup on
 * a measured 785/973 (81%) of the live 14-day pool.
 *
 * Strips the logic-tree metacharacters and collapses whitespace. This trades a little recall (the
 * remaining fragment is matched with ilike wildcards either side) for a query that actually runs;
 * precision is recovered separately by the structured identifiers in FR-2's second half.
 * Returns '' when nothing usable survives, which callers treat as "no token".
 */
export function sanitizeOrToken(token) {
  return String(token || '')
    .replace(/[(),"\\*]/g, ' ')   // logic-tree metacharacters + ilike wildcard
    .replace(/\s+/g, ' ')
    .trim();
}

/** Defensively extract a reason string from a heterogeneous handoff row. */
function handoffReasonText(row) {
  const parts = [
    row?.rejection_reason,
    row?.validation_details?.reason,
    typeof row?.validation_details === 'string' ? row.validation_details : null,
  ].filter(Boolean);
  return parts.join(' ');
}

/**
 * (a) Count rejections in the recent window whose reason cites the token.
 * Returns { count, error } — error is non-fatal (treated as ambiguous upstream).
 */
async function recentRecount(supabase, token, recentDays, nowMs) {
  if (!supabase || !token) return { count: null };
  try {
    // FR-6 batch 7 (SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001): prior .limit(2000)
    // exceeded the PostgREST 1000-row cap and was silently clamped — the recount could
    // undercount a busy window. Paginate to the declared 2000-row sampling cap; page
    // errors throw into the existing catch, preserving the { count: null } policy.
    const data = await fetchAllPaginated(() => supabase
      .from('sd_phase_handoffs')
      .select('id, rejection_reason, validation_details, created_at')
      .eq('status', 'rejected')
      .gte('created_at', cutoffISO(recentDays, nowMs))
      .order('id', { ascending: true }), { maxRows: 2000 });
    const needle = token.toLowerCase();
    const count = (data || []).filter(r => handoffReasonText(r).toLowerCase().includes(needle)).length;
    return { count };
  } catch (e) {
    return { count: null, error: e?.message || String(e) };
  }
}

/**
 * (b) Search for an already-shipped fix: a recently-completed SD referencing the
 * token, OR a git commit (--grep token, or -- referenced_file) within the window.
 * Returns { found, evidence[] }. file-path match = highest confidence.
 */
async function findShippedFix(supabase, git, descriptor, completedDays, nowMs, probeLiveState = defaultProbeLiveState) {
  const token = premiseToken(descriptor);
  const evidence = [];
  let found = false;
  let fileMatch = false;
  // FR-1: true when a resolution signal could not be evaluated at all (query error), as opposed
  // to being evaluated and coming back empty. An indeterminate lookup must never help support an
  // ARCHIVE recommendation — see the STALE branch in checkPremiseLiveness.
  let lookupIndeterminate = false;

  // Completed SD referencing the token (reuses the kr-reality-checker ilike pattern)
  //
  // SD-LEO-INFRA-SIGNAL-PROMOTION-RESOLUTION-CHECK-001 (FR-1): this block used to destructure
  // ONLY { data }, discarding { error }. PostgREST rejects the .or() logic tree whenever the
  // interpolated token carries a comma or parenthesis, and the token is routinely raw worker
  // prose. The discarded error meant no throw, so the catch below never ran, no evidence line
  // was emitted, and `found` stayed false — INDISTINGUISHABLE from a clean "no completed SD
  // references this". The check FAILED GREEN on a measured 785/973 (81%) of the live 14-day
  // harness_backlog pool while every verdict still read as considered.
  const safeToken = sanitizeOrToken(token);
  if (supabase && safeToken) {
    try {
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .select('sd_key, title, completion_date')
        .eq('status', 'completed')
        .gte('completion_date', cutoffISO(completedDays, nowMs))
        .or(`title.ilike.%${safeToken}%,description.ilike.%${safeToken}%`)
        .limit(5);
      if (error) {
        // Indeterminate, NOT "nothing found". Surfaced so an operator can tell the two apart.
        lookupIndeterminate = true;
        evidence.push(`Completed-SD check failed: ${error.message || error}`);
      } else if (data && data.length > 0) {
        found = true;
        evidence.push(`Completed SD(s) within ${completedDays}d reference "${token}": ${data.map(s => s.sd_key).join(', ')}`);
      }
    } catch (e) {
      lookupIndeterminate = true;
      evidence.push(`Completed-SD check skipped: ${e?.message || e}`);
    }
  }

  // SD-LEO-INFRA-SIGNAL-PROMOTION-RESOLUTION-CHECK-001 (FR-2, second half): EXACT lookup on any
  // SD keys the signal names inline. The ilike-on-prose path above is inherently low-precision —
  // this one is not, because an sd_key is an exact string. Runs in ADDITION to it, never instead:
  // a signal naming no SD is unaffected, and a match here is the strongest "already handled"
  // evidence available without any schema change.
  const sdIdentifiers = (descriptor.identifiers || []).filter(id => /^SD-/.test(id));
  if (supabase && sdIdentifiers.length) {
    try {
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .select('sd_key, title, status, completion_date')
        .in('sd_key', sdIdentifiers)
        .eq('status', 'completed')
        .limit(5);
      if (error) {
        lookupIndeterminate = true;
        evidence.push(`Named-SD check failed: ${error.message || error}`);
      } else if (data && data.length > 0) {
        found = true;
        evidence.push(`Signal names already-completed SD(s): ${data.map(s => s.sd_key).join(', ')}`);
      }
    } catch (e) {
      lookupIndeterminate = true;
      evidence.push(`Named-SD check skipped: ${e?.message || e}`);
    }
  }

  const since = `${completedDays} days ago`;

  // git log on referenced files (highest confidence — a fix touched the gate file)
  //
  // SD-FDBK-ENH-AUTO-APPLY-MIGRATION-001 FR-5: commit count on a MIGRATION file is not
  // evidence the migration was actually applied — editing a migration file (comment fix,
  // unrelated touch-up, or the file that INTRODUCED the still-open gap) looks identical to
  // a commit that fixed it. For migration-path files, corroborate with a live-state probe
  // (does the migration's declared schema object actually exist in pg?) before trusting the
  // commit count as "highest confidence". Non-migration files are unaffected.
  for (const file of (descriptor.referenced_files || []).slice(0, 3)) {
    const safe = String(file).replace(/"/g, '');
    const out = git(`log --oneline --since="${since}" -- "${safe}"`);
    if (!out) continue;
    const n = out.split('\n').filter(Boolean).length;

    if (!isMigrationPath(safe)) {
      found = true;
      fileMatch = true;
      evidence.push(`${n} commit(s) within ${completedDays}d touched referenced file ${safe}`);
      continue;
    }

    try {
      const probe = await probeLiveState(safe);
      if (probe.executed === true) {
        found = true;
        fileMatch = true;
        evidence.push(`${n} commit(s) within ${completedDays}d touched migration ${safe} — corroborated: all declared objects present live`);
      } else if (probe.executed === false) {
        // Commits exist but the migration's declared object(s) are still absent live —
        // editing the file is not evidence of a fix. Do NOT set found/fileMatch from this.
        evidence.push(`${n} commit(s) within ${completedDays}d touched migration ${safe}, but live-state probe shows ${probe.missingObjects.length} declared object(s) still missing — NOT treated as a shipped fix`);
      } else {
        // executed === null: indeterminate (no declared objects parsed, or file not found).
        // Same conservative treatment as the completed-SD lookup's error branch below.
        lookupIndeterminate = true;
        evidence.push(`${n} commit(s) within ${completedDays}d touched migration ${safe}; live-state probe indeterminate (no declared objects parsed) — commit count alone is not trusted as corroboration`);
      }
    } catch (e) {
      // Probe unavailable (DB unreachable, etc.) — fall back to the commit-count signal,
      // but the evidence explicitly flags it as unconfirmed so a downstream --force-liveness
      // decision is made with that caveat visible, per FR-5 AC-3.
      found = true;
      fileMatch = true;
      evidence.push(`${n} commit(s) within ${completedDays}d touched migration ${safe} — live-state corroboration UNAVAILABLE (${e?.message || e}), falling back to commit-count evidence unconfirmed`);
    }
  }

  // git log --grep on the token
  if (token) {
    const safe = token.replace(/"/g, '');
    const out = git(`log --oneline --since="${since}" --grep="${safe}"`);
    if (out) {
      found = true;
      const n = out.split('\n').filter(Boolean).length;
      evidence.push(`${n} commit(s) within ${completedDays}d mention "${safe}"`);
    }
  }

  return { found, fileMatch, evidence, lookupIndeterminate };
}

/**
 * Re-verify whether a diagnostic / retro-mined premise is still live.
 *
 * @param {Object} descriptor - { kind, gate_name?, cluster_reason?, source, severity, premise_text, referenced_files? }
 * @param {Object} [deps] - { supabase?, git?, recentDays?, completedDays?, recentThreshold?, nowMs? }
 * @returns {Promise<{status:'LIVE'|'STALE', confidence_score:number, evidence:string[], recommendation:'PROCEED'|'HOLD_FOR_REVIEW'|'ARCHIVE'}>}
 */
export async function checkPremiseLiveness(descriptor = {}, deps = {}) {
  const {
    supabase = null,
    git = defaultGit,
    recentDays = RECENT_DAYS_DEFAULT,
    completedDays = COMPLETED_DAYS_DEFAULT,
    recentThreshold = LIVE_RECENT_THRESHOLD,
    probeLiveState = defaultProbeLiveState,
    nowMs,
  } = deps;

  // Fail-OPEN wrapper: any unexpected throw resolves to LIVE so a real premise
  // is never silently dropped.
  try {
    const token = premiseToken(descriptor);

    // Ambiguous: no gate/cluster identifier to re-verify against → never STALE.
    if (!token) {
      return {
        status: 'LIVE',
        confidence_score: 0,
        evidence: ['Ambiguous premise: no gate_name/cluster_reason to re-verify — defaulting LIVE (never drop unverifiable work)'],
        recommendation: 'PROCEED',
      };
    }

    const { count: recentCount, error: recountErr } = await recentRecount(supabase, token, recentDays, nowMs);
    const fix = await findShippedFix(supabase, git, descriptor, completedDays, nowMs, probeLiveState);

    const evidence = [];
    if (recountErr || recentCount === null) {
      evidence.push(`Recent-window recount unavailable (${recountErr || 'no client'}) — treating as uncertain`);
    } else {
      evidence.push(`${recentCount} rejection(s) cite "${token}" in the last ${recentDays}d`);
    }
    evidence.push(...fix.evidence);

    // SD-LEO-INFRA-SIGNAL-PROMOTION-RESOLUTION-CHECK-001 (FR-1 / TR-4): STALE recommends ARCHIVE,
    // i.e. it DROPS the work — the dangerous direction. The verdict rests on two resolution
    // signals (completed-SD lookup, git history). If one could not be evaluated at all, the
    // checker does not have the evidence to call anything "provably dead", even when the other
    // signal did match. Downgrade to HOLD_FOR_REVIEW rather than archive on partial evidence.
    // This is deliberately asymmetric: an indeterminate lookup can only ever make the verdict
    // MORE conservative, never less.
    if (recentCount === 0 && fix.found && fix.lookupIndeterminate) {
      return {
        status: 'LIVE',
        confidence_score: 0.3,
        evidence: [...evidence, 'Verdict: LIVE (HOLD_FOR_REVIEW) — a shipped fix was found, but the completed-SD lookup could not be evaluated, so the premise is NOT provably dead'],
        recommendation: 'HOLD_FOR_REVIEW',
      };
    }

    // STALE only when we have a real recount of ~0 AND a shipped fix exists.
    if (recentCount === 0 && fix.found) {
      return {
        status: 'STALE',
        confidence_score: fix.fileMatch ? 0.95 : 0.8,
        evidence: [...evidence, 'Verdict: STALE — recent recurrence ~0 AND an already-shipped fix was found'],
        recommendation: 'ARCHIVE',
      };
    }

    // Clearly live: recurring in the recent window.
    if (typeof recentCount === 'number' && recentCount >= recentThreshold) {
      return {
        status: 'LIVE',
        confidence_score: 0.9,
        evidence: [...evidence, `Verdict: LIVE — ${recentCount} recent recurrence(s) >= threshold ${recentThreshold}`],
        recommendation: 'PROCEED',
      };
    }

    // In-between / uncertain: surface for review but still create (fail-open).
    return {
      status: 'LIVE',
      confidence_score: 0.3,
      evidence: [...evidence, 'Verdict: LIVE (HOLD_FOR_REVIEW) — not provably dead; recurrence below threshold or recount uncertain'],
      recommendation: 'HOLD_FOR_REVIEW',
    };
  } catch (e) {
    return {
      status: 'LIVE',
      confidence_score: 0,
      evidence: [`Premise-liveness check errored (${e?.message || e}) — failing OPEN to LIVE`],
      recommendation: 'PROCEED',
    };
  }
}

export default checkPremiseLiveness;
