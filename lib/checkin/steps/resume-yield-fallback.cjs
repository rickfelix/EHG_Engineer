// SD-LEO-INFRA-CHECKIN-DIRECTED-BEFORE-RESUME-001 (FR-1 hardening, adversarial-review finding):
// resume.cjs's yield branch nulls ctx.mySd and falls through to directed-assignment, TRUSTING
// that directed-assignment will genuinely claim the directed item via claim_sd. But
// directed-assignment.cjs has several real rejection paths (assignedSdFetchFailed, terminalStatus,
// ineligibleReason, qfDeferredUntil, a non-terminal tryClaim error) that never call claim_sd and
// never restore ctx.mySd -- they simply fall through with an undefined return. When that happens,
// this session's REAL, still-DB-authoritative claim (the SD ctx.mySd pointed to before the yield)
// is left completely unreleased in the database, but invisible to the REST OF THIS TICK's pipeline
// (ctx.mySd stays null). A downstream self-claim tier (merged-pool-self-claim, self-claim-qf, etc.)
// would then happily self-claim something ELSE via claim_sd -- and the symmetric-clear fix
// (SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-A) means THAT claim_sd call silently EVICTS the still-held
// original claim as part of the switch, since nothing in this tick's ctx remembers it is still
// this session's real work. That is the exact "claim reads as vacant while still held" defect
// class this whole file exists to prevent -- just reintroduced one step later.
//
// FIX: positioned immediately after directed-assignment (and before directed-assignment-outranks-
// self-claim, so restoring the real claim always wins over that narrower advisory hold). Applies
// only when resume yielded THIS tick AND the yield did not produce a successful claim (a
// successful claim returns truthy from directed-assignment and short-circuits the pipeline before
// this step ever runs, so ctx.mySd being null here is conclusive, not a guess). Restores ctx.mySd
// to the yielded-from SD and reports a resume action, deliberately mirroring resume.cjs's own
// message shape rather than falling through further -- stopping here is what prevents any
// self-claim tier below from running at all this tick.
module.exports = {
  name: 'resume-yield-fallback',
  applies(ctx) {
    return !!(ctx.base && ctx.base.resume_yielded_to_directed && !ctx.mySd);
  },
  async run(ctx) {
    const { resumable_sd: resumableSd, directed_sd: directedSd } = ctx.base.resume_yielded_to_directed;
    ctx.mySd = resumableSd;
    const failureReason = (ctx.base.directed_lane_verdict && ctx.base.directed_lane_verdict.sd_key === directedSd)
      ? ctx.base.directed_lane_verdict.reason
      : 'directed claim did not succeed';
    ctx.base.directed_lane_verdict = {
      outcome: 'yielded_to_directed', id: ctx.base.resume_yielded_to_directed.message_id, sd_key: directedSd,
      reason: `yield attempted (${failureReason}); resumed ${resumableSd} instead of stranding it`,
    };
    const isQf = /^QF-/.test(resumableSd);
    const resumeMsg = isQf
      ? `Already claiming quick-fix ${resumableSd}; resume it: node scripts/read-quick-fix.js ${resumableSd}, then run the /quick-fix workflow (do NOT run sd-start.js for a QF).`
      : `Already claiming ${resumableSd}; resume work (run sd-start to (re)attach the worktree).`;
    return { ...ctx.base, action: 'resume', sd: resumableSd,
      message: `${resumeMsg} NOTE: a directed WORK_ASSIGNMENT for ${directedSd} could not be claimed this tick (${failureReason}) — resumed the original claim instead of leaving it invisible to this checkin.` };
  },
};
