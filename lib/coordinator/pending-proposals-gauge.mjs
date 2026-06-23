/**
 * Pending-proposals gauge + drain (SD-LEO-INFRA-COORDINATOR-MATERIALIZE-QUEUE-BEFORE-SOURCE-001)
 *
 * The coordinator's belt-low DEFICIT path pings Adam for fresh work without first checking
 * whether Adam ALREADY handed back un-materialized proposals (.prd-payloads/adam-prop-*.json
 * whose proposed_sd_key is not yet in strategic_directives_v2). That produced a false-DEFICIT
 * loop (~42min of source_request pings while 10 handed-back proposals sat idle, 2 workers idled).
 *
 * This module:
 *   - scanPendingProposals(): counts un-materialized adam-prop proposals, classifying each
 *     FRESH vs STALE by file mtime against a configurable freshness window (the stale-guard that
 *     stops a mass-materialize of the full backlog).
 *   - drainPendingProposals(): materializes the FRESH pending proposals via the canonical
 *     idempotent leo-create-sd path (ingestProposalObject — keyExists skip reused verbatim).
 *
 * Mirrors scripts/lib/sourcing-engine-awareness.mjs. All FS/DB/create deps are injectable so
 * the gauge + drain are unit-testable without real FS, DB, or SD creation. Fail-soft per file.
 *
 * FR-3 note: belt-low reachAdam already uses a TYPED kind (coordinator_request ∈ DIRECTIVE_KINDS);
 * the genuinely-untyped payload.kind=null Adam-inbox consumer gap is a DISTINCT follow-up
 * (ref SD-LEO-FEAT-ADAM-INBOX-CONSUMPTION-001) and is intentionally out of scope here.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join as joinPath } from 'node:path';

export const DEFAULT_PROPOSALS_DIR = '.prd-payloads';
export const DEFAULT_FRESHNESS_DAYS = Number(process.env.PENDING_PROPOSAL_FRESHNESS_DAYS) || 7;
const ADAM_PROP_RE = /^adam-prop-.*\.json$/;

/** Resolve the SD key a proposal would materialize as (proposed_sd_key, fallback sd_key). */
function proposalKey(proposal) {
  return proposal?.proposed_sd_key || proposal?.sd_key || null;
}

/**
 * Scan .prd-payloads/adam-prop-*.json for proposals NOT yet materialized in
 * strategic_directives_v2, classifying each pending proposal fresh/stale by mtime.
 *
 * @param {Object} [opts]
 * @param {string} [opts.dir] - directory to scan (default .prd-payloads)
 * @param {number} [opts.freshnessMs] - freshness window in ms (default DEFAULT_FRESHNESS_DAYS)
 * @param {Object} [opts.supabase] - client used to check which keys already exist
 * @param {number} [opts.now] - current epoch ms (injectable for tests)
 * @param {Object} [opts.fs] - { readdirSync, readFileSync, statSync } overrides for tests
 * @returns {Promise<{pendingCount:number, pendingKeys:string[], freshKeys:string[], staleKeys:string[], scanned:number, freshProposals:Array}>}
 */
export async function scanPendingProposals(opts = {}) {
  const {
    dir = DEFAULT_PROPOSALS_DIR,
    freshnessMs = DEFAULT_FRESHNESS_DAYS * 24 * 60 * 60 * 1000,
    supabase = null,
    now = Date.now(),
    fs = { readdirSync, readFileSync, statSync },
  } = opts;

  let files = [];
  try {
    files = fs.readdirSync(dir).filter(f => ADAM_PROP_RE.test(f));
  } catch {
    return { pendingCount: 0, pendingKeys: [], freshKeys: [], staleKeys: [], scanned: 0, freshProposals: [] };
  }

  // Parse each proposal fail-soft; collect {key, file, path, mtimeMs, proposal, fresh}.
  const parsed = [];
  for (const f of files) {
    const path = joinPath(dir, f);
    try {
      const proposal = JSON.parse(fs.readFileSync(path, 'utf8'));
      const key = proposalKey(proposal);
      if (!key) continue;
      let mtimeMs = now;
      try { mtimeMs = fs.statSync(path).mtimeMs; } catch { /* default to now (treat as fresh) */ }
      parsed.push({ key, file: f, path, mtimeMs, proposal, fresh: (now - mtimeMs) <= freshnessMs });
    } catch {
      // malformed file — skip (fail-soft), do not halt the scan
    }
  }

  // Which keys already exist in strategic_directives_v2? Only those NOT present are pending.
  const existing = new Set();
  const keys = [...new Set(parsed.map(p => p.key))];
  if (supabase && keys.length > 0) {
    try {
      const { data } = await supabase.from('strategic_directives_v2').select('sd_key').in('sd_key', keys);
      for (const r of (data || [])) existing.add(r.sd_key);
    } catch {
      // DB read failed — fail-soft: treat none as existing (the canonical keyExists guard in
      // the drain still prevents double-create, so this only affects the gauge count).
    }
  }

  const pending = parsed.filter(p => !existing.has(p.key));
  const fresh = pending.filter(p => p.fresh);
  const stale = pending.filter(p => !p.fresh);

  return {
    pendingCount: pending.length,
    pendingKeys: pending.map(p => p.key),
    freshKeys: fresh.map(p => p.key),
    staleKeys: stale.map(p => p.key),
    scanned: parsed.length,
    freshProposals: fresh.map(p => ({ key: p.key, file: p.file, path: p.path, proposal: p.proposal })),
  };
}

/**
 * Materialize the FRESH pending proposals via the canonical idempotent create path.
 * Reuses ingestProposalObject (keyExists skip verbatim) — no forked create logic. Fail-soft
 * per proposal. Returns a tagged summary.
 *
 * @param {Object} opts
 * @param {Array} opts.freshProposals - [{ key, file, path, proposal }] from scanPendingProposals
 * @param {boolean} [opts.dryRun]
 * @param {Object} [opts.deps] - { ingest } injectable; defaults to the real ingestProposalObject
 * @returns {Promise<{scanned:number, materialized:number, skippedExisting:number, skippedStale:number, failed:number, results:Array}>}
 */
export async function drainPendingProposals(opts = {}) {
  const { freshProposals = [], dryRun = false, deps = {} } = opts;
  let ingest = deps.ingest;
  if (!ingest) {
    ({ ingestProposalObject: ingest } = await import('../../scripts/leo-create-sd.js'));
  }

  const summary = { scanned: freshProposals.length, materialized: 0, skippedExisting: 0, skippedStale: 0, failed: 0, results: [] };

  for (const fp of freshProposals) {
    try {
      const res = await ingest(fp.proposal, fp.path, { dryRun, deps: deps.ingestDeps });
      const action = res?.action;
      if (action === 'created' || action === 'dry-run') summary.materialized++;
      else if (action === 'skipped') summary.skippedExisting++;
      else if (action === 'skipped-stale') summary.skippedStale++;
      summary.results.push({ key: fp.key, action });
    } catch (e) {
      summary.failed++;
      summary.results.push({ key: fp.key, action: 'failed', error: e?.message || String(e) });
    }
  }
  return summary;
}

/**
 * Belt-low decision: prefer MATERIALIZE over a fresh Adam source_request when FRESH
 * un-materialized proposals already exist. (Stale-only pending does NOT suppress the ping —
 * we don't want to sit on a dry belt because of an un-drainable stale backlog.)
 */
export function shouldMaterializeBeforeSource(scan) {
  return (scan?.freshKeys?.length || 0) > 0;
}

/** One-line summary for the forecaster GAUGE/awareness output. */
export function formatPendingSummary(scan) {
  return `pending=${scan.pendingCount} (fresh ${scan.freshKeys.length}/stale ${scan.staleKeys.length}, scanned ${scan.scanned})`;
}

export default { scanPendingProposals, drainPendingProposals, shouldMaterializeBeforeSource, formatPendingSummary };
