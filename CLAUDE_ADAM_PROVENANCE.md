<!-- file_content_hash: f9dde4b902c1ac80 -->
<!-- GENERATED FILE - DO NOT EDIT DIRECTLY. Source of truth: leo_protocol_sections (DB). Regenerate: node scripts/generate-claude-md-from-db.js. Drift check: node scripts/check-claude-md-drift.cjs -->
# CLAUDE_ADAM_PROVENANCE.md — Adam Provenance (dated rationale)

**Generated**: 2026-09-11 6:54:28 AM
**Protocol**: LEO 4.4.1
**Purpose**: Why each clause exists — dated chairman verbals, live witnesses, superseded cadences
**Load when**: When you need to know WHY a rule exists, or before proposing to change one

> Every rule in CLAUDE_ADAM.md is IN FORCE regardless of whether its history is read here. This file explains; it does not govern.

---

## Adam Provenance — dated rationale and live witnesses (companion)

# CLAUDE_ADAM_PROVENANCE.md — why the rules exist

**Purpose**: Dated provenance for the Adam role contract — live witnesses, chairman verbals, and
the incidents that produced each clause.
**Load when**: Auditing WHY a rule exists, or before proposing to change one. Never required to
FOLLOW a rule.

> **Every rule in `CLAUDE_ADAM.md` is in force regardless of whether its history is recorded here.**
> This file explains; it does not govern. An absent entry is a gap in this record, never evidence
> that a rule is inactive.

## COVERAGE — READ THIS BEFORE TRUSTING AN ABSENCE

This file is **PARTIAL and mechanically derived**. The preserved original carries **81** inline
dated provenance references; only **10** could be extracted as rule-to-reason pairs, plus **4**
dated blocks. The remainder are bound to their rule by POSITION IN PROSE rather than structure —
an extracted `(chairman verbal 2026-07-17)` with no rule attached explains nothing — so they
require per-rule authoring and are NOT yet here.

Do not read a missing entry as "this rule has no provenance". Coverage is roughly 12%.

---

## Rule → why it exists

- **Proactivity is PROPOSE, not auto-execute (operator-canonical 2026-06-08)** — (operator-canonical 2026-06-08)
- **Standing assignment — GOVERNANCE & OVERSIGHT over Solomon (chairman-directed 2026-07-17)** — (chairman-directed 2026-07-17)
- **D4 — verify_before_certainty** — (chairman, 2026-07-27)
- **Plan first, gauges second** — (Solomon-calibrated 2026-07-17, ref be825042: default N=80 cohort / 4-day backstop / day-close trigger / cycle-2 recalibration rule; anchor unit stays the roadmap anchor, cohort defines only the window; prediction source = union of forward-list snapshots in the window)
- **2026-06-11 (handoff-drill fixes — durable encoding of session-fragile duties)** — (confirmed by the 2026-06-11 handoff drill)
- **2026-06-11 (handoff-drill fixes — durable encoding of session-fragile duties)** — (the ratified retry->auto-default clock, quiet-hours-paused)
- **2026-06-11 (handoff-drill fixes — durable encoding of session-fragile duties)** — (Adam-armed 2026-07-21)
- **ADAM DECIDES + INFORMS (does NOT ask):** — (e.g. threading a ratified autonomy level into the factory-read field)
- **Solomon (live, 2026-07-12):** — (the exact class that cost 9h of invisibility, 2026-07-04)
- **MECHANICS (what makes it survive sessions)** — (roadmap_waves + roadmap_wave_items, the ratified plan of record)

---

## Dated change log (verbatim from the preserved original)

**2026-06-08**: Added the "Proactivity is PROPOSE, not auto-execute" clause (SD-LEO-INFRA-CODIFY-ADAM-PROACTIVE-001). Chairman-canonical: when idle Adam presents options to the active coordinator and lets the coordinator decide; Adam never autonomously *begins* self-generated proactive work (sourcing/filing SDs, launching investigations, building) without the coordinator's go. Surfacing findings/canary/options is always in-bounds.

**2026-06-08**: Added the tri-party self-assessment RUBRIC + the NON-OPTIONAL grade→action→verify improvement LOOP + the role-model correction (Adam = coordinator's assistant, not chairman's chief-of-staff) (SD-LEO-INFRA-CANONICALIZE-TRI-PARTY-001). The coordinator's parallel rubric+loop lives in coordinator.md. Runtime feed into coordinator-self-review.mjs (cadence + bidirectional emit/consume) is a tracked follow-up gated by ADAM_SELF_SCORE_CADENCE / COORD_ADAM_REVIEW_V1.

**2026-06-09**: Reconciled the self-assessment rubric from 5 descriptive dimensions to the canonical 8 (D1_proactive_sourcing..D8_interface_clarity) matching the live `feedback` cat=`adam_self_assessment` rows, added the surfaced→accepted/graduated signal under D1, and authored the "Governance heartbeat (proactive multi-scope scan loop)" subsection behind flag `ADAM_GOVERNANCE_HEARTBEAT_V1` (authored default OFF — contract-only, no runtime behavior; flag later ENABLED 2026-06-11 via SD-LEO-INFRA-ENABLE-ADAM-GOVERNANCE-001) (SD-LEO-INFRA-ADAM-GOVERNANCE-HEARTBEAT-001).

**2026-06-10**: Chairman-canonical operating doctrine (landed from live session b68012b1; chairman verbal directives 2026-06-10): - **NEVER HOLD SOURCING (chairman override)**: Adam sources CONTINUOUSLY — raw backlog is groomed into verified, deduped, claimable DRAFT SDs/QFs as it arrives, regardless of queue depth. (This is the EXEMPTION cross-referenced in the *Proactivity is PROPOSE* clause above: sourcing/filing DRAFT SDs is never coordinator-GO-gated; only claim/build/worktree/dispatch is.) A deep claimable belt is the INTENDED state, not a fault; dispatch pacing is the coordinator's lever, supply throttling is not. A coordinator hold-sourcing directive is answered by relaying the chairman's standing override, not by compliance. (Chairman, overriding a live coordinator hold: 'keep identifying work and just keep putting it out there… Whether or not the coordinator decides to issue those to the workers is on the coordinator.') - **FULL-INBOX POLLING (D6 duty sharpened)**: Adam's inbound duty covers EVERY coordinator/chairman-directed session_coordination row WHERE acknowledged_at IS NULL — not only payload.kind=coordinator_reply. The reply-only reader (adam-advisory.cjs replies) is a known blindspot that twice hid chairman/coordinator directives on 2026-06-10 (fix tracked as QF-20260610-623); until it ships, poll the full lane every tick. - **ACCEPTANCE-SITTING OWNERSHIP**: when the chairman delegates acceptance sittings, Adam owns them end-to-end: decision packets prepared >=24h ahead (plain language, default recommendation per item), readiness-gate verification at T-24h, reminders via every live channel (advisory roll-up + exec-email NEEDS-YOU) the day before and morning of, a reschedule proposal BEFORE the sitting if any gate will miss (never run a no-op sitting), and durable outcome recording (decision artifacts on the acceptance rows) with a post-sitting confirmation of what was decided and what unlocked.

---

### Candidate-decision evaluation accepted w/ modifications (09f14b64) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

both propositions remain HYPOTHESES; the acceptance authorizes NO new machinery/instrumentation/gate/role/audit/SD/workflow change; Sept-7 reading uses PREREGISTERED existing venture-line measures only (frozen before results); the five early-return triggers are WATCH duties (observable-behavior-not-motive) authorizing REPORTING ONLY; no automatic extension. Solomon share encoded in section 611.

---

### Evening-sitting closing directive (76a3c081) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

"the system appears increasingly trustworthy, but it has not yet proven the venture-factory thesis. Let's not turn this realization into another machinery-building initiative. FINISH THE EXISTING UAT AND LAUNCH PATH FOR ALTIFYAI. Reaching a real customer means the business has started; proving the factory requires the next ventures." Binds sourcing priorities: launch-path first, machinery restraint.

---

### RSCP ruling 1b (826ecf5b) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

EHG-RSCP-001 v0.2.1 is the GOVERNING compaction-policy document; Phase-0 EXECUTION conditionally authorized (coordinator live-view check + Solomon consult first, then ONE declared throwaway session, burn logged vs the experiment record; must not touch the endurance experiment); Phase 1 remains held.

---

### Tiered sourcing claim-gate (8e0a4603) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

encoded as SD-LEO-INFRA-TIERED-SOURCING-CLAIM-001: mechanical held-class (batch>2 same-creator/10min, risk-token, novel-machinery) unclaimable until Solomon read or ~30min named wait citing the STEP-0 row; coordinator first-dispatch clause; Solomon sampling >=2/day.

---

### /design adoption sequence (d16c91fe) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

cockpit experiment runs Sep-1 after the 7am cap observation (Adam executes; /usage before-after delta measures quota; save-tier answered empirically); first venture-facing adoption = S22 artboard-pick for the NEXT venture; artboard-as-ratified-visual-ground-truth waits on 1-2 then mints citing QF-038/QF-273 with pick-version stamping; all additive - nothing chairman-critical depends on the research preview.

---

### Experiment purpose = efficiency not duration (f48e0abf) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

stretching the account to three days is GAMING; never spread work out or withhold pushes to flatter the calendar; the metric is VALUE PER TOKEN (phase telemetry is its instrument); push the workers, cut needless burn. AND the oversight split: dormant-capacity-beside-claimable is the COORDINATOR's to identify and act on (revive or request supply); Adam enforces the coordinator does; Solomon audits Adam's enforcement - each layer audits the DENOMINATOR, not just the layer below's firing.

---

### Triangulation cycle-2 resolution (2ab4b4bc) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

protocol-wide: the chairman's WEEKLY NUMBER for gauge honesty is the **KNOWN-ORPHAN COUNT** (an orphan-writers registry names each scheduled writer/probe/ledger's acting reader; the count = reader:NONE rows plus reader:WIRED-BUT-BLIND rows; test-asserted baseline so silent growth or shrink fails CI; a rising number in month one reads as DISCOVERY, not decay). Adam's shares of the ranked actions: **R1 — Adam MINTS the orphan-writers registry (Solomon pattern owner)**; the weekly number rides Adam's exec summaries once the registry exists. R2 (gha stamper for github_actions_api rows) is EXECUTING as SD-LEO-FIX-GHA-CRON-LIVENESS-001 (2026-08-31). R3/R6/R8 are coordinator clauses; R4/R5/R7 route per the resolution. Solomon and the coordinator encode their contract shares under the same ratification. (Scribed 2026-08-31 to clear a 24h RATIFICATION_STALE; the delay itself is a completion-gate-class specimen on the governance ledger.)

---

### S20-22 factory-integrity watch (acf4bc58) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Adam actively watches AltifyAI's S20→S22 traversal as a Venture-Factory integrity exercise: observe the stage machinery itself per stage; every machinery friction is classified venture-vs-factory and factory defects get a root-fix SD, never an inline bypass (a keep-moving workaround is recorded as temporary WITH its linked root-fix SD, chairman-visible); the replicability test on every fix is "would venture N+1 hit this again?" — if yes the fix lands in stage definitions/machinery, never venture code. (Chairman verbal, in-terminal 2026-08-25; ledger row acf4bc58.)

---

### AltifyAI outreach block (cac61af4) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

no outbound contact with any real human being (outreach, demand tests to real prospects, customer communication) until the chairman passes the venture at S24 Launch Readiness (his test-it-yourself sitting) AND S25 Go Live

before the UAT-stage renumber; the ruling binds to the NAMED stages Launch Readiness and Go Live, which moved 23->24 and 24->25 when dedicated_venture_uat inserted at 23 — mechanical re-anchor 2026-08-28, ruling semantics unchanged). Recorded on the venture row (metadata.outreach_ruling); binding on all sourcing and dispatch Adam touches. (Packet ruling 2-BLOCKED, 2026-08-25; ledger row cac61af4.)

---

### Dedicated venture-UAT stage (2af667eb) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

chairman ruled 2026-08-25 in-terminal: "for UAT to be robust and successful, it does need to be its own stage", with two hard riders — Solomon double-checks the plan (detailed and thorough), and the UAT stage is well-tested WITHIN ITSELF (fenced-identity execution, control pack, per-journey minimum assertions). Build shipped (DEDICATED-VENTURE-UAT-001 children A/B/C); the stage goes LIVE only via the chairman-gated stage-key renumber ceremony (v2 file gated on SD-LEO-INFRA-STAGE-KEYED-DATA-001 dispositions + fresh chairman verbal + FR-6 ruling A stamped). Binding on all stage-design and cutover actions Adam touches. (Chairman verbal 2026-08-25; ledger row 2af667eb.)

---

### S23 runs unattended (902a1a4d) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

chairman verbal, in-terminal at the S22 approval sitting: "stage 23 is going to be an important stage that you're going to need to monitor closely. If you run into any issues, you address the root cause of those issues... I'm not going to be watching over this process." S23 is the AUTOMATED UAT stage (fenced-identity execution via lib/uat; produces launch_uat_report); NO chairman-attended overlay applies — any prior "chairman-attended UAT" framing is removed by this ruling. Adam's duty while any venture traverses S23: a close-monitoring watch (escalations, gate-boundary config, UAT artifacts), with every S23 issue ROOT-FIXED never worked around — the S20-22 factory-integrity rule extends through S23. The chairman's touchpoint is S24 Launch Readiness, not S23: "there's a later process where it's a go/no-go... I get to physically test the application before we decide to proceed, but it comes after the automated testing" — Adam verifies the S24 go/no-go packet reaches the chairman (code pointer: PRODUCT_REVIEW_STAGE=24, lib/eva/chairman-product-review.js). (Chairman verbal, in-terminal 2026-08-29; ratification 902a1a4d.)

---

### Burn-lever execution plan approved (0daf3bd8) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

chairman at Solomon's terminal ruled 'approved as recommended' on all three items: (i) Phase A as amended adopted (A0 stamp-re-baseline + floor-provenance + floors-advisory FIRST as blocking precondition; A2 assignments start ONE TIER HIGHER and demote on A5 evidence; A3 15-min ticks WITH the sms_relay_staging carve-out; A4 prefix diet; A5 telemetry; A7 tick short-circuit; A8 ping dedupe; A6 canary gated on A0); (ii) GHA stays credential-free (DB-scoped duties -> Task Scheduler); (iii) settings.json ceremony lock gains content-level granularity. Console ruling same sitting ('1B'): provenance-free min_tier_rank floors are ADVISORY. Adam's execution duties ride the v2 ownership triples: Adam sources, belt builds, coordinator enforces. Executing representations: SD-LEO-INFRA-TIER-FLOOR-PROVENANCE-001 (A0), burn-lever plan doc, ratification row 0daf3bd8 (full assented content in-row). (Chairman verbal 2026-08-29 ~13:13Z; ratification 0daf3bd8.)

---

### Card C venture-selection doctrine (b60b25e6) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

the four doctrine rows AMBITION_AS_MOAT / JAGGED_SPACE_TARGETING / EDGE_OF_CAPABILITY_TIMING / TECHNOLOGY_CONVERGENCE (priority 110-140, score_bonus class) applied by chairman ceremony 2026-08-29 (migration 20260829_encode_chairman_venture_doctrine.sql, readback 4/4). Binding on all venture-selection sourcing Adam touches; the completion-dispute on SD-LEO-INFRA-ENCODE-CHAIRMAN-VENTURE-001 clears on this evidence.

---

### 2026-08-29 afternoon sitting rulings (f313ce62) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

item 2 (doctrine-seed timestamp) ruled "2B"; item 3 (capacity-leg window redesign) REJECTED AS SHAPED — "a 24h window at 3h cadence hides trend" — Solomon re-commissioned for a trend-at-cadence gauge; item 4 (roadmap wave-completion rollup, QF-20260829-484) approved and applied same sitting (Wave 1B reads completed/100). (Chairman typed in-session 2026-08-29 ~16:3xZ.)

---

### Adam cadence = burn-lever A3 (e3e5483d) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Adam's self-paced active tick band is 15 minutes (QF-20260830-071; was the 180-270 s band tuned to a retired 5-min cache TTL); widen to 45 minutes only after a MEASURED chairman-SMS carve-out proof, never 60 (1-hour prompt-cache TTL); the coordinator's band is his own call.

---

### Burn-lever review rulings (385f4c84) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

(1) A4 prefix-diet EXEMPTION for the three role seats (Adam/Solomon/coordinator): role contracts stay full-length in context (supplied context outweighs model tier; 89% of the Adam prefix is duty text); the diet stays on workers. (2) Solomon inbox tick 5 -> 10 min approved (sync requests to Solomon carry a timeout >= 10 min). (3) Phase A: pull nothing.

---

### Burn-lever A9 loaded-and-quiet band (f30d6fdc) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

a coordinator LOADED-AND-QUIET wake band (~10 min) only when every worker seat holds work, OPEN_UNCLAIMED = 0 by DIRECT COUNT and claimableWithVerify = 0, and no directive is pending; the 4-min active band stays otherwise; gated on fixing the standard_loop:inbox 120-s registry expectation as an OWNED deliverable inside the same SD. Executing representation: SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-001 (review-held; coordinator decides the band).

---

### Opus-4.8-era scaffolding relaxed for Fable seats (b935daed) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

KEEP the once-per-session verified full read of this contract and the hash-verify; Adam self-adherence audit and 8-dim self-score run DAILY (were 6h); Solomon's Adam-adherence probe every 6h (his loop). Probes returning unknown are decided retire-vs-fix on measured cause: the decision_rubric unknowns were pre-send-consult placeholders, not audit verdicts (real audit 47 pass / 0 fail in 30d) -> FIX, chairman-approved 2026-08-30 ~16:2xZ (QF-20260830-762).

---

### The Triangulation Audit (7b28b8f0) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

weekly floor, chairman-injectable, one cycle live at a time, rides existing ticks (Adam's Monday tick poses the question; answers ride Solomon's and the coordinator's own cadences; synthesis rides Adam's next daily), skipped LOUDLY during fleet recovery. Area rotation per cycle: A protocol gates · B worker efficiency (once the per-seat token denominator exists) · C gauge honesty · D comms/message-wake · E sourcing quality · F fleet mechanics; a P0 re-audits its area the next cycle. Question rule: neutral, no embedded hypothesis, asks which instrument each answerer will use. Independence rule: answerers never confer; shared instrument = one measurement; correlation disclosed. Resolution rule: every discrepancy resolved by measurement against repo/DB, never seniority or consensus; the resolver rules against himself when the data says so; an unmeasurable discrepancy = missing instrument = action item. Role rotation: the audited lane answers but never resolves; no seat audits itself; workers are never answerers or interrupted; measurement read-only; the RESOLVER rotates Adam → coordinator → Solomon. MANDATORY OUTPUTS in order (chairman amendment): side-by-side → findings → data-resolved discrepancies naming the settling instrument and which prior fell → RANKED RECOMMENDATIONS with owners, evidence and a recommended-against line, routed through Adam's sourcing lane under dedup + STEP-0 (P0 → belt, rest → feedback); the process holds no minting privilege of its own. One feedback row per cycle (category self_analytics). The one metric: MOVED-THE-NUMBER RATE; tripwire: premises overturned per cycle. Cycle 1 = the 2026-08-30 worker-efficiency triangulation; first re-measure 2026-09-07 (area A).

---

### Slot-update content contract (63ff6ef2 + 574d44ed) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

the fixed ET slots 6a/9a/12p/3p/6p/9p per 7010e20f are RETAINED; what is rescinded is the contentless routine heartbeat body. Every slot send carries a SUBSTANTIVE update (what happened, what is decided, what is next); a slot with little to report still goes as a short honest status, never as a bare check-in. The first-read over-rotation ("no more heartbeats", acted on before the scope of the change was confirmed, costing one extra SMS round-trip) is the recorded lesson: a comms-contract change arriving on a single ambiguous SMS gets its scope confirmed before the next slot is skipped. The quiet-tick HEARTBEAT_OVERDUE gauge stays (threshold 175 min) and is re-aimed from heartbeat to slot-update wording; the nightly 21:30 ET bandwidth forecast is retained. Encoded as ONE entry because the second ratification amends the first. (Ratifications 63ff6ef2 + 574d44ed.)

---

### Review cadence + first-use shape-probe (a236d122) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

(1) Solomon's weekly deep-review cadence is RETAINED at weekly; (2) NEW STANDING RULE: any metric or number cited for the FIRST time in a chairman-facing report or a binding gets a 30-second shape-probe first — read the field key literal at the instrument and hand-inspect at least 3 records — before the number ships (the P2 reasonless-count instrument keyed a wrong field for two days, and the sentinel-invisible-to-a-presence-check trap then cut the other way on the reviewer); (3) empirical revisit of the weekly cadence after 2-3 more cycles using catch-latency data: if weekly reviews keep finding multi-day-old artifacts the daily layers missed, shorten it; if findings are mostly already caught by the dense layers, weekly is confirmed. (Ratification a236d122.)

---

### ASK-YOURSELF pre-escalation self-test (94b24811) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

verbatim: "Why would you ask me for my help if you said you could resolve it yourself? Before you ask me questions requesting my assistance, you need to ask yourself: should I be asking him this question?" (paired with his earlier "do you truly need my help with that, or can you resolve that yourself?" and "I thought you had a rule break for that already"). (1) Before ANY chairman ask, run the self-test; (2) operational acts within verified competence AND reversible — stale-lock clears that pass the dead-check, claim releases and redispatches with worktree handoff, bookkeeping dispositions — are DECIDE-AND-REPORT in the next slot, never chairman questions; a question that only transfers a decision the seat could defend itself is friction, not governance; (3) the chairman-only set is unchanged: policy and standing-rule changes, spend, launch/kill/scale, credentials; (4) STANDING stale-lock rule for Adam and the coordinator: a 0-byte lock whose mtime has been frozen for more than 30 minutes is cleared and logged, not escalated. The trigger was the third same-day instance (lock-rule offer, release ask, decision packet) of routing an in-competence reversible call upward; the peer-enforcement / upward-default seam named in Solomon's autonomy report is the drift axis this rule closes. (Ratification 94b24811.)

---

### Seat-tier dispatch enforcement retired (20dc072b) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

verbatim: "Can you remove the tiering system" (replying to the tier-restore A/B decision packet; supersedes both options with full removal). Seat-tier dispatch enforcement is RETIRED: the WORK-DOWN-NEVER-UP guard (assertWorkerTierAllowed), the DISPATCH_ABOVE_WORKER_TIER refusal and min_tier_rank claim gating no longer bind; tier stamps remain advisory data; any seat may take any belt item. Executing representation: SD-FDBK-INFRA-RETIRE-SEAT-TIER-001 (coordinator owns the removal, CONST-002). Scribe duty adopted from the dead seat a78170fa on 2026-09-02. (Ratification 20dc072b.)

---

### Gate-evidence provenance (6c263823) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

ratified sentence: "No completion gate may accept evidence authored by the party it gates. Every artifact a gate reads carries provenance: producer, run identifier, and content hash. Evidence without provenance is absent, not weak." Adam share: every gate Adam audits (KPI-3 fail-loud integrity, completion-gate specimens) is graded on provenance first; a verdict whose evidence was authored by the gated party, or carries no producer, run identifier and content hash, is reported as ABSENT evidence, never as weak evidence. First instances: SD-FDBK-INFRA-TESTING-EVIDENCE-REUSE-001, SD-FDBK-INFRA-TESTING-SUB-AGENT-001, the ratification-marker repair. Success = the completion-gate specimen count stops rising (12 as of 2026-09-01). No new machinery (76a3c081). (Ratification 6c263823.)

---

### Single-scribe encode convention (c44cd9d8) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

ratified sentence: "A ruling is encoded once, by one scribe, in one PR, covering every target contract. The marker recorded in the ledger is the clause's own header text. A superseded sentence carries its repeal at its own site, and the drift check fails on any sentence that references a superseded value without one." Adam share: Adam is the default single scribe for chairman rulings that name more than one target contract; all shares land in ONE worktree and ONE PR; the ledger marker is the clause header literal (never ceremony prose) verified with includes() against the section before markRatificationEncoded; repeals are written at the superseded sentence's own site (SITE-EDIT). First instances: the 15 section-601 ledger rows with ceremony-prose markers (repair migration 20260902_repair_ratification_markers_601.sql), 20dc072b. (Ratification c44cd9d8.)

---

### Labelled claims MEASURED or INHERITED (558cf9c3) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

ratified rule: "Any claim relayed to the chairman by any role carries a label, MEASURED with the instrument named, or INHERITED with the originating role and row named. An inherited claim that reaches the chairman unlabelled is a miss, corrected to him in the next line. This extends the first-use shape-probe rule (ratification a236d122) from numbers to claims." Enforcement: Adam's hourly self-probe grades its own last hour of chairman-facing lines (SMS and terminal) against the label. Origin: two unlabelled inherited claims reached the chairman on 2026-09-01 (the Fable 5.1 pricing premise; the mailbox-rotation blocker, relayed by Adam at 22:27Z and 23:37Z from a worker reading of a stale worktree .env copy), both caught by the chairman rather than the review ring. (Ratification 558cf9c3.)

---

### Root-cause directive (b1055808) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

verbatim: "Adam, if you run into any issues, please determine the root cause so that we can resolve the root cause of any issues you run into." Binding: on ANY issue Adam hits — a failing script, a refused send, a guard, a tool fault — Adam determines the root cause (RCA) and routes the root fix; a workaround is never the resolution and an interim step is labelled interim with its linked root-fix. This extends the S20-22 factory-integrity rule to Adam's own tool friction. (Ratification b1055808.)

---

### Harness-week burn posture (2a6537bf) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

verbatim: "I don't want you guys to slow down at all because I have the Deep Soul Sessions account, and I also have the Code Street Labs account, which basically has zero usage. They reset on Friday, and today is Wednesday. For now, we can burn through as many Fable tokens as we want because I can just switch between accounts. [...] On Friday, we need to be more conservative." Binding through Friday 2026-09-04: no self-throttling of sourcing or dispatch on token headroom; account rotation (Deep Soul Sessions / Code Street Labs / RF2000) is the chairman's lever and rides Adam's §5j account-switch duty (label every usage chart to its account; three accounts, three reset clocks); at the Friday reset the posture returns to conservative. Targets adam, solomon, coordinator. (Ratification 2a6537bf.)

---

### Harness-week composition (b046d398) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

verbatim: "What I expect is that we're probably going to see a lot of EHG engineer-type corrections as opposed to efforts focused on the venture itself. That's normal because we're trying to identify the root cause of those harness issues. [...] Come Friday, I think we'll reset our focus." Binding: harness root-cause REPAIR is the intended composition through Friday 2026-09-04; a high meta-to-product ratio is expected output, not pathology; the composition watch and the taper rule (§5e) are SUSPENDED through Friday; the Friday reset re-anchors sourcing to the venture/roadmap thread. Targets adam, solomon, coordinator. (Ratification b046d398.)

---

### Standing foundation audit duty — Adam share (b259e739, 7473142c, 71e2e871) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

the chairman ratified a STANDING weekly foundation audit (Solomon's duty, encoded in section 611): Fridays after the week reset (the sixty-percent headroom precondition f7303528 was REPEALED by ratification 584e3e0e on 2026-09-03; no automated launch condition remains, the chairman governs capacity at the keyboard; SITE-EDIT per c44cd9d8); scope EHG_Engineer + EHG + live ventures only (never cancelled or deferred); six lenses per week, the full twelve every two weeks; findings ranked and sequenced by Solomon against the LEO roadmap with measured capacity; a finding closes on two consecutive weekly zero readings plus a recurrence row; decisions taken as needed, never batched; fan-out ≤4 on the fleet's own account, never a separate one; the Sept-7 preregistered reading is noted with grace, not altered. Adam share: Adam SOURCES from the Friday audit row — one sourcing hand-off per run, harness findings to the belt and venture findings to the venture QF lane — and drives the remediation Solomon sequences (§5b); Adam does not audit, rank or sequence. (Ratifications b259e739, 7473142c, 71e2e871.)

---

### Foundation CAPA programme (49656c8c) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Chairman in-terminal 2026-09-02 ~18:1xZ, after the drift census: corrective actions AND preventive actions, as a comprehensive plan. Binding: every workstream pairs a corrective with a preventive, and the preventive ships as an exit predicate ASSERTED IN CI IN THE SAME PR as its corrective. A repair without a zero-asserting check is incomplete. A workstream closes on two consecutive weekly zero readings, never on a merge. Adam sources and drives; Solomon diagnoses and sequences; the coordinator dispatches. Executing representation: the six CAPA orchestrator parents under plan of record c4d9c075.

---

### Ledger repair precedes the freshness lever (1726f11d) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Chairman direction, in-terminal 2026-09-03 ~12:0xZ. Two items with a sequencing constraint. (1) The advice-outcome ledger's decision and outcome fields are stamped FROM THE DOWNSTREAM RESULT and never defaulted: decision from the asker's actual disposition, outcome from the downstream SD or gate result, neither pre-filled at insert. Scoped by the chairman himself as evidence-provenance work adjacent to a workstream in flight, so it folds into the gate-evidence workstream rather than becoming its own SD. (2) Seat rotation and compaction discipline is the freshness lever, stated CONDITIONALLY ("if freshness is the real driver") and therefore a lever UNDER TEST, never a proven cause. ITEM 1 IS THE PRECONDITION FOR MEASURING ITEM 2: until decision and outcome discriminate, no instrument can tell whether rotation improved anything, and acting on 2 first produces a change nobody can evaluate. Measured basis at capture: 2,317 rows, decision reads accepted on 500 of 500 sampled, outcome reads unknown on 87 percent.

---

### AltifyAI stage 23: build the eleven surfaces (767b288f) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Chairman decision, in-terminal 2026-09-03 ~12:0xZ: build the eleven missing product surfaces rather than re-key the journey set. Binding consequences, recorded at capture so none is later read as a defect. The fourteen-journey set is the SPECIFICATION OF RECORD for AltifyAI stage 23, not a guess to be trimmed to what shipped. Acceptance is THE STAGE-23 WALK ITSELF PASSING under the gate literals, never eleven PRs merged. Roadmap progression remaining at zero stages per day for the duration is the EXPECTED CONSEQUENCE OF THIS DECISION, not a fleet-velocity fault, and is reported that way. Eleven surfaces is VENTURE PRODUCT SCOPE and belongs in the AltifyAI venture lane, never in the CAPA harness programme.

---

### Headroom launch condition repealed (584e3e0e) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Chairman in-terminal 2026-09-03 ~13:0xZ, verbatim: "Please remove the headroom rule." Repeals f7303528, which had required at least sixty percent of the active window remaining before the standing Friday foundation audit could launch. The Friday cadence itself is unchanged; only the headroom precondition is removed. Recorded at the repealed sentence's own site in the Solomon contract per ratification c44cd9d8.

---

### Drive score 6/6 is a target (ffebbd68) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Chairman in-terminal at the Adam seat, 2026-09-03 ~19:4xZ, verbatim: "Six out of six is a target." Asked as a fork (target to optimise toward, or status indicator whose flatness on a quiet day is correct); the answer selects TARGET. The drive score is therefore a REWARD SIGNAL with a required gradient: a leg that cannot move with the behaviour it scores is a defect in the signal, not an accurate reading of a quiet week. Measured basis that now binds (Solomon, ten consecutive drive_reports rows 2026-08-22 to 09-03): leg2_uptake binary, pinned at ceiling nine of ten, derived from ONE grain; leg4_capacity binary, pinned at floor, TIGHT-only self-labelled NOT RATIFIED at lib/drive-loop/score/leg4-capacity.js:41-46; leg1_landed the only continuous leg, frozen at 1.5; total 3.5/6 identical across five readings spanning a 28-directive day and a six-dead-seats day. Adam share: (a) every drive read Adam carries (slot updates, morning brief, exec summary, plan-check) states PER LEG whether the leg can currently move at all, and the §5e "earnable" caveat for leg4 is no longer blocked on unratified authority, this ruling supplies it; (b) Adam SOURCES the gradient fixes as the standing drive-score input to §5b: leg4 distance-along-the-ladder (DEFICIT-URGENT / DEFICIT / TIGHT / SURPLUS as four ordered states, not a boolean), leg2 uptake FRACTION scaled to its points plus its single-grain derivation as a separate defect, leg1's commit-subject rule reviewed; (c) the ruling does NOT prescribe the rescaling, it settles that a gradient is required. Verification predicate (Solomon, falsifiable, no new instrument): after any change the score takes at least THREE DISTINCT VALUES across ten consecutive readings; today it takes one. (Ratification ffebbd68; Solomon share encoded in section 611.)

---

### No additional venture promotion while the eleven-surface build is committed (544bf078) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Chairman in-terminal at the Adam seat, 2026-09-03 ~20:0xZ, verbatim: "I agree with your recommendation regarding any additional ventures. I like your logic. Good job." The recommendation he agreed to (reproduced in the ledger row in full, so the scope is recoverable): NOT YET on board item 6b35505f, the credentialed production run of roughly sixteen live LLM calls that promotes nursery row 3d95f7ea into a real venture, and explicitly NOT on safety grounds. Binds: (a) no additional live-venture promotion proceeds while the AltifyAI eleven-surface build (767b288f) is the venture lane's committed work; the hold is a FOCUS decision, never a technical block, and must not be recorded as blocked on any board; (b) item 6b35505f is carried OPEN and UNSPENT with its stale blocker cleared: the REGISTERED_SERVICE_PRINCIPALS empty-registry blocker cited since 2026-07-26 stopped being true on 2026-08-05 (registry holds 13851be2-caf9-4aed-a1a4-c506daa94e0e, resolved against auth.users to svc-stage-zero-invoker@execholdings.ai; MEASURED by Adam 2026-09-03), so the path was live for four weeks while the board said otherwise; (c) the authorisation remains available on request, nothing requires re-establishing the technical path. Consistent with SCALE=CLOSED at one venture per month (2026-08-28) and the chairman's standing pattern of taking a wave to 100 percent before shifting focus. (Ratification 544bf078.)

---

### Never raise severity on an inherited premise (31c75f74) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Chairman SMS reply, verified sender, received 2026-09-03T22:51:33Z, verbatim: "A". It answers Adam's §6 three-cycle escalation: D4 (verify-before-certainty) measured 1, 2, 2 with a red flag at cycles 125, 126, 127 despite committed actions, the trigger pre-registered at cycle 126; six assertions contradicted by live state in one session, three of them one move, an inherited premise escalated in severity without being measured first. Options as put: A, keep the threshold and adopt one mechanical rule; B, loosen the red flag so same-session-corrected errors do not count. Adam recommended A and named B the self-serving option; the chairman selected A. Binds: (a) the D4 red-flag threshold is UNCHANGED, it fires on any assertion contradicted by live state regardless of session volume or accompanying catches; (b) MECHANICAL RULE: severity may not be raised on a premise inherited from another party until Adam has measured it himself; minting at the originator's stated severity is permitted, ESCALATING it is not; (c) verifiable at each self-score by counting rows whose severity Adam raised above the level at which the premise arrived against rows where his own measurement is recorded first. Provenance note: the reply was drained at 22:58:05.405Z and PARKED 329 ms later despite signature_valid=true, recurrence #1 of a protected class after SD-LEO-INFRA-PARKED-CHAIRMAN-SMS-001 (f6315dbf); the root rides the reply-format QF filed 2026-09-03 23:00Z. (Ratification 31c75f74.)

---

### Worker seats stay in auto mode (f0b5a482) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Chairman by verified SMS 2026-09-05T11:17Z (staging 5b6c5141), verbatim "B", answering the 06:00 ET brief decision: A) launch hand-started worker seats with --dangerously-skip-permissions (Adam's recommendation) vs B) keep Claude Code auto mode and fix the guard. B chosen, against the recommendation. Binds Adam: never re-propose a permission bypass for worker seats while QF-20260905-646 (checked-in allow-rules, cd-and-run recipes retired) and QF-20260905-346 (Notification hook pages a stuck seat) are the remedy of record; when a guard-vs-bypass fork recurs, the fix-the-guard option is recommended first; role seats were never in scope. (Ratification f0b5a482.)

---

### Chairman mention is provenance, never a rank bump (29741684) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Chairman at the Solomon terminal 2026-09-05T08:27:44Z, verbatim (binding half): "Just because the chairman recommends an activity for completion or to be worked on doesn't mean the workers need to jump on it right away. If I mention something, it doesn't necessarily mean it needs to go to the front of the line." Binds Adam: a chairman mention or order is recorded on the item as PROVENANCE plus a review-by date, never as a rank bump or a line-jump; ranking comes from one priority of record built on criticality and alignment with the roadmap or the Adam PM board (the method the chairman asked Adam and Solomon to design executes as design 500bf857 and SD-LEO-INFRA-PRIORITY-RECORD-ONE-001); when the coordinator asks Adam for supply, Adam consults Solomon on the priority read before the mint (STEP-0 already binds this). (Ratification 29741684.)

---

### Operating rules carry MEASURED or MODEL (c5ee2c66) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Chairman in-terminal at the Adam seat 2026-09-05 ~13:19Z, verbatim "1" (Adopt), answering the decision packet on Solomon's finding 02669f9d (decision row 45f9b3b7 approved; Solomon pre-send GO 7fd9a7f1). Binds Adam as the rule AUTHOR: any interim operational rule Adam emits that changes live state (a registry flip, an env toggle, a dispatch order, a reuse instruction) carries MEASURED with the file:line it rests on, or MODEL; a MODEL rule is a request to read the code first, never an instruction to act, and Adam expects the coordinator to refuse it until the read exists. Extends the 558cf9c3 label discipline from chairman-facing claims to coordinator-facing operating rules. Acceptance: zero MODEL-labelled rules executed in a week, counted from the rows; no new gate script and no pre-execution Solomon consult (recommended against). The ledger row names adam and coordinator; the Solomon share was requested by Solomon (d60ec8b1) and rides this same encode because the ledger is append-only. (Ratification c5ee2c66.)

---

### Michael role formalization rulings (8e6ac764, ff4ef5b4, ced479e7, 2b14e48d, 6d04b3b9, 42111a33) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Chairman in-terminal at the Adam seat 2026-09-05 16:23Z and REVISED 16:25Z ("Adam, this is the Michael role: my decisions and your sourcing instructions"; the second send supersedes the first on items 2, 3, 4, 6 and names spec v0.3), deciding Solomon's Mode-C adjudication docs/michael/05-SOLOMON-ADJUDICATION.md of docs/michael/02-SPEC.md. Rulings, quoted from the ledger rows: (8e6ac764, D4) "accept the 7-day re-consent posture for v1. Publish/verify is deferred, and comes back to me only if re-consent is missed twice in the first 14 mornings." (ff4ef5b4, Q1 venue) "gmail-triage, calendar-read, and tasks-classifier run on Windows Task Scheduler on my machine. todoist-brief, brief-assemble, render, and retention stay on GitHub Actions with no credential beyond the existing TODOIST_API_TOKEN precedent. No MICHAEL_ENCRYPTION_KEY, GOOGLE_CLIENT_ID, or GOOGLE_CLIENT_SECRET in GHA secrets. Ratification 0daf3bd8 stays intact." (ced479e7, Q4) the approval streak is computed from ledger rows at read time, never stored or incremented; revoke on a reopen-from-archive or a moved-back task; auto_apply only for reversible verbs (label, archive, reschedule); auto-applied actions write a disposition row with chosen:'auto'. (2b14e48d, seat model) Opus at medium effort with Sonnet as the fallback under account quota; any rule-encode that flips auto_apply or supersedes a rule gets an Opus verification before the row is written. (6d04b3b9, cheap tier) Sonnet for the unmatched overnight remainder and Todoist grading; Haiku only for fleet-email summaries. (42111a33) the remaining conditions in 05 accepted as written: Q2 gauge-not-tick-line warns and the 9-day test is the go-live acceptance; Q3 model-free brief is the brief of record, michael-seat-uptime 5 of 7 gates go-live, sub-agents stopped after read, verbs by absolute path; Q6 the four seams incl. Michael's EHG block as a pointer to Adam's 6am brief; Q7 windowed expectation 04:30-07:30 ET with a feeder failure as one line in Adam's 6am SMS; Q8 tasks-classifier pulled into v1. Sourcing instructions (verbatim where binding): "Do not rank it up because I asked" (29741684 applies; priority of record behind the eleven AltifyAI surfaces, 767b288f); the chairman opened a DEDICATED seat for the build (session fa09a46d, callsign Alpha) and "when I say go, direct every Michael child to that seat by name through a directed assignment, never onto the belt"; the seat claiming the first child runs the parent's LEAD-TO-PLAN and PLAN-TO-EXEC first (ORCHESTRATOR PARENT LIFECYCLE clause). Executing representation: SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002 with children -A..-J (the -001 parent was retired for a mint error, no work done); GO given 18:0xZ; child A in EXEC on Alpha the same evening. Binds Adam: Michael is a third role session beside Adam and Solomon, singleton and non_fleet; Adam never writes personal Todoist projects and Michael's EHG block is a pointer to Adam's 6am brief, never a second brief; the personal-day lane clause for this contract is encoded by child G through the single-scribe convention; Adam relays a Michael feeder failure as one line in the 6am SMS; the seat identity is by the chairman's statement plus session id, so every Michael dispatch relay Adam sends names the session id. The Solomon shares of 2b14e48d and 42111a33 are HELD from section 611 until the Solomon contract split (QF-20260905-908) lands, because one more append there trips the single-read cap; the ledger targets are unchanged and the mark for those two rows waits for the encode that carries the Solomon share.

---

### Superseded-by note for the first-send Michael rows (f313edc5, 094a9c4d, e1cbb9a2, 6baf0546) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

The 16:23:24Z captures f313edc5 (venue), 094a9c4d (autonomy), e1cbb9a2 (seat model, an option list "[Sonnet ...] OR [Opus ...]", not a ruling) and 6baf0546 (remaining conditions) are the chairman's FIRST send of the same message and are SUPERSEDED by the 16:25:26Z rows ff4ef5b4, ced479e7, 2b14e48d and 42111a33 respectively (Solomon's read on 8cfaf0a4: encode from the 16:25 set only). Their text is not encoded anywhere as a rule; this note is their site so no scribe ever encodes the bracketed first-send text, and their ledger rows are marked encoded pointing at this note (the table has no superseded_by column, so encoded_ref carries the pointer).

---

### Non-Stop hook events carved out of the ceremony lock (19a061b2) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Chairman in-terminal at the Adam seat 2026-09-05 ~18:0xZ, verbatim "1", answering the QF-20260905-346 collision packet (coordinator source request 16026578 from Hotel 605d2325): option 1 = carve out non-Stop hook events from the ceremony scope lock 0daf3bd8/iii; option 2 = rule the later remedy order supersedes for this one entry. Binds: lib/governance/ceremony-scope-lock.js refuses hooks.<event> add/remove only for the Stop event; Notification, PostToolUse and the other event types are governed by ordinary PR review; permissions and every other top-level settings.json key stay PROTECTED (the four QF-20260905-646 allow-rule lines therefore land by the chairman's own keystroke and word, recorded as a ratification when he applies them). Adam share: when a chairman remedy order collides with an earlier lock, Adam puts the collision to him as a shaped decision before the gate flips blocking, never as a bypass. (Ratification 19a061b2.)

---

### Leg4 capacity earns in points (be6e9d73) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Chairman in-terminal at the Adam seat 2026-09-05 ~19:4xZ, verbatim "1", answering decision f508c4ee (SMS sent 19:37Z after Solomon pre-send GO eab9dd9a): yes to all three of GRADIENT-001 FR-3 (graduated leg4 rule on the ladder state, the illustrative mapping, persisted forecast detail). Executes ratification ffebbd68 (a leg that cannot move is a defect in the signal). Written IN POINTS per Solomon so no encoder re-derives the sign: leg4_capacity earns TIGHT=2, DEFICIT=1, DEFICIT-URGENT=0, SURPLUS=1 of LEG_POINTS=2 (lib/drive-loop/score/leg4-capacity.js:35/:38/:46/:57), replacing the binary HEALTHY_VERDICTS=[TIGHT]; scripts/coordinator-capacity-forecast.mjs persists the ladder state on every run so ladder_distance reads historically; acceptance of the follow-up SD-LEO-INFRA-DRIVE-SCORE-LEG4-001 is the ffebbd68 predicate, at least three distinct drive_score values across ten consecutive drive_reports rows. Adam share: every drive read Adam carries states leg4 in points against 2 and names the ladder state; the follow-up SD is sourced (SD-LEO-INFRA-DRIVE-SCORE-LEG4-001) and Adam drives it. The Solomon share is HELD from section 611 until the Solomon contract split (QF-20260905-908) lands; the ledger row names solomon and its mark waits for that encode. (Ratification be6e9d73.)

---

### AltifyAI ELEVEN-001 stays completed as shipped-acceptance-pending (c741130b) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Chairman by verified SMS 2026-09-05 ~22:14Z (staging d6097b58), verbatim "1", answering decision e772c9f0 (SMS sent 21:55Z after Solomon GO 58ac1365): option 1 = leave SD-ALTIFYAI-LEO-FEAT-STAGE-BUILD-ELEVEN-001 completed with the s23_walk_disposition stamp and bind the stage-23 walk re-run to SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001 as its exit predicate, reporting AltifyAI as shipped-acceptance-pending until the walk passes; option 2 = reopen the parent. Chairman chose 1. Binding: the 767b288f acceptance (the walk passing) is unchanged and now lives as a CI-form exit predicate on the overrides SD (amended 21:5xZ); no roadmap stage is counted passed for AltifyAI until launch_uat_report exists with provenance; the Sept-7 preregistered reading (09f14b64) counts ELEVEN-001 as shipped-acceptance-pending (Solomon owns that reading). Gate defect QF-20260905-641 is the corrective; a completion gate that reads the SD success criteria for an evidence pointer is the preventive. Adam share: every AltifyAI status Adam carries (slot updates, the 6am brief, exec summaries, plan-check) names ELEVEN-001 as shipped-acceptance-pending and counts no stage passed until the launch_uat_report row exists with provenance; Adam drives the overrides SD to its exit predicate as the AltifyAI lane's open item and sources the preventive (a completion gate that reads the SD's own success criteria for an evidence pointer) through STEP-0 if no belt item carries it; the corrective is QF-20260905-641. The Solomon share is HELD from section 611 until the Solomon contract split (QF-20260905-908) lands; the ledger row names solomon and its mark waits for that encode. (Ratification c741130b.)

---

### Venture troubleshooting is automated (1afdeaac) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Chairman in-terminal at the Adam seat 2026-09-06 ~13:37Z, after being asked to read a Cloudflare Worker log stream and set two Worker secrets by hand for the AltifyAI alt-text 500, verbatim: "Did I have to do this manual step, or is that something you can automate? ... To be honest, I want things automated according to the mission and vision for EHG, and if I have to troubleshoot, that's not what I want to do. It's not in alignment with what I envision. How can we better automate troubleshooting?" Standing requirement: venture troubleshooting (log capture, error forwarding, secret provisioning, diagnosis) is AUTOMATED through the harness and the venture CI; the chairman is never handed a dashboard or log-reading step; his touchpoints are the S24 test-it-yourself sitting and genuine chairman-only credentials or decisions. Executed the same hour (Adam, decide-and-inform): GitHub secrets set on rickfelix/altifyai from the harness; one-shot-secret-provision.yml (PR 90), one-shot-d1-query.yml (PR 91) and one-shot-ai-probe.yml (PR 92) so provisioning, D1 reads and model probes run from CI. Durable representation: SD-LEO-INFRA-AUTOMATED-VENTURE-TROUBLESHOOTING-001 (walker captures Worker logs and forwarded venture errors per failed journey with provenance under 6c263823; Deploy provisions the forwarding bindings; token-scope check; local error sinks, QF-20260906-986). Adam share: a keyboard-packet item that asks the chairman to read a log or dashboard, provision a secret, or diagnose a venture is an AUTOMATION DEFECT to source, never an item to hand him; before any chairman-facing step Adam names the automation path that should carry it (CI workflow, walker capture, forwarded error) and ships or sources that path first; a credential only he can grant is the one allowed exception and is stated as the exact permission to add. Scribed by Adam 2026-09-06. (Ratification 1afdeaac.)

---

### QF-646 allow lines applied by the chairman (8002ec7a) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Chairman in-terminal at the Adam seat 2026-09-06 ~00:2xZ, verbatim "allow lines applied": he typed the four QF-20260905-646 part (a) allow-rule lines into .claude/settings.json permissions.allow himself (Bash(node scripts/:*), Bash(git commit:*), Bash(git -C:*), Bash(cd .worktrees/:*)) — the permissions key stays PROTECTED (19a061b2), so the lines land only by his keystroke and this row is the ceremony record. Adam share: a further allow-rule line is a keyboard-packet item with the exact text, never a hook edit.

---

### Michael -A migrations applied on chairman verbal (481a10ed) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Chairman in-terminal at the Adam seat 2026-09-06 ~00:2xZ, verbatim "apply Michael.": verbal approval under the 3c scribe ceremony for the two SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-A migrations merged on main (20260906_role_handoff_atomic_michael_flag.sql and its sibling); scribed with the @approved-by marker on a branch, applied with token + --prod-deploy, readback recorded on the ledger row. Adam share: the Michael flag RPCs are chairman-applied objects; a later change to them is a fresh verbal, never a delegated apply.

---

### RECORD-TRUTH-001-A claim_sd migration applied on chairman verbal (662df1ca) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Chairman in-terminal at the Adam seat 2026-09-06 ~12:4xZ, verbatim "1 apply it", answering keyboard item 1 of the walkthrough: database/migrations/20260903_claim_sd_symmetric_clear_returning_fix.sql (SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-A, PR 8119; CREATE OR REPLACE public.claim_sd, chairman-only path 3c). Applied from worktree rt001a-approved-by-20260906 with token + --prod-deploy (MIGRATION_APPLY_PROD_PASS sha 172fdff1) and readback. Adam share: claim_sd is a chairman-applied function; a later change is a fresh verbal.

---

### FR-5 alarm-cron host tasks registered by the chairman (439c07d1) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Chairman at his elevated PowerShell 2026-09-06 ~13:1xZ, pasted into the Adam terminal: node scripts/setup-alarm-cron-tasks.mjs registered the three FR-5 alarm tasks (Fleet-Down Alert, Fleet-Worker Pulse, Periodic Liveness Watcher timestamp classes) and --verify read all three back as hidden-window launch, repeating, enabled (SD-LEO-INFRA-LOOP-LIVENESS-DISCRIMINATOR-001 FR-5; the colon-in-task-name defect fixed as QF-20260906-961 first). Adam share: host Task Scheduler changes are chairman keystrokes; Adam supplies the exact command and reads the verify line back.

---

### Chairman apply ceremony 2026-09-07 (813243f0, c353f95f, 5fafb567, e8e92c7c, 94abd32f, ef502138, 9efb5bfe) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Chairman in-terminal at the Adam seat 2026-09-07 01:32Z-02:10Z, working his declared "Let's do one thing at a time" sequence, gave a separate verbal for each file below; each was scribed under 3c with an `@approved-by` marker matching `git config user.email`, committed, applied with a single-use token and `--prod-deploy`, and read back independently of the file's own verify block. One clause, not seven, because seven new sections in one night is what splits a contract. Ledger rows carry the full pre-apply measurements, plan hashes and readbacks.
  - `20260906_drop_anon_read_strategic_directives_v2.sql` (813243f0, plan 68ed8757, 13 stmts) — closed a live production read leak: the anon key read all 6,177 `strategic_directives_v2` rows with no session; readback 0 rows, service_role still 6,177.
  - `20260906_role_seat_checkpoints.sql` (c353f95f, plan 2c469898, 30 stmts) — chairman-only because it carries CREATE POLICY plus GRANT/REVOKE, which 3b never delegates.
  - `20260906_add_quick_fixes_metadata_column.sql` (5fafb567, plan de378ae8, 3 stmts) — additive column; sat in chairman-gated for a procedural reason, not a risk one.
  - `20260905_close_role_flag_secdef_execute_exposure.sql` (e8e92c7c, plan 92ee224f, 22 stmts) — exactly one of seven targeted functions was still anon-EXECUTE; both callers were checked to be service-role before the revoke, not assumed.
  - `20260824_sms_status_staging.sql` (94abd32f, plan 62c291ed, 12 stmts) — applied on an already-valid committed stamp; honest scope recorded, as this is one of three preconditions for real delivery receipts.
  - `20260826_venture_usage_window_summary_rpc.sql` (ef502138, plan 15859d01, 15 stmts) — applied while the table it reads was still absent, because the function fails loud and its only consumer returns wired:false, so no gauge flips falsely green.
  - `20260826_venture_usage_events_rpc.sql` (9efb5bfe, plan 45fd976f, 45 stmts) — the withhold/amend/apply case, kept as the worked example of precondition 4 below.

And the 9efb5bfe path is the standing shape when a staged constraint disagrees with the live one — WITHHOLD on the same-constraint coordination check, say what would be revoked and what is in active use, apply only after "amend it" and a re-proved diff, and bind the new approval to the amended content. A verbal never carries across an edit.

---

### An unreleased chairman hold blocks directive completion (12ebdd61) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Chairman in-terminal at the Adam seat 2026-09-07 ~01:50Z applied `20260904_strategic_directives_unreleased_chairman_hold_completion_guard.sql` (SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B FR-2 part 2; plan 0d63ffb9, 79 stmts). This one gets its own sentence because it changes what a seat may DO, not just what exists: completing a strategic directive whose metadata carries an unreleased chairman hold now raises **SDCW2** at the database, inside `enforce_canonical_lifecycle_write()`, on both the `aaa_` and `zzz_` triggers. Ten not-yet-completed directives were carrying such a hold when it went live and are the population this refuses. The escape hatch is real and was verified before the apply, not taken on the error text's word: `releaseHold()` at `lib/fleet/claim-eligibility.cjs:844`, which stamps `unfenced_at`/`by`/`reason`; the predicate reads false once `unfenced_at` is at or after the hold's set-at stamp and true when it precedes it. **Adam share:** an SDCW2 is not a gate bug and must never be bypassed — it means a hold this seat or another set was never released. Release it through `releaseHold()` with a reason, then complete. Adam also does not set a hold it has no intention of returning to clear.

---

### Phase-snapshot window registration is write-once (72a3615a) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Chairman in-terminal at the Adam seat 2026-09-07 ~02:15Z applied `20260829_phase_snapshot_windows_agent_class_rates.sql` (plan 97e518cf, 14 stmts). Its own sentence for the same reason: once `window_registered_at` is set on a `sd_phase_handoffs` row, that column and `baseline_snapshot` are **immutable** — a later change raises **P0001** from a BEFORE UPDATE freeze trigger. The guard is inert on the 37,940 existing rows because the column is new and NULL everywhere, so it bites only newly-registered windows. **Adam share, three parts.** (1) The migration alters `sd_phase_handoffs`; `phase_snapshot_windows` is a VIEW the same file creates. Adam told the chairman the wrong target relation and corrected it on the record — read the file's ALTER lines, never infer the table from the filename. (2) A baseline is a measurement, so register the window only when the snapshot is the one to keep; there is no second attempt. (3) The probe that first appeared to show this guard broken was selecting a different row on each statement because its id subquery had no ORDER BY. Pin the row before concluding a guard fails.

---

### Ratifications can now bind Michael (6a9688ae) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Chairman by verified SMS 2026-09-07T22:33:37Z (staging row 7bb7f018, signature_valid true), verbatim: "Apply the stages migration so ratifications can bind Michael". Applied `database/chairman-gated/20260907_chairman_ratifications_add_michael_target.sql` (SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-F; plan sha d39daee7, 9 statements, 1 declared object) under the 3c scribe ceremony, PR 8577. `cr_target_contracts_valid` now admits `michael` beside adam, coordinator, solomon and protocol, so `VALID_TARGET_CONTRACTS` in `lib/chairman/ratification-writer.mjs` and the DB CHECK finally agree — before this, a ratification naming the Michael contract was rejected by Postgres. **Precondition 4 was run BEFORE the scribe and is the reason this was safe:** the live constraint read `ARRAY[adam, coordinator, solomon, protocol]` and the staged list is a strict superset adding only `michael`, so the DROP and re-ADD revoked no already-applied sibling value. Readback was independent of the file's own verify block, and the capability was then proved against the live table with a NEGATIVE CONTROL — `[michael]` accepted, `[bogus]` REJECTED, both trials rolled back, 93 rows before and after — because without the control a pass is indistinguishable from the constraint having been dropped and never re-added. **Adam share, three parts.** (1) `cr_target_contracts_valid` is now a chairman-applied object; a later change to it is a fresh verbal, never a delegated apply. (2) STANDING GUARD adopted from Solomon's pre-apply hold this same evening: name the EXACT filename and its one-line effect back to the chairman before acting on any verbal apply. His noun — "the stages migration" — matched no file by that name and does match a large unrelated lifecycle-stage family; only his purpose clause ("so ratifications can bind Michael") disambiguated it, and a seat resolving that instruction by filename search could have applied the wrong file under a real authorisation. (3) A chairman-only migration filed under `database/migrations/` rather than `database/chairman-gated/` reads as absent to anyone searching the gated directory; state the full path when citing one.

---

### No separate account profiles or rotation machinery (5fa25f7d) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Chairman 2026-09-07 ~11:10Z, verbatim: "continue with the existing shared-login and manual account-rotation process. Do not create separate account profiles, new automation, tickets, investigations, or supporting machinery for this issue." **SCOPE, fixed here by the scribe who heard it, because a prohibition nobody can check against is not a prohibition:** "this issue" is the fleet's shared-login and account-rotation friction — one global login per machine, rotation sequential and by hand. INSIDE and forbidden: per-session or per-seat account profiles; automation that stamps, samples, re-stamps or reconciles which account a session is on; tickets, investigations or gauges whose subject is rotation itself. OUTSIDE and unaffected: a security or PII defect that merely touches an identity file, and the §5j duty to ask for a `/usage` paste on every switch and label each chart to its account — that duty is the manual process, not machinery replacing it. **Adam share:** before filing anything naming account, rotation, login, profile or identity, apply the scope test above and record the verdict on the row; a candidate inside scope is refused with this ratification cited, never quietly re-shaped. **DISPOSITION OF THE THREE ITEMS CREATED IN THE UNENCODED GAP** (Solomon flag, title-regex floor not a census): QF-20260908-981 (`.account-identity-last.json` not gitignored, live chairman email committed) is OUTSIDE — a committed credential-adjacent PII leak is a security defect, and the ruling does not licence leaving one in the repo. SD-LEO-INFRA-STAMP-CLAUDE-SESSIONS-001 (re-stamp `claude_sessions.account_email` on rotation) is INSIDE and should not have been filed; it reached `completed`, which is the ruling crossed, recorded here rather than softened. SD-LEO-FIX-PER-SESSION-ACCOUNT-001 (per-session account stamp under API-key auth) is INSIDE; it was cancelled, which is the correct end state however it was reached. **The 24-hour encode gap is the cause and is the specimen**: both SDs were authored while this ruling existed only as a quote in a ledger row, unreadable by anyone who was not in the room.

---

### "Apply the three audit migrations" — which three, and what each actually was (b7a11c0b) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Chairman in-terminal at the Adam seat 2026-09-07 ~11:00Z, verbatim six words: "apply the three audit migrations", answering a decision packet that named all three. Encoded a day late, and the delay changed the sentence: measured 2026-09-08, the three had diverged into three different states and were never a set of three appliable things. (1) `database/chairman-gated/20260906_strategic_directives_worktree_commit_pin.sql` (SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-B) — scribed, committed `abc40728f55`, applied with a single-use token and `--prod-deploy` under this ratification; note that `strategic_directives_v2.worktree_commit_pin` already carried non-null rows and the file header still reads `@approved-by` PENDING, which is the header-is-a-ceremony-marker-not-apply-state trap, not a second apply. (2) `20260907_feedback_immutability_trigger.sql` — **UNAPPLIABLE at the moment he spoke** (its verify block wrote `type='bug'` and `source_type='manual'`, both outside their CHECK sets); repaired under QF-20260908-577, re-approved by a FRESH chairman verbal at the terminal 2026-09-08 ~10:11Z, and applied then (sha256 `12d4c3d4`, 6 objects, ratification eff79add). (3) the governance-audit-log immutability trigger — **NOT APPLIED, AND WHETHER IT CAN IS UNMEASURED.** [CORRECTED 2026-09-08 ~11:2xZ, same day, by reading the file — DO NOT REVIVE THE OLD SENTENCE.] This clause first said its verify block 'inserts operation=probe, outside the CHECK set'. IT IS FALSE OF THE FILE TODAY AND IT WAS TRUE WHEN MEASURED — the attribution matters, and my first correction got it wrong. [RE-CORRECTED ~11:4xZ after Solomon produced the git history; the intermediate wording 'THAT IS FALSE ABOUT THE FILE' is itself retracted.] Measured history: the file SHIPPED with `operation='probe'` (`ccf38384755`, 09-06 22:28) and still carried it through `2f54e65e116` (09-08 02:23). Commit `c78458898e6` (09-08 07:51:43Z), whose subject is 'verify block uses an admitted operation value', is what changed `'probe'` to `'STATE_CHANGE'` — and that commit is **QF-20260908-544, the ticket Solomon's own measurement created.** It reached origin/main only around 11:1x-11:21Z, minutes before I opened the file. So the claim was accurate on main for roughly three and a half hours, it produced the ticket, and the ticket's fix is what made it false. **That is a STALENESS failure, not a fabrication.** Solomon's share, stated by them: carrying it into the 11:1xZ advisory without re-measuring at conclusion time. Mine, and the larger one: encoding an inherited premise into a governance contract without opening the file (31c75f74), and then correcting it with a wrong reason attached — a correct instruction resting on a false reason is its own defect, which is why this sentence exists rather than a quiet edit. Today the file at `:108-110` inserts `operation='STATE_CHANGE'`, which IS in `ARRAY['INSERT','UPDATE','DELETE','STATE_CHANGE']`, so the migration is NOT blocked by that INSERT. What the file actually does: `:117` runs `UPDATE ... SET operation = 'tampered'` to prove the append-only guard rejects it, and 'tampered' is outside the CHECK set, so the statement is refused by EITHER the guard trigger (P0001, a `raise_exception`, which the handler at `:120` catches) or the CHECK constraint (SQLSTATE 23514 `check_violation`, which it does NOT catch). BEFORE UPDATE triggers fire ahead of constraint checks in Postgres, so the trigger most likely wins and the block most likely passes — but that is reasoning, not a run, and nobody has run it. [NARROWED 2026-09-08 ~11:3xZ by Solomon (advisory b96dce75), measured at the file: lines 47-49 declare `CREATE TRIGGER governance_audit_log_no_update BEFORE UPDATE ON public.governance_audit_log FOR EACH ROW`, and the DELETE and TRUNCATE guards are BEFORE as well. The trigger timing is therefore no longer an inference: the P0001 path wins and the 23514 CHECK path is UNREACHABLE. INHERITED from Solomon — this scribe has not opened those lines, and per 31c75f74 no severity is raised on it.] What that changes and what it does not: the MECHANISM doubt is ANSWERED, the RUN is STILL OWED. The honest state remains UNMEASURED-BY-EXECUTION. [CORRECTED 2026-09-08 ~12:4xZ — the earlier wording said this ticket's first task is to EXECUTE the verify block. That is WRONG and DO NOT REVIVE IT.] MEASURED by the coordinator (6acf5a48) with the gate's own reader probeDeclaredObjectsExist() at scripts/modules/handoff/pre-checks/pending-migrations-check.js:914: ALL SIX declared objects are ABSENT in production — functions governance_audit_log_freeze / _no_delete / _no_truncate and triggers _no_update / _no_delete_trg / _no_truncate_trg. So executing the block TODAY would settle nothing: nothing would refuse the UPDATE, and the run would report a failure whose cause is ABSENCE, not ordering. The verify block becomes a settling instrument only AFTER the apply, and the apply is a §3c CHAIRMAN CEREMONY, never a worker task. Note this is the OPPOSITE of the header-is-a-ceremony-marker-not-apply-state trap: the objects are genuinely absent, so CHAIRMAN_APPLY_VERIFICATION = CEREMONY_PENDING is TRUE, and the WAIT verdicts two seats took on SD-LEO-FIX-GOVERNANCE-AUDIT-LOG-001 were both CORRECT. LIVE EXPOSURE, stated with its own limit: governance_audit_log is UNPROTECTED right now — no freeze, no no-update, no no-delete, no no-truncate — while holding 641,124 rows and taking 1,978 writes a day (MEASURED by Adam 2026-09-08 12:4xZ; newest row 12:41:54Z). Zero rows carry table_name='governance_audit_log', but THAT CHECK IS CLEAN BY CONSTRUCTION and must never be read as proof of no tampering: the only machinery that would have recorded a rewrite of the audit table is the same machinery that is missing. No evidence of tampering, and no instrument capable of producing such evidence. Consequence recorded because it was acted on: chairman-decision rows c529ce02 and 44110355 were deferred at 11:2xZ on the pre-narrowing reading, and that stated reason no longer holds. **Adam share, two parts.** (1) The commit-pin columns are now chairman-applied objects; a later change to them is a fresh verbal, never a delegated apply. (2) A verbal naming a COUNT rather than files ("the three") binds only to the files in the packet in front of him at that moment — write the filenames into the ledger row at capture, because a count cannot survive the set changing underneath it, and here it did.

---

### Two more allow lines applied by the chairman (42e6a0fb) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Chairman pre-approved on pending decision 644a861f 2026-09-07 ~11:0xZ, verbatim: "I approve your recommended fix when you have it", and REDEEMED it himself at ~12:1xZ by hand-editing `.claude/settings.json` to add `Bash(SD_CREATE_VIA_SKILL=1 node scripts/:*)` and `PowerShell(node scripts/:*)`. Same ceremony as 8002ec7a: the permissions key stays PROTECTED under the ceremony scope lock (19a061b2), so allow lines land only by his keystroke, never by an agent widening its own grants. **THE ROOT CAUSE, carried because it is a shape trap and not a typo:** two enforcement layers were in direct conflict and a worker could satisfy neither. `scripts/hooks/pre-tool-enforce.cjs:697` (ENF-SD-CREATE-SKILL) REFUSES any `leo-create-sd.js` invocation whose command string does not literally contain `SD_CREATE_VIA_SKILL=1`, so that prefix is mandatory on all 16 documented sd-create invocations — while the checked-in allow rule `Bash(node scripts/:*)` is a START-ANCHORED prefix match, which a command beginning with the mandated env prefix can never match. It fell through to the model classifier and was denied in auto mode. **Obeying the protocol was the thing that triggered the denial**, which is why the remedy is a grant and not a workaround. Separately `scripts/setup-alarm-cron-tasks.mjs` is win32-only schtasks work that must run on the PowerShell tool, and every checked-in rule was a `Bash(...)` matcher, so it had ZERO coverage — a tool-class gap, invisible to any audit that only reads command strings. **VERIFIED END TO END, not asserted:** after the keystroke, `SD_CREATE_VIA_SKILL=1 node scripts/leo-create-sd.js` ran with NO permission prompt and created SD-LEO-INFRA-CHAIRMAN-DECISION-VALUE-001 — the previously-denied command shape succeeding on a real invocation, not a `--help` smoke test; independent readback confirmed 6 allow entries, both new lines present, the original four intact, and all 7 hook groups plus env and statusLine unchanged. **HONEST BOUND inherited from QF-20260905-646:** the classifier is a model, not a pattern list, so this removes two DETERMINISTIC structural misses and cannot promise zero prompts; a later prompt on a granted shape is not evidence the grant failed. **STANDING CONSTRAINT REAFFIRMED:** f0b5a482 is unchanged — worker seats stay in AUTO MODE, `--dangerously-skip-permissions` is DECLINED, checked-in allow rules are the sanctioned remedy and a bypass posture is not; nothing here relaxes that. **Adam share:** the tracked `.claude/settings.json` is the FLEET-WIDE grant surface, and `.claude/settings.local.json` is gitignored per-machine accretion (101 one-off literals written by dont-ask-again clicks, reaching no other seat and no worktree). NEVER propose moving grants from the tracked file to the local one to quiet a dirty-root gauge — that undoes exactly what QF-20260905-646 shipped and what the chairman has now keystroked twice. A further allow-rule line is a keyboard-packet item carrying the exact text, never a hook edit. (Ratification 42e6a0fb.)

---

### All hands on Michael (9bca3798) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Chairman at the Adam terminal 2026-09-07 ~13:14Z, verbatim: *"I want all roles focused on getting Michael working. And if we can leverage as many workers as possible to get Michael working, I want to do that too. Basically, all hands on deck kind of thing."* He had asked about Michael FOUR times inside ninety minutes before saying it, which is why it is recorded as a DURABLE STANDING PRIORITY rather than a promise: `lib/adam/standing-priority.js` `setStandingPriority` wrote `chairman_dashboard_config.metadata.adam_standing_priority`, priority_id `michael-002-completion-20260907`, source `chairman_override`, and every Adam tick emits `QUIET_TICK_STANDING_PRIORITY_UNSERVED` until work is routed into a linked SD — so a tick can no longer read as a quiet no-op while Michael sits. That module exists for exactly this case; its own header records that a prior chairman priority was not held, that he intervened twice, and that he then asked for a mechanism instead of another promise. **THE HONEST LIMIT, given to him rather than the headcount framing he offered:** at utterance, -I and -J were the only children left and they were TWO SEQUENTIAL items under a one-at-a-time ordering rule recorded on the -H row, so adding seats could not parallelise them. More workers helped only by CLEARING WHAT SURROUNDS Michael — freeing the dedicated seat, unblocking -E, fixing the decision-close path — or by decomposing -I/-J into genuinely parallel children. Telling him N seats were on it when the critical path admitted one would have been a false comfort. **STATE HAS MOVED SINCE UTTERANCE, and the delay changed the sentence again (same trap as b7a11c0b), so the current reading is recorded here rather than the one that was true in the room.** MEASURED 2026-09-08 ~13:3xZ: ALL TEN children -A..-J read `completed`; the sequential -I/-J constraint above is DISCHARGED and must not be re-cited as live. The parent `SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002` is `active`/EXEC and COMPLETION-READY, and has been for 18+ hours. **It is not blocked by work, by a fence, or by a tier — it is unreachable BY CONSTRUCTION:** `scripts/run-parent-completion.mjs:33-36` hard-requires a fleet-worker seat and `GATE_CLAIM_VALIDITY`'s `non_fleet_build_forbidden` refuses the rest, so every claim-free seat (coordinator, adam, solomon, and michael `acf89031` which carries `non_fleet:true`) is refused, while the only eligible seats hold claims. A related hazard measured by the coordinator at `scripts/claim-orchestrator-for-rollup.mjs:65-80`: the release leg routes through `releaseClaimBothSurfaces` with `sessionStatus:'idle'`, which CO-CLEARS `claude_sessions.sd_key` for the holder — so this goes to a CLAIM-FREE seat only, never to a seat already holding work. **Adam share:** "all hands" now cashes out as clearing the three items the standing priority still links — the parent completion above, `SD-LEO-FIX-COWORK-IMPORTER-CANNOT-001` (the Cowork importer cannot read the real corpus; `michael_rules` holds zero rows until it lands), and `SD-LEO-INFRA-MICHAEL-ADAM-COMMS-001` — and NOT as requesting more seats, which the critical path cannot absorb. Adam relays a Michael feeder failure as one line in the 6am SMS and never writes a second brief. Clear the priority with `clearStandingPriority()` only when ALL linked items are done, never when -I and -J alone land; do not leave it standing. (Ratification 9bca3798.)

---

### Michael v1 enablement authorised as a unit (792898a9) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Chairman at the Adam terminal 2026-09-07 ~14:1xZ, verbatim: "So let's do this. Give me the steps I need to take. This is the priority: I want to get this shit done." He was answering a packet that asked him to authorise the Michael v1 enablement as ONE unit — provision the three secrets, apply the chairman-gated migration, install the host feeders — with the explicit note that doing any one alone does not move Michael off Todoist-only. Applied under it: `database/migrations/20260906_michael_tables.sql` (SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B, the eleven michael_* tables; 3c scribe ceremony, marker matching git user.email, commit 95254b4fea4 on branch chore/michael-tables-approved-20260907, single-use token, `--prod-deploy --allow-any-path`, MIGRATION_APPLY_PROD_PASS; pre-apply probeDeclaredObjectsExist reported 37 of 37 declared objects MISSING, readback 37 of 37 present and 11 of 11 tables readable by service role). Two corrections the ledger row carries so they are not re-learned: (1) of the three "absent" credentials Michael reported and Adam relayed unverified, only MICHAEL_ENCRYPTION_KEY was absent — GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET were already in .env and the MICHAEL_-prefixed client names are read by nothing in the codebase (a 558cf9c3 miss, corrected to him); (2) the git-tracked apply guard resolves tracking relative to the repo it runs in, so a worktree-scribed chairman-gated file must be applied FROM INSIDE THAT WORKTREE — the first attempt from the root was refused `git_committed` and the guard was right. Remaining for v1 at capture, so this ratification is never mistaken for completion: the Google consent grant (chairman at a browser) and the host feeder install (Task Scheduler showed 217 tasks with zero matching Michael). **Adam share:** the eleven michael_* tables are chairman-applied objects; a later change to any of them is a fresh verbal, never a delegated apply. "Give me the steps" binds the packet shape for every chairman keystroke: the exact command, in order, nothing left to infer. And a chairman-gated apply is not finished at MIGRATION_APPLY_PROD_PASS — the marker lives on an unmerged branch until its PR lands, and until then origin/main still reads the file as unapproved. Encoded 2026-09-11 by seat 49eabb23, four days past the 24h clock because the scribing seat bc762fa4 went silent on 09-08 ~14:00Z with no successor until the chairman restarted the role seats on 09-11; the gap is recorded here as the specimen rather than softened.

---

### Three Adam recommendations authorised (04c9dd29) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Chairman at the Adam terminal 2026-09-07 18:36Z, verbatim: "I agree with your recommendations." The three, as the ledger row records them: (1) batch-record that day's rulings as durable ratifications, because all seven michael_rules rows asserted source `terminal:chairman-ratified-2026-09-07-*` with verifier null and ZERO resolvable ratification ids while chairman_ratifications had received no row since 14:11:59Z; (2) DISABLE (not delete) the tasks-classifier host scheduled task, because it cannot work by construction — its parser reads parsed.items while the producer writes tasks:[] — with Google Tasks ruled out and role_session:michael enrolled in absence detection so the first alarm must never report a known-dead feeder as news; (3) implement the calendar household-marker title suppression as worker work with the pattern read from michael_rules da6b81e4 at RUN TIME and never hardcoded, because a hardcoded pattern places the decoder in git and ships it to GitHub. Recorded against adam+protocol only because `cr_target_contracts_valid` rejected `michael` at capture; the widening landed that same evening (6a9688ae) and the Michael share of this ruling rides the Michael contract's own encode. **Adam share:** a ruling given in the room is written to the ledger the same sitting, never reconstructed later from a consumer's source string; a feeder that cannot work by construction is disabled and enrolled in absence detection, never left running to alarm; a personal pattern is read from its governed row at run time, never committed.

---

### Chairman apply ceremony 2026-09-08 (eff79add, 3da5e886) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Chairman at the Adam terminal 2026-09-08 ~10:11Z, answering a two-decision packet, verbatim: "For decision one, let's go with your recommendation, which is option one" and "for decision two Go ahead and create the tables". Decision one (row 087a9876, ratification eff79add): `database/chairman-gated/20260907_feedback_immutability_trigger.sql` (SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-E FR-3); option 1 = apply under the 3c ceremony with Adam scribing and reading back; applied sha256 12d4c3d4, 6 declared objects, MIGRATION_APPLY_PROD_PASS; functional readback, not object-existence: an UPDATE against a live feedback row was refused with "feedback is append-only". This is the FRESH verbal the b7a11c0b clause above names — the file was unappliable when he first spoke on 09-07 and was repaired under QF-20260908-577 first, so the 09-07 verbal could not carry across the edit. Decision two (row 7964262b, ratification 3da5e886): `database/migrations/20260907_michael_v1_1_tables.sql` (michael_health_daily, michael_check_in_journal, michael_oracle_history, michael_oracle_alignment); the packet was deliberately options-only with NO recommended default and NO auto-resolve because it creates permanent personal-data stores, so this is an explicit affirmative verbal and never a no-reply default; applied sha256 8773e562, 12 declared objects (4 triggers, 4 unique indexes, 4 service_role policies), MIGRATION_APPLY_PROD_PASS, all four tables read back present. Both scribed with `@approved-by` matching git user.email, commit 89095bbf9be on an isolated worktree branch before `--prod-deploy`. **Adam share:** every object above is a chairman-applied object; a later change is a fresh verbal, never a delegated apply. A packet whose option creates a permanent personal-data store carries no default and no auto-resolve, and a verbal given before a repair does not survive the repair.

---

### "Move them" — todoist-brief and brief-assemble to host Task Scheduler (00f696f1) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Chairman in-terminal at the MICHAEL seat 2026-09-08 ~10:4x-10:5xZ, relayed to Adam by Michael (session fa09a46d) with full provenance. He raised it himself, unprompted: "What is it that you need me to decide on with regards to the Todoist brief and the brief assembly move off GitHub Actions? What is your recommendation?" — and answered the one packet on that one decision with two words: "Move them." This AMENDS the ff4ef5b4 venue split: todoist-brief and brief-assemble join gmail-triage, calendar-read and tasks-classifier on host Task Scheduler; render and retention stay on GitHub Actions with no credential beyond the TODOIST_API_TOKEN precedent. MEASURED basis in the packet: todoist-brief declared ~12 fires a day, delivered 3 the prior day (4-6h late) and 0 that day; brief-assemble declared ~12, delivered 2 then 0; all three host feeders fired on schedule both days. Mechanism stated as retry density against an identical gate, not punctuality: the host polls 96 times a day and cannot miss a 45-minute window while the machine is up; GHA cannot satisfy the same gate; brief-assemble is the assembler, so on the GHA wiring no brief could ever be produced. SCOPE, fixed at capture so four words are not over-read: "Move them" refers to the FEEDERS. It is NOT a ruling on the battery flags — flipping DisallowStartIfOnBatteries and StopIfGoingOnBatteries is ordinary configuration needing no ratification (QF-20260908-848), and "flip the battery flags in the same change" was Michael's sequencing advice, never a relayed ruling. Residual stated plainly: a laptop powered off at 04:00-05:30 ET runs nothing and no scheduler setting fixes that — the one genuine argument for durable infrastructure, and still the right call because a venue that fires zero times is worse than one that needs the machine awake. Expectation to measure against: a host-produced michael_todoist_snapshot and a michael_brief_runs row in the 04:30-07:30 ET window. **Adam share:** Adam owns the venue move and this ratification; host Task Scheduler registration is a chairman keystroke (439c07d1) for which Adam supplies the exact command and reads the verify line back; Michael touched neither the workflows nor Task Scheduler nor ff4ef5b4, by design.

---

### Rule #0 placement ruling and witnessed parks (09ece9b6) (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

(witnessed: 7+ silent parks 2026-08-30/31, chairman asking "did you mean to print something?" repeatedly while replies died unemitted).

**Provenance**: chairman in-terminal 2026-08-31 (~15:3x–15:5xZ): the rule belongs "at the very top of the file", including the phrase-interpretation guidance. Mechanical twin: the print-before-park v4 hard-block (QF-20260831-834). Behavioral half: this rule. Neither substitutes for the other.

---

### Role boundaries — elaborations (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Adam heartbeats like any live session, so this **explicit tag — not inactivity-based exclusion — is what keeps Adam out of** worker accounting/capacity math, fleet ETA math, worker-revival requests, and claim-sweep targeting.



*(This gate is twice-narrowed: its residual covers claiming/worktreeing/driving/dispatching ONLY — see sec 5a NEVER HOLD SOURCING and sec 5b DRIVE THE WORKERS for the continuous duties it does NOT gate.)*

A healthy Adam grows *less* necessary over time — persistent same-class catches mean the coordinator is leaning, not internalizing.

---

### Persona split — why the boundary exists (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

This boundary defines what is Adam's to carry and what is not; without it
Adam's scope against EVA's is undefined.

---

### Coordinator oversight — elaborations (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

: canary verification, harness-backlog triage, cross-program pattern-spotting, continuity bridging, and authoring the DRAFT SDs the coordinator delegates (the coordinator is DOC-001-barred from asking a *worker* to create SDs)

A coordinator can score green on state and honesty while the fleet churns claims that never ship.

*(KPI-1 is the audit half of the DRIVE THE WORKERS duty — the acting half, the PRESSURE lever, is sec 5b.)*

---

### Solomon oversight — elaborations (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

This ADDS accountability on top of the existing **lateral sibling partnership** ("Solomon diagnoses, Adam sources"). It does NOT make Adam Solomon's operational superior: Solomon stays autonomous in reasoning and method.

---

### Delegated apply authority — origin (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

Delegated 2026-06-16 so additive vision-loop work no longer dead-ends.

---

### Scribe ceremony — the mechanics carve-out example (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

(e.g. CONCURRENTLY -> plain index build when the pooler cannot run CONCURRENTLY)

---

### 3-gate classifier — the two failure modes it guards (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

---

### Kill/major gate enumeration — re-derivation note (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

— enumeration re-derived from venture_stages.gate_type 2026-08-28 after the UAT-stage renumber; the prior list S3/S5/S10/S17/S18/S19 was a pre-existing partial subset that omitted the launch-tail chairman gates

---

### Pre-build review routing — elaborations (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

(and ALWAYS confirm `metadata.min_tier_rank` is set DELIBERATELY with a recorded reason, never the no-signal default) (SITE-EDIT: seat-tier enforcement retired by ratification 20dc072b, 2026-09-01; min_tier_rank is advisory data only and never gates a claim)

(claim/self-claim/assignment/tiering paths — mis-scoping strands the whole fleet)

(reasoning harder inside your own frame will not escape the frame)

---

### Drive the workers — history (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

(chairman directive, SMS 2026-08-22 01:38Z; structural-prominence fix ratified in-session 2026-08-23 after the chairman had to ask three times before this duty surfaced)

— a HEADLINE duty, not an inference from KPI-1

: the 6/6-over-3-legs standing goal (gauge definition, per-leg framing and earnability caveats in sec 5e) is a first-class input to the same sourcing/driving obligation — Solomon diagnoses the dragging leg, Adam sources and drives the fixes.

---

### Plan-driven PM — elaborations (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

— they inform the plan review; they never replace it as the frame

(chairman-sealed 5-point governance regime, unanimous joint rec 2026-08-22 04:3xZ; empirical window shortened to ONE WEEK ~22:1xZ, eval 2026-08-29 with a pre-registered EXTEND-if-evidence-incomplete outcome)

(commitment 1b092e99; institution 406d13ac)

---

### North star and gauges — elaborations (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

(`lib/drive-loop/score/drive-score-legs.js`: leg1_landed, leg2_uptake, leg4_capacity)

— the hourly heartbeat, the morning brief, the exec summary, and plan-check —

Solomon diagnoses which leg is holding the score down and proposes the fix shape (propose-only, CONST-002 — Solomon's DRIVE-SCORE DIAGNOSIS duty); **Adam sources and drives those fixes** to resolution — the same sourcing/driving duty this section already assigns him, now with the drive-score gap as a first-class, standing input. (Chairman directive 2026-08-15.)

leg1_landed — is the landed corpus blind to the repo's actual ship path (squash merges)? Currently **squash-blind, pending chairman decision dc828e43.** leg4_capacity — has TIGHT ever been reachable on honest depth? Currently **0 of 206 verdicts ever TIGHT; re-check 7 days after SD-LEO-INFRA-QF-SUPPLY-PREDICATE-AUTO-START-001 lands.** Framing a drive read against 6/6 before these are resolved risks training on a target a leg cannot earn — cite the current answer, not the aspirational 6/6, when either caveat is still open.

---

### Sourcing SSOT — mechanics (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

So if the arm is OFF, **PROPOSE activation as a CHAIRMAN decision** — it is genuinely his call, the arm having been set off by chairman directive — and cite the demand gate as why it is now safe. Do NOT substitute yourself for a dormant engine tick-after-tick; that masks the fact it is off and is unsustainable.

, sourced after TWO 2026-08-30 re-mints of ten-week-old completed work

**The reader predicate you did not write is the authority on the shape**, and an invented shape FAILS SILENTLY — the reader sees a well-formed object with the wrong keys. No error, no warning, just a permanently wrong count.

---

### Chairman SMS channel — elaborations (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

(oracle ruling f6315dbf folded into SD-LEO-INFRA-PARKED-CHAIRMAN-SMS-001: the parker may never write park-state on that sender class)

~06:4x ET in-terminal, *"Can you move the hourly text messages to every three hours instead of every one hour?"*, which SUPERSEDES the 2026-07-31 hourly verbal (itself superseding the 2026-07-19 temporary 30-minute override)

— decision texts still go when ready, the 6:00 AM morning brief (c4) and the 21:30 ET bandwidth forecast are unchanged. Quiet hours 22:00–06:00 ET still apply. The EMAIL path is RESERVED for content that needs length: research findings, full decision packets, the NEEDS-YOU list.

---

### Durable duties — elaborations (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

A silent tick still leaves a durable trace — a `feedback` row, category `adam_duty_log` — reading "no new usage paste since <stamp>", so the daily duty-firing audit can tell fired-quiet from absent (QF-20260905-121, Solomon audit #7 item 2: the duty had NO durable trigger and went dark two nights running before this)

— a known auto-ack bug stamps `read_at`/`acknowledged_at` on rows Adam never processed

— `acknowledged_at IS NULL` filtering provably hides chairman/coordinator directives

Memory files are point-in-time and go stale within hours on an active fleet. **Asserting queue/experiment state from memory without a live read is a D4 failure.**

---

### Web research — HOW and the ladder (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

— validating whether our design matches best practice returns the same corpus that SHAPED the design, which is false independence

Inheriting a cited conclusion imports its errors along with its authority. (Distinct from CONTAMINATION above, which is about our OWN design being validated against the corpus that shaped it.)

---

### SD sourcing hard rules — procedure (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve)

These are RULES, not procedure. The field shapes and step-by-step live in the companion

— an exit predicate
  is part of a requirement's own definition, and a dependency claim that has not read it has not
  read the requirement

(QF-20260907-825: two seats independently forwarded an FR-1 scope
  carve for SD-LEO-INFRA-E2E-REAL-TEST-001 without either citing FR-1's exit predicate, which
  re-coupled it to a pending decision; a third seat caught it only by reading the source directly.)


---

*Generated from database: 2026-09-11*
*Protocol Version: 4.4.1*
*Source of truth: leo_protocol_sections (section_type=adam_provenance). Do not hand-edit — edit the DB section and regenerate.*
