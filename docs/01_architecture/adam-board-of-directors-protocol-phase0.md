---
Category: Architecture
Status: Draft
Version: 0.1.0
Author: SD-LEO-INFRA-ADAM-BOARD-OF-DIRECTORS-DESIGN-001 (Phase-0 design pass)
Last Updated: 2026-06-16
Tags: adam, board-of-directors, judge-panel, sourcing, governance, const-002, design-only, phase-0
---

# Adam's Dynamic Board-of-Directors Sourcing Protocol — Phase-0 Design Spec (DESIGN-ONLY, NO BUILD)

> **Status: reviewable design artifact.** No executable harness, no code, no migration in this
> SD. This specs the protocol to build-depth; the executable board harness is a separate,
> chairman-review-gated follow-on (see §6). Where a capability already exists in the repo it is
> marked **COMPOSE** with the concrete module; where it does not, it is marked **NET-NEW**.

## 0. Why a board (and what already exists)

Adam sources, prioritizes, and sequences work. Today the ranking lens is `selectAdvisory`
(`lib/adam/rationale-bar.js`) — a single scalar pipeline: a status-tier cardinal invariant times
preference weights (`lib/adam/preference-model.js`) times a wave-alignment multiplier times a
capability-gap multiplier (`lib/adam/gauge-lens.js`). It is one perspective, collapsed to a number.

A **board of directors** replaces "one collapsed number" with **multiple preserved perspectives
that deliberate, then synthesize**, for the decisions where being wrong is expensive (what to
source next, in what order). Crucially, **a board already exists in the codebase** — it is just
not wired to Adam's sourcing:

- `lib/brainstorm/board-seats/index.js` — **6–8 C-suite seats** (CSO, CRO, CTO, CISO, COO, CFO,
  CMO, CGO), each a role with a lens.
- `lib/brainstorm/board-judiciary-bridge.js` — records per-seat positions + round-2 rebuttals
  (**dissent**) + specialist testimony into `debate_sessions` / `debate_arguments` /
  `judge_verdicts`, and synthesizes a verdict with constitutional-citation auditing.
- `lib/brainstorm/specialist-registry.js` — dynamic specialist identities matched from
  `EXPERTISE_GAP` markers in seat outputs (Jaccard ≥ 0.7) and persisted in `specialist_registry`.
- `lib/sub-agents/vetting/critic-personas.js` — 3 critic archetypes (safety / value / risk) with
  verdict + `change_requests` (the **skeptic** machinery).
- `lib/integrations/refine-score.js` — a **4-persona weighted scorer** (optimist / pragmatist /
  devil's-advocate / strategist) already used for roadmap-wave items.

**The Phase-0 thesis: this protocol is mostly a COMPOSE + a thin Adam-domain seat-selection layer,
not a new judge panel.** The board-of-directors archetypes below map onto the existing brainstorm
board seats + critic personas; the genuinely NET-NEW work is (a) the Adam-specific permanent seats,
and (b) the dynamic seat-selection keyed off roadmap wave + gauge capability.

## 1. Director roster (FR-1)

Each archetype is `{key, title, lens, decision_heuristics, when_seated}`.

### 1.1 Permanent seats (always seated — anchor every decision to the chairman's standing rules)

| key | title | lens | decision heuristics | anchors / source |
|-----|-------|------|---------------------|------------------|
| `operator` | The Operator | Solo-founder survivability | Can one founder actually run/maintain this? Does it shorten distance-to-broke / distance-to-quit? Does it reduce operational load rather than add it? | Solo-founder survivability. NET-NEW lens; can borrow framing from the distance-to-broke/quit gauge capabilities (`vdr-registry.js`, application layer). |
| `intent_keeper` | The Chairman's-Intent Keeper | Roadmap + stated-preference fidelity / anti-drift | Does this match the ratified roadmap wave order and the chairman's stated preferences? Is it drifting toward meta-work the chairman deprioritized? | **COMPOSE** `lib/adam/preference-model.js` (`computePreferenceWeights`, clamp 0.8–1.25) + `lib/integrations/okr-wave-linker.js` wave alignment. |
| `compounding` | The Compounding-Leverage Director | Does it unlock downstream / is it a prerequisite | Is this a keystone other work depends on? Does shipping it raise a weak gauge capability? Or is it a leaf with no compounding? | **COMPOSE** `lib/adam/gauge-lens.js` (`readCapabilityGaps` → per-capability build%). |

The 3 permanent seats are the board's constitutional spine — they are the lensed embodiment of
`selectAdvisory`'s existing terms (preference weights → Intent Keeper; capability-gap → Compounding;
survivability → Operator, the one genuinely new lens).

### 1.2 Rotating specialists (seated by relevance — see §2)

| key | title | lens | maps to existing seat |
|-----|-------|------|-----------------------|
| `product_ux` | Product / UX Director | user-facing value, surface coherence | CMO + brainstorm board CSO (positioning) |
| `architect` | Systems Architect | feasibility, architecture, capability graph | **COMPOSE** brainstorm `CTO` seat |
| `capital` | Capital Allocator | cost, ROI, unit economics, budget | **COMPOSE** brainstorm `CFO` seat |
| `risk` | Security / Risk Director | reversibility, data safety, cascading risk, compliance | **COMPOSE** brainstorm `CRO`/`CISO` seats + `critic-personas.js` risk persona |
| `growth` | Growth / Distribution Director | revenue growth, monetization, distribution | **COMPOSE** brainstorm `CGO` seat |

Additional ad-hoc specialists are sourced on demand via **COMPOSE**
`lib/brainstorm/specialist-registry.js` (`findRelevantSpecialists` / `generateSpecialistIdentity`)
when a seat emits an `EXPERTISE_GAP` marker.

## 2. Dynamic seat-selection (FR-2)

A panel is **3–5 seats**: the **3 permanent seats are always seated**, plus **0–2 rotating
specialists** selected per decision. Selection inputs and where they are read:

1. **Decision domain** — derived from the candidate (SD type / topic class via
   `preference-model.candidatePreferenceClass`). e.g. an infra/architecture SD → `architect`; a
   revenue/monetization SD → `capital` + `growth`; a UI/surface SD → `product_ux`.
2. **Roadmap wave** — **COMPOSE** `lib/integrations/okr-wave-linker.js` (`calculateAlignment` →
   per-wave `{wave_id, title, alignment_pct}`; LEO roadmap id in `rationale-bar.js`). Weighting
   rule: **foundation + `architect` lead in W0/W1; `capital` + `growth` gain weight in the revenue
   waves W2+.** (Waves are identified by title/linkage today, **not** a `wave_number` ordinal —
   **NET-NEW**: a small wave→ordinal mapping or an explicit `wave_number` is needed; flagged as
   **Q1**.)
3. **Gauge capability area** — **COMPOSE** `lib/adam/gauge-lens.js` + the application-layer VDR
   capabilities (`vdr-registry.js`: *See distance-to-quit, See distance-to-broke,
   Venture-performance read, The cockpit, A queryable structured north star, Application
   presentation-surface consolidation*). A decision touching a weak application capability seats
   `product_ux`; a weak infrastructure capability seats `architect`.

**Selection algorithm (NET-NEW, the thin Adam-domain layer):**
```
panel = [operator, intent_keeper, compounding]            # always
weights = waveWeighting(currentWave)                      # COMPOSE okr-wave-linker
rotating = rankSpecialists(decisionDomain, gaugeCapabilityArea, weights)
panel += rotating.slice(0, clamp(panelSize-3, 0, 2))      # 0-2 rotating -> total 3-5
```

## 3. Deliberate → Synthesize → Skeptic protocol (FR-3)

A multi-agent judge panel. Each phase names the module it **COMPOSE**s or is flagged **NET-NEW**.

### 3.1 Deliberate (dissent preserved, not averaged)
Each seated director independently scores + critiques the candidate(s) **from its own lens**.
- **COMPOSE** `lib/integrations/refine-score.js` (`score(items, context)` → per-persona item
  scores) for the lensed scoring rubric, and `lib/sub-agents/vetting/critic-personas.js`
  (`buildEvaluationPrompt` / `parsePersonaResponse` → `{verdict, score, rationale, change_requests}`)
  for structured critique.
- **COMPOSE** `lib/brainstorm/board-judiciary-bridge.js` (`recordBoardArgument`,
  `structured_dissent` field, round-2 rebuttals) to **persist each seat's position and dissent
  verbatim** — dissent is recorded, never averaged away.

### 3.2 Synthesize (one ranked, defensible recommendation with dissent attached)
Adam synthesizes a single ranked recommendation across the seat outputs, **attaching the preserved
dissent** rather than collapsing it.
- **COMPOSE** `board-judiciary-bridge.recordJudiciaryVerdict` (`detailedRationale` +
  `constitutionCitations`) and `recordBoardVotes` / `resolveTies` for the ranked output.
- The synthesis must surface, not bury, any seat whose verdict was `reject`/`revise` (the Operator
  vetoing on survivability, or the Intent-Keeper flagging drift, is a first-class output line).

### 3.3 Skeptic / completeness-critic pass (what did the board miss?)
A final pass asks what the whole board missed — a completeness critic, not another scorer.
- **COMPOSE** `critic-personas.js` (the risk/safety critic as the skeptic lens) +
  `specialist-registry.parseExpertiseGaps` (if the skeptic finds an unseated expertise gap, it is
  surfaced — and may seat an ad-hoc specialist for a second short round).
- Output: either "no material gap" or a concrete list of what to reconsider, attached to the
  recommendation.

## 4. Governance boundary (FR-4)

### 4.1 CONST-002 (preserved)
The board **sharpens the PROPOSAL; it does not approve.** The chairman remains the approver and
decides anything CONST-002-reserved. Adam never personally executes and **never self-approves** a
chairman-reserved decision — the board's output is always a *recommendation with dissent attached*,
routed to the chairman for consequential calls. The existing constitutional-citation auditing in
`board-judiciary-bridge.extractConstitutionalCitations` makes any CONST-NNN touch explicit in the
record.

### 4.2 When to convene vs decide solo (+ cost discipline)
| Decision class | Action |
|----------------|--------|
| Sourcing / prioritization / sequencing of real consequence (which SD next, wave ordering, a keystone vs a leaf) | **Convene the board** (3–5 seats). |
| Routine / trivial (a clear next child, a mechanical follow-up, a tie already broken by status tier) | **Adam decides solo** via the existing `selectAdvisory` scalar — no fan-out. |

**Cost discipline:** the board is multi-agent and therefore expensive — it must **not** fan out for
trivial calls. The convene test is "would the chairman want preserved dissent on this?" If
`selectAdvisory` already returns a confident, uncontested ranking (single dominant status tier, no
near-ties), decide solo. Panel size stays 3–5; ad-hoc specialists are added only on a real
`EXPERTISE_GAP`, not by default.

## 5. Non-goals (design-only boundary)

- **No** executable harness, agent code, or workflow wiring.
- **No** migration, schema change, or governed-row writes (the spec READS existing module
  signatures to ground §0–§3; it writes no data).
- **No** change to `selectAdvisory` or any existing board/brainstorm module in this SD.

## 6. Net-new vs compose summary, and follow-up (FR-5)

**COMPOSE (already in repo):** preference weights (`preference-model.js`), capability-gap lens
(`gauge-lens.js`), wave alignment (`okr-wave-linker.js`), 4-persona scoring (`refine-score.js`),
critic/skeptic personas (`critic-personas.js`), board seats + dissent + verdict persistence
(`board-seats/index.js`, `board-judiciary-bridge.js`), dynamic specialists (`specialist-registry.js`).

**NET-NEW (the build SD's actual work):** (1) the `operator` survivability lens; (2) the
Adam-domain dynamic seat-selection layer (§2 algorithm) wiring wave + gauge-capability + domain to a
3–5 seat panel; (3) a wave→ordinal mapping (Q1); (4) the glue that invokes the existing
brainstorm-board/judiciary machinery from Adam's sourcing flow (`selectAdvisory` / opportunity-scan)
instead of from brainstorm.

**Open questions for the chairman:**
- **Q1** Wave ordinals: waves are identified by title/linkage today, not a `wave_number`. Add an
  explicit ordinal, or map by title?
- **Q2** Reuse the brainstorm board seats verbatim (CSO/CRO/CTO/CISO/COO/CFO/CMO/CGO) as the
  rotating specialists, or keep the cleaner 5-specialist roster in §1.2 and map onto them?
- **Q3** Convene threshold: is "no confident uncontested `selectAdvisory` ranking" the right
  trigger, or should the chairman name specific decision classes that always convene?

**Follow-up:** after chairman sign-off, a separate **build/wire SD** (the executable board harness)
implements the NET-NEW items above and wires the composed machinery into Adam's sourcing. A durable
pointer is recorded on this SD's `metadata.followup`.
