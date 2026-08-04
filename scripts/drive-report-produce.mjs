#!/usr/bin/env node
/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B (TR-1) — the Drive Report producer.
 *
 * Runs on a GHA cron. Gathers the sections and the score, composes ONE drive_reports row, persists
 * it. This is the only piece of this SD that writes anything.
 *
 * ── WHY THIS FILE IS HERE AND NOT UNDER lib/drive-loop ────────────────────────────────────
 * Not a preference — a guard decided it. The FR-7 propose-only scan
 * (tests/unit/drive-loop/report-posture.test.js) fails the build on any insert/update/claim/
 * dispatch call anywhere under lib/drive-loop, because the report PROPOSES and never ACTS. That is
 * why compose-report.js is pure: it shapes the row and returns it, and the writing lives out here.
 * If a later change needs the producer inside lib/drive-loop, the answer is not to narrow the scan.
 *
 * ── IDEMPOTENCE IS KEYED ON run_id, AND IT IS THE POINT OF THE PRODUCER ───────────────────
 * A cron retries. GitHub re-runs failed jobs. Without a key, a retry writes a SECOND row for the
 * same run, and section 5 — whose entire job is report-over-report deltas — then computes a delta
 * between a report and itself: guaranteed zero movement, reported as a stall that is not there.
 * A duplicate here is not a cosmetic wart; it silently corrupts the one section that reads history.
 *
 * ── EVERYTHING IS INJECTED ────────────────────────────────────────────────────────────────
 * clock, gather, persist and findExisting are all parameters. `persist` in particular, so a test can
 * OBSERVE whether a write happened rather than assume it: "did it double-insert?" is the question
 * this module exists to answer, and it cannot be answered about a hidden client.
 */

import { composeReport } from '../lib/drive-loop/compose-report.js';

/**
 * @param {object} o
 * @param {() => Promise<{sections:object, driveScore:object}>} o.gather
 * @param {(row:object) => Promise<{id:string}>} o.persist
 * @param {(runId:string) => Promise<object|null>} [o.findExisting] idempotence probe
 * @param {string} o.runId
 * @param {string} o.generatedAt ISO
 * @param {string} [o.cadence]
 */
export async function produceDriveReport({ gather, persist, findExisting = null, runId, generatedAt, cadence = 'scheduled' } = {}) {
  if (typeof gather !== 'function' || typeof persist !== 'function') {
    throw new Error('produceDriveReport(): gather and persist must be injected — a producer whose '
      + 'write is hidden cannot be tested for whether it double-inserted');
  }
  if (typeof runId !== 'string' || runId.trim().length === 0) {
    // Without a run id there is no idempotence key, so a retry cannot be recognised. Refuse rather
    // than write a row that a re-run will silently duplicate.
    throw new Error('produceDriveReport(): runId is required — it is the idempotence key, and '
      + 'without it a cron retry writes a second row for the same run');
  }

  // PROBE BEFORE WRITING. Skipping is a real outcome and is reported as one, not as a success.
  if (findExisting) {
    const existing = await findExisting(runId);
    if (existing) {
      return { written: false, skipped: 'already_produced', run_id: runId, existing_id: existing.id ?? null };
    }
  }

  const { sections, driveScore } = await gather();

  // composeReport REFUSES a sectionless report (a failed run is not an empty one), so a total
  // gather failure throws here rather than persisting a row that reads as "we looked and there was
  // nothing". Partial failures still persist, with the unavailable sections named on the row.
  const row = composeReport({ sections, driveScore, generatedAt, runId, cadence });

  const saved = await persist(row);
  return { written: true, id: saved?.id ?? null, run_id: runId, row };
}

// CLI entry only. Nothing above touches a network or a clock, so the whole decision surface is
// testable; this block is the thin edge that supplies the real ones.
if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/')) {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const runId = process.env.GITHUB_RUN_ID || process.env.DRIVE_RUN_ID;

  const result = await produceDriveReport({
    runId,
    generatedAt: new Date().toISOString(),
    cadence: process.env.DRIVE_CADENCE || 'scheduled',
    findExisting: async (id) => {
      const { data } = await supabase.from('drive_reports').select('id').eq('run_id', id).maybeSingle();
      return data || null;
    },
    gather: async () => {
      // Wired by the consumers/sections in a follow-on; the producer's contract is fixed here.
      throw new Error('gather() is not yet wired — the producer contract and its idempotence are '
        + 'landed and tested; section wiring follows');
    },
    persist: async (row) => {
      const { data, error } = await supabase.from('drive_reports').insert(row).select('id').single();
      if (error) throw new Error(`persist failed: ${error.message}`);
      return data;
    },
  });
  console.log(JSON.stringify(result.row ? { ...result, row: undefined } : result));
}
