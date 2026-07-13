/**
 * Genesis backfill — L1-L33 (FR-2).
 * (SD-LEO-INFRA-UNIVERSAL-LOOP-GOVERNANCE-001)
 *
 * The ratified Vision Loop-Completeness Map (docs/design/ehg-vision-loop-completeness-map.md
 * @ f2b64a94 Rev1, committed on branch qf-736) IS the manifest. This seeds loop_registry
 * with the 33 mapped loops so the closure-verifier has a starting population — D8
 * self-registration only catches NEW loops. Idempotent (upsert on loop_key) and
 * FAIL-SOFT: tolerates the chairman-gated loop_registry table not yet being applied
 * (mirrors the venture_operating_burn writer), so shipping the code never hard-fails
 * pre-apply.
 *
 * Each loop gets a default closure predicate (edge_freshness / 30-day window) as a
 * placeholder that satisfies validateClosurePredicate; per-loop probes are refined as
 * each loop's closing SD lands.
 */
import { PREDICATE_TYPES } from './closure-engine.js';

const DEFAULT_PREDICATE = { window_seconds: 30 * 86400 };

/** L1-L33 manifest (loop_key, gap summary, closing SD if named, status). */
export const GENESIS_LOOPS = [
  { loop_key: 'L1', display_name: 'Org has no runtime — 8 org loops (WIRE-not-RETIRE)', closing_sd_key: 'SD-FDBK-ENH-EHG-OPERATING-COMPANY-001', status: 'open' },
  { loop_key: 'L2', display_name: 'buildChairmanBrief() zero callers (burn/runway/evidence sink)', status: 'open' },
  { loop_key: 'L3', display_name: 'Retro→QF→fix self-improvement (CLOSED-ARMED, fixed itself twice)', status: 'closed' },
  { loop_key: 'L4', display_name: 'Cross-venture capability transfer: supply side dead (MOAT)', status: 'open' },
  { loop_key: 'L5', display_name: 'Per-venture P&L: 4 breaks in series', closing_sd_key: 'SD-VENTURE-REVENUE-ATTRIBUTION-ARM-001', status: 'open' },
  { loop_key: 'L6', display_name: 'Chairman-exception feedback thin + unauthenticated', status: 'open' },
  { loop_key: 'L7', display_name: 'Vision-fidelity gate never executes (2142/2142 skipped)', status: 'open' },
  { loop_key: 'L8', display_name: 'Stage-gate code↔SSOT divergence (S23/24) + S19/25 silent-pass', status: 'open' },
  { loop_key: 'L9', display_name: 'Per-stage rework: stage_gate FAIL → no recovery call', status: 'open' },
  { loop_key: 'L10', display_name: 'Thesis-kill gauge dead (resolveObservedValue→undefined→HOLD)', status: 'open' },
  { loop_key: 'L11', display_name: 'Discovery-scheduling: no autonomous trigger (market-signal scanner)', status: 'open' },
  { loop_key: 'L12', display_name: 'Competitive-vigilance MISSING (all 3 links)', status: 'open' },
  { loop_key: 'L13', display_name: 'Expertise COMBINE armed-but-0-executions; RETIRE unimplemented', status: 'open' },
  { loop_key: 'L14', display_name: 'Customer-feedback→product: 2 edges missing', status: 'open' },
  { loop_key: 'L15', display_name: 'Support-intake mis-scoped to harness feedback table', status: 'open' },
  { loop_key: 'L16', display_name: 'Churn→win-back & delivery→renewal MISSING', status: 'open' },
  { loop_key: 'L17', display_name: 'MRR-deviation→Friday scorecard never invoked', status: 'open' },
  { loop_key: 'L18', display_name: 'Operator cash-burn consume-half dead', status: 'open' },
  { loop_key: 'L19', display_name: 'Budget-allocation per venture+phase MISSING', status: 'open' },
  { loop_key: 'L20', display_name: 'Decision-queue aging: fire-once, no decided_at, no re-nudge', status: 'open' },
  { loop_key: 'L21', display_name: 'Legal/compliance (S23) placeholder-advisory', status: 'open' },
  { loop_key: 'L22', display_name: 'Quality-lifecycle: finding→SD works, close-half absent', status: 'open' },
  { loop_key: 'L23', display_name: 'Brand loop permanent fail-closed (no comparator/claims_registry)', status: 'open' },
  { loop_key: 'L24', display_name: 'Evidence-fabric / observed-by / provenance capture dead', status: 'open' },
  { loop_key: 'L25', display_name: 'Telemetry→decision: conduit live, 100% skipped', status: 'open' },
  { loop_key: 'L26', display_name: 'Nomination-learning trigger absent', status: 'open' },
  { loop_key: 'L27', display_name: 'SPINE-G succession DB-completed ≠ shipped', status: 'open' },
  { loop_key: 'L28', display_name: 'Model-tier/cost-vs-capability human-driven, not closed', status: 'open' },
  { loop_key: 'L29', display_name: 'Harness CI-red→fix not autonomous (auto-triage OFF-by-default)', status: 'open' },
  { loop_key: 'L30', display_name: 'Harness retention-reaper (unbounded tables)', status: 'open' },
  { loop_key: 'L31', display_name: 'Harness RCA→CAPA edge partial', status: 'open' },
  { loop_key: 'L32', display_name: 'Harness sourcing-refill human-tended', status: 'open' },
  { loop_key: 'L33', display_name: 'Harness coordinator/fleet-lifecycle runs only in a human /loop', status: 'open' },
];

/**
 * Build a full loop_registry row from a manifest entry (adds the default predicate).
 * @param {Object} entry
 * @returns {Object}
 */
export function toLoopRow(entry) {
  return {
    loop_key: entry.loop_key,
    display_name: entry.display_name,
    predicate_type: PREDICATE_TYPES.EDGE_FRESHNESS,
    closure_predicate: DEFAULT_PREDICATE,
    closing_sd_key: entry.closing_sd_key || null,
    status: entry.status || 'unknown',
    status_reason: 'genesis backfill (loop-completeness map @ f2b64a94 Rev1)',
  };
}

/**
 * Idempotent, fail-soft genesis backfill. Upserts on loop_key so re-running does not
 * duplicate. Returns a summary; NEVER throws on a missing table (chairman-gated apply
 * pending) — reports { applied:false, reason } instead.
 *
 * @param {Object} supabase - service-role client
 * @returns {Promise<{applied:boolean, upserted:number, total:number, reason?:string}>}
 */
export async function backfillGenesisLoops(supabase) {
  const rows = GENESIS_LOOPS.map(toLoopRow);
  try {
    const { error } = await supabase.from('loop_registry').upsert(rows, { onConflict: 'loop_key' });
    if (error) {
      // Table absent (chairman-gated apply pending) or policy — fail soft.
      return { applied: false, upserted: 0, total: rows.length, reason: error.message };
    }
    return { applied: true, upserted: rows.length, total: rows.length };
  } catch (e) {
    return { applied: false, upserted: 0, total: rows.length, reason: (e && e.message) || String(e) };
  }
}
