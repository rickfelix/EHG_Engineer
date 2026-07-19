// Extracted VERBATIM from scripts/worker-checkin.cjs resolveCheckin (rung 4: stale-terminal/
// deleted healing, pending-WA surfacing, resume short-circuit) — SD-ARCH-HOTSPOT-CHECKIN-001.
// Only edits: locals -> ctx.* + helper destructuring. Sets ctx.mySd = null on self-heal so the
// pipeline falls through to assignment / self-claim, exactly like the inline fall-through.
module.exports = {
  name: 'resume',
  async run(ctx) {
    const { sb, sessionId, sessionRole } = ctx;
    const { ws, confirmRowGone, selfHealStaleClaim, findOwnSdClaim, healOwnClaimPointer, extractDirectedSd, ASSIGNMENT_RECENCY_WINDOW_MS } = ctx.helpers;
    // SD-LEO-INFRA-CHECKIN-OWN-CLAIM-DETECT-001: claude_sessions.sd_key is only a CACHE of the
    // authoritative claim — strategic_directives_v2.claiming_session_id (the same column sd:next
    // and the coordinator read). When the cache is null/mismatched but the authoritative claim
    // still points at this session (is_working_on=true), the resume step below was structurally
    // unreachable — action fell through to idle forever (SILENT-STARVE, live incident: session
    // e3ec24ab held an unworked claim for 4+ hours while checkin reported idle every tick). Query
    // the authoritative source FIRST when the cache is empty, and self-heal the cache to match —
    // never the reverse (the SD-side column is truth; the session-side column just mirrors it).
    if (!ctx.mySd) {
      const owned = await findOwnSdClaim(sb, sessionId);
      if (owned) {
        const healed = await healOwnClaimPointer(sb, sessionId, owned);
        ctx.base.self_healed_own_claim_pointer = { sd: owned, cache_updated: healed };
        ctx.mySd = owned;
      }
    }
    // 4. already working -> resume. A self-claimed quick-fix lands in claude_sessions.sd_key
    // too (claim_sd writes it for QF-% ids), so a QF claim must resume into the /quick-fix
    // workflow — NOT sd-start, which is SD-only (QFs have no worktree / LEAD-PLAN-EXEC).
    if (ctx.mySd) {
      const isQf = /^QF-/.test(ctx.mySd);
      // FR-2 (SD-LEO-INFRA-CLAIM-LIFECYCLE-HARDENING-002): a stale claude_sessions.sd_key pointing at
      // a TERMINAL/parked SD (completed/cancelled/deferred) would loop action=resume forever. Before
      // resuming, verify the SD is still resumable; if terminal, self-heal (CAS-guarded to THIS session)
      // and fall through to self-claim. pending_approval is NOT terminal — it resumes (to run
      // LEAD-FINAL-APPROVAL) and recoverStrandedFinal (step 5.7) owns the cleared-claim variant.
      // Fail-open: any query error preserves today's resume.
      let staleTerminal = false;
      // SD-LEO-FEAT-WORKER-CHECKIN-SELF-001 (FR-1): a HARD-DELETED claimed SD (row gone) used to fall
      // through every guard and loop action=resume on a ghost forever (sd-start then exits SD-not-found
      // = permanent strand). Track it separately and self-heal it like a stale-terminal claim.
      let staleDeleted = false;
      if (!isQf) {
        try {
          const { data: sdRow, error: sdErr } = await sb.from('strategic_directives_v2').select('status').eq('sd_key', ctx.mySd).maybeSingle();
          if (sdErr) throw sdErr; // read error -> fail-open (preserve resume)
          if (sdRow) {
            if (['completed', 'cancelled', 'deferred'].includes(sdRow.status)) staleTerminal = true;
          } else if (await confirmRowGone(sb, 'strategic_directives_v2', 'sd_key', ctx.mySd)) {
            // FR-2: only after a CONFIRMING re-read also finds the row absent (never release on a single
            // transient/eventual-consistency null).
            staleDeleted = true;
          }
        } catch { /* fail-open: leave flags false -> resume preserved */ }
      } else {
        // Quick-fix QF-20260612-113: QF claims land in claude_sessions.sd_key too, but the
        // terminal self-heal above was SD-only — a completed/cancelled/escalated QF looped
        // action=resume forever. Apply the same check against quick_fixes.status.
        try {
          const { data: qfRow, error: qfErr } = await sb.from('quick_fixes').select('status').eq('id', ctx.mySd).maybeSingle();
          if (qfErr) throw qfErr;
          if (qfRow) {
            if (['completed', 'cancelled', 'escalated', 'closed'].includes(qfRow.status)) staleTerminal = true;
          } else if (await confirmRowGone(sb, 'quick_fixes', 'id', ctx.mySd)) {
            staleDeleted = true; // FR-1/FR-2: a hard-deleted quick-fix, confirmed absent
          }
        } catch { /* fail-open: leave flags false -> resume preserved */ }
      }
      if (staleTerminal || staleDeleted) {
        await selfHealStaleClaim(sb, sessionId, ctx.mySd);
        ctx.base.self_healed_stale_claim = ctx.mySd;
        if (staleDeleted) ctx.base.self_healed_deleted_claim = ctx.mySd; // FR-1: distinguish deleted from terminal
        ctx.mySd = null; // fall through to assignment / self-claim below
      } else {
        // SD-FDBK-FIX-WORKER-CHECK-SURFACES-001 (seam 1): a claim-holding worker used to
        // short-circuit to resume BEFORE the step-5 WORK_ASSIGNMENT pull, so a coordinator
        // directive targeting a BUSY worker was never read on check-in (witnessed: an assignment to
        // Alpha stayed UNREAD across full cycles). Peek for a WORK_ASSIGNMENT targeting THIS session
        // for a DIFFERENT SD and SURFACE it on the resume result so the worker sees it now. We do NOT
        // drain read_at and do NOT auto-switch the claim — never-strand (CLAUDE.md rule 7a): the
        // worker finishes / explicitly hands off current work, then actions the assignment (genuine
        // claim_sd/ackMessage stamps read_at then). Surfacing persists (seam 2 re-surfaces on poll)
        // until actioned. Fail-open: any error preserves today's plain resume.
        let pendingAssignment = null;
        try {
          // QF-20260703-476: unackedOnly (acknowledged_at IS NULL), not unreadOnly -- a row whose
          // read_at got stamped by some other delivery path but was never genuinely actioned must
          // still surface here, bounded to a recency window so an ancient row isn't resurrected.
          const msgs = await ws.getMessagesForSession(sb, sessionId, {
            unackedOnly: true,
            sinceIso: new Date(Date.now() - ASSIGNMENT_RECENCY_WINDOW_MS).toISOString(),
          });
          // Only a row carrying a STRUCTURED directed field (assigned_sd/sd_key) is a real redirect;
          // selecting on extractDirectedSd also skips past the generic sweep advisory if a directed
          // row exists beneath it (finding #3: subtype-blind newest-wins .find() could otherwise mask
          // a genuine redirect). getMessagesForSession returns created_at DESC, so this is newest-first.
          const wa = (msgs || []).find(m => m.message_type === 'WORK_ASSIGNMENT' && extractDirectedSd(m));
          if (wa) {
            const waSd = extractDirectedSd(wa);
            // QF-20260705-858: a preempt-flagged WA (coordinator dispatch stamps payload.preempt=true
            // on a chairman-critical redirect) must surface with an act-now framing, distinct from the
            // routine "finish current work first" note below -- the resume short-circuit otherwise
            // structurally delays a preempt until the current SD fully completes. Non-preempt WAs are
            // BYTE-IDENTICAL to prior behavior (no new field, no message change) — only the preempt
            // branch changes.
            if (waSd && waSd !== ctx.mySd) pendingAssignment = { sd: waSd, message_id: wa.id, preempt: wa.payload?.preempt === true };
          }
        } catch { /* fail-open: no pending-assignment surfacing */ }
        const resumeMsg = isQf
          ? `Already claiming quick-fix ${ctx.mySd}; resume it: node scripts/read-quick-fix.js ${ctx.mySd}, then run the /quick-fix workflow (do NOT run sd-start.js for a QF).`
          : `Already claiming ${ctx.mySd}; resume work (run sd-start to (re)attach the worktree).`;
        let resumeMessage = resumeMsg;
        if (pendingAssignment?.preempt) {
          resumeMessage = `${resumeMsg} ⚠ PREEMPT: coordinator has redirected you to ${pendingAssignment.sd} (chairman-critical). Consider releasing ${ctx.mySd} cleanly (worker owns clean suspension — never auto-released) and claiming ${pendingAssignment.sd} now, rather than finishing ${ctx.mySd} first.`;
        } else if (pendingAssignment) {
          resumeMessage = `${resumeMsg} NOTE: coordinator WORK_ASSIGNMENT pending for ${pendingAssignment.sd} — finish/hand off ${ctx.mySd} first, then claim it (never drop an in-progress SD).`;
        }
        return { ...ctx.base, action: 'resume', sd: ctx.mySd,
          ...(pendingAssignment ? { pending_work_assignment: pendingAssignment } : {}),
          message: resumeMessage };
      }
    }
  },
};
