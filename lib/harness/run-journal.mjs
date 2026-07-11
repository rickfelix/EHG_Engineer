/**
 * S20-26 simulated-run HARNESS JOURNAL — spec §H2/§H3 instrumentation seam
 * (docs/design/s20-26-simulated-run-harness-spec.md; Solomon-authored, Bravo slice).
 *
 * Append-only run journal: every observation the run makes lands here as one event —
 * what fired, what it touched (touched-tables feed §H6's generated teardown-assertion
 * list), which O-requirement it maps to (§H3 coverage matrix), and any divergence from
 * the enumerated test-mode overlay (§H2: anything else = TEST_MODE_DIVERGENCE finding).
 *
 * Durability: JSONL file per run under <repo-root>/.harness-runs/<run-id>/journal.jsonl
 * (append-only, flushed per event — §H7 checkpoint-resume reads it back), mirrored into
 * a system_events row at finalize (finalizeMirror() below —
 * SD-LEO-INFRA-RUN-EVIDENCE-DURABILITY-001).
 *
 * Root-cause note (SD-LEO-INFRA-RUN-EVIDENCE-DURABILITY-001, F5+F6): the journal path
 * used to default to the CWD-relative string '.harness-runs'. A run invoked from one
 * process/cwd (e.g. a worktree) and a later teardown/finalize invoked as a SEPARATE CLI
 * process from a DIFFERENT cwd (e.g. the main repo root, or a different/since-removed
 * worktree) would resolve to two different absolute paths — the constructor's
 * existsSync() resume-check found nothing at the new cwd's path, silently started a
 * FRESH journal, and only the few lifecycle events appended by that later process
 * survived (the documented "59-entry journal reduced to a 2-entry teardown tail").
 * The original file was never deleted — it was orphaned. Anchoring baseDir to the
 * canonical main repo root (getRepoRoot(), stable regardless of caller cwd, including
 * from inside a `.worktrees/<sd>` checkout) makes every process that omits an explicit
 * baseDir resolve to the SAME file for a given run_id.
 *
 * Finalize-mirror design note (adversarial review, 2026-07-11): an earlier revision of
 * this fix persisted the mirror as a venture_artifacts row. Deep-tier adversarial review
 * caught that venture_artifacts.venture_id is FOREIGN KEY ... ON DELETE CASCADE — the
 * mirror row would be silently destroyed the instant teardownFixture() deletes the
 * fixture's ventures row, defeating the entire point of "durable independent of the
 * harness's own cleanup". system_events carries no FK to ventures at all (verified live:
 * only parent_event_id/prd_id, both NO ACTION, both optional), so it is structurally
 * immune to the venture's lifecycle — the mirror is written there instead, with no
 * venture_id column populated (informational run_id/venture_id live in the payload only).
 *
 * Coverage rule (§H3): every planned observation ends the run OBSERVED or as a
 * first-class CANNOT_DRIVE finding — checkCoverage() converts unmapped entries into
 * findings; an instrument that returns zero findings on a dead loop fails §H9 calibration.
 */
import { mkdirSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getRepoRoot } from '../repo-paths.js';

export const EVENT_KINDS = Object.freeze([
  'observation',            // a loop fired and was captured (maps to >=1 O-requirement)
  'gauge_provenance',       // O4: a gauge's DECLARED source was actually consulted (or not)
  'finding',                // first-class finding (DEAD_LOOP, NO_DATA_GAUGE, CANNOT_DRIVE, TEST_MODE_DIVERGENCE, ...)
  'fence_assertion',        // §H5/§H6 fence check result
  'checkpoint',             // §H7 cap-boundary continuation point
  'lifecycle',              // fixture created / torn down / run started / finalized
]);

export const FINDING_TYPES = Object.freeze([
  'DEAD_LOOP', 'NO_DATA_GAUGE', 'CANNOT_DRIVE', 'TEST_MODE_DIVERGENCE', 'FENCE_BREACH', 'RESIDUE',
]);

export class RunJournal {
  /**
   * @param {string} runId
   * @param {{baseDir?: string, clock?: () => string}} [opts] - injected clock per §H4
   *   (never wall-clock-dependent assertions; tests inject a fixed clock)
   */
  constructor(runId, opts = {}) {
    if (!runId || typeof runId !== 'string') throw new Error('RunJournal requires a runId');
    this.runId = runId;
    // FR-1 (SD-LEO-INFRA-RUN-EVIDENCE-DURABILITY-001): anchor the default to the
    // canonical main repo root, NOT process.cwd() — see module docstring root-cause
    // note. An explicit opts.baseDir (tests, callers with their own scratch dir)
    // always wins and is never touched.
    this.baseDir = opts.baseDir || join(getRepoRoot(), '.harness-runs');
    this.clock = opts.clock || (() => new Date().toISOString());
    this.path = join(this.baseDir, runId, 'journal.jsonl');
    this._seq = 0;
    mkdirSync(dirname(this.path), { recursive: true });
    // §H7 resume: continue the sequence from an existing journal, never overwrite.
    if (existsSync(this.path)) {
      const prior = this.readAll();
      this._seq = prior.length ? prior[prior.length - 1].seq : 0;
    }
  }

  /**
   * Append one event. Returns the persisted event (with seq + at).
   * @param {{kind: string, event: string, o_requirements?: string[], touched_tables?: string[],
   *          finding_type?: string, detail?: object}} e
   */
  append(e) {
    if (!EVENT_KINDS.includes(e.kind)) throw new Error(`unknown journal kind '${e.kind}' (allowed: ${EVENT_KINDS.join(', ')})`);
    if (e.kind === 'finding' && !FINDING_TYPES.includes(e.finding_type)) {
      throw new Error(`finding requires finding_type in ${FINDING_TYPES.join('|')}`);
    }
    const row = {
      seq: ++this._seq,
      at: this.clock(),
      run_id: this.runId,
      kind: e.kind,
      event: e.event,
      o_requirements: e.o_requirements || [],
      touched_tables: e.touched_tables || [],
      ...(e.finding_type ? { finding_type: e.finding_type } : {}),
      detail: e.detail || {},
    };
    appendFileSync(this.path, JSON.stringify(row) + '\n');
    return row;
  }

  /**
   * Convenience: journal a first-class finding. `detail.o_requirements` is
   * LIFTED to the top-level field so checkCoverage() counts the finding toward
   * its requirement (§H3: a CANNOT_DRIVE finding IS coverage — Charlie-slice
   * fix; previously findings carried the mapping only inside detail, invisible
   * to the coverage matrix).
   */
  finding(findingType, event, detail = {}) {
    return this.append({
      kind: 'finding',
      finding_type: findingType,
      event,
      o_requirements: detail.o_requirements || [],
      detail,
    });
  }

  /** Read the full journal back (array of events, seq order). */
  readAll() {
    if (!existsSync(this.path)) return [];
    return readFileSync(this.path, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  }

  /**
   * §H6: the teardown-assertion table list is GENERATED from the journal's touched-tables
   * set (plus the caller's core list) — never hand-maintained.
   */
  touchedTables() {
    const set = new Set();
    for (const e of this.readAll()) for (const t of e.touched_tables || []) set.add(t);
    return [...set].sort();
  }

  /**
   * §H3 coverage matrix: every planned O-requirement must end the run with >=1
   * observation OR a first-class finding referencing it. Unmapped = a finding ABOUT the
   * harness (returned here; §H9 calibration asserts a deliberately-dead loop lands here).
   *
   * covered/uncovered/findings are the MAPPING-COMPLETENESS gauge (did anything reference
   * this requirement at all — observation or finding) and stay exactly as before; calibration
   * (§H9) asserts against this shape. positive/blocked/cannotDrive/disposition are a SEPARATE,
   * honest-gauge fix (QF-20260711-114 / Solomon F2): a blocked or cannot-drive requirement is
   * NOT a success — the headline gauge counts positive-path completions only, never conflating
   * "mapped" with "succeeded".
   *
   * @param {string[]} plannedRequirements - e.g. ['O1','O2',...,'O10']
   * @returns {{covered: string[], uncovered: string[], findings: object[], disposition: object,
   *            positive: string[], blocked: string[], cannotDrive: string[],
   *            headline: {positive: number, total: number}}}
   */
  checkCoverage(plannedRequirements) {
    const events = this.readAll();
    const seenAny = new Set();
    const seenPositive = new Set();
    const seenCannotDrive = new Set();
    const seenBlocked = new Set();
    for (const e of events) {
      if (e.kind === 'observation') {
        for (const o of e.o_requirements || []) { seenAny.add(o); seenPositive.add(o); }
      } else if (e.kind === 'finding') {
        for (const o of e.o_requirements || []) {
          seenAny.add(o);
          if (e.finding_type === 'CANNOT_DRIVE') seenCannotDrive.add(o);
          else seenBlocked.add(o);
        }
      }
    }
    const covered = plannedRequirements.filter((r) => seenAny.has(r));
    const uncovered = plannedRequirements.filter((r) => !seenAny.has(r));
    const findings = uncovered.map((r) => ({
      finding_type: 'DEAD_LOOP',
      event: `coverage: requirement ${r} ended the run with zero observations and no CANNOT_DRIVE finding — dead loop or un-driven surface`,
      o_requirements: [r],
    }));

    const disposition = {};
    for (const r of plannedRequirements) {
      disposition[r] = seenPositive.has(r) ? 'positive'
        : seenCannotDrive.has(r) ? 'cannot_drive'
        : seenBlocked.has(r) ? 'blocked'
        : 'dead_loop';
    }
    const positive = plannedRequirements.filter((r) => disposition[r] === 'positive');
    const blocked = plannedRequirements.filter((r) => disposition[r] === 'blocked');
    const cannotDrive = plannedRequirements.filter((r) => disposition[r] === 'cannot_drive');

    return {
      covered, uncovered, findings, disposition, positive, blocked, cannotDrive,
      headline: { positive: positive.length, total: plannedRequirements.length },
    };
  }

  /**
   * §H2 config-diff seam: assert an observed runtime config/behavior divergence is inside
   * the ENUMERATED allowed set; anything else journals as TEST_MODE_DIVERGENCE.
   * @param {string} divergenceKey - e.g. 'stripe_test_keys', 'preview_only_deploy'
   * @param {string[]} allowedSet - the 7-divergence overlay + §H5 fences, enumerated by the caller
   */
  assertDivergenceAllowed(divergenceKey, allowedSet, detail = {}) {
    if (allowedSet.includes(divergenceKey)) {
      return this.append({ kind: 'observation', event: `allowed test-mode divergence: ${divergenceKey}`, detail });
    }
    return this.finding('TEST_MODE_DIVERGENCE', `unenumerated divergence: ${divergenceKey}`, detail);
  }

  /**
   * O4 provenance-reached: record that a gauge's declared source was ACTUALLY consulted.
   * A query error or empty declared source is a NO_DATA_GAUGE finding, never swallowed.
   */
  gaugeProvenance(gaugeName, declaredSource, consulted, detail = {}) {
    if (consulted) {
      return this.append({ kind: 'gauge_provenance', event: `gauge ${gaugeName} source reached: ${declaredSource}`, detail });
    }
    return this.finding('NO_DATA_GAUGE', `gauge ${gaugeName} declared source '${declaredSource}' NOT reached`, { ...detail, gauge: gaugeName });
  }
}

/**
 * FR-3/FR-4 (SD-LEO-INFRA-RUN-EVIDENCE-DURABILITY-001): persist the journal as a durable
 * system_events row, independent of both the .harness-runs filesystem scratch AND the
 * fixture venture's lifecycle (see module docstring "Finalize-mirror design note" for why
 * venture_artifacts was rejected — its venture_id FK is ON DELETE CASCADE). NET-NEW — no
 * prior finalize-mirror write existed. A write failure always loud-fails (NC-7: zero rows
 * written = escalation, never a silently swallowed warning) — system_events carries no
 * CHECK constraint blocking this write, so there is no "pending migration" grace window
 * to gate on, unlike the venture_artifacts design this replaced.
 *
 * @param {object} args
 * @param {import('@supabase/supabase-js').SupabaseClient} args.supabase
 * @param {RunJournal} args.journal
 * @param {string} [args.ventureId] - informational only; NOT written to a venture_id column
 * @param {{insertEvent?: Function}} [args.seams] - injectable for tests
 * @returns {Promise<{persisted: boolean}>}
 */
export async function finalizeMirror({ supabase, journal, ventureId, seams = {} }) {
  const doWrite = seams.insertEvent || (async () => {
    const { error } = await supabase.from('system_events').insert({
      event_type: 'harness_run_journal_finalized',
      idempotency_key: `harness_run_journal_finalized:${journal.runId}`,
      payload: { run_id: journal.runId, venture_id: ventureId ?? null, entries: journal.readAll() },
      created_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
  });

  try {
    await doWrite();
    journal.append({ kind: 'lifecycle', event: 'finalize-mirror persisted (system_events, harness_run_journal_finalized)', touched_tables: ['system_events'] });
    return { persisted: true };
  } catch (e) {
    const message = String(e && e.message || e).slice(0, 400);
    // Loud-fail (NC-7): a mirror write failure is always an escalation, never swallowed.
    throw new Error(`finalize-mirror write failed for run ${journal.runId}: ${message}`);
  }
}

export default { RunJournal, EVENT_KINDS, FINDING_TYPES, finalizeMirror };
