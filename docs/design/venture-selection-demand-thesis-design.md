# Venture Selection & Demand-Thesis Adjudication — permanent stage design + MarketLens case #1

**Status:** design proposal (propose-only, CONST-002) — Solomon on Fable, chairman-directed (systemic + tactical in one), 2026-07-07.
**Tier discipline note:** per the Fable doctrine (§4 prep condition), ALL evidence below was gathered by a cheaper (Sonnet) agent — Solomon adjudicated the packet, did zero legwork. This split is now the standing Solomon practice (§4.4).
**Companions:** `fable-use-case-doctrine.md` (why this is Fable work: R1+R2+R3), `beyond-baseline-horizon.md` (demand = the binding constraint).

---

## 0. The systemic finding — DEFLATED on correction (chairman + Adam verified, 2026-07-07)

**v1 of this section over-claimed.** It read the packet's five gate fires (stages 3/5/17/18/23, challenge/fail verdicts, `proceeded:true` each time) as proof of a fail-open advisory-gate defect and made "flip the gate binding" the SD's first child. Two independent corrections deflated it:

1. **Chairman (data):** those five fires were **formula-tuning noise on venture #1** — MarketLens predates the gate being calibrated, so its gate history is a contaminated test case, not a record of real demand verdicts being ignored.
2. **Adam (mechanism, code-checked):** the S5 kill-gate (`stage-05-financial-model.js` `evaluateKillGate()`) is **not naive fail-open** — it computes a real `blockProgression` flag plus a 3-way pass/conditional_pass/kill decision. Designed to block.

Neither the data nor the mechanism supports a fail-open defect. **The one clean, uncontaminated residual question:** is `blockProgression` **ENFORCED end-to-end** — does the orchestrator actually HALT on `blockProgression:true`, or is the flag computed-but-ignored? That is a one-shot code check, and it is what Child A now is (§8).

*Correction note, kept inline deliberately: this was the second same-day instance of a strong systemic conclusion drawn from thin/contaminated evidence (see the post-lifecycle false-absence). Both were caught by the grounding discipline this stage itself prescribes — noisy evidence makes even good reasoning land wrong, which is the strongest argument for the E0–E3 evidence ladder below applying to OUR OWN findings, not just venture theses.*

## 1. The demand-thesis artifact (falsifiable, first-class, registry-registered)

`truth_demand_thesis` — one per venture, written at S2, versioned, in the unified registry (generator-writes + gate-reads). Six claims, each **falsifiable** and each carrying its own evidence grade:

| Claim | Must state | Falsified by |
|---|---|---|
| **WHO** | ONE specific buyer persona with budget authority (segment, role, deal size) | persona can't be found/reached in channel tests |
| **PAIN** | the problem + why it's urgent enough to pay for **now** | targets acknowledge but won't prioritize |
| **ALTERNATIVES** | what they do today (incl. free/DIY/LLM-DIY) and why they'd switch | the free alternative is good enough |
| **CHANNEL** | a reachable path to the first 100 relevant strangers + cost hypothesis | probe CPL/reply-rate beyond bound |
| **WTP** | price point + the evidence anchoring it | probe conversion at price ≈ 0 |
| **KILL CRITERIA** | decided IN ADVANCE: the probe results that mean pivot/kill | (this row is what makes the rest honest) |

**Coherence rules (deterministic, free):** one persona per thesis (contradictory dual-market rows = automatic FAIL — see case #1); revenue projections must fit inside the thesis's own SOM; one pricing scheme (divergent pricing artifacts without a reconciliation record = FAIL). These three checks alone would have flagged MarketLens.

**Rule 4 — the persona↔pricing JOIN check (new defect class, Adam-evidenced + chairman-ratified 2026-07-07):** distinct from single-artifact contradiction — each artifact can be internally fine and the *reconciliation between them* still missing. **Bidirectional mapping required: every pricing tier maps to a named persona, AND every named persona maps to a tier.** An unfilled tier (a tier whose `target_segment` names no real persona) or an unpriced persona = **`COHERENCE_JOIN_GAP`**. Ground-truth case: MarketLens's Stage-7 Explorer free tier exists with generic `target_segment` ("prospective users exploring") while Stage-10 personas + Stage-12 GTM are consultant-only — the chairman's intended occupant of that tier (the indie-builder / Lovable-Replit segment) was never named by the persona work, and pricing never asked who fills its entry slot. Generalization: the JOIN check runs across ALL registry artifact pairs that share a key dimension (persona×tier first; persona×channel and tier×revenue-model are the next candidates). Durable capture: feedback `23599cbf` — rides the next fresh-run baseline, no mid-flight retrofit.

## 2. The evidence-grade ladder (the heart of the gate)

- **E0 — Generated plausibility.** LLM/agent-authored claims with no external referent. *This is what ~all current venture artifacts are* (the S5 gate itself said: "0 facts, 3 assumptions, 4 simulations").
- **E1 — Corroborated secondary.** Claims verified against external referents that exist independently: competitor pricing pages, search-volume data, community complaint threads, market reports. (The referent-audit discipline applied to the market.)
- **E2 — First-party behavioral.** Real strangers acted: landing-page signups, waitlist joins, ad CTR, cold-outreach reply rates, demo requests.
- **E3 — Money.** Preorders, paid pilots, LOIs, first invoices.

**Binding rules:**
- **S2 gate (thesis adjudication):** thesis exists, coherent (§1 rules), every claim ≥ E1 or explicitly tagged `E0-assumption` with a probe plan. Verdict: PASS / REVISE / KILL — **fail-closed** (a REVISE blocks stage advance until re-adjudicated).
- **S5 gate (pre-build):** all six claims ≥ E1, kill criteria ratified, an **E2 probe plan** (budget-boxed, ≤2 weeks, ≤$bounded) exists. Consumes the existing kill-gate machinery (`system_devils_advocate_review`, demand-feasibility) — **and flips it from advisory to binding**: `blockProgression=true` blocks; a chairman override is an explicit recorded decision, never a silent `proceeded:true`.
- **Venture-specific heavy spend** (distribution wave, sellable wave beyond template work, paid channels): gated on **E2 actual** — real strangers behaved as the thesis predicted.
- **Factory-capability spend** (deploy pipeline, APA, templates — reusable across ventures) is **NOT gated** on the venture's demand grade: it's factory investment carried by the flagship, not venture investment. This distinction is what makes case #1's verdict coherent.

## 3. Where it binds + re-adjudication triggers

- **S2:** thesis authored (Sonnet drafts from the corpus + external evidence) → **adversarially adjudicated** (Fable-tier, §4).
- **S5:** the binding kill-gate (existing machinery, made fail-closed).
- **Re-adjudication triggers:** before each major venture-specific spend wave; on E2 results landing; on competitor/market events; on any coherence-rule violation appearing in later artifacts.
- The thesis grade renders in the cockpit per venture (gauge contract: declared writer = the probe pipeline; stale evidence renders STALE, not a number).

## 4. The adjudication protocol

1. **Author ≠ adjudicator.** The thesis is drafted by the venture pipeline (Sonnet); adjudicated by a separate high-tier session (Solomon/Fable-class) with an explicitly adversarial stance: *"try to kill it."* (Anti-Goodhart: the pipeline that wants to build cannot grade its own reason to build.)
2. **Verdict object** = the Solomon output contract: verdict + why + **counterfactual** (what evidence would flip it) + next probes + confidence.
3. **Outcome ledger:** every adjudication verdict is scored later against reality (probe results, revenue, kill) — adjudicator calibration is measured, not assumed.
4. **Evidence-packet discipline (standing Solomon practice, chairman-ratified 2026-07-07):** cheaper agents GATHER (structured packet, citations, explicit NOT-FOUND/COULD-NOT-VERIFY entries — never absence-from-failed-search); the Fable-tier adjudicator reads the packet cold and judges. Fable never does its own legwork. Case #1 below ran exactly this way (Sonnet agent, 23 tool calls, ~110k tokens; Solomon consumed the packet).

## 5. CASE #1 — MarketLens adjudication (run now, on the gathered packet)

**VERDICT: CONDITIONAL-CONTINUE (thesis-unproven, E0-grade) — with three mandatory repairs and E2 probes gating all venture-specific spend.** Not KILL, not clean PASS.

**The case against (all first-hand from the packet):**
1. **Persona incoherence:** the venture row simultaneously targets "consultants/fractional-CMOs/small agencies" AND "property developers and real estate firms." Two different businesses. §1 coherence rule: automatic FAIL until resolved.
2. **The venture's own artifacts don't believe it** *(weight reduced per the §0 correction — these scores are from the formula-tuning era and are contaminated as verdicts; kept as color, the verdict rests on items 1/3/4/5/6):* AI critique scored 45; validation decision said REVISE, momentum 37; the S5 gate found "0 facts, 3 assumptions, 4 simulations."
3. **SOM incoherence:** the GTM artifact's SOM is **$25K** while the Year-1 revenue projection is **$35,820** — the plan projects exceeding its own obtainable market in year one. Either the SOM is wrong or the plan is.
4. **Pricing incoherence:** chairman-ratified seed pricing ($449/**mo** consultant-primary, web-anchored) vs the venture's own `engine_pricing_model` (freemium, $399/**yr**) — an order-of-magnitude divergence with no reconciliation artifact.
5. **Competitive shallowness:** ONE competitor named (HubSpot's **free** persona generator, threat "L") — in a crowded persona/market-intelligence category, with the free alternative acknowledged but unweighed against premium pricing. The devils-advocate's deeper point stands: "no proof competitors couldn't replicate with public data plus LLMs."
6. **Zero E2/E3:** never deployed, no waitlist, no signups, no external human has ever seen it. Grade: **E0 throughout** (E1 partial at best, via the pricing web-anchor on the seed).

**The case for continue (why not KILL):**
1. **The thesis is unproven, not disproven.** Zero external contact means zero falsifying evidence too. The chairman-originated pain hypothesis ("builders and sellers don't know who their real buyer is or what they'll pay") is a genuine, testable hypothesis that has never actually been tested.
2. **The flagship's primary role is proving the FACTORY.** Deploy pipeline, APA, journey artifact, templates — all reusable factory capital regardless of MarketLens's market fate (§2 spend distinction). That spend is not "poured into a venture nobody wants"; it's poured into the machine, with MarketLens as the test article.
3. **The three incoherences are decision-fixable this week** (pick the persona, reconcile pricing to the chairman-ratified scheme, redo SOM honestly) — they are authoring defects, not market verdicts.

**Mandatory repairs (before the sellable wave):** (R1) **RESOLVED as a defect, not a chairman decision** (Adam ground-truth trace + chairman ratification, 2026-07-07): the artifacts are consultant-only, "property-developers" was clone-drift, and the chairman's real intent adds the **indie-builder / Lovable-Replit segment as the occupant of the EXISTING Explorer free/free-trial tier** (a builder sensing what the market pays = MarketLens's own WTP function turned on its own user — a coherent entry motion). The fix is the §1 Rule-4 JOIN repair: name the builder persona, bind it to the Explorer tier — riding the next fresh-run baseline per feedback `23599cbf`, no mid-flight retrofit. (R2) reconcile pricing to one scheme with lineage to the chairman-ratified anchor (the $449/mo-vs-$399/yr divergence stands as its own repair); (R3) an honest SOM from the reconciled persona set.
**E2 probe plan (gates distribution + paid spend):** landing page + waitlist + ~50-target cold-outreach against the chosen persona, 2 weeks, budget-boxed; kill criteria set IN ADVANCE at ratification (e.g., "if signup conversion < X% and reply rate < Y%, pivot persona or kill"). The deploy Child A work makes this probe nearly free to host — the factory and the probe converge.
**Counterfactual (what flips this to KILL):** the probe failing its pre-set criteria; or the persona decision revealing the pain is real but the buyer won't self-serve (which kills the stage-zero solution shape, not just the marketing).

## 6. Distribution-stage shape (a validated thesis still needs traffic)

Per-venture, downstream of an E2-passing thesis:
1. **Launch-plan artifact** (registry-registered): ranked channel experiments derived from the thesis's CHANNEL claim, each budget-boxed with a cost-to-signal bound (SEO/content, directories, community, X/HN/PH launch, outreach; paid only post-E2).
2. **Funnel gauge** with declared writers (visitors → signups → activation → paid), per the gauge contract — no funnel number without an instrumented writer; "no data yet" renders as such.
3. **Probe execution = cheap-model work** (T1/T2): channel copy variants, outreach sequencing, directory submissions. **Fable touches distribution once per venture:** the positioning/narrative pass (R3 taste) — cheap tiers produce generic-SaaS mush exactly where distinctiveness pays.
4. **Evidence feedback:** probe results write E2 evidence back onto the thesis (the thesis is the accumulator), which re-triggers adjudication (§3).

## 7. The idea-generation audit (the input nobody checks)

**Verified mechanism** (`lib/eva/stage-zero/path-router.js`): four entry paths — competitor teardown, blueprint browse, **discovery mode** (LLM research strategies from `discovery_strategies`), seeded-from-venture — with chairman review as the gate. So: **primarily solution-led LLM generation, gated by chairman taste.**

**Findings:**
1. **Solution-led LLM ideation converges on saturated generic-SaaS shapes** — the same distinctiveness problem the design pipeline had, at the idea layer. MarketLens's shallow competitive artifact is the downstream symptom: the generator proposes what the training distribution over-represents.
2. **Provenance thins under cloning:** MarketLens's own origin_metadata is null; its alternatives-considered record doesn't exist even on the seed (stage-0 intake artifact NOT FOUND). Ideas should carry durable provenance (path, alternatives considered, why-this-one) — currently they don't survive the reseed.
3. **Recommendations (propose-only):** (a) add **demand-led discovery strategies** as first-class peers of the LLM strategies — complaint mining (communities/reviews/forums), search-demand data, "budget-line" scanning (what do these personas already pay for?) — so ideas *enter* with E1 evidence attached instead of acquiring it retroactively; (b) mandatory **idea-provenance record** surviving clones (path, alternatives, evidence grade at entry); (c) a **portfolio diversity check** at selection (n ideas from the same generator converge; the selector should see and penalize crowding).

## 8. SD shape (Adam authors; suggested)

**Parent `SD-LEO-INFRA-DEMAND-THESIS-GATE-001`:**
- **Child A — VERIFY blockProgression enforcement end-to-end** (rescoped per the §0 correction): the gate *computes* the block (Adam-verified); Child A answers the one clean residual — does the orchestrator HALT on `blockProgression:true`, or is it computed-but-ignored? If enforced: document + add a regression fixture, done. If ignored: wire the enforcement (and overrides become recorded chairman decisions, never silent). One-shot code check first, build only what the check proves missing. *Sequencing: still FIRST — cheap either way, and it settles what everything else assumes.*
- **Child B — `truth_demand_thesis` artifact + coherence rules** (deterministic checks + schema; Sonnet).
- **Child C — adjudication protocol wiring** (S2/S5 rungs, evidence-packet pipeline, outcome ledger).
- **Child D — E2 probe kit** (landing/waitlist/outreach templates + funnel gauge; rides deploy Child A).
- **Child E — demand-led discovery strategies + idea provenance** (§7).
- **MarketLens repairs (R1–R3) + probe plan:** venture-scoped items, not children of this SD — route through the venture's own lane on chairman ratification of the case-#1 verdict.

---

*Solomon, propose-only. The case-#1 verdict (CONDITIONAL-CONTINUE + repairs + probe gate) and the persona decision need chairman ratification; the §0 binding-gate flip is the single highest-leverage child and should not wait for the rest.*
