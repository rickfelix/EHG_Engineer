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
];
