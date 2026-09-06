#!/usr/bin/env node
/**
 * One-off: VALIDATION sub-agent evidence for SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E, LEAD-TO-PLAN phase.
 *
 * Independently re-runs the SD's own published STEP-0 dedup claim ("no open SD or QF on is_alive /
 * isSessionAlive / clearAndReopenQf; child C named the contradiction without treating it;
 * LIVENESS-DISCRIMINATOR-001 is adjacent, not this") rather than accepting it, plus a duplicate/
 * overlap sweep across strategic_directives_v2 and quick_fixes and a light scope-coherence check.
 *
 * HEADLINE: the dedup claim was TRUE AT MINT (2026-09-04T19:05:18Z, metadata.dedup_match_sd_key="none")
 * and is FALSE NOW. QF-20260905-544 (open, unclaimed, minted 2026-09-05T05:59:20Z) is an exact
 * duplicate of FR-3 -- same file, same line, same specimens, same fix shape.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E';

const findings = [
  {
    id: 'finding-1-dedup-conflict-qf-20260905-544-duplicates-fr3',
    severity: 'HIGH',
    summary: 'DEDUP CLAIM PREDICATE 1 IS NOW FALSE -- ONE REAL CONFLICT. QF-20260905-544 (status=open, claiming_session_id=null, disposition=null, escalated_to_sd_id=null, routing_tier=1, estimated_loc=10, created 2026-09-05T05:59:20.302Z by Adam on coordinator source request d00d7458) is an EXACT duplicate of this SD\'s FR-3. Its title is "stale-session sweep cannot release a status=open quick fix held by a dead session: clearAndReopenQf filters status=in_progress only, so the UPDATE matches zero rows and returns guard_refused". Same file and line as FR-3 (lib/fleet/best-effort-release.mjs:246-254, the .filter(\'status\',\'eq\',\'in_progress\') at :254), same specimens (old Bravo e60956f5, QF-20260903-722 and QF-20260903-020 held at status=open for 19 hours), same fix shape ("the status predicate becomes status in (open, in_progress) with the same holder CAS"). NOT a stale-authoring error: this SD\'s metadata records dedup_match_sd_key="none" at sd_authoring_validated_at 2026-09-04T19:05:18.607Z, and the QF was minted 10h54m LATER. Both rows were sourced by Adam from coordinator routes; the QF mint pass did not see the SD lane. This is the exact bidirectional blindness QF-20260903-254 already names ("STEP-0 dedup predicates are SD-lane only and cannot see a completed quick fix"). RESOLUTION REQUIRED FROM LEAD BEFORE PLAN: either close QF-20260905-544 as duplicate_of this SD (recommended -- FR-3 is coupled to FR-4, whose single CI fixture asserts BOTH an in_progress and a claimed-open QF release), or drop FR-3 from this SD and let the Tier-1 QF ship it. Do not let both proceed: they edit the same five lines.',
  },
  {
    id: 'finding-2-qf-544-carries-a-scope-increment-fr3-lacks',
    severity: 'MEDIUM_HIGH',
    summary: 'QF-20260905-544 is not a strict subset of FR-3 -- it carries TWO requirements FR-3 does not state, which would be LOST if the QF is simply cancelled as a duplicate. (a) RETURN-VALUE DISAMBIGUATION: "the return distinguishes guard_refused (a live holder or a pushed branch) from no_match_status so the sweep prints the reason" -- today the zero-row UPDATE returns guard_refused and the sweep logs it as the guard doing its job, i.e. the defect is SILENT AT THE OBSERVER, which is why it survived 19 hours of 5-minute sweeps. (b) CENSUS SPLIT: "the census line QF HOLDERS not in the census counts the two states separately". Recommend folding both into FR-3 verbatim when the QF is closed, and citing QF-20260905-544 as the second source on the PRD.',
  },
  {
    id: 'finding-3-child-c-did-not-treat-is-alive-CONFIRMED-by-diff',
    severity: 'HIGH',
    summary: 'DEDUP CLAIM PREDICATE 2 CONFIRMED ON EVIDENCE, NOT ASSUMED. SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-C is genuinely status=completed / current_phase=COMPLETED (2026-09-04T04:57Z), and genuinely did NOT treat is_alive. C shipped in exactly two merge commits, both contained in main: 53a7d92768f (PR #8153, feat branch) and c9dda9d29eb (PR #8155, CHANGELOG only); git log main..feat/SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-C is empty. C changed 11 files (+538/-38): lib/coordinator/{adam-identity,solomon-identity,singleton-refresh-sequencer}.cjs, lib/fleet/reboot-respawn-runner.js, lib/fleet/stuck-seat-predicate.cjs (DOCBLOCK ONLY, no logic), scripts/{adam,solomon}-register.cjs and 5 test files. HARD NEGATIVES: the string "is_alive" appears ZERO times in C\'s entire diff; C added or removed ZERO .update()/.upsert()/.insert() statements (every claude_sessions touch in C is a .select() column widening to add last_tool_at); and none of lib/fleet/session-liveness.cjs, lib/fleet/best-effort-release.mjs, scripts/stale-session-sweep.cjs or lib/heartbeat-manager.mjs appear in C\'s changed-file list (the first two were last touched by 8d6d5278085 on 2026-09-02, predating C). C\'s actual subject is singleton-seat election: Adam/Solomon isFresh() now composes classifySeat() from stuck-seat-predicate.cjs. The contradiction it NAMED ("is_alive IS WRONG IN BOTH DIRECTIONS IN A SINGLE READ ... Name it unusable in the child") it explicitly REFUSED as an input rather than repairing. "Named without treating" is accurate.',
  },
  {
    id: 'finding-4-both-target-defects-still-live-on-main',
    severity: 'HIGH',
    summary: 'THIS SD IS NOT ALREADY-BUILT. Verified on main HEAD 92cde3162a1b78a7463578bb24488d04a9a084ec (2026-09-05, clean working tree for all three files): lib/fleet/session-liveness.cjs:169 still reads `if (session.is_alive === true) return { alive: true, reason: \'raw_is_alive\' };` as the FIRST rung of isSessionAlive() (declared :167), with the one-directional contract still stated verbatim in the docblock at :158-161. lib/fleet/best-effort-release.mjs clearAndReopenQf() (declared :246) still carries `.filter(\'status\', \'eq\', \'in_progress\')` at :254. scripts/stale-session-sweep.cjs still composes both (isSessionAlive required :1311, called :1323; clearAndReopenQf imported :1333, called :1334). FR-5 BACKFILL SIZED BY MEASUREMENT (2026-09-05, exact count head query, not a sample): 2,106 claude_sessions rows satisfy (status=\'released\' OR stale_at IS NOT NULL) AND is_alive=true, out of 13,176 released-or-stale rows and 13,181 rows total. FR-5 says the count is "recorded on the PRD" -- that number is 2,106 as of this reading.',
  },
  {
    id: 'finding-5-fr4-exit-predicate-unsatisfiable-by-construction',
    severity: 'HIGH',
    summary: 'FR-4\'S SCHEDULED EXIT PREDICATE CANNOT REACH ZERO EVEN IF FR-1 AND FR-5 SHIP PERFECTLY -- it would fail permanently on healthy live seats. FR-4 asserts zero rows with (status released OR stale_at set) AND is_alive=true. But stale_at is NEVER CLEARED on the release leg: cleanup_stale_sessions\'s release CTE (database/migrations/20260605_atomic_lease_sweep_respect_inflight.sql:142-151) sets status=\'released\' and leaves stale_at non-null; claim_sd (20260828_claim_sd_qf_live_peer_guard.sql:450-458) and scripts/hooks/session-register.cjs:556-576 then flip status back to \'active\' WITHOUT clearing stale_at; and once status is \'active\', the one path that would null it -- lib/session-manager.mjs updateHeartbeat():637-641 -- no longer matches, because it is filtered `.in(\'status\', [\'released\',\'stale\'])`. lib/heartbeat-manager.mjs:178/350 then writes is_alive=true unconditionally, with no status or stale_at guard. NET: a live, actively-claimed, correctly-working session sits at status=\'active\' + stale_at NOT NULL + is_alive=true indefinitely, a permanent violation of FR-4\'s predicate with no defect present. Additionally startHeartbeat():178 calls setIsAlive(true) BEFORE sendHeartbeat():181 and neither is awaited, so there is a transient status=\'released\' + is_alive=true window at every session start that would make the scheduled check flap. PLAN MUST resolve this: either add a requirement that the revive/claim paths clear stale_at (making FR-1 two-sided), or narrow the predicate to status IN (\'released\',\'stale\'), or exclude rows with a fresh heartbeat. As written the exit predicate is not achievable and would be dismissed as noise within a day.',
  },
  {
    id: 'finding-6-fr1-and-fr4-miss-the-status-idle-retire-paths',
    severity: 'MEDIUM_HIGH',
    summary: 'FR-1 scopes itself to "every path that sets claude_sessions.status to released or stamps stale_at", and FR-4\'s predicate keys on the same two states. But there is a THIRD terminal shape: retire paths that land on status=\'idle\'. scripts/stale-session-sweep.cjs has five release payloads written as `s.status === \'ACTIVE\' ? \'idle\' : \'released\'` (3621-3629, 3660-3668, 3689-3697, 3726-3734, 3760-3768) -- these ARE retires, and half the time they write \'idle\', escaping both FR-1\'s phrasing and FR-4\'s predicate. claim_sd\'s takeover / claim-switch legs (20260828_claim_sd_qf_live_peer_guard.sql:392-402, :408-421) and release_sd (20260902_release_sd_by_key.sql:164-174) also write \'idle\' and never \'released\'. The LEAD-phase Explore evidence for this SD classified release_sd/release_sd_by_key as "correctly out of FR-1 scope (unclaim, not retire)" -- that judgment is right for release_sd but does NOT extend to the five sweep payloads, which are retires wearing an \'idle\' status. Recommend FR-1 state the terminal set explicitly (released, stale, and the sweep\'s idle-retire branch) rather than by status literal, and FR-4 match it.',
  },
  {
    id: 'finding-7-fr2-internal-contradiction-on-status-idle',
    severity: 'MEDIUM_HIGH',
    summary: 'FR-2 CONTRADICTS ITSELF. Clause 1: "isSessionAlive() does not honour raw is_alive when status is released or stale_at is set" -- a two-state exclusion. Clause 2, one sentence later: "the \'raw_is_alive\' reason survives ONLY for rows whose status is active" -- an allowlist of one. These disagree for every other status value, most consequentially status=\'idle\', which is a live, claimable, entirely healthy seat state and is written by release_sd, claim_sd\'s takeover legs and the sweep\'s idle-retire branch. Under clause 1 an idle row keeps the raw_is_alive rung; under clause 2 it loses it. PLAN must pick one before implementation, and the two readings produce materially different blast radii. Recommend clause 1 (deny-list on released/stale_at), because it is the narrower change and is what the SD\'s own defect specimen and FR-4 predicate are both built on.',
  },
  {
    id: 'finding-8-fr2-narrows-a-deliberate-prior-contract-needs-no-regression-test',
    severity: 'MEDIUM_HIGH',
    summary: 'FR-2 REVERSES A DELIBERATE, DOCUMENTED DESIGN DECISION FROM A PRIOR COMPLETED SD, and must carry that SD\'s regression test or it can re-open the class that SD was built to kill. SD-LEO-INFRA-IS-ALIVE-LIVENESS-SSOT-001 (completed 2026-06-23) CREATED isSessionAlive and made the one-directional rule explicit and intentional: "One-directional + stamped: only UPGRADE a parked-alive worker to alive with a reason; NEVER downgrade a worker the raw flag calls alive (never mask a real death)." Its motivating specimen was the inverse of this SD\'s: a parked-but-alive worker (Bravo 300a1a8b) false-negatived into a FALSE \'fleet down\' + FALSE \'orphaned SDs\' diagnosis that nearly reaped actively-building work. THE RISK IS LIVE, NOT THEORETICAL: released-while-alive is a recurring measured event on this fleet (QF-20260724-652 "Staleness sweep releases LIVE workers"; SD-LEO-INFRA-STALE-SWEEP-LIVENESS-SSOT-001\'s own 2026-09-04 specimen, Golf 838c05dd and Golf-3 a1d6d6cf released STALE_CLEANUP at 20:13:15Z with heartbeat_at fresh at 20:14-20:15Z). ASSESSMENT: the narrowing is nonetheless SOUND, because FR-2 removes only the raw_is_alive RUNG -- the heartbeat, PID, tick and armed-silence rungs still fire and still upgrade, so Golf-3 (fresh heartbeat) would still read alive. The regression is bounded to a row that is released/stale AND has no fresh heartbeat AND no live PID AND no fresh tick AND no armed silence AND is_alive=true, which is precisely the e60956f5 shape. BUT that reasoning must become an assertion: FR-4 should add the inverse fixture -- a wrongly-released row with a FRESH heartbeat still reads alive -- alongside the e60956f5 fixture. Without it, FR-2 ships as a one-sided change to a contract whose other side has drawn blood four times.',
  },
  {
    id: 'finding-9-discriminator-001-is-genuinely-different-plus-reciprocal-confirmation',
    severity: 'MEDIUM',
    summary: 'DEDUP CLAIM PREDICATE 3 CONFIRMED, and independently corroborated by a third SD. SD-LEO-INFRA-LOOP-LIVENESS-DISCRIMINATOR-001 (draft, minted 2026-09-04T14:29Z) is LOOP liveness -- "is the worker\'s conversation loop executing", classifying LIVE-ENGAGED / LIVE-IDLE / DEAD-LOOP / UNKNOWN from heartbeat freshness + last_tool_at movement + loop_state/isKnownWedged, consumed by adam-coordinator-health.mjs\'s engagement classifier (QF-20260904-650), lib/adam/outbound-silence-watchdog.js (QF-20260904-790), coordinator-revive fail-loud (QF-20260903-834), plus host Task Scheduler registration and a delivered-cadence gauge. This SD is RECORD liveness -- "does the claude_sessions row\'s is_alive column agree with its own status/stale_at". Zero FR overlap and zero file overlap (lib/adam/*, adam-coordinator-health.mjs, coordinator-revive.cjs vs lib/fleet/session-liveness.cjs, lib/fleet/best-effort-release.mjs and the release writers). STRONGEST EVIDENCE IS THIRD-PARTY AND RECIPROCAL: SD-LEO-INFRA-STALE-SWEEP-LIVENESS-SSOT-001 (a DIFFERENT SD, completed 2026-09-04T23:09Z, i.e. AFTER this SD was minted) states in its own OUT OF SCOPE, verbatim: "scripts/stale-session-sweep.cjs is_alive coherence (SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E owns the release paths\' is_alive writes); alarm-cron liveness (SD-LEO-INFRA-LOOP-LIVENESS-DISCRIMINATOR-001)". A neighbouring SD naming this one as the owner of exactly this territory is stronger dedup evidence than this SD\'s own assertion.',
  },
  {
    id: 'finding-10-forward-coupling-discriminator-fr7-vs-this-sd-fr2',
    severity: 'MEDIUM',
    summary: 'ONE FORWARD COUPLING THE OUT-OF-SCOPE SECTION DOES NOT COVER, worth a sequencing note rather than a block (both SDs are unstarted drafts). This SD\'s OUT OF SCOPE addresses DISCRIMINATOR-001 FR-1 only ("which consumes isSessionAlive and is unaffected by this narrowing"). It does not address DISCRIMINATOR-001 FR-7, which requires "a test [that] enumerates every reader of claude_sessions.heartbeat_at under lib/adam, lib/coordinator, LIB/FLEET and scripts/adam-*, scripts/coordinator-*, and asserts each liveness decision routes through FR-1 (allowlist for pure telemetry reads with a stated reason); baseline asserted, growth fails CI". lib/fleet/session-liveness.cjs isSessionAlive() is a heartbeat_at reader under lib/fleet that makes a liveness decision, so a literal FR-7 would require it to route through the LOOP-liveness discriminator -- wrong on the merits (record liveness is not loop liveness) and directly collides with this SD\'s FR-2. Recommend the PLAN handoff carry a one-line note that DISCRIMINATOR-001 FR-7\'s allowlist must name session-liveness.cjs as record-liveness, outside the loop-liveness domain.',
  },
  {
    id: 'finding-11-out-of-scope-item-3-is-now-factually-stale',
    severity: 'MEDIUM',
    summary: 'THE SCOPE\'S OUT OF SCOPE SECTION CARRIES ONE ASSERTION THAT IS NO LONGER TRUE. It reads: "hand-clearing -020 and -722 (the sweep owns the release once FR-3 lands; THE COORDINATOR HAS NOT HAND-CLEARED THEM)". Measured now: QF-20260903-020 and QF-20260903-722 both read status=open with claiming_session_id=NULL -- they HAVE been hand-cleared. QF-20260905-544\'s own description dates and attributes it: "the coordinator cleared both by hand 05:5xZ under the same CAS predicates, both remain open ... Live count at 06:0xZ: 0 open QFs with a claiming session (the two specimens were hand-cleared), so the class is quiet until the next dead holder." (The third cited specimen, QF-20260903-831, is consistent with the scope text: status=completed at 2026-09-04T20:24Z, disposition=re_verified.) CONSEQUENCE FOR PLAN, not merely bookkeeping: FR-3 no longer has a live specimen to verify against post-merge, and the class is dormant until the next dead holder appears. FR-4\'s fixture-built approach is therefore load-bearing rather than convenient -- it is now the ONLY way to demonstrate FR-3, which is an argument for keeping FR-3 inside this SD (where FR-4 lives) rather than splitting it out to the Tier-1 QF. Recommend a correction stamp on the scope text.',
  },
  {
    id: 'finding-12-sibling-children-and-backlog-norm-clean',
    severity: 'INFO',
    summary: 'TWO GATE-1 CHECKS THAT COULD HAVE READ AS BLOCKERS, BOTH CLEARED BY MEASUREMENT. (a) SIBLING OVERLAP: the published STEP-0 dedup named only child C, so I checked all four siblings under parent acb1476e independently. A (pending_approval, LEAD_FINAL) repairs the claim_sd symmetric clear in strategic_directives_v2 -- different table, different defect. B (draft, LEAD) repairs two phantom-column claim detectors (join on id vs session_id) -- different defect. C (completed) -- see finding-3. D (completed) collapses four idle-capacity definitions into one shared predicate -- adjacent naming, different subject. No sibling touches is_alive writing, isSessionAlive, or clearAndReopenQf. Clean. (b) BACKLOG ITEMS: this SD has 0 rows in sd_backlog_map and no PRD yet. Under the generic Gate-1 rule that would block activation, but it is the FAMILY NORM here, not a defect: siblings C and D both reached status=completed with 0 backlog items, and A sits at pending_approval with 0. This orchestrator-child family carries its FR set in the scope prose (metadata.functional_requirements is absent on all four siblings including E). Reported as INFO, NOT as a Gate-1 block. Flagging only because the require_backlog_for_active constraint may still refuse the status transition at activation time, in which case it is a harness interaction, not a scope defect.',
  },
  {
    id: 'finding-13-scope-coherence-light-strategic-read',
    severity: 'INFO',
    summary: 'LIGHT STRATEGIC SANITY CHECK (not the formal LEAD 9-question gate, which is LEAD\'s own job). The scope IS a coherent, boundable piece of work. The FR chain is a clean causal spine, each link grounded in a measured specimen from one incident: FR-1 writers -> FR-2 the reader that trusted them -> FR-3 the downstream consumer that trusted the reader -> FR-4 test + scheduled exit predicate -> FR-5 backfill of the accumulated damage. All five sites are in one repo (EHG_Engineer), the change is small and mechanical, and the specimen (e60956f5) exercises the whole chain end to end, which is unusually good scoping. THREE INTERNAL-CONSISTENCY DEFECTS FOUND, all listed above and all repairable at PLAN without re-scoping: FR-4\'s predicate is unsatisfiable as written (finding-5), FR-2 contradicts itself on non-active/non-released statuses (finding-7), and OUT OF SCOPE item 3 asserts a fact that has since changed (finding-11). THE OUT OF SCOPE SECTION IS OTHERWISE INTERNALLY CONSISTENT with the rest of the scope: item 1 (loop-liveness discriminator) is genuinely a different concern and is reciprocally confirmed by a third SD (finding-9); item 2 (the reaper reclaim predicate, WORKTREE-REAPER-PRESERVE-001) is a clean boundary and moot in practice since that SD completed 2026-09-04; item 3 is the stale one. ONE STRUCTURAL OBSERVATION FOR LEAD: FR-5 (a 2,106-row idempotent data backfill) is a different risk class from FR-1..FR-4 (code + tests) and is the only irreversible element in the SD; it is legitimately scoped here but should be gated on FR-1 and FR-2 landing first, or it will be re-dirtied by the unfixed writers before the merge commit.',
  },
];

const warnings = [
  'BLOCKING FOR LEAD APPROVAL: QF-20260905-544 (open, unclaimed) and this SD\'s FR-3 are the same five-line change to lib/fleet/best-effort-release.mjs:250-254. LEAD must pick an owner before PLAN. Recommended: close the QF as duplicate_of this SD, folding its two extra requirements (guard_refused vs no_match_status disambiguation; the split census line) into FR-3.',
  'FR-4\'s scheduled exit predicate as written can never read zero -- it fires on healthy live seats that carry a non-null stale_at at status=active, because no path clears stale_at once status leaves released/stale. PLAN must re-specify the predicate or add a stale_at-clearing requirement to FR-1, otherwise the preventive this SD exists to install is a permanently-red check.',
  'FR-2 contains two mutually inconsistent clauses (deny-list on released/stale_at vs allowlist of status=active only). They differ for status=idle, a healthy live state. PLAN must choose; recommend the deny-list reading.',
  'FR-2 narrows the one-directional contract that SD-LEO-INFRA-IS-ALIVE-LIVENESS-SSOT-001 deliberately installed on 2026-06-23 after four instances of the false-negative class. The narrowing is sound on analysis but must be pinned by an inverse fixture in FR-4 (a released-while-alive row with a fresh heartbeat still reads alive), or a fifth instance of that class becomes reachable.',
  'FR-1\'s and FR-4\'s status literals miss the sweep\'s five idle-retire payloads (stale-session-sweep.cjs 3621-3768, `s.status === \'ACTIVE\' ? \'idle\' : \'released\'`), which are retires that land on status=idle. State the terminal set explicitly rather than by status literal.',
  'The scope\'s OUT OF SCOPE claim that "the coordinator has not hand-cleared" QF-20260903-020 and -722 is now false (both cleared ~05:5xZ 2026-09-05, both still status=open with claiming_session_id null). FR-3 consequently has no live specimen left, making FR-4\'s constructed fixture the only demonstration path. Recommend a correction stamp on the row.',
  'FR-5 backfill is 2,106 rows as measured 2026-09-05 (not a small run). Sequence it after FR-1/FR-2 land or the unfixed writers will re-dirty the table before the merge commit that FR-4 asserts from.',
];

const recommendations = [
  'LEAD: resolve the QF-20260905-544 / FR-3 collision before handing off to PLAN. Preferred resolution is to close the QF as duplicate_of SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E (not the reverse), because FR-3 is coupled to FR-4 -- FR-4\'s single fixture asserts the QF pass releases BOTH an in_progress and a claimed-open QF, and splitting FR-3 to a Tier-1 QF would leave FR-4 asserting behaviour this SD does not own. Fold the QF\'s two extra requirements into FR-3 and cite QF-20260905-544 as a second source on the PRD.',
  'PLAN: re-specify FR-4\'s scheduled predicate. The cheapest correct form is `status IN (\'released\',\'stale\') AND is_alive = true` (dropping the bare `stale_at IS NOT NULL` leg), because a non-null stale_at legitimately survives on rows that have since returned to active and no writer clears it. If the broader predicate is kept, FR-1 must become two-sided and require the revive/claim paths (lib/session-manager.mjs:637-641 and :848-854, claim_sd :450-458, scripts/hooks/session-register.cjs:556-576) to clear stale_at.',
  'PLAN: add the inverse fixture to FR-4 alongside the e60956f5 fixture -- a row released while genuinely alive (status=released, is_alive=true, heartbeat fresh within threshold) must still read alive after FR-2 lands. This is the regression test that SD-LEO-INFRA-IS-ALIVE-LIVENESS-SSOT-001 shipped in the opposite direction, and the 2026-09-04 Golf/Golf-3 incident shows released-while-alive is a live event class on this fleet, not a hypothetical.',
  'PLAN: reconcile FR-2\'s two clauses explicitly in the PRD text (deny-list on released/stale_at, not an allowlist of status=active), and state what happens for status=idle, which release_sd, claim_sd takeover and the sweep\'s idle-retire branch all produce.',
  'PLAN: base FR-1\'s census on the LEAD-phase Explore evidence for this SD (~24 write sites across ~15 files plus 5 RPC bodies, exactly one already correct at stale-session-sweep.cjs:3243-3257) rather than on the four writer classes the scope text names, AND extend it with the two write shapes a naive census misses: scripts/session-tick.cjs:615-646\'s raw REST fetch() PATCH, and the five idle-retire payloads at stale-session-sweep.cjs 3621-3768.',
  'PLAN handoff should carry a one-line sequencing note to SD-LEO-INFRA-LOOP-LIVENESS-DISCRIMINATOR-001: its FR-7 census of heartbeat_at readers under lib/fleet must allowlist lib/fleet/session-liveness.cjs as record-liveness, outside the loop-liveness domain, or the two SDs will contradict each other at that one file.',
  'PLAN: sequence FR-5 (2,106-row backfill) last, after FR-1 and FR-2 are merged, and record the re-measured count at execution time rather than reusing 2,106 -- the population grows on its own, which is the recording rule this SD family already adopted ("record the OLDEST AGE and the drain cadence, NEVER THE COUNT").',
];

const summary = 'LEAD-phase VALIDATION for SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E: independently re-ran the SD\'s published STEP-0 dedup claim across strategic_directives_v2 (38 term-matching SDs reviewed) and quick_fixes (23 term-matching QFs plus all 134 QFs minted since 2026-09-03), verified child C\'s actual shipped diff, and read the adjacent liveness SDs in full. VERDICT CONDITIONAL_PASS. The SD is real, well-grounded, not already-built (both target defects confirmed live on main at 92cde3162a1b) and not a duplicate at the SD level -- and a neighbouring SD (STALE-SWEEP-LIVENESS-SSOT-001) independently names THIS SD as the owner of exactly this territory, which is stronger evidence than the SD\'s own assertion. Two of the three dedup predicates CONFIRMED on hard evidence: child C\'s diff contains the string "is_alive" zero times and touches none of the four target files, so "named the contradiction without treating it" is accurate; and LIVENESS-DISCRIMINATOR-001 is genuinely loop-liveness with zero FR or file overlap. ONE PREDICATE IS NOW FALSE: QF-20260905-544 (open, unclaimed, minted 2026-09-05T05:59Z, 10h54m AFTER this SD\'s dedup ran clean at 19:05Z on 09-04) is an exact duplicate of FR-3 -- same file, same line, same specimens, same fix shape -- and LEAD must assign an owner before PLAN. Beyond dedup, the scope-coherence read found three internal defects repairable at PLAN without re-scoping, the most serious being that FR-4\'s scheduled exit predicate is unsatisfiable by construction and would sit permanently red on healthy live seats.';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence_score: 90,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      gate: 'GATE_1_LEAD_PRE_APPROVAL',
      dedup_claim_under_test:
        'DEDUP (STEP-0 published): predicate 1, no open SD or QF on is_alive / isSessionAlive / clearAndReopenQf; RECORD-TRUTH-001 is the parent family and its child C named the contradiction without treating it; LIVENESS-DISCRIMINATOR-001 is adjacent (loop liveness), not this.',
      dedup_verdict: {
        predicate_1_no_open_sd_or_qf: 'FALSE_NOW — QF-20260905-544 duplicates FR-3 (was TRUE at mint 2026-09-04T19:05:18Z, metadata.dedup_match_sd_key="none")',
        predicate_2_child_c_untreated: 'CONFIRMED — C diff contains "is_alive" 0 times, touches none of the 4 target files',
        predicate_3_discriminator_adjacent: 'CONFIRMED — zero FR/file overlap, plus reciprocal third-party confirmation from STALE-SWEEP-LIVENESS-SSOT-001 OUT OF SCOPE',
      },
      conflicts_found: [
        {
          key: 'QF-20260905-544',
          kind: 'DUPLICATE_OF_FR3',
          status: 'open',
          claiming_session_id: null,
          created_at: '2026-09-05T05:59:20.302+00:00',
          routing_tier: 1,
          estimated_loc: 10,
          overlap: 'lib/fleet/best-effort-release.mjs:246-254 clearAndReopenQf status filter — identical fix',
          recommended_resolution: 'close QF as duplicate_of this SD; fold its guard_refused-vs-no_match_status and split-census-line increments into FR-3',
        },
      ],
      measurements: {
        main_head_at_read: '92cde3162a1b78a7463578bb24488d04a9a084ec',
        session_liveness_defect_live: 'lib/fleet/session-liveness.cjs:169 raw_is_alive early return present',
        best_effort_release_defect_live: "lib/fleet/best-effort-release.mjs:254 .filter('status','eq','in_progress') present",
        contradicted_rows_exact: 2106,
        released_or_stale_rows_exact: 13176,
        claude_sessions_rows_total: 13181,
        cited_specimens: {
          'QF-20260903-020': 'status=open, claiming_session_id=null (HAND-CLEARED — scope text says otherwise)',
          'QF-20260903-722': 'status=open, claiming_session_id=null (HAND-CLEARED — scope text says otherwise)',
          'QF-20260903-831': 'status=completed 2026-09-04T20:24:16Z, disposition=re_verified (matches scope text)',
        },
        child_c_merge_commits: ['53a7d92768f6de11a7bb2e8c3ef6f14ac330ac59', 'c9dda9d29ebbe0902109c98b2727b1d798bd52fe'],
        backlog_items: 0,
        backlog_items_family_norm: 'siblings C and D completed with 0; not treated as a Gate-1 block',
      },
      artifacts_read: [
        'strategic_directives_v2 (SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E / -001 / -001-A / -001-B / -001-C / -001-D)',
        'strategic_directives_v2 (SD-LEO-INFRA-LOOP-LIVENESS-DISCRIMINATOR-001)',
        'strategic_directives_v2 (SD-LEO-INFRA-IS-ALIVE-LIVENESS-SSOT-001)',
        'strategic_directives_v2 (SD-LEO-INFRA-STALE-SWEEP-LIVENESS-SSOT-001)',
        'strategic_directives_v2 (SD-LEO-INFRA-SESSION-IDENTITY-MARKER-CALLERS-001)',
        'quick_fixes (QF-20260905-544, QF-20260903-020, -722, -831; 23 term-matched + 134 minted since 2026-09-03)',
        'sd_backlog_map, product_requirements_v2, sub_agent_execution_results',
        'claude_sessions (exact counts, status x is_alive distribution)',
        'lib/fleet/session-liveness.cjs',
        'lib/fleet/best-effort-release.mjs',
        'scripts/stale-session-sweep.cjs',
        'lib/session-manager.mjs',
        'lib/heartbeat-manager.mjs',
        'scripts/hooks/session-register.cjs',
        'database/migrations/20260828_claim_sd_qf_live_peer_guard.sql',
        'database/migrations/20260902_release_sd_by_key.sql',
        'database/migrations/20260605_atomic_lease_sweep_respect_inflight.sql',
        'git history for SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-C (PR #8153, #8155)',
      ],
    },
    phase: 'LEAD_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'VALIDATION',
    SD_KEY,
    { name: 'VALIDATION' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD_TO_PLAN', source: 'manual' },
  );

  console.log('VALIDATION EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
