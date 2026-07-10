/**
 * S20-26 simulated-run HARNESS JOURNAL — spec §H2/§H3 instrumentation seam
 * (docs/design/s20-26-simulated-run-harness-spec.md; Solomon-authored, Bravo slice).
 *
 * Append-only run journal: every observation the run makes lands here as one event —
 * what fired, what it touched (touched-tables feed §H6's generated teardown-assertion
 * list), which O-requirement it maps to (§H3 coverage matrix), and any divergence from
 * the enumerated test-mode overlay (§H2: anything else = TEST_MODE_DIVERGENCE finding).
 *
 * Durability: JSONL file per run under .harness-runs/<run-id>/journal.jsonl (append-only,
 * flushed per event — §H7 checkpoint-resume reads it back), mirrored into a
 * venture_artifacts row (artifact_type 'harness_run_journal') at finalize.
 *
 * Coverage rule (§H3): every planned observation ends the run OBSERVED or as a
 * first-class CANNOT_DRIVE finding — checkCoverage() converts unmapped entries into
 * findings; an instrument that returns zero findings on a dead loop fails §H9 calibration.
 */
import { mkdirSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

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
    this.baseDir = opts.baseDir || '.harness-runs';
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

  /** Convenience: journal a first-class finding. */
  finding(findingType, event, detail = {}) {
    return this.append({ kind: 'finding', finding_type: findingType, event, detail });
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
   * @param {string[]} plannedRequirements - e.g. ['O1','O2',...,'O10']
   * @returns {{covered: string[], uncovered: string[], findings: object[]}}
   */
  checkCoverage(plannedRequirements) {
    const events = this.readAll();
    const seen = new Set();
    for (const e of events) {
      if (e.kind === 'observation' || e.kind === 'finding') {
        for (const o of e.o_requirements || []) seen.add(o);
      }
    }
    const covered = plannedRequirements.filter((r) => seen.has(r));
    const uncovered = plannedRequirements.filter((r) => !seen.has(r));
    const findings = uncovered.map((r) => ({
      finding_type: 'DEAD_LOOP',
      event: `coverage: requirement ${r} ended the run with zero observations and no CANNOT_DRIVE finding — dead loop or un-driven surface`,
      o_requirements: [r],
    }));
    return { covered, uncovered, findings };
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

export default { RunJournal, EVENT_KINDS, FINDING_TYPES };
