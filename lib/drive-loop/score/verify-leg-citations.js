/**
 * SD-LEO-INFRA-DRIVE-SCORE-PER-001 (FR-3) — resolve every cited row id in ITS OWN named table,
 * at generation time, before the report is written.
 *
 * ── WHAT WENT WRONG, MEASURED ─────────────────────────────────────────────────────────────
 * drive-2026-08-12 and drive-2026-08-13 each shipped a score citation carrying 12 row_ids under
 * one label, table='drive_reports'. NONE of the 12 exist there: 11 are roadmap_wave_items (leg1)
 * and 1 is strategic_directives_v2 (leg2). Nothing was fabricated — the aggregate unioned the
 * legs' ids and stamped its OWN home table over the result. A citation that cannot be resolved to
 * its referent is provenance-SHAPED, not provenance, and it reads as audited precisely because it
 * looks like a citation.
 *
 * ── THE RESOLVER IS INJECTED, AND THAT IS THE POINT ───────────────────────────────────────
 * Same contract every sibling in this directory already enforces: leg1 injects runGit /
 * runGitLog, leg2 injects nowMs, leg4 injects computeVerdict / persist. The reason stated in
 * leg1-landed.js:56-58 applies here verbatim and more sharply — a check that silently reaches
 * for a DB client cannot be tested for WHICH TABLE IT ASKED ABOUT, and which table was asked is
 * the entire defect. A test must be able to prove this queried roadmap_wave_items for leg1 and
 * never 'drive_reports'.
 *
 * ── IT FAILS THE CITATION, NOT THE SCORE — AND IT NEVER THROWS ────────────────────────────
 * An unresolvable leg is converted to the ordinary unavailable shape, so aggregate.js's existing
 * exclusion machinery drops it from the DENOMINATOR rather than scoring it zero. Two failure
 * modes were deliberately rejected:
 *   - Keeping the leg's points while its citation is unresolvable. That converts a provenance
 *     defect into a silent false positive — strictly worse than today, because today the bad
 *     citation is at least visible on the row.
 *   - Throwing. produce() in scripts/cron/drive-report-sweep.mjs has NO surrounding try/catch, so
 *     an exception here would abort the whole daily report. A provenance check that can take the
 *     chairman's report offline is a regression, not a guardrail.
 *
 * ── THE TRADE-OFF, DISCLOSED RATHER THAN SILENT ───────────────────────────────────────────
 * A leg excluded here MAY have measured perfectly well; we discard its computed value because we
 * could not verify where the number came from. That is deliberate and it follows the same rule
 * DENOMINATOR-001 settled: an unverifiable number is not a measurement, so it does not belong in
 * `possible`. It also means "we could not confirm the provenance" and "the instrument broke" both
 * arrive as an unavailable leg — and the unavailable shape carries no discriminator field, only
 * a reason string. So the reason string is the ONLY signal a downstream reader gets, and it
 * carries CITATION_FAILURE_MARKER for exactly that purpose.
 */

import { unavailable } from '../report-posture.js';

/**
 * The stable, greppable marker on every reason this module produces.
 *
 * Exported so the tests and any downstream reader share ONE literal — a consumer hunting for
 * citation failures by hard-coding the string would drift the moment the prose around it changed,
 * and the whole point of the marker is that this failure class stays distinguishable from leg1's
 * "unearnable rule" prose and leg4's "durable write failed" prose.
 */
export const CITATION_FAILURE_MARKER = 'CITATION_UNRESOLVED';

const WHY_EXCLUDED = 'The measurement itself may have been sound; the leg is EXCLUDED because its '
  + 'provenance could not be verified, and an unverifiable number is not a measurement. Excluded '
  + 'from the denominator, never scored zero.';

/** A leg is checkable only if it actually claims a row grain. */
function citedRowIds(leg) {
  const rowIds = leg?.points?.citation?.row_ids;
  return Array.isArray(rowIds) && rowIds.length > 0 ? rowIds : null;
}

function reject(leg, reason) {
  return { leg: leg?.leg ?? '(unnamed)', unavailable: unavailable(`${CITATION_FAILURE_MARKER}: ${reason} ${WHY_EXCLUDED}`) };
}

/**
 * PostgREST returns at most ~1000 rows per request by default. A cited id list longer than that
 * would come back truncated, and the missing tail would read as "these ids do not exist" — a
 * FABRICATED failure, which is the same class of lie as a fabricated pass. Chunked well under the
 * cap so the answer is never an artefact of the transport.
 */
export const RESOLVE_BATCH_SIZE = 500;

/**
 * The real, supabase-backed resolver. A FACTORY taking the client as an argument rather than a
 * module that imports one, so this file stays free of I/O and both sweeps share ONE
 * implementation — a second copy in the hourly CLI is exactly the drift this SD is about.
 *
 * @param {object} supabase
 * @returns {(table: string, rowIds: string[]) => Promise<string[]>}
 */
export function makeRowResolver(supabase) {
  if (!supabase || typeof supabase.from !== 'function') {
    throw new Error('makeRowResolver(): a supabase client is required');
  }
  return async (table, rowIds) => {
    const found = [];
    for (let i = 0; i < rowIds.length; i += RESOLVE_BATCH_SIZE) {
      const batch = rowIds.slice(i, i + RESOLVE_BATCH_SIZE);
      const { data, error } = await supabase.from(table).select('id').in('id', batch);
      // Throw rather than return []: verifyLegCitations turns this into an explicit measurement
      // failure naming the table. Returning an empty array here would be indistinguishable from
      // "queried cleanly, none of these ids exist" — the false-negative this whole file guards.
      if (error) throw new Error(`${table}: ${error.message}${error.code ? ` (${error.code})` : ''}`);
      if (!Array.isArray(data)) throw new Error(`${table}: expected rows, got ${data === null ? 'null' : typeof data}`);
      for (const row of data) found.push(row.id);
    }
    return found;
  };
}

/**
 * @param {object} o
 * @param {Array<object>} o.legs leg results, as handed to aggregateScore
 * @param {(table: string, rowIds: string[]) => Promise<Array<*>>} o.resolveRows INJECTED. Returns
 *   the ids that ACTUALLY EXIST in `table`, out of the ids asked for. Anything that is not an
 *   array is treated as a measurement failure — never as "zero matched".
 * @returns {Promise<{legs: Array<object>, verification: object}>}
 */
export async function verifyLegCitations({ legs = [], resolveRows } = {}) {
  if (typeof resolveRows !== 'function') {
    throw new Error('verifyLegCitations(): resolveRows must be injected — this check is defined by '
      + 'WHICH TABLE it asks about, and a check that silently reaches for a DB client cannot be '
      + 'tested for that (same contract as leg1 runGit, leg4 persist)');
  }

  const out = [];
  const unresolved = [];
  let legsChecked = 0;
  let idsChecked = 0;
  let idsResolved = 0;

  for (const leg of legs) {
    const rowIds = citedRowIds(leg);
    // Legs already unavailable, and legs that legitimately cite no rows (leg4, by FR-2 design —
    // ruling e6876fe6), pass through untouched. Their absence of a row grain is a decision, not a
    // gap, and treating it as a failure here would re-litigate a settled ruling.
    if (rowIds === null) { out.push(leg); continue; }

    const table = leg?.points?.citation?.table;
    if (typeof table !== 'string' || table.trim().length === 0) {
      // row_ids with no table names ids that resolve NOWHERE. This is the defect's own shape at
      // the leg level, and it must not pass merely because there is nothing to query.
      unresolved.push({ leg: leg?.leg ?? '(unnamed)', table: table ?? null, missing_ids: [...new Set(rowIds)] });
      out.push(reject(leg, `cited ${rowIds.length} row id(s) with no table naming where they live.`));
      continue;
    }

    // Deduplicate BEFORE counting. A requested list containing the same id twice must not be able
    // to inflate any count, and the comparison below is set-based for the same reason.
    const requested = [...new Set(rowIds)];
    legsChecked += 1;
    idsChecked += requested.length;

    let returned;
    try {
      returned = await resolveRows(table, requested);
    } catch (err) {
      unresolved.push({ leg: leg.leg, table, missing_ids: requested });
      out.push(reject(leg, `resolving ${requested.length} row id(s) in ${table} threw — ${err?.message || String(err)}.`));
      continue;
    }

    if (!Array.isArray(returned)) {
      // A head-count against a table that does not exist returns no error and a null count, which
      // is indistinguishable from "read cleanly, found nothing" unless it is named a failure here.
      unresolved.push({ leg: leg.leg, table, missing_ids: requested });
      out.push(reject(leg, `resolving row id(s) in ${table} returned ${returned === null ? 'null' : typeof returned} `
        + 'rather than an array — treated as a measurement failure, never as "zero rows matched".'));
      continue;
    }

    // SET membership, and NO coercion. Duplicates in the response collapse, so they cannot inflate
    // a count; and because ids are compared as the values they are, a type or case mismatch is a
    // MISS rather than a silent match. That is load-bearing for leg2, whose table
    // (strategic_directives_v2) keys on authored VARCHAR slugs, not normalised UUIDs.
    const found = new Set(returned);
    const missing = requested.filter((id) => !found.has(id));
    idsResolved += requested.length - missing.length;

    if (missing.length > 0) {
      unresolved.push({ leg: leg.leg, table, missing_ids: missing });
      out.push(reject(leg, `cited ${requested.length} row id(s) in ${table}, of which ${missing.length} `
        + `do not exist there (${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', …' : ''}).`));
      continue;
    }

    out.push(leg);
  }

  return {
    legs: out,
    verification: {
      legs_checked: legsChecked,
      ids_checked: idsChecked,
      ids_resolved: idsResolved,
      unresolved,
      // Emitted even when nothing was checkable, so a run in which no leg cites rows says so out
      // loud instead of reading as a clean N/N pass over a population of zero.
      note: legsChecked === 0
        ? 'NO leg carried a row grain this run, so nothing was resolved. This is not a pass — it is '
          + 'an empty check, and ids_checked: 0 is the disclosure.'
        : `${idsResolved}/${idsChecked} cited row id(s) resolved in their OWN named table across `
          + `${legsChecked} leg(s). Each leg was queried against the table its own citation names, `
          + 'never against the aggregate\'s label.',
    },
  };
}
