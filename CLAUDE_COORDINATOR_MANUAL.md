<!-- file_content_hash: eedb486b24b04b45 -->
<!-- GENERATED FILE - DO NOT EDIT DIRECTLY. Source of truth: leo_protocol_sections (DB). Regenerate: node scripts/generate-claude-md-from-db.js. Drift check: node scripts/check-claude-md-drift.cjs -->
# CLAUDE_COORDINATOR_MANUAL.md — Coordinator Manual (how-to companion)

**Generated**: 2026-09-06 5:12:08 AM
**Protocol**: LEO 4.4.1
**Purpose**: How-to procedures lifted out of the role contract — dispatch mechanics, gauge/count verification steps, loop-registry operating detail
**Load when**: At the MOMENT OF DOING the procedure — not at session start

> This companion carries PROCEDURE. The RULES that govern these procedures stay in CLAUDE_COORDINATOR.md and are in force whether or not this file is read.

---

## Coordinator Manual — Blocked-claim resolution & gauge-integrity procedures

## Blocked-claim resolution — the coordinator OWNS resolving worker blocks (chairman directive 2026-06-24)

When a worker signals a BLOCKED claim (a dependency / credential / gate / migration step it cannot self-complete), the worker STAYS on that SD and coordinates with YOU — it does NOT hop to a different SD. You own resolving the block:
1. DUE DILIGENCE FIRST — read the PR / migration SQL / gate output / dependency state yourself; gather whatever you need.
2. DECIDE + APPROVE within your lane — tell the worker how to proceed and give EXPLICIT approval. For a MIGRATION: verify it is safe — e.g. purely ADDITIVE (CREATE-only; no ALTER/DROP/data-mutation of existing objects) — then APPROVE the worker to apply it themselves. The worker applies WITH your sign-off; you never blind-approve without the read, and you do NOT apply a prod migration yourself in the worker place.
3. ESCALATE ONLY what you genuinely cannot resolve, and via the chain COORDINATOR -> ADAM -> CHAIRMAN. Never skip to the chairman: a pre-authorized / operational step (e.g. an additive migration) is YOURS to approve after due diligence, not a chairman question. The chairman is the last resort, reached only through Adam.

Canonical SSOT: docs/protocol/fleet-coordinator-and-worker-behavior.md ("Blocked-claim resolution protocol"). Worker side: fleet-worker-loop-directive.md loop-rule 4b. Adam relay: adam_role_contract.
### Gauge-integrity challenge (chairman-directed, verbal 2026-07-19 — standing pre-dispatch control)

Before acting on any Adam-sourced count or queue gauge (belt sizes, unpromoted totals, backlog percentages), CHALLENGE the number: (a) exact head-count (`{ count: 'exact', head: true }`) or a capped row-fetch? A gauge reading exactly 1000 is presumed truncated (live incident 2026-07-19: probe reported 1000 — the PostgREST cap — true count 1495). (b) plan-of-record-scoped, or raw table-wide? (c) deduped vs origin/main / done-state? This is the symmetric twin of Adam KPI-3 (independently recompute coordinator gauges) — bidirectional verification, no correlated blindness. count=null renders 'unavailable', never 0 (a missing relation is a measurement failure, not a healthy zero). Mechanism: lib/db/fetch-all-paginated.mjs (fetchAllPaginated / assertNotCapTruncated / renderCount) + the enumerated ledger docs/audits/count-truncation-inventory.json. Provenance: SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-8; Solomon verdict db4b2292.

(d) did the QF term's DEFINITION change recently, not just its value? The belt gauge in duty 5 above (`belt=N ... (N SD + M QF)`) sums the SD-dispatchable count with a QF count. As of SD-LEO-INFRA-QF-SUPPLY-PREDICATE-AUTO-START-001 (2026-08-15), the QF term is `countAutoStartableQuickFixes` — the SAME strict predicate the worker's own /checkin self-claim path runs (excludes stale >3d, `factory_lane`, chairman-gated, TIER3_RISK_RE keyword matches, and fixture rows), not the looser unclaimed+status='open'-only count `lib/governance/qf-mint-gate.mjs`'s demand gauge still uses. Measured live the day this shipped: the old, looser count read 173; the new, accurate count read 0. A belt reading that drops sharply right after this SD merged is the fix taking effect — the prior reading was silently counting QFs no worker could actually claim — not a belt collapse. A QF term that stays nonzero-but-small thereafter is the real, accurate signal to act on (or to feed back to Adam as sourcing demand); do not "correct" it back toward the old inflated number.

**Informational lanes are read as state, not drained as messages — and acking them by kind is not a bulk-ack.** `roll_call` rows are addressed TO the coordinator but are not messages anyone must consume: the coordinator reads seat state directly from `strategic_directives_v2`, `quick_fixes` and `claude_sessions`. Left unacked they accumulate and the hourly review reports them as UNDELIVERED OUTBOUND AT A LIVE TARGET — measured 2026-08-30: **92 unread roll_calls (oldest 565 min) burying the only two real rows in that report**, which were genuine 51-hour drops. A LANE THAT MANUFACTURES FAKE UNDELIVERED MESSAGES HIDES THE TRUE ONES, which is the silent-failure class the coordinator exists to catch, running inside the coordinator's own inbox. **Ack informational kinds in bulk BY KIND, stamping the reason on every row.** This does NOT weaken the never-bulk-ack rule for advisories: that rule exists because an advisory carries a decision the coordinator must make per item, and a roll-call carries none. The discriminator is whether the row obliges an action, never how many rows there are.

**UNANSWERED is not UNANSWERABLE, and only one of them is anyone's fault.** Before treating a relay/decision/review drop as neglect, CHECK WHETHER A RESPONDENT STILL EXISTS. Specimen 2026-08-30: two coordinator-feedback requests flagged as drops for 51 hours turned out to have been created at 2026-08-28T14:11:37Z, with both respondents **and the sending coordinator** all released at 2026-08-28T15:37:25.068676Z — the same microsecond, a fleet teardown 86 minutes later. Nobody sat on them; nobody could have answered them. Dispose such rows explicitly (`disposition: 'unanswerable_target_dead'`) with the released-at evidence on the row, so the gauge clears on truth rather than staying permanently red and training every future reader to ignore it. **A solicitation targeted at a session id is correct for a seat-specific question; the defect is that nothing re-asks when the seat dies** — re-solicit from the CURRENT roster rather than retargeting the loop away from session ids.

**Before naming a repo-wide or fleet-wide blocker to any worker, CHECK OPEN PRs AND RECENT BRANCHES FOR THAT EXACT FILE OR DEFECT FIRST.** This is a hard pre-dispatch step, not a habit. Measured 2026-08-30, and it fired TWICE in one session against the same worker: (i) a lint-scope correction sent after he had already fixed the files, and (ii) an instruction to fix two files Hotel-3 had already guarded in an unpushed branch. Both times the coordinator owned the miss immediately — which the worker named as a good pattern — **but owning a miss twice is not a substitute for preventing it, and he was right to say so.** The specific gap in both cases: the defect was measured in the LOCAL WORKING TREE (or a tree several commits behind merged main) and dispatched without asking whether anyone was already on it. A shared repo-wide red check is exactly the thing two seats hit simultaneously and both fix, because it blocks both of them and neither owns it.

MECHANICALLY: before a dispatch that names a shared blocker, run `gh pr list` (and, where the defect is file-scoped, `git log --all` / `gh pr view <n> --json files`) for that file or defect. If a PR already carries the fix, DISPATCH NOTHING AND SAY SO to whoever is waiting. **The cost of skipping this is not a wasted dispatch — it is a worker's cycle spent on work that was already done, discovered only after they finish.**

**When dispatching claim-row-less work, stamp something the capacity gauges can read.** A directive-only WORK_ASSIGNMENT (a UAT run, an investigation, anything not minted as a QF or SD) leaves the executing seat holding nothing, so every capacity gauge — dashboard, forecast, deficit counter, idle-QF hint — reads that seat as IDLE while it does the highest-priority work on the board. Measured 2026-08-30: the idle hint fired five times at one seat carrying a chairman-ordered UAT (QF-434 twice, QF-590, QF-084 twice), costing him several check-in cycles of triage-and-ignore, and his own `/checkin` auto-self-claimed a QF, creating a real double-claim that needed explicit sequencing to unwind. **THE SECOND SYMPTOM IS WORSE THAN THE FIRST: the noise is annoying, the auto-claim actually competes for the seat.** Until a durable representation exists (SD-LEO-INFRA-… / QF-20260830-454), the interim discipline is: tell the seat explicitly that idle hints do not apply to it, and tell it BEFORE the first hint fires rather than after.

**Outbound to a role seat is ABSTRACT-FIRST. Volume is a cost the sender does not pay.** Measured 2026-08-30: roughly forty long-form coordinator directives reached Adam's lane in three hours. The substance was accepted as good; the problem is that EVERY ONE REQUIRES A FULL READ BY THE RECIPIENT, and the marginal ones — verified-delta confirmations, praise relays, status echoes — carried a paragraph where a line would do. **A coordinator who reports thoroughly is spending someone else's attention, and thoroughness measured only by the sender is indistinguishable from noise at the receiver.** The shape to copy is the one Solomon used for the chairman assessment: a packet-sized abstract that stands alone, with the long form held as an artifact for whoever asks. RULE: lead with the finding in one or two sentences; put the measurement, the timestamps and the reasoning below or in a linked artifact; and for a confirmation that changes nothing on the recipient's side, send a line, not a page.

**Read the artifact, THEN compose — never compose from a colleague's one-line summary.** Specimen 2026-08-30 (row 9054bcd9): Adam's ruling relay paraphrased a QF as "narrowed to the warn"; the coordinator composed an alarm from that phrase and escalated that a chairman-ratified recommendation rested on withdrawn evidence. Reading the actual row took thirty seconds and showed the QF had ALWAYS carried the full-strength scope — it predated the softening entirely. **A NARRATED SCOPE IS NOT A SCOPE**, and the same rule already applied to belt counts and gauge readings applies to a trusted colleague's shorthand. The failure mode is specific: the measurement WAS run, but after the message was composed, so it printed to the console where it could not change anything. **A measurement taken after the conclusion is written is decoration.**

**Until the retirement-predicate mismatch (QF-20260830-084) lands, CANONICAL-TOOL-ONLY for acks, both directions.** `coordinator-ack-adam.cjs` for advisories, `coordinator-ack-signal.cjs` for worker signals. Stamping a `session_coordination` mirror clears neither gauge and produces phantom pendings and re-sends in both lanes.

### Escalation-duty spec check (SD-LEO-INFRA-ACTIVATE-INERT-STALL-001-C, resolving an RCA 9a02a76d open question)

RCA 9a02a76d flagged this section's coordinator escalation chain ("COORDINATOR -> ADAM ->
CHAIRMAN", above) as possibly contradicted by `docs/protocol/crew-comms-routing-protocol.md`
Rule 5's escalation ladder ("Adam -> Solomon -> Chairman"). Investigated: **not a conflict --
two different ladders for two different triggers, both funneling to the chairman only through
Adam.**

- **This section's ladder** (Coordinator -> Adam -> Chairman) is the coordinator's own
  blocked-claim-resolution path: an operational matter the coordinator cannot itself resolve,
  escalated through Adam.
- **Rule 5's ladder** (Adam -> Solomon -> Chairman) is Adam's escalation path when a matter
  needs deep-reasoning consult before reaching the chairman -- it adds the Solomon hop
  specifically for issues in Solomon's remit (hard analysis/verdicts), which a coordinator
  blocked-claim is not.

Both are consistent with Rule 5's own stated invariant that "the chairman receives only the
funnel (through Adam), never the raw N^2 chatter between the other roles" and this section's
"the chairman is the last resort, reached only through Adam." No amendment needed to either
document; this note closes the RCA's open question with a documented "no conflict" verdict
rather than leaving it unresolved.

---

*Generated from database: 2026-09-06*
*Protocol Version: 4.4.1*
*Source of truth: leo_protocol_sections (section_type=coordinator_manual). Do not hand-edit — edit the DB section and regenerate.*
