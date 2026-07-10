# Fresh-Run Demand-Thesis Adjudication + Pre-Mortem

**Status:** adjudication (propose-only, CONST-002) — Solomon on Fable, chairman-directed commission #1, 2026-07-07. Evidence: one Sonnet gather-packet (repair state, seed mechanism, frozen seed thesis, ratification records, unified-thesis search), adjudicated cold.
**Question:** is the reconciled MarketLens demand thesis sound enough to regenerate 26 stages on?

---

## 1. VERDICT: **NOT SEED-READY — one authoring step short, two mechanical hazards live.**

The surprise in the evidence: **the thesis itself is the soundest object in the system — and it's the OLD one.** The frozen seed venture (`849cd2bd`, "Market Modeling SaaS", `metadata.stage_zero`, chairman-ratified 2026-06-25) ALREADY carries the dual-segment reconciliation this week's repairs were reaching for:
- `target_market`: `primary_recurring_payer: "consultants / fractional-CMOs / small agencies"` + `secondary_self_serve_volume: "indie / no-code app builders (Lovable/Replit/Cursor/Bolt)"` — **the builder segment was ratified two weeks before we "discovered" it missing.**
- `pricing.tiers`: consultant **$449/mo (PRIMARY)**, builder **$49/mo**, agency $999/mo, free single-persona teaser — chairman-revised at the S7 review gate.

**Reframe:** the week's three incoherences were not thesis gaps — they were **GENERATION DRIFT from an already-ratified thesis.** The MarketLens run's Stage-7 invented freemium $399/**yr**/$1799/yr (ignoring ratified $449/**mo**), Stage-10/12 dropped the ratified builder segment entirely, and the venture row acquired "property developers and real estate firms" from clone-noise. The pipeline was unfaithful to its own ratified seed.

**Why NOT seed-ready despite a sound thesis — three blockers:**

**B1 — No unified seedable thesis object exists (verified).** `truth_demand_thesis` artifacts: 0 rows. No chairman-decision record ties the reconciliation together. It lives scattered: the ratified-but-stale seed `stage_zero` (untouched since 06-30), feedback `23599cbf` (status=backlog, the JOIN directive), and design docs. The seed `stage_zero` also **lacks the SOM repair entirely** (no SOM field) — Stage-12 regenerated a $25K SOM fiction last time and, unconstrained, will regenerate another.

**B2 — Contamination propagates through the reseed mechanism (mechanical, certain if unfixed).** `venture-reseeding.js` reads ONLY the source venture's durable columns — and `ecbba50e`'s `problem_statement`/`description` carry the **property-developer contamination**. Worse: the stage-zero orchestrator writes the new venture's `raw_chairman_intent := suggested_problem` — so a reseed **from ecbba50e** would stamp the property-developer text as the new venture's *chairman intent*, **falsifying chairman provenance**. A clean clone MUST source from `849cd2bd` (clean) or repair `ecbba50e.problem_statement` first.

**B3 — The drift mechanism is unfixed (fix-shipped-symptom-recurs class).** Regenerating 26 stages with the same generators that drifted last time, without any fidelity check, reproduces the drift. The §1 coherence rules + Rule-4 JOIN (venture-selection design) are exactly that check — but they are designs, not shipped code.

## 2. Preconditions (must land BEFORE the run — all small)

- **P1 — Author `truth_demand_thesis` (the one authoring step):** one object from ratified seed `stage_zero` + the 23599cbf JOIN fix (builder segment → Explorer/entry tier, named) + an **honest SOM derived from the dual-segment WHO** + the falsifiable differentiation claim (see PM1). Sonnet drafts from this doc + the schema; adjudication is substantially pre-done here. Seed it into `stage_zero` (or as the run's first artifact) so §S3's mechanism actually carries it.
- **P2 — Source hygiene:** clone from `849cd2bd`, or repair `ecbba50e.problem_statement` first. Never reseed from the contaminated columns (provenance-falsification hazard, B2).
- **P3 — Minimum fidelity gate:** at least a **one-shot post-S7/S10/S12 coherence check** against the thesis (rules 1–4: one-persona-set, revenue≤SOM, one-pricing-scheme, persona×tier JOIN) with block-on-violation — a script or even a mandated manual check; the full binding-gate SD can follow. Without P3, the run re-manufactures the drift it exists to fix.
- **P4 — The venture-pick flag (answered):** clean-clone vs MarketLens-continue does NOT change the adjudication — **either way P1 is required**; clean-clone **additionally** requires P2. The pick changes which mechanical hazard is live, not whether the thesis is ready.

## 3. PRE-MORTEM — assume the regenerated venture failed; ranked silent root causes (blast × likelihood)

| # | Silent root cause | Blast × Likelihood | Mitigation BEFORE the run |
|---|---|---|---|
| **PM1** | **ALTERNATIVES unrefuted: DIY-LLM is good enough.** A consultant prompts their own LLM for personas/WTP bands at ~$0. The venture's own competitive artifact concedes "no data moat"; the S3 devils-advocate said competitors could replicate "with public data plus LLMs" — never answered. This attacks the reason-to-exist; every regenerated artifact inherits it. | TOTAL × HIGH | P1's thesis must state the differentiation **falsifiably** (what MarketLens does that the buyer's own LLM session cannot — e.g. proprietary WTP data, calibration, longitudinal tracking) with ≥E1 evidence. **If it cannot be stated, pivot BEFORE regenerating 26 stages, not after.** This is the single highest-value hour of the whole fresh run. |
| **PM2** | **Dual-segment spine inversion.** If builders (free/$49 tier) are the real market and consultants the LLM-plausible fiction — or vice versa — every artifact organizes around the wrong primary (journeys, landing, copy, pricing pages). | HUGE × UNKNOWN | The E2 probe runs **both segments' landing variants in parallel** (the 5.5.1 message-test protocol); primary is confirmed by measured signal, and the run's persona-locked artifacts carry a re-adjudication trigger on probe results. Cheap insurance against an unknowable. |
| **PM3** | **Self-serve × $449/mo motion mismatch.** The PRIMARY payer at $449/mo via credit-card self-serve, no human contact, is an untested pairing (B2B at that price usually wants a demo). Interacts with the Motion policy (engine D4). | HIGH × MED-HIGH | Probe includes a price-anchored CTA test on the consultant variant; Motion policy ratified before the sellable wave; if self-serve fails at $449, the fallback is Motion C (agent-assisted outbound), not silence. |
| **PM4** | **PAIN urgency unfounded** ("why now" — acknowledged pain that never gets prioritized). Pure E0 today. | KILL-LEVEL × UNKNOWN | Outreach reply-rate IS the direct test; kill criteria pre-set at probe ratification (per the demand-thesis design §5). |
| **PM5** | **Consultant channel unreachable.** Builders are reachable (build-in-public/X — the existing adapter); consultants' channel (LinkedIn/communities/referral) is unnamed and untested, and the engine's current rail doesn't cover it. | REVENUE-TIMING × MED | The D1 channel plan must name ONE consultant-reachable channel with a cost-to-signal bound before the probe; if none can be named, that's a thesis CHANNEL-claim failure surfacing early (good). |
| **PM6** | **WTP anchor fiction.** "$500 competitor avg" is anchored on tools that may not be the buyer's real alternative; if the real alternative is DIY-LLM (~$0), the anchor is decorative. | MED (folds into PM1) | Re-derive the anchor against the true alternative set in P1. |

*(PM0 — the mechanical certainties B2/B3 — are preconditions above, not probabilistic items.)*

## 4. Summary for the chairman

The thesis you ratified on June 25 was right, including the builder segment everyone rediscovered this week. The pipeline drifted from it, and nothing caught the drift. **Do not regenerate until: (P1) the ratified thesis + JOIN fix + honest SOM + a falsifiable differentiation claim exist as ONE seedable object; (P2) the run seeds from clean source columns; (P3) a minimum fidelity check guards S7/S10/S12 against re-drift.** The pre-mortem's top item (PM1: "why not just use ChatGPT?") is the question the whole venture must answer in writing before it earns 26 regenerated stages.

---

*Solomon, propose-only. P1–P3 are small (Sonnet + one-shot checks); PM1's differentiation claim likely needs the chairman's own judgment on what the moat genuinely is.*
