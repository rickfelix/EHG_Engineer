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
 * a venture_artifacts row (artifact_type 'harness_run_journal') at finalize
 * (finalizeMirror() below — SD-LEO-INFRA-RUN-EVIDENCE-DURABILITY-001).
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
 * Coverage rule (§H3): every planned observation ends the run OBSERVED or as a
 * first-class CANNOT_DRIVE finding — checkCoverage() converts unmapped entries into
 * findings; an instrument that returns zero findings on a dead loop fails §H9 calibration.
 */
import { mkdirSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getRepoRoot } from '../repo-paths.js';
import { loadPendingChairmanGateAllowlist } from '../eva/stage-templates/artifact-type-parity.js';
import { ARTIFACT_TYPES } from '../eva/artifact-types.js';

const HARNESS_RUN_JOURNAL_TYPE = ARTIFACT_TYPES.HARNESS_RUN_JOURNAL;

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
 * venture_artifacts row (artifact_type 'harness_run_journal'), independent of the
 * .harness-runs filesystem scratch. NET-NEW — no prior finalize-mirror write existed.
 *
 * Loud-fail semantics are GATED on migration-applied state (risk-agent 2026-07-11):
 * while 'harness_run_journal' is still listed in
 * database/artifact-type-parity-pending-chairman-gate.json, the live CHECK constraint
 * has NOT been widened yet, so the insert is a GUARANTEED failure, not a transient one —
 * hard-aborting every run during that window would be worse than the bug being fixed.
 * Degrade to a loud, unambiguous warning (console.warn + a journaled lifecycle event
 * with detail.evidence_degraded=true) instead. Once the migration is chairman-applied
 * and the exemption entry is removed, any future write failure throws (NC-7: zero rows
 * written = escalation, never a silently swallowed warning).
 *
 * @param {object} args
 * @param {import('@supabase/supabase-js').SupabaseClient} args.supabase
 * @param {RunJournal} args.journal
 * @param {string} args.ventureId
 * @param {number} args.lifecycleStage - stage to attribute the mirror row to (the run's entryStage)
 * @param {{writeArtifact?: Function}} [args.seams] - injectable for tests
 * @returns {Promise<{persisted: boolean, degraded?: boolean, error?: string}>}
 */
export async function finalizeMirror({ supabase, journal, ventureId, lifecycleStage, seams = {} }) {
  const pending = loadPendingChairmanGateAllowlist();
  const migrationApplied = !(HARNESS_RUN_JOURNAL_TYPE in pending);

  const doWrite = seams.writeArtifact || (async () => {
    const { writeArtifact } = await import('../eva/artifact-persistence-service.js');
    return writeArtifact(supabase, {
      ventureId,
      lifecycleStage,
      artifactType: HARNESS_RUN_JOURNAL_TYPE,
      title: `Harness run journal (run_id=${journal.runId})`,
      artifactData: { run_id: journal.runId, entries: journal.readAll() },
      source: 'harness-run-journal-finalize',
    });
  });

  try {
    await doWrite();
    journal.append({ kind: 'lifecycle', event: 'finalize-mirror persisted (venture_artifacts, harness_run_journal)', touched_tables: ['venture_artifacts'] });
    return { persisted: true };
  } catch (e) {
    const message = String(e && e.message || e).slice(0, 400);
    if (!migrationApplied) {
      console.warn(`HARNESS_FINALIZE_MIRROR_DEGRADED run=${journal.runId} reason=pending-chairman-gate error=${message}`);
      journal.append({ kind: 'lifecycle', event: `finalize-mirror write failed (pending chairman-gated migration — evidence-degraded, not aborted): ${message}`, detail: { evidence_degraded: true, error: message } });
      return { persisted: false, degraded: true, error: message };
    }
    // Migration already applied — this failure is unexpected. Loud-fail (NC-7).
    throw new Error(`finalize-mirror write failed for run ${journal.runId} (migration already applied — this should never fail): ${message}`);
  }
}

export default { RunJournal, EVENT_KINDS, FINDING_TYPES, finalizeMirror };
