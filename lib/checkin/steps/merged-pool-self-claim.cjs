// Extracted VERBATIM from scripts/worker-checkin.cjs resolveCheckin (rung 5.5
// ensureActiveBaseline + rung 6 merged-pool self-claim: 5 candidate sources, seen-set dedup,
// sortByDispatchRank, tierCtx, belt gauges on base, claim loop) — SD-ARCH-HOTSPOT-CHECKIN-001.
// Only edits: locals -> ctx.* + helper destructuring.
module.exports = {
  name: 'merged-pool-self-claim',
  async run(ctx) {
    const { sb, sessionId } = ctx;
    const {
      ensureActiveBaseline, fetchDraftCandidates, fetchNewestDraftCandidates,
      fetchFleetCriticalCandidates, fetchRankedCandidates, sortByDispatchRank,
      ladderTopRank, seatCapabilityIsVerified,
      fetchFableWindowActive, claimableForTier, claimableForRepo, baselinedCandidateEligible, isSdInFlight,
      tryClaim, tryClaimDraftCandidate, antiWinddownDirective, coordinatorReservation,
      SELF_CLAIM_CANDIDATE_LIMIT,
    } = ctx.helpers;
    // 5.5 SD-FDBK-INFRA-AUTO-MAINTAIN-EXECUTION-001: ensure an active execution baseline exists
    //      BEFORE reading v_sd_next_candidates. With zero active baseline the view returns 0 rows
    //      and self-claim silently idles with a full queue. Fail-open: a failure here degrades to
    //      today's behavior (read returns [] -> idle), never an error action.
    try { await ensureActiveBaseline(sb); } catch { /* fail-open: never block the checkin */ }

    // 6. self-claim from ONE merged SD pool: baselined sd:next candidates + claimable
    //    UN-BASELINED drafts, rank-sorted TOGETHER (QF-20260610-986, feedback dc87039d).
    //    The old sequential tiers (6 then 6.25) meant a coordinator dispatch_rank could
    //    never lift a draft above ANY baselined candidate — a rank-0 critical draft was
    //    skipped for rank-5 baselined mediums. Merging preserves the no-rank precedence
    //    (baselined entries listed first; orderByRankMap's stable sort keeps unranked
    //    rows in input order) while fresh ranks reorder across both pools. Per-kind
    //    eligibility guards and claim semantics unchanged; baselined entry wins a
    //    same-SD dedup (both pools can surface one SD).
    try {
      const { data: cands } = await sb
        .from('v_sd_next_candidates')
        .select('sd_id, track, status, priority')
        .limit(SELF_CLAIM_CANDIDATE_LIMIT);
      let draftRows = [];
      try { draftRows = await fetchDraftCandidates(sb); } catch { /* fail-open: drafts absent */ }
      // SD-LEO-INFRA-SELF-CLAIM-WINDOW-NEWEST-FIT-DRAFT-001 (FR-1): a FOURTH source — the NEWEST-N drafts
      // (created_at DESC), so a fresh non-fleet_critical fit-draft at age-position 11+ (outside the oldest-10
      // fetchDraftCandidates window and not fleet_critical) is in the pool instead of starving. Fail-open,
      // mirroring the draft/fleet_critical fetches.
      let newestRows = [];
      try { newestRows = await fetchNewestDraftCandidates(sb); } catch { /* fail-open: newest window absent */ }
      // SD-LEO-INFRA-SELF-CLAIM-WINDOW-FLEET-CRITICAL-001 (FR-2): a THIRD source for fleet_critical SDs
      // that sit OUTSIDE both windows above, so the downstream fleet_critical lift has them in the pool to
      // reorder. Placed here, inside the step-6 try and downstream of ALL acquisition guards (4.5/5.7/5.8/5.9).
      let fcRows = [];
      try { fcRows = await fetchFleetCriticalCandidates(sb); } catch { /* fail-open: window-only behavior */ }
      // SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-B (FR-1/FR-2): a FIFTH source for SDs the
      // coordinator has ranked (metadata.dispatch_rank set) that sit OUTSIDE every window above, so a
      // ranked-but-not-fleet_critical, middle-of-the-backlog SD is not wasted ranking work.
      let rankedRows = [];
      try { rankedRows = await fetchRankedCandidates(sb); } catch { /* fail-open: window-only behavior */ }

      const seen = new Set();
      const merged = [];
      for (const c of (cands || [])) {
        if (c.sd_id && !seen.has(c.sd_id)) { seen.add(c.sd_id); merged.push({ kind: 'baselined', key: c.sd_id, track: c.track }); }
      }
      for (const d of draftRows) {
        if (d.sd_key && !seen.has(d.sd_key)) { seen.add(d.sd_key); merged.push({ kind: 'draft', key: d.sd_key, row: d }); }
      }
      // SD-LEO-INFRA-SELF-CLAIM-WINDOW-NEWEST-FIT-DRAFT-001 (FR-1/FR-3): union the NEWEST-N drafts as
      // kind:'draft' rows (so each routes through tryClaimDraftCandidate -> the COMPLETE eligibility SSOT),
      // deduped by the SAME seen-set so an SD already surfaced by the oldest-10 window keeps its existing
      // entry (no double-count). Widens the POOL only; changes NO eligibility/ordering semantics.
      for (const d of newestRows) {
        if (d.sd_key && !seen.has(d.sd_key)) { seen.add(d.sd_key); merged.push({ kind: 'draft', key: d.sd_key, row: d }); }
      }
      // FR-2: union the fleet_critical source LAST so an SD already surfaced by the view/draft windows keeps
      // its existing entry (dedup via the SAME seen-set). kind:'baselined' routes each injected entry through
      // baselinedCandidateEligible -> the COMPLETE eligibility SSOT (classifyDispatchIneligibility incl. the
      // WORK-DOWN-NEVER-UP tier axis + parentLeadPending + refillSourceIneligibility + draftDepsSatisfied),
      // then isSdInFlight, then tryClaim — NO eligibility/claim bypass. sortByDispatchRank then lifts these
      // (strict-boolean fleet_critical) to the front of the merged pool.
      for (const f of fcRows) {
        if (f.sd_key && !seen.has(f.sd_key)) { seen.add(f.sd_key); merged.push({ kind: 'baselined', key: f.sd_key }); }
      }
      // FR-2 (SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-B): union the ranked-direct source LAST so
      // an SD already surfaced by any prior source keeps its existing entry (SAME seen-set dedup).
      // kind:'baselined' routes each injected entry through baselinedCandidateEligible -> the COMPLETE
      // eligibility SSOT, exactly like the fleet_critical union above — no eligibility/claim bypass.
      for (const r of rankedRows) {
        if (r.sd_key && !seen.has(r.sd_key)) { seen.add(r.sd_key); merged.push({ kind: 'baselined', key: r.sd_key }); }
      }

      // duty-6: honor the coordinator's fresh dispatch_rank across the WHOLE pool (fail-open).
      const ranked = await sortByDispatchRank(sb, merged, (x) => x.key);
      // FR-1 (anti-premature-winddown): expose the ranked claimable belt depth on EVERY result so the
      // /checkin skill can render concrete available work — a worker about to wind down sees data, not a
      // vibe. base is spread into the self_claimed / idle / QF results below.
      ctx.base.belt_ranked_claimable = ranked.length;
      // SD-LEO-INFRA-COMPLEXITY-TIERED-WORKER-ASSIGNMENT-001 (FR-3 + FR-5): resolve this worker's rung
      // and whether tiering is active ONCE per checkin (both are per-run constants, not per-candidate),
      // then thread into the shared classifier so a below-rung worker skips above-rung work. Fail-open:
      // any fault leaves tierCtx empty => byte-identical pre-tiering behavior.
      let tierCtx = {};
      try {
        // SD-LEO-INFRA-SELF-CLAIM-TIER-ENFORCEMENT-001: worker_tier_rank/tiering_active are now
        // computed ONCE per tick by the tier-context.cjs step (rung 5.65, before this one) and
        // read from ctx.tierCtx here rather than recomputed -- relocates, not duplicates, the
        // resolveWorkerTierRank/isTieringActive calls this file used to make on its own.
        tierCtx = {
          worker_tier_rank: ctx.tierCtx && ctx.tierCtx.worker_tier_rank,
          // SD-LEO-INFRA-FLEET-MODEL-REGISTRY-001 FR-6: the tier_rank above is read from the
          // PERSISTED stamp, which may have been derived when an unknown model still resolved
          // to STRONGEST — so it cannot vouch for capability. Thread positive evidence
          // separately so an unverified seat cannot self-admit above the lowest rung.
          worker_capability_unverified: !seatCapabilityIsVerified(ctx.sessionMetadata),
          tiering_active: !!(ctx.tierCtx && ctx.tierCtx.tiering_active),
          // SD-LEO-INFRA-DISPATCH-AUTH-AUTO-AUTHORIZE-001-C (FR-3): thread the reservations
          // drained by drain-reservations.cjs + this session's own id into the SAME tierCtx
          // object spread into both baselinedCandidateEligible below and
          // tryClaimDraftCandidate (scripts/worker-checkin.cjs), so the coordinatorReservation
          // axis reaches every self-claim path from one injection point. Absent ctx.reservations
          // (the common no-active-fence tick) leaves this undefined -- byte-identical to before.
          reservations: ctx.reservations,
          sessionId,
          // SD-LEO-INFRA-WORK-CLASS-CLAIM-001: the session's self-reported model enables the
          // workClassAxes fence in the shared classifier from this ONE injection point (both
          // baselinedCandidateEligible and tryClaimDraftCandidate receive tierCtx). Absent /
          // non-string model leaves the axis a byte-identical no-op (C-AC5) — only a
          // restricted model (fable) is fenced, and only on self-claim, never directed-assign.
          session_model: (ctx.sessionMetadata && typeof ctx.sessionMetadata.model === 'string')
            ? ctx.sessionMetadata.model : undefined,
        };
      } catch { /* fail-open: no tier ctx */ }
      // SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-E (FR-6)'s lower_tier_backlog_data fetch/thread was
      // retired to advisory-only by QF-20260831-419, then DELETED by SD-FDBK-INFRA-RETIRE-SEAT-TIER-001
      // (chairman ratification 20dc072b) -- the reserved_no_lower_backlog branch that consumed it no
      // longer exists in claim-eligibility.cjs's tierAxes. The fable_window_active producer below is a
      // SEPARATE, still-live ruling (QF-20260709-881) and is FENCED from this retirement -- untouched.
      if (tierCtx.tiering_active === true) {
        // QF-20260709-881: only a top-rung (fable) worker's downward claims are gated on this, so
        // only fetch when relevant — avoids a config round-trip for every sub-top-rung checkin.
        if (Number(tierCtx.worker_tier_rank) >= ladderTopRank()) {
          tierCtx.fable_window_active = await fetchFableWindowActive(sb);
        }
      }
      /*
       * SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-B FR-3 — THE PRODUCER for inflightGitAxes.
       *
       * Precomputed ONCE per tick and threaded into the same tierCtx spread into every self-claim
       * path, exactly as lower_tier_backlog_data above: the axis itself is pure/sync and must not
       * probe (a per-row probe would cost ~1.4s in a loop this file's own comment calls
       * "Pure/sync/DB-free").
       *
       * This exists because the first cut shipped the CONSUMER WITH NO PRODUCER — the axis read a
       * field nothing set, so it was permanently inert and, unlike the QF lanes, logged nothing.
       * A guard that silently never fires is worse than no guard, because the queue looks healthy.
       * Reviewers TESTING 94001fa5 / SECURITY d1622fdc both caught it independently.
       *
       * Scoped to EHG_Engineer: the snapshot records forApp, and the axis no-ops on any row from a
       * different target_application, so the worst case is a MISSED in-flight SD in another repo
       * (fail-open), never a false withhold. Fail-open on every fault — an unset field is the
       * pre-existing byte-identical behaviour.
       */
      try {
        const { getInflightSnapshot } = require('../../fleet/inflight-git-state.cjs');
        const { resolveGitHubRepo } = await import('../../repo-paths.js');
        const snap = getInflightSnapshot({
          repo: resolveGitHubRepo('EHG_Engineer'),
          forApp: 'EHG_Engineer',
        });
        if (snap && snap.status === 'OK') tierCtx.inflight_git_state = snap;
      } catch { /* fail-open: no in-flight ctx, axis stays a no-op */ }
      // QF-20260630-761: snapshot whether tiering is active so the idle message (below, outside this
      // scope) only attributes a 0-claimable belt to TIER when tiering is actually on. With tiering off
      // the 0 is non-tier ineligibility (orchestrator parents / clone trees / human-action / held).
      ctx.base.belt_tiering_active = tierCtx.tiering_active === true;
      // SD-LEO-INFRA-BELT-TIER-AWARE-CLAIMABILITY-001 (FR-2): belt_ranked_claimable above is the
      // tier-AGNOSTIC ranked pool — a below-rung worker sees it non-zero even when every ranked SD is
      // above its rung, then idles for hours on false "ranked" hope. Expose belt_claimable_at_my_tier:
      // of the ranked pool, how many are base-eligible AND reachable at THIS worker's rung (shared
      // tier-claimable rollup, reusing the gate). One batched fetch supplies the metadata the view-sourced
      // baselined candidates lack. Fail-open to the agnostic count so a fault never under-reports.
      ctx.base.belt_claimable_at_my_tier = ctx.base.belt_ranked_claimable;
      // FR-2 (BELT-CLAIMABLE-ACCURACY-FLOOR-001): default the repo-scoped count to the tier count so a
      // fault never under-reports; recomputed below to the subset claimable from THIS worker's checkout.
      ctx.base.belt_claimable_for_my_repo = ctx.base.belt_claimable_at_my_tier;
      try {
        // QF-20260629-597: ALL ranked keys are sd_keys — baselined keys come from
        // v_sd_next_candidates.sd_id which holds the sd_key STRING (not a UUID), and draft keys are sd_key.
        // The prior split fetched baselined via .in('id', ids), matching the UUID `id` column against sd_key
        // strings => 0 rows => baselined candidates dropped from the tier pool => belt_claimable_at_my_tier
        // under-counted to 0. One fetch keyed by sd_key is correct for both kinds.
        const allKeys = ranked.map((x) => x.key).filter(Boolean);
        // SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-D (FR-1): `parent_sd_id` added so the eligibility predicate
        // below can run IN MEMORY. Without it the gauge counted a raw pool.
        // `dependencies` is deliberately NOT selected (SEC-D-7): the dependency-refs axis is a recorded
        // exclusion for this PR, so the column would have no consumer while widening EVERY pooled row on
        // EVERY check-in tick, fleet-wide. It goes back in with the axis that reads it, not before.
        const cols = 'sd_key,id,sd_type,status,description,title,metadata,target_application,claiming_session_id,parent_sd_id';
        let pool = [];
        if (allKeys.length) {
          const { data } = await sb.from('strategic_directives_v2').select(cols).in('sd_key', allKeys);
          // QF-20260629-047: drop SDs already claimed by ANOTHER session — they are not claimable-to-me, so
          // counting them inflates belt_claimable_at_my_tier and suppresses the tier-deficit idle message
          // (which only fires at 0). Mirrors the forecaster's `if (d.claiming_session_id) continue;`. Keep
          // rows claimed by THIS session (resume) and unclaimed rows.
          pool = (data || []).filter((r) => !r.claiming_session_id || r.claiming_session_id === sessionId);
        }
        /*
         * SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-D (FR-1 + FR-2) — THE PARENT-LEAD AXIS ON THE GAUGE.
         *
         * MEASURED DEFECT (2026-09-03T09:53Z): this gauge reported claimable depth 10 while the true
         * eligible depth was 0, in a tick that simultaneously returned action='idle' and
         * belt_block={verdict:'OK'}. Ten ranked children of a pre-LEAD orchestrator parent counted as
         * claimable because NOTHING here applied the parent-LEAD axis — claimableForTier/ForRepo accept
         * an OPTIONAL depSatisfied predicate (tier-claimable.cjs:54-60) that the call sites never passed,
         * leaving the filter inert. The belt CENSUS (belt-census.cjs:186) already gets this right; this
         * is the same defect class QF-20260812-281 closed in belt-depth.cjs on 2026-08-12, on a surface
         * that sweep never reached.
         *
         * SYNCHRONOUS BY CONSTRUCTION: the counting path is deliberately sync (the pool loop avoids a
         * per-tick async cost). So parent rows are resolved ONCE, batched, into maps BEFORE the
         * predicate runs — the batched shape proven at scripts/lib/capacity-inputs.mjs:317-327, not the
         * census's per-row awaits (belt-census.cjs:184-186), which would be O(N) round-trips per tick.
         *
         * PARENT REFS RESOLVE BY id OR sd_key: parentLeadPending resolves via .or(id.eq,sd_key.eq)
         * (claim-eligibility.cjs:583), so parent_sd_id may hold EITHER form. A bare .in('id', refs)
         * would repeat the QF-20260629-597 scar recorded 4 lines above — and would additionally ERROR
         * on a non-uuid ref (invalid input syntax for type uuid). Refs are therefore split by shape and
         * fetched with at most TWO bounded .in() calls.
         */
        const { parentLeadPendingVerdict } = require('../../fleet/claim-eligibility.cjs');
        const byKey = new Map(pool.filter((r) => r.sd_key).map((r) => [r.sd_key, r]));
        const byId = new Map(pool.filter((r) => r.id != null).map((r) => [r.id, r]));
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const missingRefs = [...new Set(pool
          .map((r) => r.parent_sd_id)
          .filter((ref) => ref != null && !byId.has(ref) && !byKey.has(ref)))];
        const extraParents = new Map();
        if (missingRefs.length) {
          const pcols = 'id,sd_key,status,current_phase';
          const uuidRefs = missingRefs.filter((ref) => UUID_RE.test(String(ref)));
          const keyRefs = missingRefs.filter((ref) => !UUID_RE.test(String(ref)));
          const fetches = [];
          // Explicitly bounded: missingRefs is a subset of the ranked pool (itself capped by
          // SELF_CLAIM_CANDIDATE_LIMIT), so 500 can never truncate a real read — it is a stated
          // ceiling rather than a silent PostgREST cap.
          if (uuidRefs.length) fetches.push(sb.from('strategic_directives_v2').select(pcols).in('id', uuidRefs).limit(500));
          if (keyRefs.length) fetches.push(sb.from('strategic_directives_v2').select(pcols).in('sd_key', keyRefs).limit(500));
          const results = await Promise.all(fetches.map((q) => Promise.resolve(q).catch(() => ({ data: [] }))));
          for (const res of results) {
            for (const p of ((res && res.data) || [])) {
              if (p.id != null) extraParents.set(p.id, p);
              if (p.sd_key) extraParents.set(p.sd_key, p);
            }
          }
        }
        // A ref that resolves to nothing is DANGLING (no such parent row). parentLeadPendingVerdict
        // fail-opens on an absent parent by design (claim-eligibility.cjs:570-571), and this MATCHES
        // that contract deliberately rather than diverging — a gauge that disagreed with the claim
        // path would be a second representation. Surfaced as a count so it is observable, not silent.
        const resolveParent = (sd) => {
          const ref = sd && sd.parent_sd_id;
          if (ref == null) return null;
          return byId.get(ref) || byKey.get(ref) || extraParents.get(ref) || null;
        };
        ctx.base.belt_dangling_parent_refs = missingRefs.filter((ref) => !extraParents.has(ref)).length;
        // The predicate itself: pure, synchronous, and composed from the SHARED verdict (TR-1 — reuse,
        // never re-derive). Scoped to the parent-LEAD axis; the dependency-refs axis is a RECORDED
        // EXCLUSION for this PR (see the SD), not an oversight — its absent-ref semantics differ
        // between the forecaster and the claim path and must be reconciled before it is wired here.
        const depSatisfied = (sd) => !parentLeadPendingVerdict(resolveParent(sd));
        ctx.base.belt_claimable_at_my_tier = claimableForTier(pool, {
          workerTierRank: tierCtx.worker_tier_rank,
          tieringActive: tierCtx.tiering_active === true,
          depSatisfied,
        }).length;
        // M-3 OBSERVABILITY: the surrounding try fails OPEN to the raw agnostic count, which was the
        // right direction before this change (never under-report) but now means ONE swallowed exception
        // silently restores the defect with every test still green. This flag is the discriminator: it
        // is only ever true when the eligibility predicate actually ran.
        ctx.base.belt_eligibility_applied = true;
        // FR-1 — THE HEADLINE NUMBER. belt_ranked_claimable is what idle.cjs:88, antiWinddownDirective
        // (worker-checkin.cjs:1057, directed-assignment.cjs:295) and coordinator-belt-block.js:59 all read
        // as "work is available". Leaving it as the RAW pool size IS the reported symptom: the measured
        // tick returned belt_block={verdict:'OK', claimableDepth:10} in the same breath as action='idle'.
        // It therefore now reports ELIGIBLE depth. tierBlocks() is a documented no-op (tier-claimable.cjs:
        // 71-73), so claimableForTier here yields the BASE-ELIGIBLE set — exactly the meaning this field
        // has always claimed to have. The raw size is preserved, not discarded, so the gap stays visible.
        ctx.base.belt_ranked_pool_size = ctx.base.belt_ranked_claimable;
        ctx.base.belt_ranked_claimable = ctx.base.belt_claimable_at_my_tier;
        // FR-2: repo-scoped subset — of the tier-reachable pool, how many this worker's checkout
        // (process.cwd()) can actually claim (not cross-repo / premise-open), reusing the gate's repo
        // axis. Lets a repo-pinned worker idle honestly instead of chasing a fleet-wide count.
        ctx.base.belt_claimable_for_my_repo = claimableForRepo(pool, {
          workerTierRank: tierCtx.worker_tier_rank,
          tieringActive: tierCtx.tiering_active === true,
          cwd: process.cwd(),
          depSatisfied,
        }).length;
        // QF-20260719-144: tally the REAL ineligibility reason per pooled row so idle.cjs can name the
        // actual blockers instead of blaming TIER whenever tiering is active. classifyDispatchIneligibility
        // is the SSOT and its tier axis is near-LAST in precedence, so an orchestrator / human-action /
        // test-fixture row classifies as THAT — never as tier. Eligible rows return null (skipped). Pure/
        // sync/DB-free tally over the already-fetched pool; the surrounding try keeps it fail-open.
        const { classifyDispatchIneligibility } = require('../../fleet/claim-eligibility.cjs');
        const ineligBreakdown = {};
        for (const r of pool) {
          const reason = classifyDispatchIneligibility(r, tierCtx);
          if (reason) ineligBreakdown[reason] = (ineligBreakdown[reason] || 0) + 1;
        }
        ctx.base.belt_ineligibility_breakdown = ineligBreakdown;
        // SD-LEO-INFRA-WORK-CLASS-CLAIM-001 (C-STARVE observability): fenced-away items are
        // never silent — surface which ranked SDs this restricted session skipped and why,
        // mirroring reservation_fences_skipped. Empty/no-op for unrestricted sessions.
        if (typeof tierCtx.session_model === 'string') {
          const { workClassIneligibilityReason, deriveWorkClass } = require('../../fleet/work-class.cjs');
          const fenced = pool
            .map((r) => ({ sd: r.sd_key, reason: workClassIneligibilityReason(r, tierCtx.session_model), derived_class: deriveWorkClass(r) }))
            .filter((f) => f.reason);
          if (fenced.length) ctx.base.work_class_fenced = fenced;
        }
      } catch { /* fail-open: keep the agnostic count */ }
      for (const x of ranked) {
        // SD-LEO-INFRA-DISPATCH-AUTH-AUTO-AUTHORIZE-001-C (FR-4): cheap, DB-free pre-check using
        // the SAME coordinatorReservation function the eligibility axis uses (no duplicated fence
        // logic) -- when it fires, skip this candidate immediately (no wasted DB round-trip) and
        // record a breadcrumb. Absent ctx.reservations (the common no-active-fence tick) makes
        // this a no-op single object check.
        if (ctx.reservations) {
          const fenceReason = coordinatorReservation({ sd_key: x.key }, tierCtx);
          if (fenceReason) {
            const now = Date.now();
            const fences = ctx.reservations[x.key] || [];
            const activeFence = fences.find((f) => {
              const exp = f.expiresAt ? Date.parse(f.expiresAt) : NaN;
              return !(Number.isFinite(exp) && exp <= now);
            }) || fences[0] || {};
            if (!ctx.base.reservation_fences_skipped) ctx.base.reservation_fences_skipped = [];
            ctx.base.reservation_fences_skipped.push({
              sd: x.key,
              reason: fenceReason,
              reserved_for_session: activeFence.reservedForSession || null,
              reserved_for_tier: activeFence.reservedForTier || null,
              lane_pattern: activeFence.lanePattern || null,
              expires_at: activeFence.expiresAt || null,
            });
            continue;
          }
        }
        if (x.kind === 'baselined') {
          // SD-FDBK-FIX-WORKER-SELF-CLAIM-001: skip dependency-blocked SDs and orchestrator PARENTS
          // (the view surfaces both; claim_sd enforces neither). Mirrors the draft-tier guard.
          // SD-LEO-INFRA-WORKER-CLAIM-TIME-001 (FR-2): {cwd} adds the claim-time fitness axes so a
          // baselined candidate unfit for THIS checkout is skipped before claiming.
          if (!(await baselinedCandidateEligible(sb, x.key, { cwd: process.cwd(), ...tierCtx }))) continue;
          if (await isSdInFlight(sb, x.key, sessionId)) continue;  // dedup: started or live-foreign-held
          const claimed = await tryClaim(sb, x.key, sessionId, x.track);
          if (claimed.ok) {
            return { ...ctx.base, action: 'self_claimed', sd: x.key, track: x.track,
              message: `Self-claimed ${x.key} from sd:next. Run: node scripts/sd-start.js ${x.key}. ${antiWinddownDirective(ranked.length)}` };
          }
        } else {
          const result = await tryClaimDraftCandidate(sb, sessionId, ctx.base, x.row, tierCtx);
          if (result) return result;
        }
      }
    } catch { /* fail-open */ }
  },
};
