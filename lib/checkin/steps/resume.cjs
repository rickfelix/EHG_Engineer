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
    } else {
      // SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-002 (FR-8): the branch above only runs when the mirror
      // is NULL, so two states were structurally invisible:
      //   MISMATCH     — mirror says SD-A while the authoritative column says SD-B. Resume then
      //                  works the wrong SD, and no amount of re-checking notices, because the
      //                  authoritative source is never consulted once the mirror is non-empty.
      //   MULTIPLICITY — mirror says SD-A while the session authoritatively holds {SD-A, SD-B}.
      //                  SD-B is held, invisible, and unreleasable through this path. Live right
      //                  now: one session holds 2 claims, so this is not hypothetical.
      // Detection only — surfaced on ctx.base for the check-in payload. Deliberately NOT self-healed
      // here: picking a winner between two authoritative claims is a policy decision, and guessing
      // wrong silently drops real work. Report it and let the operator or a later FR decide.
      try {
        const { getMyClaims } = require('../../claim/get-my-claims.cjs');
        const { claims, error } = await getMyClaims(sb, sessionId);
        if (!error && claims.length) {
          const keys = claims.map((c) => c.key);
          if (!keys.includes(ctx.mySd)) {
            ctx.base.claim_mirror_mismatch = { mirror: ctx.mySd, authoritative: keys };
          }
          if (keys.length > 1) {
            ctx.base.claim_multiplicity = { mirror: ctx.mySd, held: keys };
          }
        }
        // A read error is NOT evidence of agreement — leave both flags unset rather than implying
        // a clean comparison that never happened.
      } catch { /* detection is additive; never let it break an otherwise valid resume */ }
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
          const { data: qfRow, error: qfErr } = await sb.from('quick_fixes').select('status, claiming_session_id').eq('id', ctx.mySd).maybeSingle();
          if (qfErr) throw qfErr;
          if (qfRow) {
            if (['completed', 'cancelled', 'escalated', 'closed'].includes(qfRow.status)) staleTerminal = true;
            // SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-002 (FR-1): the RETURNED-QF pin. A QF sent back
            // to the queue (status -> 'open', claiming_session_id cleared) is in NEITHER the terminal
            // set nor gone, so the mirror was never cleared and this seat resumed it forever — while
            // the same QF sat claimable, so a second seat could build it concurrently.
            //
            // THE TEST IS OWNERSHIP, NOT STATUS, and that distinction is load-bearing. The FR's
            // acceptance says to add 'open' to the terminal set above. Measured live, that would be a
            // REGRESSION: CLAIMABLE_QF_STATUSES is exactly ['open'], so a legitimately-held QF also
            // reads status='open' (1 of 1 claimed QFs live). Treating 'open' as terminal would
            // self-heal every real QF claim on its next check-in. What actually makes this seat's
            // mirror stale is that the authoritative column no longer names THIS session — which is
            // precisely the ownership question the SD title asks for.
            else if (qfRow.status === 'open' && qfRow.claiming_session_id !== sessionId) staleTerminal = true;
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
          // FR-4 (SD-LEO-INFRA-FULL-UTILISATION-RECOVERY-001): ASSIGNMENT_RECENCY_WINDOW_MS bounds
          // BOTH this peek AND the directed-assignment pull, so an assignment to a seat that holds
          // its claim past the window ages out of both and goes PERMANENTLY INVISIBLE — never
          // claimed, never surfaced, never acked. 24h sits inside a normal SD duration, so this is
          // reachable in routine operation, and the failure is SILENT LOSS, not delay.
          // REPORT ONLY — deliberately NOT resurrected. The bound above exists precisely so a truly
          // ancient, abandoned row is never auto-claimed; that intent stands. What must not stand is
          // it being unclaimed AND unreported at the same time.
          if (!pendingAssignment) {
            const cutoff = Date.now() - ASSIGNMENT_RECENCY_WINDOW_MS;
            const all = await ws.getMessagesForSession(sb, sessionId, { unackedOnly: true });
            const aged = (all || []).filter((m) => m.message_type === 'WORK_ASSIGNMENT'
              && extractDirectedSd(m)
              && Date.parse(m.created_at) < cutoff);
            if (aged.length) {
              ctx.base.aged_work_assignments = aged.map((m) => ({
                sd: extractDirectedSd(m), message_id: m.id, created_at: m.created_at,
                aged_out_of_window: true,
              }));
            }
          }
        } catch { /* fail-open: no pending-assignment surfacing */ }
        // SD-LEO-INFRA-WORKER-INBOX-DRAIN-SUBSET-001 (FR-1): the seam-1 peek above only matches a
        // WORK_ASSIGNMENT carrying a STRUCTURED directed SD. Every OTHER directive kind
        // (coordinator_request, coordinator_directive, fence_notice, chairman_directive,
        // coordinator_reminder …) had NO surfacing path for a claim-holding worker, so it stayed
        // invisible for as long as the SD took. That is the measured shape of this SD's incident:
        // the two worst non-drainers were holding coordinator_request / fence_notice rows, not
        // work assignments, while building productively.
        // Same contract as seam 1 and for the same reason: SURFACE ONLY. We do NOT stamp read_at
        // (read_at IS NULL is the deliberate deliver-not-consume signal for DIRECTIVE_KINDS —
        // scripts/hooks/coordination-inbox.cjs; forcing it re-introduces a corrected regression)
        // and we do NOT touch the claim (never-strand, CLAUDE.md rule 7a). Fail-open.
        let pendingDirectives = [];
        try {
          const kinds = new Set(ws.DIRECTIVE_KINDS || []);
          const dmsgs = await ws.getMessagesForSession(sb, sessionId, {
            unackedOnly: true,
            sinceIso: new Date(Date.now() - ASSIGNMENT_RECENCY_WINDOW_MS).toISOString(),
          });
          pendingDirectives = (dmsgs || [])
            // WORK_ASSIGNMENT is already covered by the seam-1 peek above — do not double-surface it.
            .filter(m => m.message_type !== 'WORK_ASSIGNMENT' && kinds.has(m.payload?.kind))
            .map(m => ({ id: m.id, kind: m.payload.kind, subject: m.subject || null }));
        } catch { /* fail-open: no directive surfacing */ }
        const resumeMsg = isQf
          ? `Already claiming quick-fix ${ctx.mySd}; resume it: node scripts/read-quick-fix.js ${ctx.mySd}, then run the /quick-fix workflow (do NOT run sd-start.js for a QF).`
          : `Already claiming ${ctx.mySd}; resume work (run sd-start to (re)attach the worktree).`;
        let resumeMessage = resumeMsg;
        if (pendingAssignment?.preempt) {
          resumeMessage = `${resumeMsg} ⚠ PREEMPT: coordinator has redirected you to ${pendingAssignment.sd} (chairman-critical). Consider releasing ${ctx.mySd} cleanly (worker owns clean suspension — never auto-released) and claiming ${pendingAssignment.sd} now, rather than finishing ${ctx.mySd} first.`;
        } else if (pendingAssignment) {
          resumeMessage = `${resumeMsg} NOTE: coordinator WORK_ASSIGNMENT pending for ${pendingAssignment.sd} — finish/hand off ${ctx.mySd} first, then claim it (never drop an in-progress SD).`;
        }
        if (pendingDirectives.length) {
          const summary = pendingDirectives.map(d => d.kind).join(', ');
          resumeMessage = `${resumeMessage} PENDING DIRECTIVE${pendingDirectives.length > 1 ? 'S' : ''} (${pendingDirectives.length}): ${summary} — read and action them now; they do NOT require dropping ${ctx.mySd}. Ack a coordinator_directive with: node scripts/worker-ack-directive.cjs --id <id>; ack a coordinator_reply / completion_nudge with: node scripts/worker-ack-advisory.cjs --id <id> (SD-LEO-INFRA-WORKER-REACHABLE-ACK-001 — the advisory lane has its own verb; the directive path correctly refuses those kinds).`;
        }
        return { ...ctx.base, action: 'resume', sd: ctx.mySd,
          ...(pendingAssignment ? { pending_work_assignment: pendingAssignment } : {}),
          ...(pendingDirectives.length ? { pending_directives: pendingDirectives } : {}),
          message: resumeMessage };
      }
    }
  },
};
