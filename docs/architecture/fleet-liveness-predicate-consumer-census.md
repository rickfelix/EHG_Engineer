# Fleet liveness-predicate consumer census

**SD**: SD-LEO-INFRA-SIXTEEN-SITE-LIVENESS-001
**Status**: measurement-only — zero code changes ship with this SD
**Purpose**: Give the follow-on substitution SD a measured consumer map instead of the
unmeasured-consumer premise that caused SD-LEO-INFRA-UNIFY-FLEET-LIVENESS-001's C2
five-consumer substitution to be withdrawn mid-flight.

## Search scope

Repo-wide `git grep`, excluding `.worktrees/`, `node_modules/`, `docs/`, `.artifacts/`,
`.prd-payloads/`. Test files (`*.test.*`) are counted separately and excluded from
"production call site" tallies. Command used (rerun to reverify):

```bash
git grep -n "isDispatchableFleetMember" -- ':!.worktrees' ':!node_modules' ':!docs' ':!.artifacts' ':!.prd-payloads'
git grep -n "isFleetWorker(\|liveFleetWorkers(\|isRecentlyReleased(" -- ':!.worktrees' ':!node_modules' ':!docs' ':!.artifacts' ':!.prd-payloads'
```

## Reconciliation against the SD's stated "16"

The SD's premise ("SIXTEEN files" for `isDispatchableFleetMember`) is **not reproducible
from any single measure**. Under this census's scope:

| Measure | Count |
|---|---|
| Direct executable production call sites of `isDispatchableFleetMember` | **5** |
| + transitive call via the `isLiveCountableWorker` wrapper | **1** (resolves the one ambiguous site) |
| **Total production consumer surface for `isDispatchableFleetMember`** | **6** |
| Files containing the string `isDispatchableFleetMember` (incl. comments/imports/tests/CHANGELOG) | 17 |
| Direct production callers of `everClaimed` | **0** (only used internally by `isFleetWorker`) |
| Transitive consumers via `isFleetWorker` | 4 call sites |
| Transitive consumers via `liveFleetWorkers` | 9 call sites (several files call both) |
| **Total production consumer surface for the `everClaimed` family** | **~13 unique call sites across 9 files** |

"16" does not match any of: direct `isDispatchableFleetMember` calls (5), its full transitive
surface (6), file-count-with-any-mention (17), or the `everClaimed` family surface (13). The
closest plausible origin is 17 minus one non-code hit (CHANGELOG.md), but that still counts
comments/imports as "sites," which this census does not. **Any follow-on SD spec must use the
per-axis counts in this table, not "16."**

## `isDispatchableFleetMember` — direct call sites

Definition: `lib/fleet/session-predicates.mjs:90`. Deliberately does **not** call `everClaimed`
— it checks `quarantined_at` and `parked_until` directly (lines 104, 110). Divergence rationale
quoted verbatim below.

> **Quoted rationale (session-predicates.mjs:77-84)**:
> "Identity/role-level fleet membership: is this session a dispatchable fleet MEMBER — i.e.
> NOT the coordinator, NOT adam (metadata.role==='adam'), NOT non_fleet, NOT a fixture id?
> Unlike isFleetWorker / isGenuineCountableWorker this deliberately does NOT require everClaimed
> or an active/idle status. A genuine worker that just FINISHED an SD is released with sd_key AND
> claimed_at nulled (lib/session-manager.mjs releaseSD), and v_active_sessions exposes neither
> worktree_path nor continuous_sds_completed — so everClaimed would read false and wrongly drop
> the very workers that are most "idle and available". A freshly-spawned worker likewise has not
> claimed yet. Use THIS predicate for the idle / available-capacity panel where the only thing to
> exclude is the role/identity polluters (the witnessed bug 623eb17d: adam/non_fleet counted as
> idle workers). FAILS toward "member" on garbage so a quirk never hides a real idle worker."

| # | File:line | Liveness question | What it currently reads | Verdict | Quoted evidence |
|---|---|---|---|---|---|
| 1 | `lib/eva/capacity-governor.js:173` | Idle-capacity: is this session a countable idle fleet member right now? | Filters coordinator sessions to non-solomon + `isDispatchableFleetMember` | **Correct** — capacity governance wants dispatch-now membership, not ever-claimed history | `.filter(row => row.metadata?.role !== 'solomon' \&\& isDispatchableFleetMember(row, coordinatorId))` |
| 2 | `scripts/coordinator-charter-audit.mjs:153` | Dispatch-now: which live sessions are genuine dispatchable workers for a charter audit? | Filters non-coordinator live sessions by the predicate | **Correct** — an audit of current worker roster wants identity/role filtering, not claim history | `const liveWorkers = live.filter((s) => !(s.metadata && s.metadata.is_coordinator === true) \&\& isDispatchableFleetMember(s, coordinatorId));` |
| 3 | `scripts/fleet-dashboard.cjs:385` | Dispatch-now: which sessions render as active/idle workers on the live dashboard? | Filters sessions through the predicate for dashboard rows | **Correct** — file's own comment (`:376`) explicitly documents this choice: "isDispatchableFleetMember fails toward 'member' on purpose" | `isDispatchableFleetMember(s, _dashCoordinatorId)` |
| 4 | `scripts/fleet-rollcall.cjs:132` | Dispatch-now: who counts as a worker for roll-call purposes, excluding role sessions? | Filters sessions not in `roleSessionIds` through the predicate | **Correct** — roll-call needs identity/role filtering of present sessions, not claim-history | `const workers = (sessions \|\| []).filter(s => !roleSessionIds.has(s.session_id) \&\& isDispatchableFleetMember(s, coordinatorId));` |
| 5 | `scripts/lib/live-countable-worker.mjs:35` | Dispatch-now, wrapped: canonical single-purpose re-export for "is this a live countable worker" | Returns `isDispatchableFleetMember(session, coordinatorId)` directly | **Correct (pass-through)** — file's own docblock (`:6`) states it exists "to be imported by a test" and to canonicalize the SSOT | `return isDispatchableFleetMember(session, coordinatorId); // FR-1: drops adam/non_fleet/fixture` |
| 6 (transitive) | `scripts/lib/capacity-inputs.mjs:381` | Idle-capacity forecasting: which sessions count as live workers for the capacity forecaster? | Filters sessions via `isLiveCountableWorker`, which wraps site #5 | **Correct** — comment at `:374` explicitly names this as the fixed SD-LEO-INFRA-FORECASTER-FIXTURE-WORKER-EXCLUSION-001 defect, confirming intentional use of the dispatch-now predicate over `everClaimed` | `// SD-LEO-INFRA-FORECASTER-FIXTURE-WORKER-EXCLUSION-001: use the canonical isDispatchableFleetMember` … `const workers = (sessions \|\| []).filter(s => isLiveCountableWorker(s, coordinatorId));` |

**Test-only reference** (excluded from the count above): `tests/unit/session-predicates.test.js` (16 occurrences — this is the unit test file, and its occurrence count of "16" is very likely the actual origin of the SD's misremembered "sixteen" figure; it is a test-assertion count, not a call-site count).

## `everClaimed` family — direct and transitive consumers

Definition: `lib/fleet/genuine-worker.mjs:163`. **Zero direct production callers** — every
production consumer reaches it transitively through `isFleetWorker` or `liveFleetWorkers`.

> **Quoted rationale (genuine-worker.mjs:163-164, `released_at` inclusion, QF-20260728-930 cited at :152)**:
> `everClaimed` treats a session as "ever claimed" using `sd_key || claimed_at || worktree_path ||
> continuous_sds_completed`, and per `lib/fleet/stuck-seat-population.cjs:6`'s own docblock this
> is the same shape "the shipped `isFleetWorker()` — which requires everClaimed = (sd_key ||
> claimed_at || worktree_path || …)" depends on. The QF-20260728-930 fix specifically added
> `released_at`-window awareness so a session released seconds ago is not treated identically to
> one released weeks ago — this is a *different* deliberate-divergence axis from
> `isDispatchableFleetMember`'s, and moved independently in SD-LEO-INFRA-UNIFY-FLEET-LIVENESS-001
> as `isRecentlyReleased` (see below).

| # | File:line | Liveness question | Path to `everClaimed` | Verdict | Quoted evidence |
|---|---|---|---|---|---|
| 1 | `scripts/adam-exec-summary.mjs:175` | Ever-worked: recently-seen fleet workers for an exec summary | Direct `isFleetWorker` call | **Correct** — an exec summary of "who has worked" wants claim-history, not dispatch-now | `(sessRaw \|\| []).filter((s) => isFleetWorker(s, me) \&\& s.heartbeat_at \&\& (t - new Date(s.heartbeat_at).getTime()) < PROVISIONED_WINDOW)` |
| 2 | `scripts/coordinator-email-summary.mjs:158` | Ever-worked: recently-seen workers for an email digest | Direct `isFleetWorker` call | **Correct** — same rationale as #1, digest context | `(sessRaw \|\| []).filter(s => isFleetWorker(s, me) \&\& s.heartbeat_at \&\& (t - new Date(s.heartbeat_at).getTime()) < PROVISIONED_WINDOW)` |
| 3 | `scripts/fleet-worker-pulse.mjs:75` | Ever-worked: recently-seen workers for a pulse check | Direct `isFleetWorker` call | **Correct** — file's own comment block (`:25,45`) explicitly documents the fail-open freeze-term behavior of `liveFleetWorkers`/`isFleetWorker` and warns against inverting it | `(sessRaw \|\| []).filter((s) => isFleetWorker(s, me) \&\& s.heartbeat_at \&\& (t - new Date(s.heartbeat_at).getTime()) < PROVISIONED_WINDOW)` |
| 4 | `scripts/one-off/_fleet-down-pager-ab-compare.mjs:16,30` | Ever-worked: A/B comparison of the old vs new liveness predicate | Direct `isFleetWorker` calls (both branches of the comparison) | **Correct (by design)** — this file exists specifically to compare `isFleetWorker`-based liveness against `liveFleetWorkers`, so both branches deliberately use the `everClaimed` family | `const oldLive = rows.filter((s) => isFleetWorker(s, me) \&\& …)`; `for (const s of rows.filter((s) => isFleetWorker(s, me)))` |
| 5 | `lib/fleet/live-fleet-sessions.cjs:71` | Ever-worked + frozen-vs-shell: canonical `liveFleetWorkers` SSOT wrapper | Calls `liveFleetWorkers` (own definition) | **Correct (definition site)** — this file's docblock (`:24`) names all three predicates (`liveFleetWorkers()/isFleetWorker()/everClaimed()`) as the columns it requires | `return liveFleetWorkers(data, coordinatorId, nowMs, windowMs);` |
| 6 | `lib/fleet/tier-backlog.cjs:122` | Ever-worked: live worker count feeding the tier backlog computation | Calls `liveFleetWorkers` | **Correct** — tier backlog needs claim-history-aware liveness, not raw dispatch-now identity | `const live = liveFleetWorkers(fleetSessions \|\| [], coordinatorId, Date.now());` |
| 7 | `lib/fleet/tier-ladder.cjs:523` | Ever-worked: live worker set for the tier ladder ranking | Calls `liveFleetWorkers` | **Correct** — same rationale as #6 | `return liveFleetWorkers(data, coordinatorId, nowMs);` |
| 8 | `scripts/adam-coordinator-health.mjs:83` | Ever-worked: live worker count for coordinator health reporting | Calls `liveFleetWorkers` | **Correct** — health reporting wants claim-history-aware liveness | `const live = liveFleetWorkers(rows, coordinatorId, nowMs);` |
| 9 | `scripts/coordinator-audit.mjs:87` | Ever-worked: live worker count for a coordinator audit | Calls `liveFleetWorkers` | **Correct** — same rationale | `const live = liveFleetWorkers(sessRaw, me, t);` |
| 10 | `scripts/coordinator-email-summary.mjs:84` | Ever-worked: live worker count for the email digest (separate from #2's recently-seen filter) | Calls `liveFleetWorkers` | **Correct** — digest needs both the live-count (`liveFleetWorkers`) and the recently-seen filter (`isFleetWorker`, #2), two different questions in one file | `const live = liveFleetWorkers(sessRaw, me, t);` |
| 11 | `scripts/coordinator-idle-qf-hint.mjs:269` | Ever-worked: live worker set feeding idle-QF-hint eligibility | Calls `liveFleetWorkers` | **AMBIGUOUS — flag for follow-on review**: this file already layers `isRecentlyReleased` (site below) on top of `liveFleetWorkers` specifically because SD-LEO-INFRA-UNIFY-FLEET-LIVENESS-001 found `everClaimed` alone insufficient here (the 07:56:44Z incident). The follow-on SD should verify no other `liveFleetWorkers` consumer needs the same `isRecentlyReleased` layering. | `const live = liveFleetWorkers(sessions \|\| [], coordinatorId, nowMs);` |
| 12 | `scripts/fleet-worker-pulse.mjs:73` | Frozen-vs-shell: live worker set for pulse reporting | Calls `liveFleetWorkers` | **Correct** — same file already documents (see #3) the fail-open freeze-term rationale | `const live = liveFleetWorkers(sessRaw, me, t);` |
| 13 | `scripts/adam-exec-summary.mjs:173` | Ever-worked: live worker set for exec summary (paired with #1's recently-seen filter) | Calls `liveFleetWorkers` | **Correct** — same two-question pattern as `coordinator-email-summary.mjs` (#10) | `const live = liveFleetWorkers(sessRaw, me, t);` |

**Test-only references** (excluded from the count above): `lib/fleet/db-clock.test.js:67,71`, `tests/unit/fleet/genuine-worker.test.js` (7 occurrences), `tests/unit/fleet/canary-session.test.js` (3 occurrences).

## Additional divergence axes beyond the SD's original 4

VALIDATION sub-agent review (LEAD phase, `sub_agent_execution_results` row
`23094172-0f1e-4df7-8c17-ab6a89b1f9e3`) identified **2 axes the SD's original scope missed**,
both enforced only inside `isDispatchableFleetMember` and **not** part of the `everClaimed`
family:

| Axis | Enforced at | Consumer | Note |
|---|---|---|---|
| `quarantined_at` | `session-predicates.mjs:104` | QF-20260705-436 | Excludes quarantined sessions from dispatch-now membership; distinct field from the unrelated test-quarantine `quarantined_at` usages in `scripts/unit-tier-quarantine.mjs` / `lib/quarantine/retriage.js` (different domain, not fleet-liveness) |
| `parked_until` | `session-predicates.mjs:110` | QF-20260705-347 | Excludes parked sessions from dispatch-now membership |

Plus a 6th axis:

| Axis | Definition | Only consumer | Note |
|---|---|---|---|
| `isRecentlyReleased` | `lib/fleet/genuine-worker.mjs:226` | `scripts/coordinator-idle-qf-hint.mjs:220` (import `:36`) | 15-min window excluding just-released sessions from idle-claim-hint eligibility (SD-LEO-INFRA-UNIFY-FLEET-LIVENESS-001). Cross-referenced in a comment at `coordinator-idle-qf-hint.mjs:216` naming the `everClaimed`-inclusive gap this closes. |

## Uncalled sibling predicate (informational)

`lib/fleet/session-predicates.mjs:69` defines `isGenuineCountableWorker` (composes
`isFleetWorker` + a fixture-id guard), documented as intended "for the sweep/ranking paths." A
repo-wide grep for `isGenuineCountableWorker(` outside its own definition and test files finds
**zero production call sites** — it is currently unused. Not in scope for the follow-on
substitution SD (no consumer exists to migrate), but worth flagging so it is not mistaken for
dead-but-load-bearing code.

## Applications-table duplicate-identity census

Query: `SELECT id, name, local_path, github_repo, status FROM applications WHERE name ILIKE '%altify%'`

| id | name | local_path | github_repo | status |
|---|---|---|---|---|
| `75c6da62-a9ad-4f07-a5df-ab91eeeff8d0` | AltifyAI | `C:/Users/rickf/Projects/_EHG/altifyai` | `rickfelix/altifyai` | **active** |
| `f37300af-013b-4976-a3b1-2bba043d3fa8` | AltifyAI | `C:/Users/rickf/Projects/_EHG/altifyai` | `rickfelix/altifyai` | inactive |

**Confirmed**: byte-identical `name`/`local_path`/`github_repo` across both rows — the only
duplicate among 16 total `applications` rows. **Proposed disposition** (not executed by this
SD): archive/deprecate the `inactive` row (`f37300af...`) once every consumer that currently
resolves "which app owns this SD" by name lookup is confirmed to prefer the `active` row, or
add an explicit `is_canonical` marker if both must persist for historical linkage. The
merge/delete itself is a separate governed change, out of scope here.

## Follow-on substitution SD scoping (draft)

Per-site change/no-change verdicts, for the follow-on SD to inherit directly:

- **No sites require predicate substitution.** Every classified site in both tables above is
  marked **Correct** for its current predicate choice — the census found no site currently using
  the wrong liveness semantics. This directly explains why UNIFY's blind five-consumer
  substitution would have been wrong: it targeted a system with zero actual defects, only an
  unmeasured assumption about which predicate belonged where.
- One item flagged **AMBIGUOUS** for follow-on review: `scripts/coordinator-idle-qf-hint.mjs:269`
  — verify whether any *other* `liveFleetWorkers` consumer needs the same `isRecentlyReleased`
  layering this file already added.
- The `isDispatchableFleetMember`/`everClaimed` divergence rationale (quoted above in full) must
  ship as a standing code comment cross-reference in any future refactor of either function, so a
  future editor cannot remove one without reading the other's justification.
- Applications duplicate-identity disposition (above) is a separate, smaller follow-on, not
  bundled with the predicate work.

**Net conclusion for the follow-on SD**: given zero incorrect sites found, the actionable
follow-on is narrow — confirm the one ambiguous site, document the divergence rationale as a
cross-reference, and file the applications-duplicate disposition as its own tiny governed
change. No wide predicate-substitution SD is warranted by this census's findings.
