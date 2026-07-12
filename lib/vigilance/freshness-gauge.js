/**
 * Vigilance freshness gauge — SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-F FR-2, S-4 gauge substrate.
 *
 * OBJECTIVE+GUARD (per docs/design/operating-company-satellite-architecture-v1.md §3.5):
 * objective = observation freshness per watched thesis; guard = fetch-provenance rate = 100%
 * (any unfetched claim renders NO-DATA). S-4 doctrine: never report a mapping/coverage number as
 * a success number — an absent/disabled intake renders NO-DATA, never a stale green (mirrors the
 * honest-degrade pattern in lib/org/chairman-surface.mjs's section()/failedSection() and the
 * status:'unknown' discipline in lib/vision/vdr-probes.js).
 */
import { readEvidence } from '../org/evidence-fabric.mjs';
import { EVIDENCE_KIND } from './watcher-framework.js';

const DEFAULT_STALE_AFTER_HOURS = 48;

/**
 * Compute vigilance freshness, optionally scoped to one watched thesis/subject.
 *
 * @param {object} supabase - injected service-role client
 * @param {object} [opts]
 * @param {string|null} [opts.subjectType]
 * @param {string|null} [opts.subjectId]
 * @param {number} [opts.staleAfterHours]
 * @returns {Promise<{status:'FRESH'|'STALE'|'NO_DATA', latest_observed_at:string|null, hours_since_latest:number|null, thesis_count:number, computed_at:string}>}
 */
export async function computeVigilanceFreshness(supabase, opts = {}) {
  const staleAfterHours = opts.staleAfterHours ?? DEFAULT_STALE_AFTER_HOURS;
  const computed_at = new Date().toISOString();

  let rows;
  try {
    rows = await readEvidence(supabase, {
      evidenceKind: EVIDENCE_KIND,
      subjectType: opts.subjectType ?? null,
      subjectId: opts.subjectId ?? null,
      limit: 100,
    });
  } catch {
    // Read failure (table absent, connectivity) is itself a NO-DATA condition — never a stale
    // green fabricated from a prior in-memory value.
    return { status: 'NO_DATA', latest_observed_at: null, hours_since_latest: null, thesis_count: 0, computed_at };
  }

  if (!rows || rows.length === 0) {
    return { status: 'NO_DATA', latest_observed_at: null, hours_since_latest: null, thesis_count: 0, computed_at };
  }

  const latest = rows.reduce((acc, r) => {
    const ts = r.observed_at || r.created_at;
    return !acc || new Date(ts) > new Date(acc) ? ts : acc;
  }, null);

  if (!latest) {
    // Rows exist but none carry a usable timestamp — NO-DATA, not a fabricated "fresh".
    return { status: 'NO_DATA', latest_observed_at: null, hours_since_latest: null, thesis_count: rows.length, computed_at };
  }

  const hoursSinceLatest = (Date.now() - new Date(latest).getTime()) / (3600 * 1000);
  const theses = new Set(rows.map((r) => r.payload?.thesis).filter(Boolean));

  return {
    status: hoursSinceLatest <= staleAfterHours ? 'FRESH' : 'STALE',
    latest_observed_at: latest,
    hours_since_latest: Number(hoursSinceLatest.toFixed(1)),
    thesis_count: theses.size,
    computed_at,
  };
}
