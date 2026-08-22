# Role-Contract Structural Evaluation — Adam's Half
**Commission**: chairman verbal 2026-08-22 ~22:5xZ ("proper instructions … foundational — top priority"), following the drive-workers prominence incident.
**Scope of this half (cross-review design)**: CLAUDE_COORDINATOR.md (101 lines, hash 62c9c8bd) + CLAUDE_SOLOMON.md (311 lines, hash 1f069347), both read IN FULL against live DB/code where claims were checkable. Solomon independently evaluates CLAUDE_ADAM.md (commissioned ed6d9711). Consolidation: one chairman packet, disagreements preserved.
**Author**: Adam seat 0549d739. Propose-only — no contract text was changed by this evaluation; all restructures require chairman ratification.

---

## A. The systemic finding first: RATIFIED-NEVER-ENCODED is a class, not an incident

Five specimens inside ONE week, across all three roles:
1. **Adam / drive-the-workers** — chairman SMS 2026-08-22 01:38Z; surfaced only after the chairman asked three times on 08-22 evening; encoded same night (now CLAUDE_ADAM.md §5b headline).
2. **Solomon / plan-alignment cadence** — chairman ratified 24–48h daily baseline ~22:0xZ; contract line 95 still reads "Every 48–72h". Solomon himself flagged the stale-spec-resurrects-old-cadence hazard. (Encoding in Adam's queue.)
3. **Coordinator / raise-issues-to-Adam** — operator directive ~22:0xZ ("coordinator raises all future issues/concerns to Adam"); grep count in CLAUDE_COORDINATOR.md: **0**.
4. **Solomon / PLAN-OF-DAY BLESSING** — the chairman-sealed 5-point governance regime (08-22 04:3xZ, unanimous joint rec; empirical window shortened to 1wk ~22:1xZ) makes daily plan-blessing a STANDING Solomon duty. Grep "PLAN-OF-DAY|bless" in CLAUDE_SOLOMON.md: **0**.
5. **Adam+Solomon / N=4 focus budget + 1-week empirical review** — same sealed regime; encoded in NEITHER contract (grep: 0 in both).

**Root cause**: the ENCODE-BEFORE-NEXT-USE rule exists — but only inside CLAUDE_ADAM.md (§5h parent rule), and it has **no enforcement mechanism anywhere**. A chairman verbal lives or dies on the receiving seat surviving until it scribes; seat 08049808 died mid-rotation carrying specimen #1 and #2.

**Fix shape (F-1, highest leverage)**:
- (a) Copy ENCODE-BEFORE-NEXT-USE verbatim into all three contracts.
- (b) A **ratification ledger**: every chairman verbal that changes a standing duty mints a row (who/what/when/quote) with `encoded_at NULL` until the contract edit lands; a staleness gauge trips on any row unencoded >24h. This survives seat death — the exact failure that produced specimens 1–2.

## B. CLAUDE_COORDINATOR.md findings

- **B-1 (structure, GOOD contrast case)**: this contract is *obligation-forward* — "idle worker = failure", the quiet-tick never-say-standing-by protocol, maximize-utilization are all prominent. The prominence inversion that hid Adam's drive duty is NOT present here. Lesson: the coordinator charter's duty-first shape is the template the other two should match.
- **B-2 (three-headed SSOT)**: line 16 declares the source of truth as contract + `fleet-coordinator-and-worker-behavior.md` + the `/coordinator` skill, and self-describes as "ties scattered behaviors together; does not replace them." Tonight's live specimen: the skill's sourcing-awareness section pointed the coordinator at the RETIRED env-flag surface → a near-miss no-op activation packet to the chairman (coordinator owned it, logged doc-drift to harness_backlog). **One contract of record per role; everything else explicitly subordinate + drift-checked.**
- **B-3 (the loop layer is contract-invisible)**: the coordinator's 26 armed cron loops — its operational heartbeat — appear NOWHERE in the charter. Tonight's cron-interference ruling had no contract anchor; durability had to be improvised as QF-20260822-510 against STANDARD_LOOPS. The charter should name the loop registry as a governed surface and the session_arm/gha_backed contract.
- **B-4 (duplicated header)**: lines 73–77 carry two near-identical "comms MUST be typed" headings — literal accretion artifact.
- **B-5 (boundary asymmetry, inverted)**: obligation-rich but boundary-light. Its few prohibitions (never apply prod migrations yourself; never dispatch a parent SD) are buried mid-paragraph. The same balance rule cuts both ways: every prominent must-do deserves an equally prominent never-do set.
- **B-6 (chronological scrapbook)**: dated operator directives (06-07, 06-09, 06-10, 06-13, 06-16, 06-24, 07-19…) are embedded inline as provenance; utilization is restated three times (duty 3, "Maximize utilization", belt KPI). Adam's contract already solved this with the MANUAL/PROVENANCE 3-file split — apply it here.

## C. CLAUDE_SOLOMON.md findings

- **C-1 (wall-of-text duties)**: single duties run 500+ words as one paragraph (grounding-completeness ~600 words; autonomy-oversight similar). Load-bearing preconditions (the MANDATORY PRECONDITION inside plan-alignment) are buried mid-wall. Prominence inside a wall is flat — the same defect class as Adam's, expressed as illegibility rather than misplacement.
- **C-2 (broken-sentence riders)**: the chairman-SMS-lane rider (~120 words) is pasted MID-SENTENCE into two duties verbatim ("…COLD **The chairman SMS lane counts as a source…**" — the host sentence never resumes). Duplicated content + broken grammar = pure accretion damage.
- **C-3 (in-file supersession without site-marking)**: line 56 still teaches "Fable is the single most expensive call; Solomon spends zero tokens when idle" — 200 lines before P1 reveals that posture is REPEALED as an idleness rule (WORK/SPEECH split, chairman-ratified 07-19). Superseded text must be edited at its site, not overridden at a distance; this is the stale-spec-resurrects class INSIDE one file.
- **C-4 (model-clause sprawl)**: four interacting model/pin clauses (default pin §5, window strategy, degradation §10, P4 portability) in four places; a fresh seat must reconcile them to know what model it should be on.
- **C-5 (parity mechanism EXISTS — good)**: solomon-startup-check.mjs carries a contract↔loops parity reconciliation (same pattern as Adam's). The duty→loop mapping is therefore checkable; the missing entries are the ratification gaps in §A, not tooling.
- **C-6 (missing standing duties)**: PLAN-OF-DAY BLESSING and the 1-week empirical-review obligations (specimens #4/#5) — the newest chairman-ratified duties are exactly the ones absent.

## D. Cross-cutting restructure proposal (for the consolidated packet)

**R-1 — One canonical shape for all three contracts** (Adam's 3-file split as template):
1. MISSION (~3 lines: why the role exists, for whom);
2. TOP OBLIGATIONS — ranked by CHAIRMAN weighting, not incident recency; each one line + pointer;
3. HARD BOUNDARIES — the never-do set, same prominence as obligations;
4. DUTIES — procedures pushed to MANUAL, dated provenance to PROVENANCE;
5. LOOP REGISTRY — the armed-cron surface named as governed (fixes B-3).
**R-2 — Ratification ledger + staleness gauge** (fix F-1b) — the enforcement mechanism the encode rule lacks.
**R-3 — Single contract-of-record per role**; skills/behavior docs explicitly subordinate; extend the drift checker to assert skill↔contract agreement on the drift-prone sections (fixes B-2).
**R-4 — Site-edit rule**: a ratified supersession edits the superseded text where it stands (fixes C-3; prevents the next reader from learning the repealed rule first).
**R-5 — Immediate encoding batch** (no restructure needed, do first): specimens #2–#5 scribed into their contracts.

## E. What I could NOT evaluate from my seat (for Solomon/chairman)
- Whether CLAUDE_ADAM.md suffers C-1-class walls (Solomon's half; likely — §5g/§5f are long).
- The behavior-doc (`fleet-coordinator-and-worker-behavior.md`) and `/coordinator` skill internals — evaluated only via tonight's drift specimen, not read in full (time-boxed; flagged as follow-up).
- Whether worker-side docs (fleet-worker-loop-directive.md) carry the same class — out of commissioned scope, likely candidates.
