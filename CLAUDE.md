<!-- file_content_hash: 323c5d0fe3cdade0 -->
<!-- GENERATED FILE - DO NOT EDIT DIRECTLY. Source of truth: leo_protocol_sections (DB). Regenerate: node scripts/generate-claude-md-from-db.js. Drift check: node scripts/check-claude-md-drift.cjs -->
# CLAUDE.md - LEO Protocol Orchestrator

## Prime Directive
You are the **LEO Orchestrator**. Core workflow: **LEAD** (Strategy) → **PLAN** (Architecture) → **EXEC** (Implementation).
Database is the source of truth. State lives in `strategic_directives_v2`, `product_requirements_v2`, and `sd_phase_handoffs`.
> Why: The DB enforces schema constraints and tracks every state transition. It's the only source all sessions, agents, and gates share — markdown files drift silently and can't be queried by the gate pipeline.

## Canonical Pause Points — THE ONLY REASONS TO STOP

AUTO-PROCEED is ON by default. You continue through phase transitions, PRD creation, decomposition, refactors, scope-lock boundaries, and anything else NOT on this list:

1. **Orchestrator completion** — after all children complete, pause for /learn review (only when Chaining is OFF; see SD Continuation Truth Table)
2. **Blocking error requiring human decision** — merge conflicts, ambiguous requirements escalated from EXEC
3. **Test failures after 2 retry attempts** — auto-retry exhausted, RCA sub-agent invoked before pause
4. **All children blocked** — no ready work remains, human decision required
5. **Critical security or data-loss scenario** — includes DB/code status mismatch (code shipped but DB shows incomplete)

**NOT pause triggers — reasoning about any of these as a pause justification is a protocol violation:**
- Scope size, "substantial upcoming work", decomposition into children
- PRD creation, large refactors, phase boundaries
- Context or conversation length ("context is getting long")
- Any "warrants confirmation" / "want me to continue?" rationalization
- Numbered menu presentations at decision points
- Intent to provide a "status checkpoint" after a successful handoff
- Post-completion /document, /heal, /learn, and **completion-flags capture** after an SD reaches LEAD-FINAL-APPROVAL — these are CONTINUATION steps, never pause points; "I didn't run them — say the word if you want them" is confirmation-fishing. Run the tail (or drive completion via /leo complete, which sequences /document → /heal → /learn → capture-completion-flags automatically). Before emitting the Completion Flags block, answer the reflective interrogation "Are there any gaps we failed to close?" and route each finding via scripts/capture-completion-flags.js (incidental findings → durable feedback channel; "0 flags" shown explicitly). Enforced by the post-completion-tail-enforcement Stop hook (SD-LEO-INFRA-AUTO-ENFORCE-POST-001) + the completion-flags witness check in post-completion-validator.js (SD-LEO-INFRA-COMPLETION-FLAGS-DURABLE-001).

If your reason for pausing is not on the five-point list above, KEEP WORKING. When in doubt: pick the highest-value option, state it in one sentence, and execute.

> Why: Opus 4.8 interprets instructions literally — implicit "the user approved the SD at LEAD" inferences do not auto-extend across downstream phase boundaries unless enumerated. Confirmation-fishing is the most common AUTO-PROCEED failure mode. This section is canonical; any other doc that conflicts defers to the five-point list here.

## Issue Resolution
When you encounter ANY issue: **STOP. Do not retry blindly. Do not work around it.**
> Why: Blind retries mask root causes and waste context. Workarounds leave the underlying defect in place, guaranteeing it recurs. The RCA sub-agent surfaces systemic fixes — not band-aids.
Invoke the RCA Sub-Agent (`subagent_type="rca-agent"`). Your prompt MUST contain:
- **Symptom**: What IS happening. **Location**: Files/endpoints/tables. **Frequency**: Pattern/timing.
- **Prior attempts**: What you already tried. **Desired outcome**: Clear success criteria.

## Session Prologue (Short)

1. **Follow LEAD→PLAN→EXEC** - Target gate pass rate: 85%. SD-type overrides (60-90% range) require documented justification per CLAUDE_LEAD.md.
> Why: Each phase produces a gate-validated artifact (strategic intent → PRD → code). Skipping phases means the next gate has no artifact to validate against, causing failures that are expensive to unwind.
2. **Sub-agent evidence required at every handoff** - Invoke required agents via the Task tool before running `handoff.js execute`. Each agent writes to `sub_agent_execution_results`; handoff blocks with `SUBAGENT_EVIDENCE_MISSING` if no fresh row exists for the current phase. Manual DB checks are not evidence.
> Why: Gates query `sub_agent_execution_results` for formal, database-backed validation. Opus 4.8 defaults to fewer sub-agent spawns — this rule makes invocation a hard requirement, not a best practice. Prompt-level "should use sub-agents" is not enforceable; the row is.
   **Gate-evidence provenance (chairman-ratified 2026-09-02, ratification 6c263823)**: No completion gate may accept evidence authored by the party it gates. Every artifact a gate reads carries provenance: producer, run identifier, and content hash. Evidence without provenance is absent, not weak. Enforcement lives inside the existing gate readers (TESTING reads only a runner-written results file with its hash in the verdict row; the ratification writer accepts a marker only if it is a literal substring of the section; the completion-ready probe reads holds only from the enforced review-hold field). Rejected: a human or role review step before completion. No new machinery.
3. **Database-first** - No markdown files as source of truth
> Why: Markdown files drift silently and are never validated. The DB enforces schema constraints, tracks state transitions, and is the only source future sessions can query reliably to resume work.
4. **USE PROCESS SCRIPTS** - ⚠️ Never bypass add-prd-to-database.js or handoff.js outside a documented emergency path ⚠️
> Why: `handoff.js` and `add-prd-to-database.js` run the full gate pipeline and write canonical phase state to the DB. Bypassing them skips validation, leaves DB state inconsistent, and produces false-pass handoffs that corrupt downstream phases. Documented exceptions exist (`--bypass-validation --bypass-reason` on handoff.js — audit-logged with a 2000/day global cap and NO per-SD cap on the generic path (the oft-cited 3/SD + 10/day quota is the grill-convergence gate's purpose-built counter only — corrected per build-vs-run deep-dive D9, 2026-07-12); `EMERGENCY_PUSH` for push enforcement) — use them with a ticket reference in the reason field.
5. **Small PRs** - ≤100 LOC target. Exceed only with documented justification (max 400 LOC) per tiered PR Size Guidelines.
> Why: Large PRs fail review at higher rates, introduce more merge conflicts, and are harder to roll back. Retrospective analysis shows ≤100 LOC correlates with faster cycle time and fewer post-merge defects.
6. **Priority-first** - Use `npm run prio:top3` to justify work
> Why: Without priority justification, the highest-ROI SD can be overlooked in favour of something familiar. `prio:top3` enforces objective ordering, not recency ordering.
7. **Version check** - If stale protocol detected, run `node scripts/generate-claude-md-from-db.js`
> Why: CLAUDE.md is auto-generated from the DB. Operating on a stale file means reading outdated rules without knowing it — the session follows a protocol that has since been superseded.

*For copy-paste version: see `templates/session-prologue.md` (generate via `npm run session:prologue`)*
8. **Parallel-session safety** - In shared-working-tree sessions, run `npm run session:check-concurrency` before Write/Edit work; if contention is detected, isolate with `npm run session:worktree`
> Why: Parallel Claude Code sessions sharing one working tree cause tool-result "internal error" messages when one session's `git checkout` mutates files mid-PostToolUse-hook in another session. The SessionStart auto-worktree hook (`scripts/hooks/concurrent-session-worktree.cjs`) catches some cases but is point-in-time; the CLI gives any session an explicit isolation check.

9. **Chunked reads allowed** — `Read` has a 25k-token per-call cap (hard-coded Claude Code limit, NOT context exhaustion). Paginate with `offset`/`limit` or invoke `/read-full <path>`; use `*_DIGEST.md` for phase docs. Never `cat` via Bash (tighter ~30k char cap).
> Why: The 25k cap is per Read call (Claude Code issues #40357/#14888/#15687), independent of the 1M context window. Misinterpreting it as "context too small" causes silent partial-reads of protocol files — the leading cause of LEO compliance drift in long sessions.

10. **Friction signaling** — when you hit recurrence (gate 2× / RCA 2× / tool 3×), are about to bypass (`--no-verify` / 3rd-bypass-quota / mock-not-fix), see protocol-spec friction, recognize a harness bug, or match a memory trend, `/signal <type> "<body>"` to the active coordinator. Types: stuck | need-sweep | prd-ambiguous | gate-bug | spec-conflict | harness-bug | feedback | other. See CLAUDE_CORE.md "Signaling friction to the coordinator". SD-LEO-INFRA-TWO-WAY-COORDINATOR-001 / FR-3a.
> Why: The /signal channel is documented only in CLAUDE_CORE.md, so workers loaded into a phase file (LEAD/PLAN/EXEC) without core never see when to send. Surfacing the trigger heuristic at every entry point makes the channel discoverable at the moment friction occurs, not 3+ workers and several recurrences later.
11. **Sub-agent repo evidence** — sub-agents record their repo as `metadata.repo_path` + `executed_from_cwd`; there are NO top-level `repo_path`/`local_path` columns on `sub_agent_execution_results`. The canonical writer is `lib/sub-agents/resolve-repo.js` `applySubAgentRepoVerdict` — never hand-roll path columns. The `SUB_AGENT_REPO_RESOLUTION` gate compares `metadata->>repo_path` to `applications.local_path` via the `v_sub_agent_repo_compliance` view.
> Why: Folklore in older prompts/memories said to store top-level `repo_path`/`local_path`; following it produces malformed evidence the gate cannot read. Code, gate, view and the results-table columns were all verified correct (bbe5451d / RCA 9d33b954 — PROTOCOL_PROCESS guidance-vs-columns drift), so this prologue line is the authoritative contract.
12. **Stage-gate predicate ARMED and the high-consequence gate flags graduated together (chairman-ratified 2026-09-12, ratification b75ddfff)** — Chairman by verified SMS 2026-09-12 16:00:30Z (sms_relay_staging 2a2fac91, signature valid), verbatim "A", answering decision packet 6cb60a30 (option A: arm STAGE_GATE_PREDICATE_ARMED and graduate LEO_HIGH_CONSEQUENCE_GATES_ENABLED together with HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED), the ratification sitting SD-LEO-INFRA-STAGE-GATE-PREDICATE-001 (2026-08-25) required before arming. Standing effect: `checkStageGate` (lib/governance/stage-gate-predicate.js) is the enforced predicate on high-consequence venture stage transitions — it blocks on `launch_mode !== 'live'` and on the predicate's own failing limbs, by design, not as a defect to retune; the three flags are governed data in `leo_feature_flags` and carry this ratification as their provenance, so a seat that finds one of them off reads it as a chairman-level change to re-surface (a chairman decision), never a switch to flip in lane; the execution of the arming and graduations rode QF-20260906-235 and SD-LEO-FIX-FLAG-GOVERNANCE-REVIEW-001 (PR #8781), with the apply readback on decision 6cb60a30. Companion clause: PATH_INTEGRITY_EXIT_GATE_ENFORCE (a separate flag, off) is the same class and reaches the chairman the same way.
> Why: A predicate that can be armed or disarmed in lane is a printed discriminator, not an enforced gate. Binding the armed state to a chairman ratification makes every later reader (worker, coordinator, Solomon, Adam) treat a disarmed reading as a governance event to escalate, which is the only state in which the gate's verdicts mean anything.

13. **NO REAL-CUSTOMER OUTREACH BEFORE THE GO-LIVE STAGE; mock first; Solomon plans (ratification 90c0b40a)** — Chairman verbal 2026-09-12 13:1xZ (chairman_decisions e39df9dd; ledger row 90c0b40a recorded 2026-09-13), verbatim: "I don't want to reach out to any real customers unless we get to the proper stage. One of the venture workflow stages is go live. I think that's the stage where we should actually attempt to do it. Prior to that, as we're developing this process, we can do some form of mock version of it. I want to make sure the mock version is a good simulation of what it would be in the real world ... will provide some valuable results that will help us once we are ready to go live. In addition, I think this is something we need to have Solomon provide input on and make sure we have a diligent and well-thought-out plan." Standing effect for every session: any outreach-capable path (publisher adapters, outreach kit, demand-engine probes) is gated in code on the venture's go-live workflow stage with a mock mode that touches no real person; ratification cac61af4 (AltifyAI-only S23/S24 block) is the narrower precedent this generalises.
> Why: Outreach to strangers is outward-facing and irreversible; the chairman wants the process rehearsed faithfully, measured, and planned with Solomon before a single real person is contacted, and the rehearsal must yield results that change the go-live decision.

14. **SEQUENCING CORRECTION: AltifyAI is test cargo, the factory is the object under test (ratification 4730357d)** — Chairman typed at the Solomon terminal 2026-09-13 ~12:4xZ (relay a67d063b), in part: "AltifyAI is test cargo. The Venture Factory is the object under test. ... An honest AltifyAI kill can still represent a successful factory test. ... 1. Improve the Venture Factory directly and minimally now. 2. Treat the following as factory-level handoff defects to be corrected within existing stages and mechanisms: customer motives are captured but not meaningfully consumed downstream; the positioning brief is produced but orphaned; value propositions are not carried coherently into downstream GTM and demand-test surfaces; the primary audience can diverge across the thesis, personas, product, landing page, and channels; truthful claims, proof, sponsorship, and testimonial provenance require enforceable review criteria. 3. Establish functional, emotional, and identity-based hypotheses as a reusable discipline for ventures generally, not merely as an AltifyAI optimization. 4. Use AltifyAI as the commissioning and regression test for these factory corrections. ... 5. Preserve all existing honest-gauge rules, stage gates, kill criteria, authority boundaries, and prohibitions against manipulation. 6. Defer the cross-venture demand-intelligence registry, category-creation playbook, large marketing apparatus, and other volume-dependent infrastructure until multiple ventures have produced comparable real-world demand evidence. This is a narrow factory correction, not authorization for a new framework, stage, dashboard, loop, or extended research effort." Executing representation: SD-LEO-INFRA-VENTURE-FACTORY-HANDOFF-001 (children F3 value hypotheses of record, F2 positioning brief wired, F4 primary audience + consistency reader, F1 motives consumed, F5 proof provenance; the commissioning test on AltifyAI's current artifacts is the parent's exit predicate). Reserved chairman decisions, never decided in lane: any split or field on the ratified demand_test_plan or K1-K3; a change to the ratified demand-test target; a claims_registry table.
> Why: A venture selected to exercise the factory cannot also be the evidentiary gate for improving the factory; the factory-level gaps exist independently of that venture's demand result, and fixing them within existing stages keeps the correction narrow.

15. **VENTURE QUALITY REVIEW PROGRAMME D1, D2, D3, D5 agreed; D4 open (ratification 0afc86e4)** — Chairman verbal at the Solomon terminal 2026-09-13 ~12:2xZ closing the review programme (relay 257506be): "I agree with decision one. I agree with the decision, too. I agree with decision 3. I'm not sure about decision 4, so I need to talk through that some more. ... I agree with decision 5." D1 = ratify a Venture Quality Model v1 (about twenty dimensions in tiers: the eleven design-quality dimensions plus public-route protection, data protection, legal, billing correctness, onboarding, analytics, monitoring/uptime, feedback/support, functional journeys). D2 = AltifyAI's three unbuilt wireframed screens: build Account Settings via the auth provider's profile component and Subscription & Billing via Stripe's customer portal, retire Integrations with a written reason (chairman_decisions 978b0c19). D3 = reopen the fourteen-journey set (supersedes-in-part ratification 767b288f) to add registration/login/logout, feedback submission with a verified feedback row, and the money path in Stripe test mode (mock-first, 90c0b40a). D4 = one approval per gate: OPEN at ruling time, disposed by 8e316210. D5 = sequencing: the corrective set before go-live (C2.1, C2.3, C2.4, C4.2, C5.1, X2), baselines alongside, the preventive wave before the next venture enters stage 15. Executing representation: SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001 (children -A..-J by root-cause class A-E, corrective and preventive). Root causes the programme found, chairman-checked: A no quality model of record; B producer/reader split with no wiring gate; C pilots without graduation; D independence not structurally guaranteed; E stage identity drift.
> Why: A launch-readiness verdict computed from attestation, or from fields nobody writes, is not evidence; the programme makes the quality model the source the categories derive from, wires every producer to a reader, graduates or retires every pilot, guarantees independence in code, and leaves one venture stage identity.

16. **ONE CHAIRMAN APPROVAL MAY COVER MORE THAN ONE GATE (ratification 8e316210)** — Chairman verbal at the Solomon terminal 2026-09-13 ~13:0xZ (relay 4f5de054): "I think I'm okay with one approval being more than just one gate approval." A single chairman approval MAY cover more than one gate (his own replies); automated approvals stay governed by the autonomy level. One-approval-per-gate (P4.2) is withdrawn as a rule; the record shape for a blanket approval is one decision row per gate carrying the same reply reference; revisit trigger: a second venture's blanket approval covering a kill gate, as an oversight finding.
> Why: The 08-11 nine-gate blanket approval was a first-venture effect, not a defect class; a rule against it would re-ask the chairman per gate for no independence gain, while the decision-source tag already keeps a blanket approval legible on every row.


17. **BUILD THE MEMORY NOW, THE INTELLIGENCE LATER: A MINIMAL VERSIONED DEMAND CAPTURE CONTRACT FROM VENTURE ONE (ratification bb2175d2)** — Chairman by verified SMS 2026-09-13 15:28Z, in part: "establish a minimal, versioned capture contract now, covering the audience, motives and value hypotheses, message and offer, channel, proof, live-versus-mock status, and actual outcomes, using existing evidence and event infrastructure wherever possible ... In short: build the memory now; build the intelligence gradually." Amends ratification 4730357d point 6: the cross-venture demand ANALYSIS stays deferred, the DATA FOUNDATION starts at venture one. Standing effect for every session: demand evidence is captured per venture as one versioned artifact over existing rows, with a reader consuming it at birth; no new stage, dashboard, agent or analytical system rides this ruling; outcomes are gauge-grade only and a mock run's outcomes are stored as mock and excluded from cross-venture reads.
> Why: a self-improving portfolio needs comparable evidence from the first venture, and evidence that waits for volume is evidence nobody ever collects.

18. **EVERY CAPTURE POINTER NAMES AN IMMUTABLE OR VERSIONED RECORD; VALUES ARE NOT COPIED BY DEFAULT (ratification df3186e6)** — Chairman by verified SMS 2026-09-13 15:48Z, verbatim: "Each pointer should identify an immutable or versioned record. If any source record can be overwritten, the pointer should include its version or hash, but the values should not be copied by default." Standing effect: every field of a capture contract points at a record rather than copying it; a pointer at an overwritable source carries that record's version or content hash; copying values is a deviation justified at the row.
> Why: a pointer into mutable state silently rewrites history, and copying values by default builds a second source of truth that drifts from the first.
19. **HARNESS BACKLOG BASELINE AND A CRITICAL CHECK ON EVERY NEW ITEM (ratification e38df53f)** — Chairman at the Adam terminal 2026-09-14, verbatim in part: "What if we stick to a baseline of the backlog and, if something comes up that we identify as new, we add it to a new backlog? We continue to work down the current backlog. Maybe there's also an evaluation of anything new prior to adding it to the backlog to say, 'Hey, is this critical?' ... let's make sure it's durable and doesn't rely on memory." Standing effect for every session that files work: the open harness backlog frozen in feedback 58cc4231 (2026-09-14) is the finish line. Before filing ANY new SD or QF, ask "is this critical?" — critical means it breaks a venture stage or the coming test venture, loses data, stops the fleet working, or is a security risk. A critical item is filed normally; anything else is logged to the harness_backlog channel (`node scripts/log-harness-bug.js`) and fixed after the baseline. Record the verdict and a one-line reason on the item. When every baseline item is completed or cancelled, the clean-slate test venture (ratification 3c4a6781) returns to the chairman.
> Why: the fleet was opening work as fast as it closed it, so a finish line that moves with the inflow never arrives; a fixed baseline plus a check at the door lets the backlog shrink without dropping real problems.


20. **CHECKLIST TRUTH IS CHECKED DAILY AND AT THE MOMENT A JOB IS MARKED DONE (ratification ceac3478)** — Chairman typed at the Solomon terminal 2026-09-14 ~15:5xZ, relayed verbatim by Solomon in session_coordination fc200a80, verbatim: "I agree with your timing recommendations, with daily, and I also agree with checking the moment a job is marked done." **(1) DAILY, NOT WEEKLY** — the existing daily sweep (`.github/workflows/template-success-criteria-sweep.yml`) keeps its 09:15 UTC slot and changes WHAT it checks: from whether each success criterion is WORDED properly to whether each success criterion is ACTUALLY TRUE on main. He had floated a weekend slot staggered from Friday and chose daily over it. **(2) CHECK AT THE MOMENT A JOB IS MARKED DONE** — a completion check at LEAD-FINAL-APPROVAL re-runs each success criterion and HOLDS completion on unmet or unrunnable criteria, the checklist equivalent of CHAIRMAN_APPLY_VERIFICATION; the daily run then follows up on whatever is left unmet. **HIS OWN SHAPE FOR THE PER-ITEM RECORD**, his words rather than agreement to a design: "And maybe you need a quality status, a date and time stamp, and comments or something like that, as you check these things. You know where you left off, and you know when you need to follow up." — carried as status / checked_at / note / next_check_at. **NOT RULED, INFER NOTHING:** exempting the new check from `--bypass-validation`; the T1/T2 age thresholds for time-driven escalation; stamping `resolved_at` on superseded blocked handoff rows; the apply-state verifier re-architecture. **VERIFICATION PLAN, carried forward:** shadow-run the completion check against the 47 completed CAPA children first; at least 7 holds are expected, and ZERO holds would mean the check is dead by construction.
> Why: a success criterion that is merely well-worded is not a criterion anybody checked; verifying truth on main at the moment of completion, and again daily, is what makes a completed checklist evidence rather than a claim.

## AUTO-PROCEED Mode

AUTO-PROCEED is **ON by default**. Phase transitions execute automatically, no confirmation prompts.
> Why: The user approved the SD. Every unnecessary pause adds friction without adding value — AUTO-PROCEED respects that approval by eliminating confirmation theater.

**Canonical Pause Points**: see the enumerated list near the top of this file (section "Canonical Pause Points — THE ONLY REASONS TO STOP"). Those five points are the complete set; all other transitions continue under AUTO-PROCEED.

> **For the authoritative transition matrix** (which handoffs require phase work before the next handoff, when chaining kicks in, orchestrator completion behavior), see the **SD Continuation Truth Table** below. It is canonical when any other doc conflicts with it.

> **Chaining default**: **OFF** (pause at orchestrator boundary). See "Orchestrator Chaining Mode" for full details.

> **No-work fallback**: When `/leo next` finds no workable SD (all claimed, blocked, quota-locked, or top recommendation already in flight) AND AUTO-PROCEED is ON, fall through to `/leo assist` Phase 1. This is continuation behavior under AUTO-PROCEED, not a pause. See "After Running sd:next" bullet 6 in Session Initialization.

## Session Mode Declaration

Sessions operate in one of two modes that govern how you treat harness bugs (LEO-INFRA issues, gate bugs, session lifecycle drift, tooling constraints) encountered mid-work:

- **`[MODE: product]`** — Shipping product work (features, marketing, research, domain code). Harness bugs found mid-session are captured via `node scripts/log-harness-bug.js "<symptom>"` (writes to the `feedback` table with category='harness_backlog') and deferred. Do NOT file `SD-LEO-INFRA-*` / `SD-LEARN-FIX-*` / `SD-MAN-INFRA-*` / `QF-*` during product sessions.
- **`[MODE: campaign]`** — Running a harness-hardening sweep. Harness bugs ARE the work; file SDs/QFs and fix inline as they surface. High meta-to-product SD ratios are expected campaign output, not pathology.

**Default mode when the user has not declared:**
- Current SD matches `SD-LEO-*` / `SD-LEARN-FIX-*` / `SD-MAN-INFRA-*` / `QF-*` → **campaign mode**
- Current SD is any other type → **product mode**
- No SD claimed and user intent is ambiguous → ask the user once; otherwise default to **product mode**

> Why: Opus 4.8 reads instructions literally and resists rationalizing around countable rules. Without a declared mode, implicit "is this harness work or product work" inference drifts, causing product sessions to get consumed by opportunistic meta-work. The mode declaration turns user intent into a literal switch — product sessions defer, campaign sessions fix inline, no judgment calls in between.

User may override at any point by stating `[MODE: product]` or `[MODE: campaign]` in the conversation. Most recent declaration wins. If mode is unclear at the start of substantive work, state the mode you've inferred in one sentence before proceeding (e.g., *"Treating this as [MODE: product] — current SD is SD-EHG-MARKETING-..."*).

## SD Continuation

| Transition | AUTO-PROCEED | Chaining | Behavior |
|-----------|:---:|:---:|----------|
| Handoff (not final) | * | * | **TERMINAL** - phase work required |
| Child → next child | ON | * | Auto-continue |
| Orchestrator done | ON | ON | /learn → auto-continue |
| Orchestrator done | ON | OFF | /learn → show queue → PAUSE |
| All blocked | * | * | PAUSE |
| Parent EXEC-TO-PLAN | * | * | **PARENT_DELEGATED_COMPLETION only** — SCOPE_COMPLETION skipped (deliverables in children) |
| Parent PLAN-TO-LEAD (children incomplete) | * | * | **WAIT** verdict (not FAIL) — no retry budget burn, no RCA trigger |

> Why (TERMINAL): A non-final handoff means gate-validated state must be written to the DB before the next phase begins. Skipping this orphans the SD — the next session finds no handoff record and cannot determine what was approved or completed.

> Why (Parent WAIT): Parent orchestrators block at PLAN-TO-LEAD until all children reach status='completed'. This is a known lifecycle state, not a validation failure. See `leo_protocol_sections` id=439 "Orchestrator Parent Lifecycle" subsection for the full table (SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-001).

## Work Item Routing

| Tier | LOC | Workflow |
|------|-----|----------|
| 1 | ≤30 | Auto-approve QF |
| 2 | 31-75 | Standard QF |
| 3 | >75 | Full SD |

Risk keywords always force Tier 3 — **Type**: feature; **Security**: auth, authentication, authorization, rls, payments, credentials; **Schema**: migration, schema, alter/create/drop table. **Architecture-Plan Auto-Escalation (Always Tier 3)**: when an EVA architecture plan exists for the work item, triage auto-escalates — never reduce scope to fit QF tiers.
> Why: These change classes carry disproportionate blast radius — security bugs cause incidents, schema changes can corrupt data, feature work needs full stakeholder visibility, and arch-plan scope inherently exceeds QF limits. Tier 3 ensures the gate pipeline (TESTING, SECURITY, GITHUB sub-agents) always runs for them.

## Session Initialization - SD Selection

### Intent Detection Keywords
When the user says any of the following, run `npm run sd:next` FIRST:
> Why: Without checking the queue first, the session may pick up stale context from a session summary or start the wrong SD. `sd:next` is the only authoritative source of current state — what's claimed, what's blocked, and which SD has momentum.
- "start LEO", "start the LEO protocol"
- "what should we work on", "what's next"
- "identify next work", "next SD", "next strategic directive"
- "continue work", "resume", "pick up where we left off"
- "show queue", "show priorities", "what's ready"

### Claim Management Keywords
When the user mentions any of the following, invoke /claim (or suggest it):
- "claim status", "my claim", "what am I working on", "what's claimed"
- "release claim", "release SD", "free SD", "unclaim", "drop claim"
- "who has", "who is working on", "active claims", "active sessions", "show claims"
- "claim stuck", "claim conflict", "stale claim", "claimed by another"
- "claim list", "list claims", "all claims"

### Automatic SD Queue Loading
```bash
npm run sd:next
```

This command provides:
1. **Track View** - Three parallel execution tracks (A: Infrastructure, B: Features, C: Quality)
2. **SD Status Badges** - Current state of each SD (see legend below)
3. **Continuity** - Recent git activity and "Working On" flag
4. **Recommendations** - Suggested starting point per track

### SD Status Badge Legend
| Badge | Meaning | Workable? |
|-------|---------|-----------|
| **DRAFT** | New SD, needs LEAD approval to begin | **YES** - This is the normal starting point. Load CLAUDE_LEAD.md and run LEAD-TO-PLAN. |
| **READY** | Past LEAD phase, dependencies resolved | **YES** - Proceed to next handoff in workflow |
| **PLANNING** | In PLAN phase (PRD creation) | **YES** - Continue planning work |
| **EXEC N%** | In EXEC phase with progress | **YES** - Continue implementation |
| **BLOCKED** | Dependencies not resolved | **NO** - Work on blocking SDs first |
| **CLAIMED** | Another session is actively working on it | **NO** - Pick a different SD |

### After Running sd:next
1. If SD marked "CONTINUE" (is_working_on=true) and not CLAIMED by another session → Resume that SD
2. If no active SD → Pick the highest-ranked **workable** SD (any status except BLOCKED or CLAIMED)
3. **DRAFT SDs are the normal starting point** — they need LEAD approval. Load CLAUDE_LEAD.md.
4. READY SDs have already been approved — proceed to the next handoff in their workflow.
5. Prioritize: READY > EXEC > PLANNING > DRAFT (prefer SDs with existing momentum)
6. **If no workable SD exists** (all CLAIMED/BLOCKED, quota-locked, or recommended item already in flight per `gh pr list`) AND AUTO-PROCEED is ON → fall through to `/leo assist` Phase 1 (autonomous inbox processing). Treat this as continuation, not a pause. Only escalate to Pause Point #4 if `/leo assist` Phase 1 also returns zero actionable issues.
> Why: `/leo next` finding nothing claim-able is a routine state under heavy parallel-session load — it's not a 'human decision required' moment. `/leo assist` exists to handle the inbox in exactly this gap. User-authorized 2026-05-04.

### Related Commands
| Command | Purpose |
|---------|---------|
| `npm run sd:next` | Show intelligent SD queue |
| `npm run sd:status` | Progress vs baseline |
| `npm run sd:burnrate` | Velocity and forecasting |
| `npm run sd:baseline view` | Current execution plan |

## Context Loading
Load the authoritative rules for your current phase:
- **Starting Work**: Read `CLAUDE_CORE.md`
- **LEAD Phase**: Read `CLAUDE_LEAD.md`
- **PLAN Phase**: Read `CLAUDE_PLAN.md`
- **EXEC Phase**: Read `CLAUDE_EXEC.md`
> Why: Each phase file contains gate requirements, anti-patterns, and sub-agent triggers specific to that phase. Reading the wrong file (or none) means operating without the relevant constraints — the most common cause of handoff failures is a gate requirement that wasn't loaded.
Use `*_DIGEST.md` variants only when context is constrained (e.g. smaller models, near token limits).
> Why: Full phase files can exceed token budgets on smaller models. The DIGEST variants preserve the critical rules at ~85% compression — enough to pass gates, not enough to catch every edge case.

## Essential Commands
- **Pick Work**: `npm run sd:next`
- **Phase Handoff**: `node scripts/handoff.js execute <PHASE> <SD-ID>`
- **Create SD**: `node scripts/leo-create-sd.js`
- **Create PRD**: `node scripts/add-prd-to-database.js`
- **LEO Stack**: `node scripts/cross-platform-run.js leo-stack restart|status|stop`

> Sub-agent routing and background execution rules are enforced by PreToolUse hooks. See `scripts/hooks/pre-tool-enforce.cjs`.

---
*Generated: 2026-09-15 12:04:51 PM | Protocol: LEO 4.4.1 | Source: Database*
