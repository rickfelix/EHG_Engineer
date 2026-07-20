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
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

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
async function findShippedFix(supabase, git, descriptor, completedDays, nowMs) {
  const token = premiseToken(descriptor);
  const evidence = [];
  let found = false;
  let fileMatch = false;

  // Completed SD referencing the token (reuses the kr-reality-checker ilike pattern)
  if (supabase && token) {
    try {
      const { data } = await supabase
        .from('strategic_directives_v2')
        .select('sd_key, title, completion_date')
        .eq('status', 'completed')
        .gte('completion_date', cutoffISO(completedDays, nowMs))
        .or(`title.ilike.%${token}%,description.ilike.%${token}%`)
        .limit(5);
      if (data && data.length > 0) {
        found = true;
        evidence.push(`Completed SD(s) within ${completedDays}d reference "${token}": ${data.map(s => s.sd_key).join(', ')}`);
      }
    } catch (e) {
      evidence.push(`Completed-SD check skipped: ${e?.message || e}`);
    }
  }

  const since = `${completedDays} days ago`;

  // git log on referenced files (highest confidence — a fix touched the gate file)
  for (const file of (descriptor.referenced_files || []).slice(0, 3)) {
    const safe = String(file).replace(/"/g, '');
    const out = git(`log --oneline --since="${since}" -- "${safe}"`);
    if (out) {
      found = true;
      fileMatch = true;
      const n = out.split('\n').filter(Boolean).length;
      evidence.push(`${n} commit(s) within ${completedDays}d touched referenced file ${safe}`);
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

  return { found, fileMatch, evidence };
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
    const fix = await findShippedFix(supabase, git, descriptor, completedDays, nowMs);

    const evidence = [];
    if (recountErr || recentCount === null) {
      evidence.push(`Recent-window recount unavailable (${recountErr || 'no client'}) — treating as uncertain`);
    } else {
      evidence.push(`${recentCount} rejection(s) cite "${token}" in the last ${recentDays}d`);
    }
    evidence.push(...fix.evidence);

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
