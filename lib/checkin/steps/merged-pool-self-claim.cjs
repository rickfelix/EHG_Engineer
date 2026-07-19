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
      resolveWorkerTierRank, isTieringActive, fetchLowerTierBacklogData, ladderTopRank,
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
        tierCtx = {
          worker_tier_rank: resolveWorkerTierRank({ metadata: ctx.sessionMetadata }),
          tiering_active: await isTieringActive(sb),
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
      // SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-E (FR-6): precompute the backlog verdict inputs ONCE
      // per tick — lowerTierBacklog() itself is pure/sync (runs inside classifyDispatchIneligibility),
      // but its two halves (claimable-by-tier, idle-by-tier) are DB-dependent, so fetchLowerTierBacklogData
      // does the fetch here and the result is threaded into tierCtx.lower_tier_backlog_data. Only when
      // tiering is active (mirrors every other tier-axis fetch in this function) — with < 2 live workers
      // the whole tier axis, including this gate, must stay inert (degrade-to-1). Fail-open: a null
      // return leaves the field unset, which is the classifier's documented byte-identical
      // WORK-DOWN-ALWAYS fallback.
      if (tierCtx.tiering_active === true) {
        const backlogData = await fetchLowerTierBacklogData(sb);
        if (backlogData) tierCtx.lower_tier_backlog_data = backlogData;
        // QF-20260709-881: only a top-rung (fable) worker's downward claims are gated on this, so
        // only fetch when relevant — avoids a config round-trip for every sub-top-rung checkin.
        if (Number(tierCtx.worker_tier_rank) >= ladderTopRank()) {
          tierCtx.fable_window_active = await fetchFableWindowActive(sb);
        }
      }
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
        const cols = 'sd_key,id,sd_type,status,description,title,metadata,target_application,claiming_session_id';
        let pool = [];
        if (allKeys.length) {
          const { data } = await sb.from('strategic_directives_v2').select(cols).in('sd_key', allKeys);
          // QF-20260629-047: drop SDs already claimed by ANOTHER session — they are not claimable-to-me, so
          // counting them inflates belt_claimable_at_my_tier and suppresses the tier-deficit idle message
          // (which only fires at 0). Mirrors the forecaster's `if (d.claiming_session_id) continue;`. Keep
          // rows claimed by THIS session (resume) and unclaimed rows.
          pool = (data || []).filter((r) => !r.claiming_session_id || r.claiming_session_id === sessionId);
        }
        ctx.base.belt_claimable_at_my_tier = claimableForTier(pool, {
          workerTierRank: tierCtx.worker_tier_rank,
          tieringActive: tierCtx.tiering_active === true,
        }).length;
        // FR-2: repo-scoped subset — of the tier-reachable pool, how many this worker's checkout
        // (process.cwd()) can actually claim (not cross-repo / premise-open), reusing the gate's repo
        // axis. Lets a repo-pinned worker idle honestly instead of chasing a fleet-wide count.
        ctx.base.belt_claimable_for_my_repo = claimableForRepo(pool, {
          workerTierRank: tierCtx.worker_tier_rank,
          tieringActive: tierCtx.tiering_active === true,
          cwd: process.cwd(),
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
