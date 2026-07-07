# APA — Automated Product Assessment (design)

**Status:** design proposal (propose-only, CONST-002) — Solomon authored, Adam co-reviewing, chairman fold-in pending.
**Origin:** Chairman, 2026-07-07, mid MarketLens walkthrough, after catching two functional defects by hand that a machine should have caught first. His time must be **taste-only**; functional/UX defects must be caught by machine before they reach him.
**Acceptance criteria (non-negotiable):** APA MUST catch, by machine, both bugs the chairman caught by hand:
1. Signup says "we emailed you" but there is **zero email-sending code** in the repo / no email is actually sent.
2. **No password-recovery flow** exists.

---

## 0. The seam — why the current checks miss it

The existing verdict/rescore engine is the **CLAIMS / STATIC** layer: it reads artifacts and scores "does the claim exist and cohere?" (signup page? ✓). It structurally cannot catch behavioral defects because it never runs the app.

**APA is the BEHAVIOR / DYNAMIC layer:** it boots the app in a sandbox and observes what it actually *does*. These are complementary axes, not duplicates. A venture reaches the chairman only when **both** verdicts pass — the claim is coherent **AND** the running app honors it. That is the honest realization of "machine-precheck gate, chairman time = taste-only."

APA is the check on the verdict engine's blind spot: the claim "signup sends a confirmation email" **passes** the claims layer (the claim exists) and **fails** APA (the behavior is absent).

---

## 0.5 The chairman bar (chairman directive, 2026-07-07)

> "As chairman I want this application fully reviewed before it gets to me. That means all aspects — I want it to just work when I get it."

Three design consequences, all binding:

1. **The gate is the FULL assessment, fail-closed.** An app clears to the chairman only when the *entire* APA surface (§0.5.1) passes — every found defect blocks, loops back to fix, and the assessment re-runs until clean. "We ran some checks" is not the bar; **zero known defects at handoff** is.
2. **Phasing governs BUILD ORDER, not gate scope.** The lean-first MVP (§8 Phase 1) is the right build sequence, but Phase 1 alone must never *clear* an app to the chairman — a partial assessment that passes is a false green. Until Phase 2 ships, any chairman handoff is explicitly stamped **"partial machine coverage — [dimensions covered / not covered]"** (honest attesting, first-class), never silently passed.
3. **"All aspects" is an ENUMERATED surface, not a vibe.** Coverage is a checklist the gate walks, so "fully reviewed" cannot quietly shrink to "the checks we happened to write."

### 0.5.1 The full-review surface (coverage enumeration)

| Dimension | What must hold | Layer |
|---|---|---|
| Functional journeys | every canonical persona journey completes end-to-end | B1 + C1 |
| Side-effect honesty | every claimed side effect observed in an instrumented sink | A + C1 |
| Data provenance | every displayed metric/result traces to a real source row or computation (no hardcoded/null-derived values); semantic correctness of the values = 10.2b (Phase 3, human-review-required until then, stamped honestly) | A + C1 (10.2a) / C2+human (10.2b) |
| Recovery/affordances | password reset, logout, error recovery, empty states reachable + functional | C1 |
| Every route/page | loads without error; no orphan/dead routes | B2 + C1 |
| Every interactive element | every primary CTA/button/form yields a real state change (no dead-ends, no silent no-ops, no 500s) | B2 + C1 |
| Forms | validate, submit, persist; bad input handled gracefully | B1/B2 + C1 |
| Content integrity | no placeholder/lorem text, no broken images, no template artifacts, no fabricated claims in copy | B2 + C1/C2 |
| Link integrity | no broken internal/external links | B2 + C1 |
| Error/empty states | intentional, styled, honest (no raw stack traces, no fake data) | B2 + C2 |
| Responsive | key breakpoints (mobile/tablet/desktop) render usably | B + C1/C2 |
| Console/network cleanliness | no console errors, no failed requests on core paths | A + C1 |
| Performance sanity | pages load within a threshold; no hung states | A + C1 |
| Accessibility basics | labels, contrast, keyboard focus on core flows | B + C1 |
| UI craft | scores vs the Stage-17 design rubric | C2 (Fable) |
| UX quality | friction, misleading messaging, confusing flows | C2 (Fable) |
| Per-persona | ALL of the above per defined persona, not just the happy-path user | D |

Every dimension maps to a layer that produces its evidence — a dimension with no producing layer is a coverage gap the findings card must surface (**absence of coverage is itself a finding**).

---

## 1. Three load-bearing principles (crux — keep these load-bearing)

### 1.1 Instrument, don't mock — "absence is the signal"
The sandbox swaps the app's **real** email transport for a **capturing transport at the transport layer** (or reads the app's real outbox table). It intercepts the app's genuine send path — it does **not** mock.

A mock the test pretends the app called would re-introduce the exact blind spot: a mocked inbox "receives" a fake email and *passes* the fabricated-email bug. With a capturing transport on the real path, if the app has **no email code at all** (today's bug), the transport receives **nothing** → the assertion fails → the bug is caught. **Absence is the signal.**

This is the anti-pattern guard against "mock-the-gate ships green on dead code." APA's entire value dies if a test double lets the app skip its real code path.

### 1.2 APA is the THIRD consumer of the unified registry — not a fourth silo
The unified registry (framework-artifacts / page-input-contract, one primitive: **generator-writes + gate-reads**) gets three consumers, one registry:
1. the **builder** reads the contract to build;
2. the **claims-scorer** reads it to score that the claim exists;
3. **APA** reads it to assert the running app honors it.

Standing up a fourth silo re-creates the duplication disease at the meta level. APA's assertions register in the same unified registry.

### 1.3 The model-tier split
- **Deterministic code = the BACKBONE.** Binary assertions against captured evidence. Catches **both** acceptance bugs at **zero model cost** — most reliable, cheapest.
- **Cheap model = hands + eyes.** Drives the browser and *observes/records*; it **never judges** quality.
- **Fable = sparing judgment only.** UI craft/taste (reuse Stage-17 `shared-design-prompts.json`) and UX friction/dead-end/misleading-messaging adjudication — the expensive tier, used narrowly.

This encodes the chairman's hard constraint: **Fable DESIGNS the assessment and JUDGES the subjective; the cheap model RUNS the walk; deterministic code does the binary assertions.**

---

## 2. Architecture (3 layers)

### Layer A — Sandbox Harness (deterministic code, no model)
Boots the venture app isolated: ephemeral DB seeded with test personas/fixtures, a known base URL, teardown after. **Non-negotiable feature:** it **instruments the app's real side-effect sinks** — capturing email transport, sandboxed payments, captured network + console + errors — per §1.1. Provides observability hooks: DB inspection, network capture, side-effect-sink capture, console/error capture.

### Layer B — Browser Executor (the RUN tier — cheap model)
- **B1 — Scripted canonical journeys.** Deterministic Playwright for persona paths (signup → login → core-value → result). Cheap-model only for selector-drift resilience. *This is also the minimal vehicle the MVP's deterministic assertions ride on — see §6.*
- **B2 — Exploratory click-walk.** Cheap-model agent clicks every primary CTA, follows the persona's plausible path, and **records** outcomes per step (URL, DOM delta, network, errors, screenshots). Hands + eyes: it drives and observes; it does not judge. **Bounded** — see §3(b).

### Layer C — Judgment (tiered)
- **C1 — Deterministic assertions (code).** The backbone; runs the assertion library (§4) against captured evidence. Catches both acceptance bugs with zero model cost.
- **C2 — Fable judgment (expensive, sparing).** Only for what code cannot decide: UI craft/taste (Stage-17 rubric), UX friction/dead-end/misleading-messaging, and adjudicating **novel** exploratory observations into findings.

---

## 3. Three additions (Adam's co-review, folded in)

### (a) Claim → assertion auto-derivation (anti-drift)
Assertions are **auto-seeded**, never a hand-maintained catalog that drifts. Two claim sources feed derivation:
1. **Registry claims** — the unified registry's behaviorally-testable claims/contracts (declared) auto-generate one assertion each at run time.
2. **Emergent UI claims** — a scan of the running app's own copy for side-effect claims ("we emailed you", "payment processed", "we notified the team") auto-generates a side-effect-honesty assertion each.

Coverage therefore tracks the registry + the app's actual copy automatically; it cannot silently fall behind a hand-curated list. New behaviorally-testable claim in the registry ⇒ new APA assertion, for free.

### (b) Exploratory walk — bounded budget + stopping criterion + dedup
The cheap-model walk (B2) is **cost-controlled and convergent**:
- **Budget:** a hard step ceiling (max clicks/pages per persona) enforced before the walk starts.
- **Stopping criterion:** stop early when no **new** app state is discovered for *K* consecutive steps (coverage plateau), or budget exhausted — whichever first.
- **Dedup:** every observation is keyed by a **state signature** (route + DOM-shape hash + interaction type). Duplicate states collapse. **Fable adjudicates only NOVEL observations** — the expensive tier never re-judges a state it has already seen. This is what keeps C2 sparing.

### (c) Phasing — lean-first (agreement + one sharpening)
**Agree with Adam's lean-first.** MVP = **Layer A (sandbox + instrumentation) + Layer C1 (deterministic assertions)**, which catches **both** acceptance bugs at near-zero model cost.
**One sharpening (not a push-back):** the MVP's Layer A must include **side-effect instrumentation** from day one — a naive C1 that only checks persistence + no-500s would still *miss* the fabricated-email bug, because catching that requires an instrumented sink to prove absence (§1.1). And C1 assertions need a **minimal scripted vehicle (B1 scripted-only)** to actually reach and submit the signup form. So the precise MVP is: **A (sandbox + instrumentation) + B1 (scripted signup/login journey) + C1 (deterministic assertions)**. Everything else defers.

---

## 4. Assertion library (the durable heart)

A declarative registry of assertion **primitives**, each `{ id, category, probe (gather evidence from the running sandbox), predicate (pass/fail) }`. Durable and venture-agnostic; each run selects the universal set + venture-specific, all **auto-seeded** per §3(a). Categories:

- **Side-effect-honesty** (catches bug 1, generalized): any UI copy claiming a side effect must be backed by real evidence in the instrumented sink. Data-driven from both claim sources. Archetype = the fabricated email; the primitive catches the whole class.
- **Recovery-path / expected-affordance** (catches bug 2, generalized): declared/expected flows (password reset, logout, error recovery, empty states) must be **reachable + functional**, not 404/dead. "Expected recovery affordance ⇒ reachable + functional."
- **Persistence:** signup creates a durable row; submits persist.
- **No-dead-end:** every primary CTA yields a state change (URL/DOM/network), never a silent no-op or 500.
- **Integrity:** no console errors / unhandled network failures on core paths.

---

## 5. Worker/model allocation matrix (chairman directive: allocate by intelligence required, 2026-07-07)

**Allocation principle (binding):** every action defaults to the **cheapest tier that can do it reliably**, and escalates only on a defined trigger — never by habit. Four tiers, mapped to the fleet's tiered-worker model (`min_tier_rank` / complexity-tiered worker assignment):

**T0 — Deterministic code (zero model tokens).** Anything with a binary answer or mechanical procedure:
sandbox boot/seed/teardown; side-effect instrumentation + sink capture; the assertion library (persist? side-effect honored? recovery reachable? dead-end? console/network clean?); link checking; performance timers; automated a11y scans (axe-class); screenshot capture + pixel/DOM diffing; stage-ladder orchestration + dispatch; per-persona scheduling; findings-card assembly from structured results.

**T1 — Haiku-class (minimal intelligence, high volume).** Mechanical-with-slack:
selector-drift recovery on scripted journeys; form-fill value generation; classifying obvious step outcomes ("did the page change? did an error render?"); observation labeling for the dedup index; drafting findings prose from already-structured data.

**T2 — Sonnet-class (moderate judgment).** The workhorse tier:
driving the exploratory click-walk (choosing the persona-plausible next action); content-integrity judgment (lorem/placeholder? incoherent copy? template artifact?); error/empty-state assessment (intentional vs broken?); triaging ambiguous observations into finding-candidates vs noise; **UX pre-screen** — first-pass heuristic sweep that shortlists candidate UX issues.

**T3 — Fable (deep judgment, sparing — anything requiring review of the user interface as a designed experience).**
UI craft/taste scoring vs the Stage-17 rubric; final UX adjudication of the Sonnet shortlist (friction, misleading messaging, confusing flows); findings sign-off on the chairman-bound card; designing/evolving APA itself (one-time / rare).

### Escalation rules (what moves work UP a tier)
- **T1→T2:** outcome classification is ambiguous, or the state signature is novel (never-seen route/DOM shape).
- **T2→T3:** only **deduplicated, novel, shortlisted** items — Fable never reads the raw observation stream. The **two-stage judgment funnel** (Sonnet pre-screens → Fable adjudicates the shortlist) is the single biggest Fable-token saver in the design.
- Nothing escalates to T3 before stage S4 (§8.5): Fable only ever sees a functionally-clean app.

### Token-economics shape
The stage ladder (§8.5) concentrates volume where tokens are free: S0–S1 ≈ pure T0; S2–S3 ≈ T0 orchestration + T1/T2 driving; S4 is the only T3 stage, and it receives a pre-screened shortlist, not the firehose. Steady-state, the overwhelming majority of APA actions run at T0–T1; Sonnet does the bounded exploratory/judgment middle; **Fable's spend scales with *novel findings*, not with app size or run count.**

### Fleet mapping
Each stage job dispatches to fleet workers via the existing tier mechanism (`min_tier_rank` floors per child SD / job class): T0 runs in-harness (no seat); T1/T2 jobs are claimable by Haiku/Sonnet seats; T3 is routed **explicitly** to a Fable seat (explicit routing, not floor-only — floors don't reserve). This also keeps APA runs from competing with build work for Fable capacity.

This refines (does not replace) the chairman's hard constraint: **Fable DESIGNS the assessment and JUDGES the interface; cheaper models RUN and pre-screen the walk; deterministic code does everything binary.**

---

## 6. Seam vs the verdict engine (augment, don't duplicate)

The verdict engine stays the claims/static layer. APA is the behavior/dynamic layer, sharing the registry. APA writes **`behavioral_verdicts`** rows parallel to `post_build_verdicts`, reusing the **same disposition vocabulary** (BUILT / PARTIAL / MISSING / DEVIATED) so the convergence loop + findings-gate consume both uniformly. Chairman gate = **claims-verdict PASS AND behavioral-verdict PASS**. Findings that fail auto-surface in a structured card (walkthrough-#2 shape); only a passing run escalates to the chairman.

**Seam note (consume-the-canonical-function discipline):** the same augment-don't-duplicate rule applies to every decision APA touches: verdict vocabulary (reused above), QF-vs-SD routing (delegated to the canonical triage gate, §10.3), personas (from the artifact corpus), journeys (from `blueprint_user_journey`, §11), assertions (from the unified registry, §1.2). APA re-derives **nothing** that already has a canonical owner.

---

## 7. SD decomposition (tier-coherent, dependency-minimal)

**Parent: SD-EHG-INFRA-APA-001** (Automated Product Assessment) — umbrella.

- **Child A — Sandbox Harness** (deterministic infra, cheaper tier): boot / seed / instrument / teardown + real side-effect capture sinks. The trunk; everything depends on it.
- **Child B — Assertion Library** (deterministic code + design, medium): the registry + the two generalized catchers + claim→assertion auto-derivation, wired into the unified registry. Where both acceptance criteria are guaranteed.
- **Child C — Browser Executor** (cheap-model tier): scripted journeys (B1) + bounded exploratory walk (B2) + evidence capture. Depends on A.
- **Child D — Persona Coverage + Orchestration** (deterministic, medium): assertions × personas, scheduling. Depends on A, B, C.
- **Child E — UI/UX Judgment + Findings Gate** (Fable tier): Stage-17 UI rubric + Fable UX adjudication + findings card + `behavioral_verdicts` write + convergence integration. The cap; depends on all.

Trunk = A; B and C parallelize off A; D needs A+B+C; E caps.

---

## 8. Phasing

- **Phase 1 (lean, ship now — wire as a gate on the MarketLens rebuild):** Child A minimal (boot + seed + **side-effect instrumentation**) + Child B (the two generalized catchers + auto-derivation) + Child C **B1 scripted-only** — **plus, per chairman direction (2026-07-07), two hardening items from §10:** the **seeded-defect calibration suite (§10.1)** — APA must prove it catches known-injected defects before its verdicts are trusted — and **findings→fix routing (§10.3)** — every finding auto-routes into the existing fix machinery with an owner, so Phase 1 ships as a self-verified gate with a closed loop, not a report generator. This catches both acceptance bugs, deterministic, cheap, reliable — the highest-leverage 20%.
- **Phase 2 (deep):** bounded exploratory click-walk (B2), full persona matrix (D), Fable UI/UX judgment + findings gate (E), completing the full-review surface (§0.5.1). Absorbs §10.4 (flake management, first needed when B2's volume arrives), §10.5 (async/third-party seams), and **§10.2a provenance-exists** if not already landed in Phase 1 — **for the flagship (a data product), 10.2a is mandatory before any machine-pass stamp**, ideally alongside Phase 1's assertion library (it is T0-deterministic and reuses the §1.1 instrumentation pattern on the data path).
- **Phase 3 (hardening horizon):** **§10.2b value-is-correct** (semantic/domain judgment) + the §10 honorable mentions (security probes, persona provenance).

**Gate note (binding, per §0.5):** Phase 1 passing does NOT clear an app to the chairman. Until Phase 2 completes the surface, chairman handoffs carry an explicit "partial machine coverage" stamp listing covered vs uncovered dimensions. The chairman bar — "it just works when I get it" — is only met by the full surface passing fail-closed.

---

## 8.5 Staged execution model (chairman confirmation, 2026-07-07)

The full-review surface (§0.5.1) is the **bar**, not a single monolithic pass. APA executes as a **staged, iterative pipeline** — cheap deterministic stages gate the expensive judgment stages (the testing-pyramid principle), and each stage is a fix-loop.

### Stage ladder (each stage runs only on an app that cleared the previous)

| Stage | What runs | Tier / cost | Gates |
|---|---|---|---|
| **S0 — Smoke** | boots? seeds? routes load? no boot-time errors? | deterministic, seconds | everything — if S0 fails, stop; nothing downstream is meaningful |
| **S1 — Deterministic functional** | scripted journeys (B1) + assertion library (C1): side-effect honesty, recovery paths, persistence, no-dead-end, integrity | deterministic + minimal cheap-model, cheap | S2+ — don't explore a functionally broken app |
| **S2 — Full-surface sweep** | bounded exploratory walk (B2): every route, every CTA, forms, content integrity, links, responsive, console/network, performance sanity, a11y basics | cheap model, moderate | S3+ |
| **S3 — Persona matrix** | S1+S2 dimensions × every defined persona (D) | deterministic + cheap model | S4 |
| **S4 — Judgment** | Fable UI craft + UX quality on the now-functionally-clean app (E) | **Fable, expensive** | final stamp |
| **S5 — Full clean pass** | one uninterrupted end-to-end re-run of S0–S4 | mixed | the chairman handoff |

**Why judgment runs LAST:** UX/craft findings on a broken app are polluted — half the "friction" is the breakage. Fable judges only a functionally-clean substrate, so its findings are all signal. This is also the cost guard: the expensive tier never burns on an app the cheap tiers would have rejected.

### The iteration axis (fix-loops)

- **Within a stage:** run → findings card → fix → **re-run that stage** until clean, then advance. Failures never accumulate downstream.
- **Loop guards** (reuse the convergence-loop stop conditions): per-stage retry cap + plateau detection (same findings recur N× with no improvement → escalate to human/RCA rather than loop forever).
- **Regression guard:** stage-local re-runs are the cheap inner loop, but a fix at S4 can regress what S1 already passed — so the **chairman stamp requires S5: one full clean end-to-end pass with zero findings**. No app reaches the chairman on stitched-together partial greens.

### Incremental re-assessment (post-first-pass economics)

After an app has passed once, subsequent changes trigger **S0 + the dimensions touched by the change** as the fast inner loop; the full ladder re-runs before any renewed chairman handoff. Fast iteration for builders, full assurance at the gate.

---

## 9. Preconditions / risks to hand-verify at PLAN

1. **Bootability:** APA needs the flagship (MarketLens) to be reproducibly boot + seedable in a sandbox. If it is not, Child A's first task is making it so — which may surface its own gaps. Verify before scoping A as "small."
2. **Instrument-not-mock enforcement:** a reviewer must confirm the capturing transport intercepts the app's real send path and that **no test double** lets the app skip its real code. This is the guard on §1.1; APA's whole value dies if a mock sneaks in.

---

## 10. Known gaps / hardening roadmap (Solomon self-critique, chairman-reviewed 2026-07-07)

Ranked by damage-if-unaddressed. **Chairman direction: §10.1 and §10.3 move into Phase 1** (cheap enough, and both change what "shipped" means); §10.4/§10.5 land with Phase 2; §10.2 + honorable mentions are Phase 3.

### 10.1 APA must prove ITSELF — seeded-defect calibration suite (**Phase 1**)
The most dangerous failure mode is not a bug APA misses — it is APA silently rotting while the chairman trusts it (the dormant-verifier class). **Fix:** a fixture app with known injected defects — a fabricated email claim, a dead route, a missing recovery flow — that APA must catch on every version of itself; a seeded defect slipping through turns APA's own gate red. The two hand-caught MarketLens bugs become **permanent calibration fixtures**, not just one-time acceptance criteria. Without this, a false green to the chairman is unfalsifiable. (This is mutation testing applied to the gate itself.)

### 10.2 Mechanical "works" ≠ core output is TRUE — data-provenance assertions (SPLIT, Adam co-review 2026-07-07, chairman-approved)
Side-effect honesty catches "we emailed you" with no email. But the flagship's actual product is *analysis* — a dashboard rendering confident numbers derived from nothing passes every current assertion (routes load, forms persist, no 500s). This is the fabricated-email bug's bigger sibling: **fabricated value** — and for a market-INTELLIGENCE product whose entire value IS the numbers, it is the highest-stakes dimension. Originally sequenced Phase 3 as one item, it conflates two things of very different difficulty; **split:**

- **10.2a — PROVENANCE EXISTS** (cheap, deterministic, T0 — **Phase 1/2, mandatory for the flagship**): every displayed metric/result must trace to a **real source row or a real computation** — not a hardcoded literal, not a null-derived value. If a rendered number has no source, that is a finding. This is the **direct sibling of the fabricated-email check**: instrument the data path, "absence is the signal," same instrument-don't-mock pattern (§1.1). Catches the crude fabricated-value case ("confident dashboard numbers derived from nothing") at near-zero cost.
- **10.2b — VALUE IS CORRECT** (hard, domain judgment — **stays Phase 3**): are they the RIGHT numbers / is the analysis semantically valid. The genuinely hard, highest-ceiling piece.

**Coverage-stamp handling (honest residual, binding per §0.5):** until 10.2b ships, the flagship's chairman handoff stamp must read explicitly — *"data provenance: source-traced ✓ (machine); semantic correctness: human-review-required (Phase 3 pending)."* The chairman is never told "it just works" on a dimension the machine didn't verify; he is told precisely which truth-check ran and which is still his eyes.

### 10.3 Findings must have a declared consumer — findings→fix routing (**Phase 1**)
Unrouted, APA becomes a report generator whose findings pile up (the generator-without-consumer disease). **Fix:** the findings card is a **work order, not a report** — every finding auto-routes: **through the canonical triage gate** → QF or convergence-loop rework item → tier-matched worker (per §5) → the fix landing triggers the stage re-run (§8.5). Dedup against known/open findings so re-runs don't refile. No finding without an owner and a next action.

**Triage delegation (chairman-directed, 2026-07-07 — binding):** APA does NOT define its own QF-vs-SD severity threshold. Each finding (with its captured evidence + LOC estimate) passes through the **existing canonical decision function** — `scripts/modules/triage-gate.js` (AI LOC estimator + Unified Work-Item Router) / `scripts/classify-quick-fix.js` (≤50 LOC, bug/polish not feature, no schema/auth, tests exist, single file; `--auto-escalate` promotes to SD). Same consume-the-canonical-function discipline as persona-provenance and the unified registry — an APA-local threshold would re-commit the exact SSOT-divergence disease found on the message carrier (§10 provenance: a second place re-deciding an existing rule). Net: **APA produces evidence-backed findings; the canonical triage gate decides QF vs SD; the convergence/fix loop (§8.5) iterates until clean-or-escalated.**

### 10.4 Fail-closed + flaky browser tests = pipeline paralysis — flake management (Phase 2)
E2E browser automation is notoriously flaky, and this gate is fail-closed; even a few percent false-red burns fix-loops on non-bugs and teaches builders to distrust the gate — which is how gates die. Needs first-class flake discipline: deterministic waits (no sleeps), bounded auto-retry that distinguishes "flaky" from "intermittent real bug" (**an intermittent 500 IS a finding, not a flake**), a quarantine lane with expiry (quarantined ≠ deleted; expiry forces resolution), and a wall-clock budget per run.

### 10.5 Async + third-party seams — where the fabricated-email bug's cousins live (Phase 2)
The sandbox is specified for synchronous behavior, but real defects live in async: verification-email **links that actually work when clicked**, background jobs, webhooks, scheduled tasks, payment callbacks. An email that sends but contains a dead link passes today's design. Needs: clock control, in-sandbox job-runner execution, round-trip completion (webhook/callback simulation at the boundary — still instrument-not-mock: the app's real handler code runs), and **captured-email link-following as an assertion**.

### Honorable mentions (Phase 3 backlog)
- **Security probes:** auth bypass, IDOR across personas — two personas in one sandbox is the natural place to assert isolation.
- **Persona provenance:** personas must come from the venture's artifact corpus (identity_persona_* artifacts), not be invented at assessment time — same registry discipline as §1.2.

---

## 11. Instance source & the production-incident loop (architecture consult, 2026-07-07)

Two coupled decisions folded in before Child A is scoped. They couple because whatever produces the assessable instance must also support **deterministic replay** of captured production incidents (§11.2).

### 11.1 DECISION 1 — where the assessable instance comes from: **ride the venture's own deploy path** (option b)

"Sandbox" in this doc was shorthand, not a settled choice. Evaluated against bootability, side-effect capture, fidelity-to-what-the-user-gets, and replay support:

**RECOMMENDED: (b) an ephemeral preview deploy produced by the venture's OWN deploy/run machinery, in a strictly-enumerated test-mode config.** Reasoning:

1. **Zero parallel infrastructure.** The venture must solve reproducible boot + deploy to *ship* anyway (the hosting standard already demands it — `verifyPagesUrlLive` / `verifyComputeDeployed` are exit-gate verifiers). APA consumes that machinery instead of owning a second one that drifts.
2. **The bootability iceberg inverts into an assertion.** §9 precondition 1 worried Child A might inherit "make MarketLens bootable." Under (b), *"this venture cannot be reproducibly deployed" is itself a FINDING* — absence is the signal, again — not APA's scoping burden. APA's biggest risk becomes one of its checks.
3. **Highest fidelity.** The chairman looks at the deployed URL, not localhost. Assessing the deploy-path artifact catches the whole defect class a local sandbox masks: missing env vars, unrun migrations, hosting config, build-output divergence. A local sandbox (option a) can pass an app whose *deploy* is broken.
4. **Instrument-not-mock survives via config, with a diff budget.** Test-mode wires the capturing transports (real code runs; the transport boundary is swapped by config). **Binding guard: the test-mode config surface is ENUMERATED** — transport swaps, clock injection, seed hooks, and *nothing else*. Any other prod/test divergence is a finding. Without the enumeration, test-mode quietly becomes a second app.
5. **Replay support (the coupling):** the deploy path must accept an arbitrary build SHA + seeded state — which preview-deploy machinery naturally does — so a captured incident replays against the same code that threw it (§11.2).

Rejected: **(a) local ephemeral sandbox** — max control but owns the bootability iceberg, drifts from the real deploy path, and masks deploy-class defects. Survives only as a Phase-1 *interim* if MarketLens preview-deploys aren't ready — and then explicitly stamped interim with a declared exit criterion (never observe-only-forever). **(c) containerized per-run** — a parallel packaging that drifts unless the venture's deploy path is already containerized, in which case (c) *is* (b).

**Cost note:** preview deploys boot in minutes, not seconds. Mitigation is already in the design: one deployed instance is reused across the stage ladder within a run (§8.5), and incremental re-assessment reuses the instance until the code changes.

### 11.2 DECISION 2 — production error/feedback → reproduce → fix → permanent regression (designed in, not bolted on)

Every EHG venture already captures errors (universal venture telemetry, PII-redacted) and feedback (required `/feedback` page). The loop, generalizing §10.1 — **reality-seeded defects instead of hand-seeded**:

1. **INGEST** — a captured production error (or bug-describing feedback) enters APA's intake. First check: is the capture **reproduction-grade** (§11.3)? If not, that gap is a finding *against the telemetry capture*, not a silent drop.
2. **REPLAY** — deploy the incident's build SHA via the §11.1 path in test-mode, seed the captured state, drive the captured journey step, and attempt deterministic reproduction.
3. **REPRODUCED** → the reproduction becomes a **failing APA assertion carrying real-incident evidence** → routed through the canonical triage gate (§10.3) as QF or SD.
4. **FIX CONFIRMS** — the fix is accepted only when the reproduction PASSES (confirm-resolved-through-testing, never confirm-by-claim).
5. **PROMOTE** — the reproduction joins the assertion library as a **permanent regression assertion**, tagged with incident provenance. The library *grows from reality*; coverage compounds with every incident.
6. **NOT reproduced** → parked with a reproduction-attempt counter, never silently dropped; recurring non-reproducibles are their own finding class (environmental/flaky — feeds §10.4).

This extends APA from a pre-launch gate into a **continuous production loop** — same instance source, same assertion library, same ladder, same triage gate; only the trigger differs (incident instead of build). And it is §10.1's calibration suite fed by reality: hand-seeded defects prove APA *can* catch; incident-seeded assertions prove it *keeps catching what actually escaped*.

### 11.3 Reproduction-grade capture contract (small extension to the telemetry SD)

For an incident to be replayable, capture must include (beyond hash/stack-trace):
- **journey step ID** — which step of which persona's journey it occurred on (ties to `blueprint_user_journey`, SD-LEO-INFRA-FIRST-CLASS-USER-001 — journey steps therefore need **durable, stable IDs** telemetry can reference);
- **build SHA** + route;
- **input payload** — PII-redacted via **deterministic pseudonymization** (same shape/type, stable substitute values) so redaction preserves replayability — naive redaction kills reproduction;
- **app-state pointer** — enough seeded-state reference to reconstruct the precondition;
- **clock** — incident time, for clock-injection on replay;
- the user-visible symptom.

### 11.4 What this changes elsewhere in the doc
- §9 precondition 1 (bootability) softens: under §11.1(b), non-deployability is an APA finding, not a scoping precondition — Child A's job is consuming the deploy path + the test-mode config enumeration, not building a sandbox.
- §10.1's seeded-defect suite gains a second seed source (§11.2 step 5).
- Child A's scope statement in §7 should be read as "instance acquisition via the venture deploy path + instrumentation config," not "sandbox construction."

---

## 12. Child E detailed design — the two-stage Sonnet→Fable judgment funnel (Fable-window design, 2026-07-07)

The Phase-2 judgment layer (stage S4, §8.5) in implementable detail. Governing invariant (§5): **Fable spend scales with NOVEL FINDINGS, not with app size or run count.**

### 12.1 Inputs
- The S2 exploratory-walk **observation stream**: per visited state — `{state_signature, screenshot, DOM excerpt, console/network events, action taken, outcome}` (state_signature = route + DOM-shape hash + interaction type, per §3b).
- S1/S3 deterministic results (context only — functional failures were already routed at their own stages; S4 judges a functionally-clean app).
- The **Stage-17 craft rubric** (`shared-design-prompts.json` — reused verbatim, not re-derived) + the venture's design tokens/brand artifacts from the unified registry.
- The **verdict cache**: prior adjudications keyed by `(state_signature, heuristic_id)`.

### 12.2 Stage 1 — Sonnet pre-screen (the workhorse; T2)
Per **novel** state (signature not in the verdict cache):
1. **Heuristic sweep** against a fixed checklist — navigation dead-ends, misleading/dishonest copy, missing recovery affordances, inconsistency with adjacent screens, confusing flow order, placeholder/lorem remnants, visual brokenness (overlap/clipping visible in screenshot).
2. Emit **candidate findings**: `{state_signature, heuristic_id, severity_guess, confidence, evidence: {screenshot_ref, DOM_excerpt, repro_action}}`.
3. **Evidence assembly** — the candidate must be adjudicable from its packet alone (Fable never re-walks the app).
4. **Dedup + suppression** — drop candidates whose `(state_signature, heuristic_id)` hit the verdict cache (previously adjudicated NOT-real stays suppressed until the state's DOM-shape changes; previously-real stays an OPEN finding, not a re-adjudication).

**Gate to Stage 2:** a candidate passes only if **novel ∧ confidence ≥ floor ∧ not cache-suppressed**. Everything else dies here at Sonnet cost.

### 12.3 Stage 2 — Fable adjudication (sparing; T3)
Three call shapes, batched for context economy:
1. **Candidate verdicts** (batched per screen): for each shortlisted candidate — `{real: y/n, severity, why, fix_direction}`. Rejections write to the verdict cache (permanent Sonnet-suppression for that state-shape).
2. **Per-screen craft score**: each distinct screen scored once per version against the Stage-17 rubric (6 dims, floors ≥3 / mean ≥4, blocker auto-fail — same semantics as the design-rubric scorecard already in use). Screens unchanged since last scoring (same DOM-shape hash) are **not re-scored**.
3. **One holistic coherence pass** per run: Fable reads the screen gallery + journey order end-to-end and judges what per-screen calls cannot — design-system consistency across screens, journey-level flow sense, tonal coherence. Exactly one call; it is the only mandatory Fable call on a re-run of an unchanged app.

**Spend model:** first run ≈ (shortlist ÷ batch) + screens + 1; steady-state re-run on an unchanged app ≈ **1 call** (holistic) or 0 if gated on any-change. Cache invalidation is DOM-shape-scoped, so a one-screen change re-judges one screen, not the app.

### 12.4 Outputs + judge integrity
- Verdicts merge into `behavioral_verdicts` (§6 vocabulary) and findings cards → the canonical triage gate (§10.3). Craft scores feed the convergence loop's rubric machinery.
- **Judge calibration (10.1 applied to the judgment layer):** a small fixed set of known-verdict fixtures (screens with planted, chairman-confirmed craft defects + known-good screens) runs through both stages periodically; drift in either stage's verdicts = a finding against APA itself.
- **Anti-Goodhart sampling:** a rotating sample of Fable adjudication rationales is adversarially re-verified by a separate session (adversarial-verify > parallel-confirmer consensus) — the judgment layer never grades its own honesty.

---

*Solomon design proposal — propose-only. Adam co-reviews, then brings to the chairman before any SD is authored/sourced.*
