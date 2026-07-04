/**
 * Coordinator self-assessment RoleConfig — SD-LEO-INFRA-ROLE-RUBRIC-SCORE-001 FR-2.
 *
 * Dimensions per .claude/commands/coordinator.md "Coordinator self-review rubric" (~L839):
 * (1) worker utilization, (2) proactive sourcing, (3) conflict-free dispatch,
 * (4) identity + claim-state hygiene, (5) anticipate-not-just-self-correct.
 *
 * Only the first three have a reliable live signal available inside
 * scripts/coordinator-self-review.mjs's DUE branch today — the remaining two are left
 * INCONCLUSIVE (never fabricated), mirroring lib/adam/self-assessment.cjs's own honesty
 * convention (a dimension with no observable signal is omitted, not guessed).
 */

const DIMENSIONS = [
  'worker_utilization',
  'proactive_sourcing',
  'conflict_free_dispatch',
  'identity_claim_hygiene',
  'anticipate_not_self_correct',
];

const ACTION_HINTS = {
  worker_utilization: 'route claimable belt work to idle workers before the next tick; check WORK_ASSIGNMENT dispatch',
  proactive_sourcing: "source more belt candidates ahead of idle - keep a surplus, don't react only to visible idle",
  conflict_free_dispatch: "verify write-surface + live-worker checks before dispatching; investigate this cycle's solicit failures",
  identity_claim_hygiene: 'confirm coordinator pointer registration + heartbeat freshness',
  anticipate_not_self_correct: "anticipate gaps before Adam catches them; drive Adam's catch count toward zero",
};

const SCORERS = {
  // idle workers while the belt has claimable work = the documented failure mode
  worker_utilization: (s) => {
    if (s.idle_workers_with_claimable_work == null) {
      return { score: null, provenance: 'no idle-workers-with-claimable-work signal (inconclusive)' };
    }
    const n = s.idle_workers_with_claimable_work;
    const score = n === 0 ? 5 : n === 1 ? 3 : n === 2 ? 2 : 1;
    return {
      score,
      signal: `idle_workers_with_claimable_work=${n}`,
      provenance: 'active worker sessions with no claim while the belt has claimable draft SDs',
      red_flag: n >= 3,
    };
  },
  // surplus belt depth = better proactive sourcing (same thresholds as Adam's D1)
  proactive_sourcing: (s) => {
    if (s.belt_depth == null) return { score: null, provenance: 'no belt_depth signal (inconclusive)' };
    const d = s.belt_depth;
    const score = d >= 8 ? 5 : d >= 5 ? 4 : d >= 3 ? 3 : d >= 1 ? 2 : 1;
    return { score, signal: `belt_depth=${d}`, provenance: 'unclaimed claimable draft SD count (surplus-belt check)' };
  },
  // this cycle's coordination-row dispatch failures as a conflict-free-dispatch proxy
  conflict_free_dispatch: (s) => {
    if (s.solicit_failed_count == null) return { score: null, provenance: 'no solicit_failed_count signal (inconclusive)' };
    const n = s.solicit_failed_count;
    const score = n === 0 ? 5 : n === 1 ? 4 : n <= 2 ? 3 : n <= 4 ? 2 : 1;
    return { score, signal: `solicit_failed_count=${n}`, provenance: "this cycle's coordination-row dispatch failures (conflict-free-dispatch proxy)" };
  },
  // no reliable live source yet -- left inconclusive rather than a fabricated constant pass
  identity_claim_hygiene: () => ({ score: null, provenance: 'no reliable live source yet (inconclusive, not a fabricated pass)' }),
  anticipate_not_self_correct: () => ({ score: null, provenance: "no reliable live source yet (Adam's catch trend not tracked here) - inconclusive" }),
};

export const COORDINATOR_CONFIG = {
  role: 'coordinator',
  dimensions: DIMENSIONS,
  scorers: SCORERS,
  actionHints: ACTION_HINTS,
  target: 4,
  belowThresholdAt: 2,
  generatedBy: 'coordinator-self-review',
};
