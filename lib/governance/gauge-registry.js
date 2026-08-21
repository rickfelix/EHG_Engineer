/**
 * Invariant Gauges Registry (SD-LEO-INFRA-INVARIANT-GAUGES-FRAMEWORK-001)
 *
 * A shared registry of silent-drift invariants, replacing the bespoke-one-off-gauge pattern
 * (e.g. scripts/gauge-unranked-claimable-leaves.mjs) with ONE runner (scripts/gauge-runner.mjs)
 * that executes every ENABLED entry on a cadence. Mirrors lib/governance/guardrail-registry.js's
 * shape (an array of objects carrying a function reference) rather than a DB table -- a table
 * cannot cleanly hold a `detectorFn` reference, and this is fundamentally code-config, not data.
 *
 * STUB-ROW ADOPTION CONTRACT: an invariant whose detector doesn't exist yet (its own SD hasn't
 * shipped) registers here as a STUB: `detectorFn: null, enabled: false`. This reserves the
 * registry slot and documents the owner/remediation/prevent story WITHOUT depending on the
 * sibling SD shipping first (no build-order deadlock). When the sibling SD ships its detector,
 * adoption is TWO ADDITIVE edits, neither structural: (1) in THIS file, set `detectorFn` to the
 * new string key and flip `enabled: true`; (2) in scripts/gauge-runner.mjs's
 * buildDetectorResolvers(), add one new `'<key>': async () => {...}` entry mapping that string key
 * to the real detector call. The runner's alerting/heartbeat/budget/skip-on-missing-resolver
 * machinery is untouched either way -- a half-adopted stub (registry flipped, resolver not yet
 * added) is skipped non-fatally, never breaks a run.
 *
 * Entry shape:
 *   id            — stable slug, used in GAUGE lines and findings
 *   name          — human-readable label
 *   detectorFn    — a STRING KEY resolved by gauge-runner.mjs's buildDetectorResolvers() map, so
 *                   the registry stays a plain, inspectable/serializable data structure rather than
 *                   embedding live function references, or `null` for a stub entry with no detector
 *                   yet.
 *   thresholdConfig — { tripWhen: (result) => boolean } — when true, the runner routes a finding
 *   ownerRole     — who a tripped finding is routed to (adam | solomon | coordinator | chairman)
 *   remediation   — what to do when this invariant fires
 *   prevent       — the durable fix that would retire this gauge entirely
 *   enabled       — false for stub entries
 *   tracesToLayer — 'L1'|'L2'|'L3'|null (SD-LEO-INFRA-REWARD-SPINE-ONE-001-C). Per THE RULE in
 *                   docs/architecture/reward-spine-ssot.md, anything that gates/routes behavior
 *                   must trace to a real outcome layer; process gauges are diagnostics only. Most
 *                   entries here are role/plumbing/session-hygiene invariants (not outcome traces)
 *                   and are correctly `null` -- they detect a hard boundary violation or pipeline
 *                   defect directly, not a Goodhart-able proxy score. A non-null value means the
 *                   gauge reads a genuine L1/L2/L3 carrier (e.g. loop-health-* reads
 *                   v_improvement_ledger, the L2 carrier named in the spine doc).
 */

// SD-LEO-INFRA-009-LEAF-PER-001 (C-009 leaf 3): LOOP_IDS is imported (not re-declared) so the
// registry's 6 per-loop entries can never drift from per-loop-health-gauges.js's own loop list --
// this is a plain string-array import, not a live detectorFn reference, so it doesn't compromise
// the file's serializable-data-structure shape.
import { LOOP_IDS as PER_LOOP_HEALTH_LOOP_IDS } from './per-loop-health-gauges.js';

export const GAUGE_REGISTRY = [
  {
    id: 'unranked-claimable-leaves',
    name: 'Unranked claimable leaf SDs',
    detectorFn: 'unranked-claimable-leaves',
    thresholdConfig: { tripWhen: (result) => (result?.count || 0) > 0 },
    ownerRole: 'coordinator',
    remediation: 'Run node scripts/coordinator-backlog-rank.mjs to re-rank the flagged leaf SD(s).',
    prevent: 'SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001 (rank-on-transition + periodic cron + worker-checkin pool-window fix) should make this gauge permanently 0; a non-zero reading is a regression in that belt-and-suspenders.',
    enabled: true,
    tracesToLayer: null,
  },
  {
    id: 'relay-drop',
    name: 'Un-actioned relay/decision/review request',
    detectorFn: 'relay-drop',
    thresholdConfig: { tripWhen: (result) => (result?.count || 0) > 0 },
    ownerRole: 'coordinator',
    remediation: 'Relay the stranded request to its intended peer and post a confirm-back referencing it.',
    prevent: 'SD-LEO-INFRA-RELAY-QUEUE-CONFIRM-ON-RELAY-DELIVERY-GUARANTEE-001 FR-3 (tracked relay-request queue + mandatory confirm-on-relay).',
    enabled: true,
    tracesToLayer: null,
  },
  {
    id: 'stale-tree',
    name: 'Singleton session running a stale (behind-N) working tree',
    detectorFn: 'stale-tree',
    thresholdConfig: { tripWhen: (result) => (result?.count || 0) > 0 },
    ownerRole: 'chairman',
    remediation: 'Supervised relaunch of the stale singleton session on a current working tree.',
    prevent: 'SD-LEO-INFRA-SINGLETON-STALE-TREE-STALENESS-GAUGE-001 FR-1 (behind-N staleness gauge on singleton startup + periodic tick).',
    enabled: true,
    tracesToLayer: null,
  },
  {
    id: 'fw3-cmv-rejecter-fake-separation',
    name: 'FW-3 CMV-rejecter reject-rate ~0 over sufficient sample (fake separation / structural deference)',
    detectorFn: 'fw3-cmv-rejecter-fake-separation',
    thresholdConfig: { tripWhen: (result) => (result?.count || 0) > 0 },
    ownerRole: 'coordinator',
    remediation: 'The independent adversarial CMV-rejecter is approving everything: sample >= FW3_REJECTER_MIN_SAMPLE instrument framings verdicted with rejectRate <= FW3_REJECTER_EPSILON means the proposer/rejecter separation is fake (structural deference to the bigger brain — design fw3 §3). Audit recent payload.cmv_rejecter verdicts and grounds; confirm the rejecter session is genuinely separate and genuinely adversarial.',
    prevent: 'SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-D — this gauge IS the durable detection for the CONST-002 proposer-certifies-itself class; small samples never trip (design §7.1), so pre-Child-A silence is benign zero-sample, visible in the result sample field.',
    enabled: true,
    tracesToLayer: null,
  },
  {
    id: 'ship-witness-unwitnessed-merge',
    name: 'Platform-repo merge with zero merge_witness_telemetry row (WATCH-HOLE)',
    detectorFn: 'ship-witness-unwitnessed-merge',
    thresholdConfig: { tripWhen: (result) => (result?.count || 0) > 0 },
    ownerRole: 'coordinator',
    remediation: 'A merge landed with observe skipped entirely (not just recorded-and-allowed) — escalate immediately per the WATCH-HOLE contract; identify which merge lane bypassed telemetry writing and file a fix.',
    prevent: 'SD-LEO-INFRA-SHIP-WITNESS-ENFORCE-001 (Ship-witness D) — this gauge itself is the durable detection; a genuine fix retires individual watch-holes as merge lanes finish migrating to mergeWork(), not this gauge.',
    enabled: true,
    tracesToLayer: 'L1',
  },
  {
    id: 'coordinator-sourced-sd',
    name: 'SD sourced by the coordinator role (work-boundary breach)',
    detectorFn: 'coordinator-sourced-sd',
    thresholdConfig: { tripWhen: (result) => (result?.count || 0) > 0 },
    ownerRole: 'coordinator',
    remediation: 'Coordinator must never author/source an SD row — re-route sourcing to Adam or the sourcing engine and correct metadata.sourced_by on the flagged row(s).',
    prevent: 'SD-LEO-INFRA-009-LEAF-WORK-001 (C-009 leaf 5) — this gauge itself is the durable detection of the coordinator-never-sources boundary.',
    enabled: true,
    tracesToLayer: null,
  },
  {
    id: 'adam-claimed-or-built-sd',
    name: 'SD claimed/built by the Adam role (work-boundary breach)',
    detectorFn: 'adam-claimed-or-built-sd',
    thresholdConfig: { tripWhen: (result) => (result?.count || 0) > 0 },
    ownerRole: 'coordinator',
    remediation: 'Adam must never claim/build an SD — release the claim and route the SD back to the worker fleet.',
    prevent: 'SD-LEO-INFRA-009-LEAF-WORK-001 (C-009 leaf 5) — this gauge itself is the durable detection of the Adam-never-claims/builds boundary.',
    enabled: true,
    tracesToLayer: null,
  },
  {
    id: 'solomon-dispatched-sd',
    name: 'SD dispatch-ranked by the Solomon role (work-boundary breach)',
    detectorFn: 'solomon-dispatched-sd',
    thresholdConfig: { tripWhen: (result) => (result?.count || 0) > 0 },
    ownerRole: 'coordinator',
    remediation: 'Solomon must never set dispatch_rank — the coordinator owns dispatch; correct the flagged row(s) and re-check Solomon\'s tooling for an unintended dispatch write path.',
    prevent: 'SD-LEO-INFRA-009-LEAF-WORK-001 (C-009 leaf 5) — this gauge itself is the durable detection of the Solomon-never-dispatches boundary.',
    enabled: true,
    tracesToLayer: null,
  },
  {
    id: 'venture-capture-completeness',
    name: 'Venture per-stage capture-forward completeness (collect-without-promote, SD-LEO-INFRA-CAPTURE-FORWARD-GATE-001)',
    detectorFn: 'venture-capture-completeness',
    thresholdConfig: { tripWhen: (result) => (result?.count || 0) > 0 },
    ownerRole: 'coordinator',
    remediation: 'Run node scripts/capture-forward-venture.mjs --venture <id> --from <n> --to <n> to backfill the missing per-stage capture(s) for the flagged venture(s).',
    prevent: 'SD-LEO-INFRA-CAPTURE-FORWARD-GATE-001 FR-1\'s forward hook in lib/eva/workers/stage-advance-worker.js should make this gauge permanently 0 for any venture advancing through the normal auto-advance path; a non-zero reading flags a venture whose stages advanced by some OTHER path (manual override, chairman gate) that bypassed the hook.',
    enabled: true,
    tracesToLayer: 'L3',
  },
  {
    id: 'recursion-governor-ratio',
    name: 'Sustained meta-to-product throughput breach (chairman taper rule)',
    detectorFn: 'recursion-governor-ratio',
    thresholdConfig: { tripWhen: (result) => (result?.count || 0) > 0 },
    ownerRole: 'chairman',
    remediation: 'Self-improvement (meta) throughput has sustainably outpaced product throughput — review the belt for over-indexing on harness/infra work vs shippable product SDs and taper meta-work back toward the declared band.',
    prevent: 'SD-LEO-INFRA-009-LEAF-RECURSION-001 (C-009 leaf 4) — this gauge itself is the durable, KPI-owned detection of the taper rule; a genuine fix is sustained discipline in SD selection, not this gauge.',
    enabled: true,
    tracesToLayer: null,
  },
  ...PER_LOOP_HEALTH_LOOP_IDS.map((loopId) => ({
    id: `loop-health-${loopId}`,
    name: `Per-loop health KPIs (witnesses-before-prevention + recurrence-after-closure): ${loopId}`,
    detectorFn: `loop-health-${loopId}`,
    thresholdConfig: { tripWhen: (result) => (result?.count || 0) > 0 },
    ownerRole: 'coordinator',
    remediation: 'Investigate the un-prevented RECORD backlog (witnessesBeforePrevention) or reopened-after-closure cycles (recurrenceAfterClosure) for this loop via v_improvement_ledger; escalate to leaf-2 (FORMALIZE) enforcement review if sustained.',
    prevent: 'SD-LEO-INFRA-009-LEAF-PER-001 (C-009 leaf 3) — this gauge itself is the durable, per-loop health measurement; SD-LEO-INFRA-009-LEAF-FORMALIZE-001 (leaf 2) consumes these readings to set enforcement thresholds.',
    enabled: true,
    tracesToLayer: 'L2',
  })),
  // SD-LEO-INFRA-ROLE-RUBRIC-SCORE-001 FR-4: one entry per role, each delegating to the SAME
  // shared staleSelfScoreDetector(category, cadenceHours) factory in gauge-runner.mjs. All three
  // ship `enabled: false` alongside their writers' own default-OFF cadence flags
  // (ADAM_SELF_SCORE_CADENCE / COORD_SELF_SCORE_V1 / SOLOMON_SELF_SCORE_CADENCE) — flipping a gauge
  // on before its writer is live would permanently trip against an intentionally-inert loop. Flip
  // both together in the live-enablement follow-up.
  {
    id: 'expired-premise-tags',
    name: 'REVISIT-IF workaround tag with an expired/orphaned/malformed premise',
    detectorFn: 'expired-premise-tags',
    thresholdConfig: { tripWhen: (result) => (result?.count || 0) > 0 },
    ownerRole: 'coordinator',
    remediation: 'A tagged workaround\'s premise lapsed (expires= date passed), its anchor code vanished (orphaned), or the tag is malformed — open the tag\'s provenance SD/QF, decide remove-or-renew, and either delete the workaround or restamp with a new NAMED trigger. Grammar + tag inventory: docs/reference/bitter-lesson-ledger.md.',
    prevent: 'SD-LEO-INFRA-BITTER-LESSON-AUDIT-001 — this gauge itself is the durable detection; workarounds stop breaking silently only while every new workaround lands with a REVISIT-IF tag (enforced culturally at review, inventoried by the audit script).',
    enabled: true,
    tracesToLayer: null,
  },
  {
    id: 'adam_self_score_age',
    name: 'Adam self-assessment score gone stale or missing',
    detectorFn: 'adam-self-score-age',
    thresholdConfig: { tripWhen: (result) => (result?.count || 0) > 0 },
    ownerRole: 'adam',
    remediation: 'Confirm ADAM_SELF_SCORE_CADENCE is on and node scripts/adam-self-assessment-writer.cjs is firing on cadence; check the fail-open catch path for a swallowed error.',
    prevent: 'This gauge itself is the durable lapsed-self-score detector.',
    enabled: false,
    tracesToLayer: null,
  },
  {
    id: 'coordinator_self_score_age',
    name: 'Coordinator self-assessment score gone stale or missing',
    detectorFn: 'coordinator-self-score-age',
    thresholdConfig: { tripWhen: (result) => (result?.count || 0) > 0 },
    ownerRole: 'coordinator',
    remediation: 'Confirm COORD_SELF_SCORE_V1 is on and scripts/coordinator-self-review.mjs is reaching its DUE branch (COORD_REVIEW_EVERY completed SDs).',
    prevent: 'This gauge itself is the durable lapsed-self-score detector.',
    enabled: false,
    tracesToLayer: null,
  },
  {
    id: 'solomon_self_score_age',
    name: 'Solomon self-assessment score gone stale or missing',
    detectorFn: 'solomon-self-score-age',
    thresholdConfig: { tripWhen: (result) => (result?.count || 0) > 0 },
    ownerRole: 'solomon',
    remediation: 'Confirm SOLOMON_SELF_SCORE_CADENCE is on and the deep-sweep tick is invoking node scripts/solomon-self-assessment-writer.cjs.',
    prevent: 'This gauge itself is the durable lapsed-self-score detector.',
    enabled: false,
    tracesToLayer: null,
  },
  {
    id: 'operator-cash-attestation-missing',
    name: 'Distance-to-broke gauge dark for lack of a cash attestation (QF-20260705-915)',
    detectorFn: 'operator-cash-attestation-missing',
    thresholdConfig: { tripWhen: (result) => (result?.count || 0) > 0 },
    ownerRole: 'chairman',
    remediation: 'Run node scripts/operator/feed-operator-cash-burn.mjs --cash <current-cash-usd> to attest the current month\'s cash-on-hand; the distance-to-broke gauge lights up on the next read once cash_usd is live.',
    prevent: 'A one-time operator attestation; the substrate (lib/operator/cash-burn-substrate.js) and CLI are already built (SD-EHG-OPERATOR-RUNWAY-SUBSTRATE-001) -- this gauge itself is the durable "ask" so the activation is never silently forgotten again.',
    enabled: true,
    tracesToLayer: null,
  },
  // SD-LEO-INFRA-PLAN-DRIFT-GAUGE-001: Layer A (stamp-coverage, the starvation detector) ships
  // enabled now -- SD-LEO-INFRA-ROADMAP-FOLD-SEAM-001 (the wave-linkage substrate) already shipped
  // (PR #5925) before this SD reached LEAD, so there is no external gate to wait on.
  {
    id: 'plan-drift-coverage',
    name: 'Roadmap wave-linkage stamp coverage (starvation detector)',
    detectorFn: 'plan-drift-coverage',
    thresholdConfig: { tripWhen: (result) => Boolean(result?.starved) },
    ownerRole: 'coordinator',
    remediation: 'Coverage of claimable leaf SDs carrying roadmap wave linkage has fallen below the 80% floor -- run node scripts/coordinator-backlog-rank.mjs and check roadmap_wave_items for a starved promotion channel (mirrors the frozen-roadmap incident this gauge was built to detect).',
    prevent: 'SD-LEO-INFRA-ROADMAP-FOLD-SEAM-001 restores the promotion channel; this gauge is the durable, mechanical detection that it stays fed.',
    enabled: true,
    tracesToLayer: null,
  },
  // Layer B (dispatch-mix drift) ships as a STUB-ROW ADOPTION CONTRACT entry: detectorFn is wired
  // (not null) but the detector itself self-gates on LIVE coverage (reads Layer A) before computing
  // any drift -- a self-gating precondition rather than a manually-timed enabled flip, so it never
  // needs re-litigating if roadmap linkage starves again in the future.
  {
    id: 'plan-drift-mix',
    name: 'Dispatch-mix drift vs active-wave demand (self-gated on live coverage)',
    detectorFn: 'plan-drift-mix',
    thresholdConfig: { tripWhen: (result) => Boolean(result?.sustainedBreach) },
    ownerRole: 'coordinator',
    remediation: 'Sustained dispatch-mix drift from the active wave\'s demand across 2+ consecutive gauge-runner cycles -- review recent dispatch/claim history against the active wave\'s expected rung distribution.',
    prevent: 'Sustained discipline in dispatch ordering (coordinator-backlog-rank.mjs\'s active-rung-first ranking); this gauge is the durable, mechanical detection that dispatch is actually following the plan, not just capable of it.',
    enabled: true,
    tracesToLayer: null,
  },
  // SD-LEO-GEN-SATELLITE-AGENT-LIFECYCLE-001 (Satellite 3.6, phase b): wires
  // lib/agents/ghost-ceo-gauge.js into the shared runner rather than shipping it as an
  // unreachable library module. Zero agent_registry rows currently exist for
  // agent_type='venture_ceo', so this trips 0 today -- it activates automatically the moment a
  // venture CEO agent is provisioned without a corresponding liveness evidence source.
  // SD-LEO-INFRA-HOLD-STATE-CONTRACT-001 (FR-6): reuses this shared registry + gauge-runner.mjs's
  // existing cadence for the sweeper lane, rather than a standalone script that risks becoming a
  // registered-but-never-fired verifier. Scoped to the 3 surfaces where a passed review_at does
  // NOT self-resolve (sd_park, exec_boundary_hold, min_tier_rank) -- QF defer's not_before already
  // self-releases claimability, so it is deliberately excluded (see lib/governance/hold-state-sweep.js).
  {
    id: 'hold-state-overdue',
    name: 'Hold/fence/floor whose review_at has passed (sd_park, exec_boundary_hold, min_tier_rank)',
    detectorFn: 'hold-state-overdue',
    thresholdConfig: { tripWhen: (result) => (result?.count || 0) > 0 },
    ownerRole: 'coordinator',
    remediation: 'Review each flagged hold: confirm it is still intentional (refresh review_at + release_condition) or resolve it (unpark the SD, clear exec_boundary_hold, or re-stamp the min_tier_rank floor).',
    prevent: 'SD-LEO-INFRA-HOLD-STATE-CONTRACT-001 — this gauge itself is the durable detection that a stale hold surfaces within one sweep cycle instead of relying on manual diagnosis (the ApexNiche incident this SD generalizes from).',
    enabled: true,
    tracesToLayer: null,
  },
  {
    id: 'ghost-ceo',
    name: 'Ghost venture-CEO agents (status=active, no liveness evidence)',
    detectorFn: 'ghost-ceo',
    thresholdConfig: { tripWhen: (result) => result?.status === 'GHOSTS_FOUND' },
    ownerRole: 'coordinator',
    remediation: 'Investigate the flagged venture_ceo agent_registry row(s): confirm real liveness evidence exists (e.g. a live EVA orchestrator heartbeat) or correct the row\'s status to reflect its actual dormant state.',
    prevent: 'A future SD wiring a real livenessEvidenceProvider (per docs/audits/venture-ceo-factory-reachability-verdict.json\'s BUILD-ON path) would let this gauge distinguish genuinely-live CEOs from stale status rows automatically, rather than flagging every active row by default.',
    enabled: true,
    tracesToLayer: null,
  },
];

/**
 * DRAIN DESCRIPTORS (SD-LEO-INFRA-DETECTOR-OUTPUT-DRAIN-001)
 *
 * GAUGE_REGISTRY answers "who owns a TRIP". This answers "who drains the ROW it wrote" — a
 * different question, and the one nobody was asking. The seam is visible in this very file:
 * `relay-drop` is a registered entry WITH an ownerRole, yet its output (feedback
 * category=relay_drop) sat at 11 rows, all status=new, undrained since 2026-07-19. Registration
 * is not drainage.
 *
 * WHY A SIBLING MAP RATHER THAN FIELDS ON GAUGE_REGISTRY ENTRIES: most detectors that write
 * durable output are not gauges at all, and a drain-only SINK has no detectorFn — putting these
 * on entries would break this file's own non-null-detectorFn invariant, its entry count and its
 * enabled-id list. Keeping it a sibling export in the SAME FILE satisfies "no new registry"
 * while letting a descriptor exist for a sink that has no detector.
 *
 * Descriptor fields:
 *   consumer            WHO drains this. Absent => NO_CONSUMER (a FINDING, never a blank cell).
 *   closingPath         the concrete terminal transition. Absent => NO_CLOSING_PATH (HARDENING 1:
 *                       a queue with no expressible DONE can only grow).
 *   predicate           what counts as OWED vs merely DELIVERED — named on the row, because a raw
 *                       unacked count and an answer-owed count are DIFFERENT POPULATIONS and two
 *                       honest parties reading the same table will otherwise disagree forever.
 *   shapeContract       the field the READER keys on, so a writer/reader disagreement is
 *                       detectable rather than silently producing a confident wrong number.
 *   accumulationSignal  the alarm on the SERIES, distinct from the per-event signal — some
 *                       failures are individually correct and only visible in aggregate.
 *   fieldQuestion       what the field ACTUALLY answers vs what its consumers assume it answers.
 *   measuredBy          for work whose value leaves no artifact: the DIFFERENT instrument, or an
 *                       EXISTING terminal signal. NEVER a manufactured artifact.
 *   timestampSkew       declared when the source stores naive timestamps (age reads ~4h YOUNGER,
 *                       i.e. in the alarm-SUPPRESSING direction).
 */
export const DRAIN_DESCRIPTORS = Object.freeze({
  'relay-drop': {
    source: { kind: 'feedback_category', category: 'relay_drop' },
    predicate: 'feedback rows with category=relay_drop and status in (new, triaged)',
    fieldQuestion: 'Answers "did a relay/decision/review request go un-actioned", which IS what its consumers assume.',
    // consumer/closingPath deliberately ABSENT — this is the finding. The gauge writes the row and
    // nothing reads it: grepping relay_drop repo-wide matches only the writer.
    evidence: 'Writer scripts/coordinator-relay-drop-gauge.cjs:56. 11 rows, all status=new, oldest 2026-07-19, zero readers. Registered as a gauge with ownerRole=coordinator and still undrained — the worked example that registration is not drainage.',
  },
  'wind-down-survey': {
    // SD-LEO-INFRA-WIND-DOWN-SURVEY-001 (FR-1): relocated OUT of feedback entirely. QF-20260803-503
    // + QF-20260802-966 fixed the STATUS-based human-triage-lane flood (self-resolving writes,
    // backlog disposition), but the category still dominated raw feedback inflow (68.4% of 24h
    // inflow, 14,122 total rows, measured 2026-08-21) with zero readers — so it now writes to a
    // dedicated, unread table instead of a 4th per-consumer exclusion list on the shared table.
    source: { kind: 'table', table: 'worker_wind_down_events' },
    predicate: 'worker_wind_down_events rows (one per worker Stop-hook firing; query by session_id/reason/created_at for the distribution)',
    fieldQuestion: 'Answers "why did a worker stop", intended to feed fleet-attrition analysis.',
    evidence: 'Writer scripts/hooks/stop-loop-wakeup-reminder.cjs recordWindDown() (c) block. Table is chairman-gated (database/migrations/20260821_worker_wind_down_events.sql) — TIER-2 due to required RLS+REVOKE+GRANT posture, staged not self-applied. The historical feedback(category=wind_down_survey) backlog (14,122 rows as of 2026-08-21) was archived into retention_archive then purged (FR-2). A regression trip-wire (lib/governance/wind-down-recurrence-guard.js) alarms if feedback.category=wind_down_survey inflow ever fails to decline vs. its ship-time baseline (206/24h), catching a reintroduction of the old write path. Still no dedicated reader of worker_wind_down_events itself as of this writing — write-only sink, same as before, just relocated.',
  },
  'adam-adherence-drift': {
    source: { kind: 'feedback_category', category: 'adam_adherence_drift' },
    consumer: 'feedback-sla-gauge (counts it) — but see closingPath',
    predicate: 'feedback rows with category=adam_adherence_drift and status in (new, triaged)',
    fieldQuestion: 'Answers "did Adam drift from a duty", the remediation half of the self-improving governance loop.',
    // No closingPath: the SLA gauge's only response is to write ANOTHER feedback row
    // (feedback_sla_breach) which is itself undrained. A reminder is not a drain.
    evidence: 'Writer scripts/adam-self-adherence-review.mjs:34. 72 of 78 rows undrained, oldest 2026-06-21 — five weeks. Counted by feedback-sla-gauge but nothing resolves a row.',
  },
  'adam-adherence-ledger': {
    source: { kind: 'table', table: 'adam_adherence_ledger' },
    consumer: 'lib/vision/rung-health-convergence.mjs:126 (catch-rate trend)',
    predicate: 'ledger rows with verdict=fail',
    fieldQuestion: 'Answers "was a duty met on this probe run" — but consumers read it as "is Adam adhering now", which an append-only ledger cannot answer.',
    accumulationSignal: 'MISSING — the table only grows; scripts/adam-self-adherence-review.mjs:248 independently flags unbounded accumulation with no pruning.',
    // closingPath ABSENT and that is structural, not an oversight: the table has NO status column
    // at all (run_id/probe/duty/verdict/detail/remediation_ref/created_at), so a verdict=fail row
    // can never be marked addressed. This entry FAILS the inventory by design — HARDENING 1.
    evidence: 'A consumer EXISTS, which is exactly why this matters: a named consumer is not sufficient when the table cannot express DONE. 1,333 rows and still writing.',
  },
  'solomon-advice-outcome-ledger': {
    source: { kind: 'table', table: 'solomon_advice_outcome_ledger' },
    consumer: 'scripts/solomon-ledger-pending-resurface.cjs (72h resurface, cron-wired) + solomon-ledger-reconcile.cjs',
    closingPath: 'decision column: pending -> accepted|rejected|partial',
    predicate: 'ledger rows with decision=pending',
    shapeContract: 'The reconciler keys on outcome_sd_key; advisories that produce no downstream SD have NO outcome path BY DESIGN, not merely unrecorded.',
    accumulationSignal: 'Resurface digest past OPERATING_THRESHOLD_HOURS=72.',
    fieldQuestion: 'decision answers "did the recipient act on this advice". Distinct from outcome, which answers "did it work" — 79 rows have closed_at with outcome=unknown and 16 the reverse, so the two closed-signals disagree on 95 of 895 rows.',
    evidence: 'The MODEL entry: real terminal column plus a real staleness gauge on the drain. Included so the inventory demonstrably discriminates rather than failing everything.',
  },
  'quick-fixes-stranded': {
    source: { kind: 'table', table: 'quick_fixes' },
    predicate: 'quick_fixes with status=in_progress AND claiming_session_id IS NULL — invisible to the open queue AND uncounted as done',
    fieldQuestion: 'status answers "did a worker finish their task". Every consumer reads it as "did the system change" — a narrower question than assumed.',
    timestampSkew: 'quick_fixes stores naive timestamp; JS age reads ~4h YOUNGER (alarm-suppressing). SD-LEO-INFRA-NAIVE-TIMESTAMP-SKEW-001.',
    // consumer ABSENT: the apparent owner structurally excludes this population.
    evidence: 'scripts/orphan-qf-reaper.mjs:229 requires .not(claiming_session_id,is,null), so it reconciles the OPPOSITE population. Nothing owns the stranded state. Only artifact is a manual one-off script.',
  },
  'roadmap-link-exception': {
    source: { kind: 'sd_metadata', key: 'roadmap_link_exception' },
    consumer: 'scripts/adam-coordinator-health.mjs:112 (countRoadmapLinkExceptionsLive)',
    closingPath: 'without_reason -> with_reason via the canonical builder',
    predicate: 'exceptions where reason_supplied !== true',
    shapeContract: 'buildRoadmapLinkException emits {sd_key, operator_reason, reason_supplied, recorded_at}; countRoadmapLinkExceptions tests reason_supplied === true STRICTLY. A hand-authored {reason, recorded_by} row counts as without-reason no matter how good the reason.',
    accumulationSignal: 'MISSING — point-in-time count only, no oldest-unresolved age.',
    fieldQuestion: 'Answers "was a reason supplied THROUGH THE CANONICAL BUILDER", not "was a reason supplied".',
    evidence: 'The writer/reader shape-disagreement variant: drains fine and reports a confident WRONG number. More dangerous than an undrained queue because it looks healthy and precise, and both parties are correct inside their own frame.',
  },
  'worktree-reaper-refusals': {
    source: { kind: 'artifact', path: '.claude/worktree-reaper-state.json' },
    predicate: 'consecutive_refusals > 0 on a git-ignored local JSON file',
    accumulationSignal: 'PRESENT but undrained — the counter exists and logs a BACKLOG line; nothing consumes it.',
    fieldQuestion: 'Answers "how many consecutive ticks refused to reclaim". Each refusal is individually CORRECT, so a per-event review finds nothing wrong — only the series exposes the outage.',
    // No closingPath: durable output that is not even in the database, so no DB-querying sweep can
    // inventory it. Not a consumer gap that can be filled by naming someone.
    evidence: 'QF-20260726-794 shipped this counter as the remedy for the aggregate-only class; writer worktree-reaper-tick.cjs:285, its only invoker ignores the return value. The remedy shape shipped and immediately became a fresh instance. Pool reached 31/28 after ~21 individually-correct refusals.',
  },
  'invariant-gauge-finding': {
    source: { kind: 'feedback_category', category: 'invariant_gauge_finding' },
    consumer: 'gauge_finding_dispositions (the designed drain)',
    closingPath: 'a gauge_finding_dispositions row per finding',
    // Declared so the CLI PROBES the path instead of assuming it works. Without this the entry
    // rendered as PASS despite thousands of outstanding findings and zero dispositions.
    closingPathTable: 'gauge_finding_dispositions',
    predicate: 'feedback rows with category=invariant_gauge_finding and status in (new, triaged)',
    fieldQuestion: 'Answers "did a registered invariant trip". Consumers assume a tripped invariant gets dispositioned.',
    // The closing path EXISTS and has NEVER been used — a state distinct from both healthy and
    // missing, which is why CLOSING_PATH_UNEXERCISED is its own verdict.
    evidence: 'Written by scripts/gauge-runner.mjs:437 routeFinding — the gauge runner\'s OWN output. 4,235 of 4,235 undrained; gauge_finding_dispositions is live with ZERO rows ever written. The largest single undrained category in the database.',
  },
  'feedback-sla-breach': {
    source: { kind: 'feedback_category', category: 'feedback_sla_breach' },
    predicate: 'feedback rows with category=feedback_sla_breach and status in (new, triaged)',
    fieldQuestion: 'Answers "did another feedback category breach its SLA" — an alarm about undrained rows.',
    evidence: 'The alarm about undrained queues is ITSELF undrained: 54 rows, oldest 23 days. Written by lib/coordinator/feedback-sla-gauge.cjs when a category breaches; no reader.',
  },
  'index-jam-detector': {
    source: { kind: 'process_exit', script: 'scripts/cron/index-jam-detector.mjs' },
    consumer: 'the scheduled cron tick itself — a non-zero exit is the alarm, surfaced where the scheduler reports',
    closingPath: 'the jam clears (lock released or removed by a human) and the next tick reports HEALTHY, resetting the persistence counter',
    predicate: 'A SINGLE lock identity (mtimeMs, ino) persisting past the dwell floor. OWED means a jam confirmed across ticks; merely DELIVERED means a lock was seen once, which is ordinary healthy git work.',
    shapeContract: 'The verdict is carried by the process EXIT CODE (JAMMED=1, HEALTHY=0, UNAVAILABLE=0) plus a named human-readable line. Any reader must key on the exit code, not parse the message.',
    accumulationSignal: 'Persistence across ticks IS the signal — a single observation is deliberately never actionable, because a lock present at one tick is normal.',
    fieldQuestion: 'Answers "is this tree index writable RIGHT NOW", which is the question a blocked seat actually has. It deliberately does NOT answer "does a lock exist" — measured: a live healthy git add holds a zero-byte lock for its whole duration, so lock presence is a false signal.',
    // SD-LEO-INFRA-JAMMED-GIT-INDEX-001. Registered here so this detector cannot become the thing
    // its sibling SD exists to find: a detector whose output nobody drains.
    //
    // THREE SCOPE BOUNDARIES, stated rather than left implicit — each is a real way this reports
    // HEALTHY while something is wrong:
    //   1. LOCKLESS JAM (corrupt index, broken .git permissions, disk full) — it keys on lock
    //      presence, so there is nothing to observe. All six recorded incidents were stale-lock
    //      jams, so the narrowing is defensible.
    //   2. CHURN JAM — locks repeatedly appearing and clearing. Identity changes each time, so
    //      persistence never accumulates and it reads as healthy churn. Indistinguishable, by
    //      design, from the sustained healthy git activity TS-17a exists to protect.
    //   3. SUB-INTERVAL JAM — detection needs the SAME identity at two consecutive ticks, so the
    //      EFFECTIVE floor is max(dwell, 2 x tick). Any jam shorter than that is invisible.
    evidence: 'At least five jams on 2026-07-27 (one ~10h lock left the shared tree 46 commits behind origin), a sixth on 2026-07-26, class dating to 2026-06-14 (25h lock, 125 commits behind). Nothing detected any of them: the claim sweep and drain gauge read DB state, and the worktree reaper runs git worktree list --porcelain which never touches the index, so it kept SUCCEEDING throughout and reported git healthy.',
  },
  'solomon-consult-replies': {
    source: { kind: 'unkeyable' },
    measuredBy: 'Consult-reply catch rate, reviewed qualitatively against the routed-consult record — NOT a queue count and NOT an SD/QF row.',
    fieldQuestion: 'There is no field. The work changes what someone ELSE sends, leaving no artifact to key on.',
    evidence: 'WORK WHOSE VALUE LEAVES NO ARTIFACT. Solomon consult replies ran 5-of-5 real catches on 2026-07-27 and produce no SD; the same is true of coordinator rulings, holds and retractions. If the inventory only catalogued queues it would conclude these lanes underperform — a measurement bug presenting as a productivity finding, aimed at the roles whose interventions changed the most outcomes. Forcing these to emit rows so a counter can see them is EXPLICITLY FORBIDDEN: it converts judgment work into paperwork and degrades the lane the measurement was meant to protect.',
  },
});
