/**
 * SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-A (FR-1/FR-2/FR-3): make regeneration of the rendered
 * CLAUDE_*.md contracts FOLLOW a write to leo_protocol_sections, instead of waiting for a human
 * to remember.
 *
 * WHY THIS IS DETECT-AND-REMEDIATE RATHER THAN A WRITE HOOK, which is a correction to this SD's
 * own FR-1 wording ("a write to leo_protocol_sections causes the rendered contracts to be
 * regenerated"). Measured before building: 25+ files write to that table, and almost all of them
 * are ad-hoc scripts/one-off/*.mjs. There is no canonical writer to wrap — only two
 * sanctioned-looking paths (scripts/protocol/adam-contract-land.mjs and
 * coordinator-contract-land.mjs), which the one-off scripts bypass entirely, and new one-off
 * writers appear continuously. A hook on "the write path" would therefore cover a minority of
 * writes while READING as if it covered all of them: a guard that is blind by construction.
 *
 * The drift check already sees the RESULT of any write, whoever made it, because it compares live
 * per-section digests against the manifest. Detecting the consequence is complete where hooking
 * the cause cannot be. So this attaches remediation to the existing detector and, in effect,
 * regeneration follows every write — including from a one-off script nobody will remember to wire.
 *
 * NEVER TOUCHES THE SHARED ROOT. Regenerating in the shared checkout is the shared-tree hijack
 * class ENF-17 exists to prevent (~30 sibling worktrees and concurrent fleet sessions read it),
 * and it is named as the leading risk in the parent CAPA plan. The ENF-17 guard's own invariant
 * permits operations under .worktrees/<sd>/, so working there is compatible with it rather than
 * fighting it.
 *
 * WORKTREE DISCIPLINE. The pool has a hard cap (observed saturated at 40/40 for an entire
 * session, with the reaper finding nothing reapable five times). A trigger that provisioned one
 * worktree per write would exhaust it and block every other seat, so this takes at most ONE and
 * releases it in a finally.
 *
 * Every side effect is injected, so the orchestration is unit-testable without git, the network,
 * or a database — matching the convention already used by findOrphanFiles in
 * scripts/check-claude-md-drift.cjs ("pure given an injected verify function").
 */

/** Outcomes, so callers branch on a value rather than parsing prose. */
export const REGEN_OUTCOME = Object.freeze({
  CLEAN: 'clean_no_action',
  REGENERATED: 'regenerated_pr_opened',
  NO_CHANGE: 'drift_reported_but_generator_produced_no_change',
  REFUSED_SHARED_ROOT: 'refused_shared_root',
  REFUSED_STILL_DRIFTED: 'refused_still_drifted_after_regen',
  PROBE_UNAVAILABLE: 'probe_unavailable',
  // QF-20260903-451: a throw from generation/verification/PR-open used to propagate uncaught
  // past this module to a bare `exit 1` with no diagnostic and no PR -- exactly what converts an
  // enforceable threshold (or any other generator error) into a fleet-wide wedge the instant one
  // document crosses it. Reported as a normal outcome instead, carrying the failing reason.
  GENERATION_FAILED: 'generation_failed',
});

/**
 * @param {object} deps
 * @param {() => Promise<{drift:boolean, staleFiles?:string[]}>} deps.driftProbe   read drift (defaults to computeDrift at the call site)
 * @param {() => Promise<{path:string, release:() => Promise<void>}>} deps.acquireWorktree
 * @param {(worktreePath:string) => Promise<{changedFiles:string[]}>} deps.runGenerator
 * @param {(worktreePath:string) => Promise<{drift:boolean, staleFiles?:string[]}>} deps.verifyInWorktree
 * @param {(args:{worktreePath:string, changedFiles:string[]}) => Promise<{url:string}>} deps.openPullRequest
 * @param {() => boolean} [deps.isSharedRoot] true when the process would operate on the shared checkout
 * @param {{warn:Function, log:Function}} [deps.logger]
 * @returns {Promise<{outcome:string, detail?:object}>}
 */
export async function regenerateOnDrift({
  driftProbe,
  acquireWorktree,
  runGenerator,
  verifyInWorktree,
  openPullRequest,
  isSharedRoot = () => false,
  logger = console,
} = {}) {
  // Refuse BEFORE reading anything. A shared-root run is unsafe regardless of whether there is
  // drift to fix, so the cheapest and most dangerous condition is checked first.
  if (isSharedRoot()) {
    return {
      outcome: REGEN_OUTCOME.REFUSED_SHARED_ROOT,
      detail: { reason: 'regeneration would mutate the shared checkout that ~30 sibling worktrees and concurrent sessions read (ENF-17)' },
    };
  }

  let drift;
  try {
    drift = await driftProbe();
  } catch (err) {
    // The detector being down is infra trouble, not a licence to regenerate blind: regenerating
    // without knowing whether anything drifted could open an empty PR on every invocation.
    return { outcome: REGEN_OUTCOME.PROBE_UNAVAILABLE, detail: { message: err?.message } };
  }

  if (!drift?.drift) {
    // The common case. No worktree is taken and no PR is opened, so a quiet tree costs nothing.
    return { outcome: REGEN_OUTCOME.CLEAN };
  }

  const worktree = await acquireWorktree();
  try {
    try {
      const { changedFiles = [] } = await runGenerator(worktree.path);

      // The generator is skip-on-unchanged for both the rendered files and the manifest, so drift
      // that resolves to no byte change must NOT produce a PR. Without this, a trigger attached to
      // a detector becomes a churn generator.
      if (changedFiles.length === 0) {
        return { outcome: REGEN_OUTCOME.NO_CHANGE, detail: { staleFiles: drift.staleFiles || [] } };
      }

      // FR-3: the hook enforces zero drift as part of its OWN operation rather than deferring to
      // CI. This is the second invocation site parent SC#1 requires ("in CI and on the regen hook").
      // Verified in the WORKTREE, not the root — checking the wrong tree would report on files this
      // run never touched.
      const after = await verifyInWorktree(worktree.path);
      if (after?.drift) {
        // Regenerating and still drifting means the generator did not converge. Opening a PR here
        // would ship a change that claims to fix drift while leaving it in place.
        return {
          outcome: REGEN_OUTCOME.REFUSED_STILL_DRIFTED,
          detail: { staleFiles: after.staleFiles || [], changedFiles },
        };
      }

      const pr = await openPullRequest({ worktreePath: worktree.path, changedFiles });
      logger.log?.(`regen-on-drift: regenerated ${changedFiles.length} file(s), PR ${pr?.url || '(no url)'}`);
      return { outcome: REGEN_OUTCOME.REGENERATED, detail: { changedFiles, pr: pr?.url || null } };
    } catch (err) {
      // A throw here (generation, in-worktree verification, or PR-open) is a real finding, not a
      // reason to exit silently — report it the same structured way as every other outcome so the
      // caller's existing logging (which already prints `detail`) surfaces the failing reason.
      return {
        outcome: REGEN_OUTCOME.GENERATION_FAILED,
        detail: { message: err?.message || String(err), staleFiles: drift.staleFiles || [] },
      };
    }
  } finally {
    // Always release. The pool cap is the binding constraint on this whole design, so a leaked
    // worktree here degrades every other seat, not just this trigger.
    try { await worktree.release?.(); } catch (err) { logger.warn?.(`regen-on-drift: worktree release failed: ${err?.message}`); }
  }
}
