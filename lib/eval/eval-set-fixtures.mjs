/**
 * eval-set-fixtures.mjs — sealed eval-set corpus definitions, 2 governed-artifact
 * classes (SD-LEO-INFRA-SHADOW-TRIAL-RATIFICATION-001-B).
 *
 * IN-REPO BY DESIGN (documented deviation from golden-task's out-of-repo seal
 * discipline): these cases feed MECHANICAL replay (child C's engine re-evaluates
 * predicates / hash-checks proposals), not an LLM that could memorize answers —
 * the contamination threat model does not apply, and reviewability wins. The DB
 * seal (content_hash per case) remains the integrity authority: a case counts
 * only if its sealed hash matches this module's content at load time.
 *
 * GT HONESTY FLOOR (parent SD contract): a class's verdicts count as more than
 * experimental only when its sealed set holds >=3 independent REAL adjudicated
 * cases including >=1 known-bad. Synthetic cases carry synthetic: true and NEVER
 * count toward the floor — they exercise the pipeline only (capability-runner
 * DRY_RUN_FIXTURES discipline).
 *
 * Every closure_predicates case pins its own `now` — evaluateLoopClosure freshness
 * is now-relative, and an unpinned clock is the exact time-bomb class that turned
 * repo CI red on 2026-07-17 (PR #6159).
 */

/** Class registry — names are child A's governed_change_proposals artifact_class literals. */
export const EVAL_SET_CLASSES = Object.freeze({
  closure_predicates: Object.freeze({
    category: 'eval_set_closure_predicates',
    eventType: 'eval_set_closure_predicates_seal',
  }),
  leo_protocol_sections: Object.freeze({
    category: 'eval_set_protocol_sections',
    eventType: 'eval_set_protocol_sections_seal',
  }),
});

/**
 * closure_predicates — REAL adjudicated cases (floor: 4 real, 1 known-bad → MET).
 * Shape is machine-evaluable by lib/loop-governance/closure-engine.js:
 *   evaluateLoopClosure(case.loop, case.evidence, new Date(case.now)).status
 * For known_bad cases the ENGINE verdict (engine_verdict_expected) deliberately
 * differs from the ADJUDICATED truth — that mismatch is the case's point: it is
 * the false-CLOSE class a naive predicate emits and an honest gate must catch.
 */
const CLOSURE_PREDICATE_CASES = [
  {
    case_id: 'CP-001-l30-measured-decline-closed',
    synthetic: false,
    known_bad: false,
    loop: { loop_key: 'L30', predicate_type: 'edge_freshness', closure_predicate: { window_seconds: 30 * 86400 } },
    evidence: { upstreamFiredAt: '2026-07-13T09:00:00.000Z', edgeAt: '2026-07-13T09:00:00.000Z' },
    now: '2026-07-14T12:00:00.000Z',
    engine_verdict_expected: 'closed',
    adjudicated_status: 'closed',
    adjudication_evidence: 'L30 session-coordination-retention: legitimate CLOSED with measured backlog decline (collector lib/loop-governance/collectors/session-coordination-retention.js; GT1_VIOLATION guard scripts/loop-closure-verifier-run.mjs). Chairman-visible closure trail 2026-07-14.',
  },
  {
    case_id: 'CP-002-starved-baseline-no-upstream',
    synthetic: false,
    known_bad: false,
    loop: { loop_key: 'L07', predicate_type: 'edge_freshness', closure_predicate: { window_seconds: 30 * 86400 } },
    evidence: { upstreamFiredAt: null, edgeAt: null },
    now: '2026-07-14T12:00:00.000Z',
    engine_verdict_expected: 'starved',
    adjudicated_status: 'starved',
    adjudication_evidence: 'Chairman-ratified 33/33 STARVED honest baseline (2026-07-14): upstream never fired, nothing to close — STARVED, not the loop\'s fault.',
  },
  {
    case_id: 'CP-003-open-fired-but-edge-stale',
    synthetic: false,
    known_bad: false,
    loop: { loop_key: 'L12', predicate_type: 'edge_freshness', closure_predicate: { window_seconds: 30 * 86400 } },
    evidence: { upstreamFiredAt: '2026-07-10T00:00:00.000Z', edgeAt: '2026-05-01T00:00:00.000Z' },
    now: '2026-07-14T12:00:00.000Z',
    engine_verdict_expected: 'open',
    adjudicated_status: 'open',
    adjudication_evidence: 'Documented adjudication class (loop-evidence-collectors retro): loop fired but closure edge is months stale — running-but-not-closing is OPEN.',
  },
  {
    case_id: 'CP-004-known-bad-liveness-only-false-close',
    synthetic: false,
    known_bad: true,
    loop: { loop_key: 'L30', predicate_type: 'edge_freshness', closure_predicate: { window_seconds: 30 * 86400 } },
    // The naive collector fed the reaper's OWN run timestamp in as the closure
    // edge ("the reaper ran, so the loop closed") — liveness masquerading as
    // closure. The engine, given that evidence, says CLOSED; adjudicated truth
    // is OPEN (the backlog showed no measured decline).
    evidence: { upstreamFiredAt: '2026-07-14T06:00:00.000Z', edgeAt: '2026-07-14T06:00:00.000Z' },
    now: '2026-07-14T12:00:00.000Z',
    engine_verdict_expected: 'closed',
    adjudicated_status: 'open',
    adjudication_evidence: 'FALSE-CLOSE known-bad (loop-evidence-collectors retro; LIVENESS≠CLOSURE doctrine, vision loop-map L-META): liveness-only "reaper ran" evidence closes the loop under the naive predicate while the measured backlog never declined. GT-1 golden regression in session-coordination-retention.test.js pins the same class.',
  },
];

/**
 * leo_protocol_sections — 2 REAL adjudicated cases exist (both known-bad folklore
 * later corrected), which is BELOW the >=3 floor → class ships EXPERIMENTAL with
 * honestly-labeled synthetic fill. Shape: a section-change record with an
 * adjudicated good/bad label; replay here is hash/label-based (no engine).
 */
const PROTOCOL_SECTION_CASES = [
  {
    case_id: 'PS-001-bypass-quota-folklore',
    synthetic: false,
    known_bad: true,
    section_change: {
      section_ref: 'session_prologue rule 4 (USE PROCESS SCRIPTS)',
      change_description: 'Section content stated a generic "3/SD + 10/day" bypass quota as the cap on the generic handoff bypass path.',
    },
    adjudicated_label: 'bad',
    adjudication_evidence: 'Corrected per build-vs-run deep-dive D9 (2026-07-12): the 3/SD + 10/day counter is the grill-convergence gate\'s purpose-built counter only; the generic path is audit-logged with a 2000/day global cap and no per-SD cap. Folklore-as-content misdirected sessions for weeks; correction memorialized in the live prologue rule 4.',
  },
  {
    case_id: 'PS-002-repo-path-columns-folklore',
    synthetic: false,
    known_bad: true,
    section_change: {
      section_ref: 'sub-agent evidence guidance (prologue rule 11 neighborhood)',
      change_description: 'Guidance instructed sub-agents to store top-level repo_path/local_path columns on sub_agent_execution_results.',
    },
    adjudicated_label: 'bad',
    adjudication_evidence: 'RCA 9d33b954 / commit bbe5451d (PROTOCOL_PROCESS guidance-vs-columns drift): those columns do not exist; following the guidance produced malformed evidence the SUB_AGENT_REPO_RESOLUTION gate cannot read. Canonical contract is metadata.repo_path via applySubAgentRepoVerdict.',
  },
  {
    case_id: 'PS-003-syn-good-adds-why-rationale',
    synthetic: true,
    known_bad: false,
    section_change: {
      section_ref: 'synthetic: any enforcement section',
      change_description: 'Adds a "> Why:" rationale line under a bare rule, citing the concrete failure the rule prevents; changes no normative content.',
    },
    adjudicated_label: 'good',
    adjudication_evidence: 'SYNTHESIZED fixture (pipeline exercise only — never satisfies GT-REPLAY). Models the documented good pattern: every prologue rule carries its why.',
  },
  {
    case_id: 'PS-004-syn-bad-deletes-pause-enumeration',
    synthetic: true,
    known_bad: true,
    section_change: {
      section_ref: 'synthetic: Canonical Pause Points',
      change_description: 'Replaces the enumerated five-point pause list with "pause whenever a stop seems prudent — use judgment".',
    },
    adjudicated_label: 'bad',
    adjudication_evidence: 'SYNTHESIZED fixture (pipeline exercise only). Models the documented bad class: replacing a literal enumerated contract with judgment language reopens the confirmation-fishing failure mode the enumeration exists to kill.',
  },
  {
    case_id: 'PS-005-syn-bad-contradicts-sibling-section',
    synthetic: true,
    known_bad: true,
    section_change: {
      section_ref: 'synthetic: any phase file',
      change_description: 'Adds a rule to CLAUDE_EXEC content that contradicts the SD Continuation Truth Table without deferring to it.',
    },
    adjudicated_label: 'bad',
    adjudication_evidence: 'SYNTHESIZED fixture (pipeline exercise only). Models the documented conflict class the truth-table canonicality clause exists to resolve.',
  },
];

/** Corpus registry keyed by artifact class. */
export const EVAL_SET_CORPORA = Object.freeze({
  closure_predicates: CLOSURE_PREDICATE_CASES,
  leo_protocol_sections: PROTOCOL_SECTION_CASES,
});
