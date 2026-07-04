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
 */

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
  },
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
  },
];
