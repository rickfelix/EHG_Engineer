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
// QF-20260807-992: the canonical cross-platform entry guard — see the CLI block at the bottom.
import { isMainModule } from '../lib/utils/is-main-module.js';

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
//
// QF-20260807-992 — THIS GUARD USED TO BE HAND-ROLLED AND NEVER FIRED ON WINDOWS.
// It read: import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/')
// PROVEN on both platforms rather than argued: on Windows that template builds
// `file://C:/Users/...` — TWO slashes — while import.meta.url is `file:///C:/Users/...` — THREE.
// No match, so main() never ran: the producer exited 0, printed NOTHING, and wrote NO ROW. On
// Linux both render `file:///home/...`, which is why the GHA path was unaffected and the defect
// stayed invisible for as long as nobody ran it by hand.
//
// That silence is the whole danger. An entry point that never fires is indistinguishable from a
// run that had nothing to do — and this is the ONLY writer of drive_reports, so the empty table
// would have been blamed on the chairman-gated migration (applied 18:20Z) rather than on a guard.
// The same hand-rolled pattern printed nothing and exited 0 in a reaper script earlier the same
// day (QF-20260807-190); recognising the exit-0-no-output signature from that is the only reason
// this was caught instead of filed as a successful verification.
//
// pathToFileURL is Node's own encoder — the same one import.meta.url is built with — so it also
// survives spaces, '#' and unicode in a path, which a manual slash-replace silently mis-encodes.
if (isMainModule(import.meta.url)) {
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
      // QF-20260807-056 — THIS REFUSAL IS CORRECT; ONLY ITS REASON WAS WRONG, AND THE WRONG REASON
      // COST TWO SEATS A MISDIAGNOSIS. The old message read "gather() is not yet wired — section
      // wiring follows", which says the drive chain is blocked on an unbuilt function. It is not.
      // The cron path's gather EXISTS and is wired: drive-report-sweep.mjs:384 passes
      // buildGather({...}) to runDriveReportSweep alongside produce: produceDriveReport. That
      // message sent a dispatched worker looking for a build gate that had already been closed.
      //
      // WHY THIS ENTRY POINT STILL REFUSES RATHER THAN REUSING buildGather. Not tidiness — three
      // things the sweep does that this block structurally cannot, each of which makes a row
      // written here WORSE than no row:
      //   1. WINDOW KEY. The sweep reads the clock ONCE and passes capacityRunId: windowKey(now),
      //      deliberately "the SAME window key the report row is written under, so an auditor can
      //      join a verdict to the report that cites it". This block keys on GITHUB_RUN_ID, so a
      //      row from here and leg4's capacity verdict would land under DIFFERENT keys and the
      //      join silently returns nothing.
      //   2. REGISTRY STAMP + WINDOW GATE. Both live in runDriveReportSweep. A row written here
      //      is outside the window and leaves LAST_RUN_FIELD unstamped, so the liveness instrument
      //      reads "never ran" over a table that just gained a row.
      //   3. TABLE-ABSENT HANDLING. The sweep treats a missing drive_reports as a KNOWN state and
      //      exits cleanly without stamping; the raw insert below throws instead.
      // Importing buildGather here would also be circular: the sweep already imports this module.
      //
      // So the supported entry is the sweep. If you want a report now, run that.
      throw new Error('drive-report-produce.mjs is not a standalone entry point — run the sweep '
        + '(scripts/cron/drive-report-sweep.mjs), which owns the window gate, the registry stamp '
        + 'and the windowKey() run id that lets a capacity verdict be joined to the report citing '
        + 'it. gather() IS wired there (drive-report-sweep.mjs:384 buildGather). This module '
        + 'exports produceDriveReport for that sweep to call; invoking it directly would write a '
        + 'row under the wrong run id, outside the window, with the registry left unstamped.');
    },
    persist: async (row) => {
      const { data, error } = await supabase.from('drive_reports').insert(row).select('id').single();
      if (error) throw new Error(`persist failed: ${error.message}`);
      return data;
    },
  });
  console.log(JSON.stringify(result.row ? { ...result, row: undefined } : result));
}
