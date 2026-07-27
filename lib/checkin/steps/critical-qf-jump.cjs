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
    let resolveGitHubRepo = null;
    try { ({ resolveGitHubRepo } = await import('../../repo-paths.js')); } catch { /* gh infers from cwd */ }

    /*
     * GROUP BY TARGET APP, then probe once per repo.
     *
     * The first version derived one repo from list[0].target_application and applied it to the
     * whole batch. The live population is HETEROGENEOUS — 94 non-terminal QFs across
     * EHG_Engineer (91), EHG (2) and apexniche-ai (1) — so a mixed batch would probe the wrong
     * repository for everything after the first element and return a false CLEAR. That is the
     * FR-7 failure mode this SD's own docblock calls the most dangerous one, because it looks
     * exactly like a working guard. Today's critical+open slice happens to be 9/9 EHG_Engineer,
     * so the single-repo version was correct BY LUCK. (SECURITY d1622fdc F8 / TESTING 94001fa5.)
     */
    const byApp = new Map();
    for (const item of list) {
      const app = item.target_application || 'EHG_Engineer';
      if (!byApp.has(app)) byApp.set(app, []);
      byApp.get(app).push(item);
    }

    const kept = [];
    const withheld = [];
    let snapshotStatus = 'OK';
    for (const [app, group] of byApp) {
      let repo = null;
      try { repo = resolveGitHubRepo ? resolveGitHubRepo(app) : null; } catch { /* gh infers */ }
      const r = filterOutInFlight(group, (qf) => qf.id, { repo, ...(ctx?.inflightProbe || {}) });
      kept.push(...r.kept);
      withheld.push(...r.withheld);
      if (r.snapshotStatus !== 'OK') snapshotStatus = r.snapshotStatus;
    }
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
          // target_application added for the per-repo in-flight probe below: without it the
          // grouping collapses to the 'EHG_Engineer' default and a non-Engineer QF would be
          // probed against the wrong repo (false CLEAR).
          .select('id, status, pr_url, commit_sha, created_at, routing_tier, title, severity, not_before, target_application')
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
