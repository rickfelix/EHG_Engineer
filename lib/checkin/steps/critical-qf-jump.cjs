// Extracted VERBATIM from scripts/worker-checkin.cjs resolveCheckin (rung 5.95 incl. the
// last_claim_was_qf_jump consume/clear if/else) — SD-ARCH-HOTSPOT-CHECKIN-001.
// Only edits: locals -> ctx.* + helper destructuring.
module.exports = {
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
        for (const qf of (criticalQfs || [])) {
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
