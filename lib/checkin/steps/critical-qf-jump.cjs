// Extracted VERBATIM from scripts/worker-checkin.cjs resolveCheckin (rung 5.95 incl. the
// last_claim_was_qf_jump consume/clear if/else) — SD-ARCH-HOTSPOT-CHECKIN-001.
// Only edits: locals -> ctx.* + helper destructuring, plus the git in-flight filter below
// (SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-B FR-3).

/**
 * Drop quick-fixes that already have a pushed branch or an open PR.
 *
 * Wholly fail-open: any fault (module load, repo resolution, probe) returns the candidate list
 * UNCHANGED. Withholding on error would convert a gh outage into a fleet-wide dispatch halt,
 * which is the inverse of this SD's intent and strictly worse than the bug being fixed.
 *
 * `ctx.inflightProbe` is an injection seam for tests; production passes nothing.
 */
async function withheldFilteredQfs(qfs, ctx) {
  const list = Array.isArray(qfs) ? qfs : [];
  try {
    const { filterOutInFlight } = require('../../fleet/inflight-git-state.cjs');
    // resolveGitHubRepo is ESM; this step is already async so the dynamic import is free.
    // An EXPLICIT repo matters: a probe against the wrong repository returns "nothing in
    // flight" and silently re-opens the defect while appearing to work.
    let repo = null;
    try {
      const { resolveGitHubRepo } = await import('../../repo-paths.js');
      repo = resolveGitHubRepo(list[0]?.target_application || 'EHG_Engineer');
    } catch { /* fall through: gh infers from cwd */ }

    const { kept, withheld, snapshotStatus } = filterOutInFlight(
      list,
      (qf) => qf.id,
      { repo, ...(ctx?.inflightProbe || {}) },
    );
    if (withheld.length) {
      // SR-4: name the withheld items and the reason. A silent skip is indistinguishable from
      // an empty belt, which is how this class of bug stays invisible.
      console.log(`[critical-qf-jump] withheld ${withheld.length} in-flight QF(s): ` +
        withheld.map((w) => `${w.id}(${w.reason})`).join(', '));
    } else if (snapshotStatus !== 'OK') {
      // Distinguishable from a genuine "nothing in flight" (SR-4) — a sustained stream of these
      // means the guard is inert, not that the fleet is clean.
      console.log('[critical-qf-jump] in-flight probe UNAVAILABLE — not withholding (fail-open)');
    }
    return kept;
  } catch {
    return list; // fail-open
  }
}

module.exports = {
  withheldFilteredQfs,
  name: 'critical-qf-jump',
  async run(ctx) {
    const { sb, sessionId } = ctx;
    const { tryClaim, isCriticalQfJumpEligible, QF_CANDIDATE_LIMIT } = ctx.helpers;
    // 5.95 QF-20260704-244 (leg 3): a CRITICAL open QF, aged past the directed-dispatch grace
    // window, outranks SD self-claim. Fenced to prevent reverse SD-belt starvation: only
    // 'critical' jumps, and at most ONE consecutive jump per worker -- if the LAST pull was a
    // jump (metadata.last_claim_was_qf_jump), this pull consumes/clears that flag and falls
    // through to the normal SD-first order instead of jumping again immediately.
    if (ctx.sessionMetadata?.last_claim_was_qf_jump === true) {
      try {
        await sb.from('claude_sessions')
          .update({ metadata: { ...ctx.sessionMetadata, last_claim_was_qf_jump: false } })
          .eq('session_id', sessionId);
      } catch { /* fail-open: worst case is one extra consecutive jump */ }
    } else {
      try {
        const { data: criticalQfs } = await sb
          .from('quick_fixes')
          .select('id, status, pr_url, commit_sha, created_at, routing_tier, title, severity, not_before')
          .eq('status', 'open')
          .eq('severity', 'critical')
          .is('pr_url', null)
          .is('commit_sha', null)
          .order('created_at', { ascending: true })
          .limit(QF_CANDIDATE_LIMIT);
        const nowMs = Date.now();
        // SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-B FR-3: the column guard above
        // (.is('pr_url', null).is('commit_sha', null)) is BLIND in the measured real-world
        // shape — 23/30 (77%) of non-terminal QFs carry BOTH columns NULL while a real PR is
        // open. This lane is the one that offered QF-20260726-425 while PR #6540 was open on
        // qf/QF-20260726-425. Withhold anything already in flight in git. Fail-open: an
        // UNAVAILABLE probe withholds nothing (AC-3), so a gh/auth outage can never present
        // as an empty belt.
        const candidates = await withheldFilteredQfs(criticalQfs, ctx);
        for (const qf of candidates) {
          if (!isCriticalQfJumpEligible(qf, nowMs)) continue;
          const claimed = await tryClaim(sb, qf.id, sessionId);
          if (claimed.ok) {
            try {
              await sb.from('claude_sessions')
                .update({ metadata: { ...ctx.sessionMetadata, last_claim_was_qf_jump: true } })
                .eq('session_id', sessionId);
            } catch { /* fail-open: worst case the one-consecutive bound doesn't hold once */ }
            return {
              ...ctx.base,
              action: 'self_claimed_qf',
              qf: qf.id,
              message: `Self-claimed CRITICAL quick-fix ${qf.id} (priority jump ahead of SD self-claim, QF-20260704-244). Load it: node scripts/read-quick-fix.js ${qf.id} — then run the /quick-fix workflow (implement <=50 LOC on branch qf/${qf.id}, run tests, then node scripts/complete-quick-fix.js ${qf.id}). Do NOT run sd-start.js for a QF. On completion, re-run /checkin.`,
            };
          }
        }
      } catch { /* fail-open: proceed to normal SD-first order */ }
    }
  },
};
