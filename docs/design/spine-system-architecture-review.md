# Spine + Satellites — System Architecture Review (chairman-facing)

**Status:** Solomon-authored (Fable 5 / high, 2026-07-11 evening), propose-only. This is the step-back review you asked for — the whole system before the parts — per your two in-session directives: the venture CEO/VP organization is the center, and find the glue, the synergies, and what's missing. It supersedes the flat "spec the seven" framing; the per-satellite specs (`operating-company-satellite-architecture-v1.md`) get re-cut to the boundaries below.

---

## 1. The one-paragraph verdict

The seven satellites were accreted one decision at a time, and it shows: four of them are actually **four loops over one missing substrate** (a shared evidence fabric), two of them belong **inside other things** (support belongs in the relationship engine; effort-distribution is mostly a spine amendment), and the set as named has **two genuine holes** (your meeting/calendar surface, and venture wind-down). The center you named — the CEO/VP organization — exists in code as a complete, well-designed, **never-once-run** factory: zero CEO agents, zero VP agents, zero messages, ever. The right move is not to build seven parallel services; it is to stand up **one spine core (the org + its protocol + one venture-state read model), one shared evidence fabric, and six right-sized satellites on top** — with the existing factory folded in for its good bones and superseded where its assumptions predate this week's doctrine.

## 2. The center: your venture organization — and what the existing factory really is

**What I verified first-hand tonight (runtime behavior vs claims):**
- `lib/agents/venture-ceo-factory.js` is real and substantial: a 19-agent template per venture (1 CEO, 4 VPs, 14 crew agents), with budget authority ($5k/VP caps), token budgets, stage ownership per VP, and advisory-approval stages built in. The runtime (`venture-ceo-runtime.js` + 7 modules) is a genuine message-processing loop with budget enforcement and a truth layer that tracks each agent's predictions against outcomes (calibration — exactly the "earned autonomy" mechanism the spine wants).
- **It has never run.** No live code path invokes the factory or the runtime (every reference is archive or test). The database agrees: **0 CEO rows, 0 VP rows, 0 agent messages ever; the agent registry's last write was February 22.**
- Meanwhile its sibling, the venture **state machine**, IS live — the EVA orchestrator drives stage transitions through it today. So stages advance through machinery that was designed to be CEO-operated, with no CEOs. This matches what the simulated S20-26 run observed: stages run through workers; the org layer is decorative at run level. It is the dormant-machinery pattern at the most important spot in the company, exactly as you suspected.

**Fold-in-or-supersede (explicit, per your ask):**
- **FOLD IN (keep, valuable):** the org template (CEO/VP/crew taxonomy and stage ownership), the budget manager, and especially the truth-layer calibration — that is the earned-autonomy engine and it is already built.
- **SUPERSEDE (re-base, do not run as-is):** its identity/authority substrate. It predates this week's doctrine — born-denied authority, enforced writer identity, typed exceptions. The spine core becomes the single identity/authority source; the factory's agents are created THROUGH it. Its message loop is kept for **intra-venture** org traffic (CEO↔VP — it has proper claim semantics) while fleet/role traffic stays on the existing coordination lane; both under one typed-kind discipline. One org substrate, never two side by side.
- **Verdict: FOLD-AND-REBASE** — roughly 60% of the org layer is already built and good; the 40% being replaced is precisely the part that today's incidents proved dangerous (ungoverned authority, silent identity).

## 3. The glue (what you suspected exists — it does, in four pieces)

1. **The org protocol.** Chairman↔EVA↔CEO↔VP↔fleet all speak one discipline: typed message kinds, hard-interrupt directives, two-stage acknowledgment, recorded dispositions. This already exists in scattered form (coordination lanes, decision queues, advisory ACKs) — the spine makes it THE interface every satellite exposes its service through. A satellite is then just "a service an org role can call, and a loop that reports through the same protocol."
2. **One venture-state read model.** Today a venture's truth is scattered (venture row, stages, vision docs, thesis, gauges, org). The spine defines ONE canonical aggregate — thesis + stage + gauges + org chart + economics — that every satellite, every CEO, and your meeting surface read from. This is the single highest-leverage cleanliness win: most inter-satellite coupling disappears because they stop asking each other and start reading the same model.
3. **The portfolio evidence fabric.** The synergy you guessed at is real: **vigilance** (external observations), **learning-speed** (traversal reflections), **capability-extraction** (deposited capabilities), and **effort-distribution** (decision-quality ledger) are not four systems — they are four writers/readers on ONE provenance-typed evidence store with dispositions. Built as one fabric, each "satellite" shrinks to a thin loop; built separately, we would have four half-alike stores drifting apart (the CHECK-enum lesson at architecture scale).
4. **The objective + guard-gauge registry.** Every role AND every satellite declares an objective function paired with an anti-Goodhart guard. This is the economics glue — it is how EVA optimizes your attention honestly, how effort-distribution routes by decision quality instead of cost, and how a satellite that starts gaming its own number gets caught by design.

**Collapses this produces:** learning-speed + capability-extraction merge onto one traversal seam and one fabric (two loops, one SD pair). Vigilance keeps its own watchers but writes the same fabric. Effort-distribution becomes a spine amendment plus a thin ledger (as its own adversarial panel already concluded). Support intake folds into pipeline/CRM as a case type — one **relationship engine**, two case families (revenue, support). Net: seven accreted satellites → **six right-sized ones on four shared substrates.**

## 4. What was missing (gap scan — my honest calls)

- **REAL, and it is yours: the chairman surface.** Your vision's meeting loop (EVA roll-ups, attention items, calendar-scheduled deep-dives with a venture's CEO) is the spine's §2 rendered for its only human — and the calendar deep-dive piece is confirmed not captured anywhere. This is not a satellite; it is the spine's face. It also inherits the audit finding that bottleneck/constraint computation exists in four pockets and reaches no chairman surface — the meeting brief is where the "#1 constraint right now" line belongs.
- **REAL: venture wind-down/exit.** The S20-26 spec predicted total absence of scale-or-exit machinery; the run confirmed it. Kill executes pre-registered criteria; but exit (data, customers, domains, billing teardown, capability harvest) is designed machinery nobody has built. Named as satellite 6 below; it consumes capability-extraction (harvest before shutdown) and the kill-gate regime.
- **THIN, fold into the spine (not satellites):** portfolio capital/budget allocation (a chairman-ratified allocation policy + the already-designed spend envelopes — real, small); per-venture compliance/legal (a checklist consumed at launch and wind-down gates, adjacent to your row-7 authority; not standing machinery yet).
- **DEFERRED, honestly:** an inter-venture resource market. With one live venture it is architecture theater; the allocation policy covers it until portfolio scale makes a market meaningful.

## 5. The re-cut map

**SPINE CORE (one build):** org identity + authority (born-denied, enforced writer identity) · the org protocol (typed kinds, dispositions) · the venture-state read model · the objective/guard registry · the evidence fabric · the chairman surface (meeting brief + attention items + calendar deep-dive scheduling + the top-constraint line). The CEO factory folds in here, re-based.

**SIX SATELLITES:** 1) **Relationship engine** (pipeline/CRM + support intake; identity graph; branching case engine as a sibling of the stage machine) · 2) **Creative engine** (visual/video generation as a VP_GROWTH tool; artifact-theater guard) · 3) **Learning & capability loop** (traversal reflections + capability deposits; one seam, one fabric) · 4) **Vigilance loop** (observed-source watchers on the fabric; the surviving observed-baseline design implements it) · 5) **Agent-lifecycle** (contracts, evaluation, succession, ghost-CEO detection — the factory's truth layer is its seed) · 6) **Wind-down/exit** (the new one). **Effort-distribution** ships as the spine's §3.3 amendment + thin ledger — in the build tree, just not pretending to be a standalone service.

Every satellite interface is defined **relative to the org**: who calls it (CEO, VP, EVA), through the protocol, reading the venture-state model, writing the fabric. That single sentence is the integration rule you asked for.

## 6. What this changes in the build plan

The v1 pass's parallel-build contract survives, re-cut: **spine core first** (bigger than the earlier stub — it absorbs the org protocol, read model, fabric, and chairman surface; still one SD tree, and the factory fold-in means most of the org half is adaptation, not creation), then six satellites in parallel with disjoint write surfaces. The S20-26 harness re-run remains the integration test, now with a sharper pass condition: the previously-undrivable loops must run **through org roles** (a CEO's support loop fires, not a bare worker's).

## 7. Counterfactual and the first verification

**What would change this review:** if you want ventures operable WITHOUT standing per-venture agent orgs (cheaper, simpler — EVA drives everything directly and "CEO" is just a reporting label), then the spine core shrinks to protocol + read model + fabric, the factory is archived rather than re-based, and agent-lifecycle drops to role contracts only. That is a coherent, cheaper company — but it is not the organization you described on the 10th, and the truth-layer/earned-autonomy machinery loses its subject. Say the word and I re-cut once more; absent that, the org-centered map above stands.
**Verify-first (before the spine core SD is cut):** one seeded end-to-end thread on the folded factory — create one CEO+VP org for the fixture venture through the re-based identity path, have it claim one message, make one budget-checked decision, and leave one calibration row. That single thread proves the fold-in is real before six satellites take a dependency on it — the run-before-you-build lesson of this entire week.

---

## 8. RATIFIED — the §7 counterfactual is closed (chairman, 2026-07-11 evening)

The chairman confirmed the **org-centered map** and rejected the EVA-as-sole-decision-maker variant, with rationale that is now a **binding design principle** across the spine core and agent-lifecycle satellite:

- **Role-specialized decision quality:** VPs and CEOs carry genuinely distinct knowledge/skill profiles — different contexts, prompts, and expertise per role, never one brain wearing hats. Role **knowledge-profiles are first-class data** in the agent-lifecycle satellite (part of the role contract, versioned, inherited on succession).
- **EVA is chief-of-staff, never the decision bottleneck:** context-switching overload in a single decision-maker is the named failure mode. Decisions distribute to the role closest to the domain; EVA orchestrates, aggregates, and routes exceptions — she does not decide in the roles' place. The spine's authority-distribution section encodes this: authority grants attach to the DOMAIN role, and an EVA-decides fallback on a domain matter is itself a typed exception, not a silent default.
- **This is what makes the truth layer meaningful:** per-role calibration (the folded factory's prediction/outcome engine) only measures anything if roles genuinely decide. Earned autonomy widens per role on its own calibration record — which requires the decisions to be genuinely theirs.

No re-cut needed; the map in §5 stands ratified.

---

## 9. RECONCILIATION against the recovered originals (PR #5958 landed byte-exact copies on main)

The three docs I could not re-emit verbatim were recovered byte-exact (`operating-company-spine-spec.md`, `visual-video-generation-satellite-spec.md`, `fable-suitability-map-v1.md`, plus `fw3-effort-distribution-tier-design.md` and `crm-pipeline-operational-satellite-spec.md`). Reconciliation verdicts, checked against the originals directly:

- **The originals are SSOT for their own content.** My v1 doc's compressed spine restatement and its FRESH video-satellite section (§3.2) are **superseded** by the recovered originals. In particular my §3.2 stated Gemini as the image path per the hosting standard — **wrong against the chairman's 07-10 in-session ruling** captured in the original: **RunwayML is PRIMARY for both image and video; Gemini is the live fallback behind the provider abstraction.** The original's full opportunity surface (build-time assets through venture-product capability, agent embodiment via the Characters API, the audio stack), its anti-fabrication gates (no synthesized social proof in pixels; an avatar/voice may not perform confidence the gauges don't support), and its delivery-evidence-gated envelope registration are all binding content my re-derivation compressed away. The creative-engine satellite builds from the ORIGINAL spec, with this review adding only its org framing (VP_GROWTH-owned, artifact-theater guard).
- **One correction to §4 of this review:** I called the calendar deep-dive "not captured anywhere." The recovered spine spec §2.3(ii) DOES specify it — EVA schedules a calendar meeting with the venture's CEO, who presents against thesis and pre-registered kills. The gap is therefore **unbuilt, not unspecified** — which moves it from "design work needed" to "build work needed," a cheaper gap than I reported.
- **No structural conflicts.** The original spine's six families match this review's restatement; its §2.3 meeting surface, §4.4 learning-speed hook, and §5.3 vigilance activity are exactly the seams my glue substrates and six-satellite re-cut attach to. The NEW contributions of this review — the evidence-fabric consolidation, the six-satellite re-cut, the CEO-factory fold-and-rebase verdict, the org-centered ratification (§8), and role knowledge-profiles — layer on top of the originals without contradiction.

*Propose-only. Companion: `operating-company-satellite-architecture-v1.md` (per-satellite detail, to be re-cut to these boundaries; its spine restatement and video section yield to the recovered originals per §9). Committed at creation per the evidence-durability rule.*
