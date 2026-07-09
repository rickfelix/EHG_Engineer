// Extracted VERBATIM from scripts/worker-checkin.cjs resolveCheckin (rung 5.8) —
// SD-ARCH-HOTSPOT-CHECKIN-001. Only edits: locals -> ctx.* + helper destructuring.
module.exports = {
  name: 'adopt-orphan',
  async run(ctx) {
    const { sb, sessionId } = ctx;
    const { adoptOrphanInProgress } = ctx.helpers;
    // 5.8 SD-FDBK-INFRA-ORPHAN-ADOPTION-WORKER-001: adopt an ORPHANED in_progress SD (zero active
    //     claims, session reaped mid-build) BEFORE self-claiming new work — finishing a
    //     partially-built SD beats starting fresh, but a one-handoff-from-shipped stranded final
    //     (5.7) still wins over a mid-build orphan.
    const adopted = await adoptOrphanInProgress(sb, sessionId, ctx.base);
    if (adopted) return adopted;
  },
};
