/**
 * venture-build-merge-witness — OBSERVE-ONLY merge-witness for a venture-build leaf at completion.
 *
 * SD-LEO-INFRA-SHIP-WITNESS-VENTURE-001 (Ship-witness C). Reuses the Ship-witness A substrate
 * (lib/ship/merge-witness-ladder.mjs + merge-witness-telemetry.mjs, PR #5412): when the outer
 * tree-walker (venture-build-consumer.runConsume) reports a leaf driven to LEAD-FINAL-APPROVAL,
 * this helper records whether that leaf's PR actually merged (done=SHIPPED) — WITHOUT changing
 * control flow and WITHOUT advancing any stage. The fail-CLOSED flip (block completion on an
 * unmerged leaf) is a SEPARATE downstream SD (Ship-witness D, SD-LEO-INFRA-SHIP-WITNESS-ENFORCE-*);
 * this module NEVER blocks and NEVER returns anything the caller acts on for control flow.
 *
 * Fail-soft by design: the ENTIRE body is wrapped so nothing escapes into the walk. Every IO seam
 * (prLookup, verifyMerged, writeTelemetry, evaluateLadder, emitEvent) is injectable via `deps`,
 * each defaulting to the REAL implementation, so the witness is deterministically unit-testable
 * with NO live gh/DB.
 */
import { spawnSync } from 'node:child_process';
import { evaluateMergeWorkLadder } from '../../ship/merge-witness-ladder.mjs';
import { writeMergeWitnessTelemetry } from '../../ship/merge-witness-telemetry.mjs';
import { verifyMerged } from '../../ship/auto-merge.mjs';
// emitEvent is a hoisted `export async function` in the consumer, so this cyclic import is
// runtime-safe (the binding is live and only ever dereferenced at call time).
import { emitEvent } from './venture-build-consumer.js';
// Operator Contract fractal binding (SD-LEO-INFRA-OPERATOR-CONTRACT-GATE-001 FR-7):
// ventures inherit operate-by-default via the SAME shared validator (no duplicated
// logic). Observe-only advisory here — this seam is fail-soft telemetry, not a hard gate.
import { evaluateVentureOperatorContract } from '../../gates/operator-contract/venture-adapter.js';

export const LANE = 'venture-build';
const GH_TIMEOUT_MS = 15000;

/** Under a test runner we never shell out — hermetic + deterministic (real gh/DB is injected in tests). */
function underTest() {
  return !!(process.env.VITEST || process.env.NODE_ENV === 'test');
}

/**
 * Bounded gh runner that THROWS on spawn failure / non-zero exit. Passed to verifyMerged so its
 * false-on-lookup-failure branch instead surfaces as a THROW here → mergedState='not_evaluable',
 * never a false 'not_merged' (a gh outage must not positively flag a leaf as unshipped).
 */
function boundedThrowingRunner(args) {
  const r = spawnSync('gh', args, { encoding: 'utf8', timeout: GH_TIMEOUT_MS });
  if (r.error) throw r.error;
  if ((r.status ?? 1) !== 0) throw new Error(`gh exited ${r.status}: ${(r.stderr || '').trim()}`);
  return { code: 0, stdout: r.stdout || '', stderr: r.stderr || '' };
}

/**
 * Default PR resolver: canonical ship_review_findings(sd_key) most-recent row, else the
 * `gh pr list --head feat/<sd_key>` merged-PR fallback. Fail-soft — returns null on any error / no PR.
 */
async function defaultPrLookup(supabase, sdKey) {
  try {
    const { data, error } = await supabase
      .from('ship_review_findings')
      .select('pr_number, branch')
      .eq('sd_key', sdKey)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error && data && data.pr_number != null) return { pr_number: data.pr_number, branch: data.branch };
  } catch { /* fall through to gh fallback */ }
  if (underTest()) return null; // never shell out under a test runner
  try {
    const r = boundedThrowingRunner(['pr', 'list', '--state', 'merged', '--head', `feat/${sdKey}`, '--json', 'number', '--jq', '.[0].number // empty']);
    const n = parseInt(String(r.stdout || '').trim(), 10);
    return Number.isInteger(n) ? { pr_number: n, branch: `feat/${sdKey}` } : null;
  } catch { return null; }
}

/**
 * Default merged-check: reuse the existing verifyMerged with a bounded/throwing runner
 * (true|false; throw⇒not_evaluable). QF-20260703-197: verifyMerged now REQUIRES
 * repoOwner/repoName (repo-scoped `-R` lookup) — without them it fails closed (false)
 * rather than resolving against the wrong ambient repo.
 */
async function defaultVerifyMerged(prNumber, repoOwner, repoName) {
  if (underTest()) return null; // never shell out under a test runner → not_evaluable
  return verifyMerged(prNumber, repoOwner, repoName, boundedThrowingRunner);
}

/**
 * OBSERVE-ONLY witness for one COMPLETED leaf. Returns a small summary object for logging only —
 * the caller MUST NOT branch on it. Never throws.
 */
export async function observeLeafMergeWitness({ supabase, leaf, ventureId, repoOwner = null, repoName = null, dryRun = false, logger = console, deps = {} }) {
  const {
    prLookup = defaultPrLookup,
    verifyMerged: verifyMergedDep = defaultVerifyMerged,
    writeTelemetry = writeMergeWitnessTelemetry,
    evaluateLadder = evaluateMergeWorkLadder,
    emitEvent: emit = emitEvent,
  } = deps;
  const summary = { workKey: leaf?.sd_key ?? null, prNumber: null, mergedState: 'not_evaluable', telemetryWritten: false, readBack: false, unmergedEmitted: false, operatorContract: null };
  try {
    // (a) resolve the leaf's PR — fail-soft: any error or no PR ⇒ mergedState stays 'not_evaluable'
    let pr = null;
    try { pr = await prLookup(supabase, leaf.sd_key); }
    catch (e) { logger.error?.(`[venture-build-merge-witness] prLookup threw for ${leaf?.sd_key}: ${e?.message || e}`); }
    const prNumber = pr && pr.pr_number != null ? pr.pr_number : null;
    summary.prNumber = prNumber;

    // (b) merged state — throw/timeout ⇒ not_evaluable (never a false not_merged)
    let mergedState = 'not_evaluable';
    if (prNumber != null) {
      try {
        const m = await verifyMergedDep(prNumber, repoOwner, repoName);
        mergedState = m === true ? 'merged' : (m === false ? 'not_merged' : 'not_evaluable');
      } catch (e) { logger.error?.(`[venture-build-merge-witness] verifyMerged threw for PR #${prNumber}: ${e?.message || e}`); }
    }
    summary.mergedState = mergedState;

    // (c) build the observe-only verdict via the Ship-witness A ladder
    const verdict = await evaluateLadder({
      prNumber, workKey: leaf.sd_key, merged: mergedState === 'merged', verifyResult: { ok: mergedState === 'merged' },
    });

    // (d) persist telemetry, then READ IT BACK to confirm persistence (write-then-read-back)
    if (prNumber != null) {
      const w = await writeTelemetry(supabase, verdict, { repo: 'venture-build-consumer', lane: LANE, logger });
      summary.telemetryWritten = !!(w && w.ok);
      try {
        const { data } = await supabase
          .from('merge_witness_telemetry')
          .select('id, pr_number, lane, work_key, overall, rungs')
          .eq('pr_number', Number(prNumber))
          .eq('lane', LANE)
          .eq('work_key', leaf.sd_key)
          .order('evaluated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        summary.readBack = !!(data && Number(data.pr_number) === Number(prNumber) && data.lane === LANE && data.work_key === leaf.sd_key);
        if (!summary.readBack) logger.warn?.(`[venture-build-merge-witness] telemetry read-back missed for PR #${prNumber} ${leaf.sd_key}`);
      } catch (e) { logger.error?.(`[venture-build-merge-witness] telemetry read-back threw: ${e?.message || e}`); }
    }

    // (e) POSITIVE not-merged ONLY ⇒ emit observe event; NEVER on not_evaluable or merged (no false-flag)
    if (mergedState === 'not_merged') {
      await emit(supabase, 'LEO_BUILD_LEAF_COMPLETED_UNMERGED',
        { leaf: leaf.sd_key, pr_number: prNumber, merged_state: mergedState },
        { ventureId, sdId: leaf.id, dryRun, logger });
      summary.unmergedEmitted = true;
    }

    // (f) Operator Contract fractal binding (FR-7) — observe-only advisory via the
    // SHARED validator. The leaf's build metadata may declare the persistent output
    // it created (created_tables / capability_keys) and any waiver; a venture-stage
    // CREATOR without its operator triple is surfaced with the SAME verdict a harness
    // SD would get. Fail-open: any error leaves operatorContract null, never blocks.
    try {
      const meta = leaf?.metadata || {};
      const createdTables = Array.isArray(meta.created_tables) ? meta.created_tables : [];
      if (createdTables.length) {
        const oc = evaluateVentureOperatorContract({
          createdTables,
          changedFiles: Array.isArray(meta.operator_changed_files) ? meta.operator_changed_files : [],
          registryRows: Array.isArray(deps.registryRows) ? deps.registryRows : [],
          retentionPolicies: Array.isArray(deps.retentionPolicies) ? deps.retentionPolicies : [],
          capabilityKeys: Array.isArray(meta.operator_capability_keys) ? meta.operator_capability_keys : [],
          waiver: meta.operator_contract_waiver || null,
        });
        summary.operatorContract = { verdict: oc.verdict, reason: oc.reason, missing: oc.missing };
        if (oc.verdict === 'fail') {
          logger.warn?.(`[venture-build-merge-witness] operator-contract advisory for ${leaf?.sd_key}: ${oc.reason}`);
        }
      }
    } catch (e) {
      logger.error?.(`[venture-build-merge-witness] operator-contract advisory threw (non-fatal): ${e?.message || e}`);
    }

    return summary;
  } catch (e) {
    logger.error?.(`[venture-build-merge-witness] observe failed (non-fatal, observe-only) for ${leaf?.sd_key}: ${e?.message || e}`);
    return { ...summary, error: e?.message || String(e) };
  }
}
