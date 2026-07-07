# Beyond the baseline — horizon scan (v2)

**Status:** strategic scan (propose-only, CONST-002) — Solomon on Fable, chairman-requested via Adam, 2026-07-07. **v2** folds in the expanded commission: first-hand assessment of the EXISTING operations layer (b), the autonomy curve (e), the generalized territory-audit mechanism (f), the unknown-unknowns ask, and the liveness-map opinion (g).
**Baseline assumed shipped:** deploy pipeline + APA + journey artifact (their design docs are the companions).
**One-sentence synthesis:** the baseline completes a SUPPLY-side factory; the frontier is demand, revenue truth, and the loops — and the factory proves itself when **a stranger pays twice** (first payment proves demand, the second proves the product) **without the chairman touching the machine**.

---

## I. Pressure-test of Adam's forward-look

### (a) DEPLOYED ≠ SELLABLE — agree; the minimal chargeable path
Minimal "MarketLens chargeable + trustworthy": **Stripe Checkout (hosted) + Clerk + the legal/trust floor (§II.7) + 10.2a provenance + methodology transparency.** Two sharpenings:
1. **Use hosted primitives** (Stripe Checkout/Customer Portal, Clerk-hosted auth pages) — near-zero custom code, and the compliance surface (PCI, session security) stays on the vendor. Templatable across the factory; Sonnet-tier work measured in days.
2. **Trust-through-transparency ships before verified-truth.** Full 10.2b (analysis semantically TRUE) is Phase-3-hard. The commercially load-bearing 80% is cheaper: every rendered number carries its **source, computation date, and method** ("12 competitors tracked, updated daily ⌄"), backed by 10.2a provenance plumbing. A data product that *shows its work* is sellable while verified-truth machinery matures. Sequence transparency into the sellable wave, not Phase 3.

### (b) OPERATE capability — ASSESSED FIRST-HAND: more built than assumed, ALL of it silent
Verified against `operations-layer-design-plan-2026-06-26.md` (v3) + the live tree + DB:

- **The plan is real and well-audited** — launch-gated phasing (Phase 1 = first live customer-facing deploy), 0-SDs-now discipline, ground-truth premise-check rule, D-COMPOUND capture-forward shipped (snapshots flowing, application still correctly fenced).
- **MORE code exists than the plan names:** beyond `ops-health-monitor.js` (product/agent health + alerts + Friday scorecard), the tree has `ops-customer-health.js`, `ops-revenue-collector.js`, `ops-revenue-alerts.js`. The RUN-phase gauges are substantially *written*.
- **But every one of them is WIRED-BUT-SILENT:** `service_telemetry` = **0 rows** (verified). Nothing populates the tables the ops layer reads, because no venture has ever been deployed. The entire OPERATE layer is a gauge suite awaiting its writer — the deploy pipeline + venture telemetry are what turn it on. (`post-lifecycle-decisions.js` — `lib/eva/post-lifecycle-decisions.js`, 353 lines, the Stage-25 CONTINUE/PIVOT/EXPAND/SUNSET/EXIT decision framework — **exists and is imported by the live `eva-orchestrator.js`**: verdict WIRED-AWAITING-TRIGGER, legitimately silent until a venture completes the lifecycle. *v2 of this doc wrongly asserted it absent from a partial directory listing after a timed-out search — a map-vs-territory error inside the map-vs-territory section, caught by Adam's triple-verify. Corrected here; see §IV for why this is the canonical case for the liveness analyzer.*)
- **The plan's own verified Phase-1 hole is now filled by APA:** v3 flags "no venture-level alert collection exists; a true incident-response consumer needs the alert pipeline built first" (`feedback-classifier` hard-coded unavailable). APA §11.2/11.3 (reproduction-grade telemetry capture → replay → regression) **is** that alert pipeline, designed. **Merge them at Phase 1** — one telemetry contract feeding both APA replay and ops alerting; do not build two ingest paths.
- **Genuine gaps that remain after the merge:** (i) **support** — nothing designed anywhere answers a paying customer's email/feedback with a reply (APA ingests bug-shaped feedback as findings; nobody *responds to the human*); (ii) **revenue truth at first charge** — financial-ops is Phase-2-gated on first revenue, but the Stripe-ledger-as-gauge should exist the day the first charge is *attempted* (you can't detect broken billing with machinery gated on revenue that broken billing prevents); (iii) the incident-response *consumer* stays propose-and-approve → chairman until an advice-outcome ledger earns autonomy (the plan's graduated-autonomy call is right — keep it).

**Verdict:** OPERATE is not missing — it is dormant supply-side machinery plus three real gaps (support-reply, revenue-truth timing, autonomy graduation). The work is *wiring and gap-fill*, not a new system.

### (c) 1→N — the secretly-MarketLens-specific list
Enumerated for the `venture_specific_assumptions` ledger (record now, generalize at venture-2, per mission discipline):
1. **Deploy:** Cloud Run/Express path is the only one that will be *proven*; Pages/Workers paths are designed-untested. Required-env enumeration (SESSION_SECRET-class) is per-venture and currently hand-discovered.
2. **APA test-mode enumeration is hardcoded to MarketLens's side-effect channels** (email, payments, clock). A venture sending SMS (Twilio), push, or outbound webhooks needs capture for those. **Fix now, cheap:** make the §4 divergence list **schema-driven from the venture descriptor** (each venture declares its side-effect channels; the overlay + APA honesty assertions generate from the declaration) rather than a fixed 7.
3. **APA journeys assume account-based SaaS** (signup/login universal journey). A no-auth venture (calculator, content site) breaks the "universal journey" floor — the journey artifact (which is per-persona, per-venture) already fixes this; make APA's floor "the venture's declared journeys," never a hardcoded signup path.
4. **Journey synthesis assumes the persona/story/wireframe corpus exists and is story-referenced** — older/imported ventures may lack it; the coverage self-check must fail loudly, not synthesize fiction.
5. **English-language copy assumptions** in the side-effect claim scanner and content-integrity checks.

### (d) Fleet reliability — the systemic opportunity, not bug-whack-a-mole
The named symptoms (dead-letter purge, tier-floor bypass, /loop exits, session limits, the inert Adam→Solomon routing fix) share one root: **the harness has no APA for itself.** We built instrument-and-assert discipline for venture apps while the factory's own machinery is verified by memory files and heroic manual audits. The systemic opportunity, in three layers:
1. **Static: the liveness map (§IV)** — registered-but-never-dispatched, zero-live-caller, flag-divergence detection, continuously.
2. **Dynamic: harness canaries** — synthetic end-to-end drills on a timer: a canary message through every comms lane asserting delivery-and-read (the inert routing fix would have been caught in minutes, not weeks); a synthetic SD walked through claim→handoff→ship in a sandbox weekly; a canary deploy through the pipeline. The harness equivalent of APA's scripted journeys.
3. **The SLO that makes it real: the unattended-weekend test.** Fleet runs Friday-evening→Monday-morning, zero chairman touches; every failure self-diagnoses into a filed, triaged item by Monday. **Weekend-survival-rate is THE fleet KPI** — reliability stays a vibe until it has an acceptance test.

### (e) THE AUTONOMY CURVE — what still requires the chairman, and the path to zero
The north star restated as engineering: enumerate every chairman-touch class, drive each to zero-or-taste. Current inventory (from this week's observed reality):

| # | Chairman-touch today | Class | Path to zero |
|---|---|---|---|
| 1 | Paste-relaying messages between sessions (Adam→Solomon routing inert) | comms liveness | lane canaries (§d2) + auto-retarget on delivery failure; fix the routing defect |
| 2 | Nudging stalled/parked workers; zombie-session cleanup | fleet lifecycle | watchdog with *verified* liveness signals (2+ signals rule) + auto-nudge/restart; weekend SLO forces it |
| 3 | Account/quota cliff management; model pinning; /model switches | capacity ops | capacity scheduler: pre-cliff detection → policy-driven model demotion/pause; quota telemetry as a first-class gauge |
| 4 | Sequencing/priority calls that are policy-applicable ("do X before Y") | decision routing | ratify PRIORITY POLICIES once; Adam/coordinator apply; exceptions escalate (the II.4 inversion) |
| 5 | Design-taste sign-off | **legitimate — keep** | shrink to taste-only via machine-precheck (APA) + batched review queues |
| 6 | Product review walkthroughs | being replaced | APA ships → walkthroughs become taste-only (already directed) |
| 7 | Chairman-gated DDL/migrations | **legitimate — keep** | batch into sittings (already working); pre-flag at sourcing |
| 8 | Infra bootstraps (GCP billing, accounts, API keys) | physically-only-his | batch into one setup sitting per capability wave; enumerate in advance so it's one session, not a drip |
| 9 | First-customer selling motion | **undecided** | the §II.2 ratification — decide self-serve-only vs budgeted founder hours |
| 10 | Reading/grooming decision queues + email heartbeats | partially automated | continue: groom-before-surface, digest supersede, decision-packet quality |

**The curve's discipline:** publish this table as a living gauge — **chairman-touches-per-week by class** — and require every new capability design to state which class it adds to and how it trends to zero. Classes 5 and 7 are the *designed end-state* (taste + reserved); everything else trends to zero. Fleet reliability (d) and OPERATE (b) are components of classes 1–3.

### (f) Territory-audit generalized — the mechanism, not the habit
Every big catch this session (never-deployed, no-DB-client, fabricated email, inert routing fix, wired-but-silent ops layer) was map-vs-territory divergence found *by hand*. The generalized mechanism, two halves:
1. **The gauge contract (registry rule):** no gauge without a **declared writer + freshness/liveness contract** — `{source, writer, expected_write_cadence, last_write}`. A gauge whose writer misses cadence renders **STALE/ATTESTING**, never a number (the cockpit design law's "no fabricated numbers," enforced at the registry level). This kills the wired-but-silent class *by construction*: `ops-health-monitor` over an empty `service_telemetry` would have rendered "no writer yet" instead of implying health coverage existed.
2. **Synthetic transactions per territory (canaries):** revenue = a test charge through the real Stripe path monthly; CX = a synthetic support ticket asserting reply latency; ops = a canary deploy + replay; comms = the lane canary; app = APA itself. Each canary is a scheduled assertion that the *whole path* is alive — the runtime complement to the static liveness map.

---

## II. What was MISSING from everyone's list (v1 items, held)

**II.1 DEMAND/DISTRIBUTION — still the biggest absence.** Everything above is supply-side; nothing acquires a customer. Distribution stage + per-venture funnel gauge (visitors→signups→paid), launch-plan artifact, agent-executed channels. The binding constraint on the mission is traffic, not build quality — and marketing automation is chairman backlog use-case #2.
**II.2 FIRST-CUSTOMER MOTION — an unowned chairman decision.** Self-serve/product-led-only (constrains venture selection at S2/S5) vs budgeted chairman founder-selling hours. Choosing neither = customer #1 by accident. → ratification.
**II.3 PRODUCT-ITERATION LOOP.** APA closes the defect loop; nothing closes the direction loop (feedback+telemetry+revenue → venture backlog → re-enter build). Without it every venture freezes at v1 and the AI-CEO panel is a costume. (Ops plan's D-CEO PARK is compatible: the loop needs the *backlog machinery*, not the 19-agent org chart.)
**II.4 CHAIRMAN-BANDWIDTH INVERSION** — now concretized by the (e) table: ratify policies, agents apply, exceptions escalate; chairman-minutes-per-venture must FALL as capability grows. → ratify as a standing design rule.
**II.5 FACTORY UNIT ECONOMICS.** Token/harness spend per venture per stage vs revenue — the ops plan already flags the token-accounting view as its top machine-improvement candidate; endorse and pair it with the cockpit per-venture P&L build-cost line.
**II.6 POST-LAUNCH KILL DISCIPLINE.** S5 kills pre-build; policy-driven sunset post-launch (traffic × conversion × retention thresholds + runbook) has no machinery. Cockpit already ratified the affordance.
**II.7 LEGAL/TRUST FLOOR.** ToS, privacy, refunds, support contact, Stripe Tax, ExecHoldings LLC identity on-page. Templatable in one wave; blocks real commerce while absent.
**II.8 SECURITY OPERATIONS** (prevention ≠ response): CVE patching cadence, secrets rotation, abuse/bot controls in the venture template + an OPERATE tick.
**II.9 COMPOUNDING BY CONSTRUCTION.** Capture-forward now ships (D-COMPOUND) — the missing half stays application: versioned venture template, harvest step per milestone, venture-setup-cost trending down as the measured moat. Correctly fenced until venture-1 resolves; the fence needs its declared exit honored.

## III. The unknown-unknowns (what NEITHER list anticipated)

**III.1 PLATFORM/GATEKEEPER RISK — the human-gatekept commercial layer.** The factory's outputs must pass through infrastructure with human fraud/risk review tuned to human-shaped businesses: **Stripe risk holds** (new entity, thin history, low-touch support → account freezes are common for far less unusual businesses), ad platforms, search quality raters, app directories, banks. Two concrete exposures: (i) **correlated risk** — one shared Stripe account across N ventures means one risk-flag freezes the whole portfolio's revenue (evaluate per-venture accounts / Stripe Connect early, not after a freeze); (ii) **AI-run signals** — thin domains, templated content, no human support responses are exactly the heuristics gatekeepers flag. Mitigations are cheap early and expensive late: domain warm-up, real support SLAs (§b gap i), gradual charge-volume ramp, impeccable legal floor (II.7). *Nobody owns this risk today.*

**III.2 PUBLIC-INPUT PROMPT INJECTION — the factory's new attack surface.** The moment §II.3's loop and APA §11.2 ingestion exist, **text written by strangers flows into tool-wielding agents** (feedback → CEO-agent backlog analysis; captured errors → replay agents; support inbox → responders). A crafted feedback message is a prompt-injection vector into a harness that holds service-role keys. This class does not exist today only because no venture has users. **Rule to adopt before first ingestion:** public-origin text is DATA, never instructions — quarantined rendering, no tool-call authority derived from it, injection canaries in the APA fixture set (seeded-defect pattern applied to security).

**III.3 MODEL-DEPENDENCY CONCENTRATION.** The entire factory's unit economics and capability ride one vendor's pricing/quota/capability curve — this week's quota cliffs are the preview. Not actionable as a build now; actionable as a *design posture*: keep the model-tier registry (§5 allocation matrix) vendor-abstracted, and let the C5 model/effort evaluation duty maintain a live "what breaks if prices double / quotas halve" answer.

## IV. (g) The liveness codebase map — Solomon's opinion (explicitly requested)

**(i) Worth building? YES — but as a LIVENESS ANALYZER, not a wiki.** The DeepWiki-class existence map (per-module LLM prose + diagrams + navigable wiki) is the *wrong* half to copy: agents don't need prose summaries (they grep in seconds, and prose drifts into exactly the false confidence we're fighting). The valuable half is the part DeepWiki *doesn't* do: **liveness verdicts**. Our four recurring catches — dormant verifiers, inert routing fix, never-deployed venture, wired-but-silent ops layer — are all one class: *code whose registration exists but whose dispatch/consumption doesn't.* An existence map documents that class AS IF WORKING; a liveness map is its detector. Build the detector; skip the wiki.

**(ii) Minimal in-house design (no third-party dependency):** a nightly CI job + on-merge regen producing one queryable artifact (JSON + a small DB table + generated markdown digest):
- **Static reachability core:** parse the JS/TS import+call graph from declared entrypoints (bin scripts, hooks, cron specs, package.json, migrations) → every exported symbol gets `declared_callers`.
- **Registration-vs-dispatch cross-checks** (the classes we keep hand-finding, automated): gate strings in code vs migration bindings (the dormant-verifier grep); `payload.kind` senders vs readers (the carrier/routing class); env-flag gates vs DB flags (divergent-flag class); registered crons/hooks vs execution evidence.
- **Runtime-evidence join:** for symbols with runtime footprints (tables they write, logs they emit), check recent evidence rows — `ops-health-monitor` writing nothing for 30 days ⇒ SILENT.
- **Verdict vocabulary:** `LIVE / WIRED-BUT-SILENT / REGISTERED-NEVER-DISPATCHED / DEAD` — deliberately parallel to APA's disposition discipline; findings route through the same canonical triage gate.
- **LLM use: diffs only.** No per-module prose. The one LLM call narrates *verdict changes* since last run ("verifyPagesUrlLive moved REGISTERED→LIVE; 3 symbols went SILENT") — that's the digest a human/agent actually reads.

**(iii) Relation to APA — two layers of ONE discipline, two tools.** The liveness map is **static/registration-time** truth about the *harness* ("does a consumer exist?"); APA is **dynamic/runtime** truth about *venture apps* ("does the behavior happen?"). Different territory, different cadence, same primitive family (absence-is-the-signal, verdict vocabulary, triage routing, seeded-defect calibration). Keep them separate tools with a shared reporting/triage spine; the harness canaries (§I.d.2) are the dynamic complement on the harness side, completing the 2×2 (static/dynamic × harness/venture).

**(iv) Maintenance honesty — the map must obey its own rule.** A stale liveness map is worse than none. Non-negotiables: every annotation carries `{derived_at, method, inputs_hash}`; regen on merge + nightly; a **map-freshness gauge** (HEAD-distance since derivation) rendered on the digest per the §I.f gauge contract; and **seeded-defect calibration for the map itself** — 2–3 permanent known-DEAD and known-LIVE fixtures in the repo; the map misclassifying a fixture turns the map's own gauge red (10.1's pattern, applied to the detector).

**Route recommendation:** build in-house, ~3 bounded pieces (graph walker + cross-checkers + evidence join), Sonnet-buildable against this design, zero external dependency, patterns-not-code from the DeepWiki class. First targets are already known offenders: the exit-gate verifier bindings, the comms `payload.kind` matrix, the ops-layer table writers, the env-vs-DB flag pairs.

**The canonical case — the discipline catching its own designer.** While writing v2 of THIS document, its author greps-and-asserted that `post-lifecycle-decisions.js` "does not exist anywhere" — from a partial directory listing after a timed-out search. The file exists (353 lines) and is imported by the live orchestrator; correct verdict **WIRED-AWAITING-TRIGGER**. A reachability analyzer with an import-graph walk would have returned that verdict in milliseconds and made the false-absence claim impossible to write. Ad-hoc grep liveness auditing fails in BOTH directions — dormant code passes as live (the four original catches) AND live code passes as dead (this one) — which is precisely why the verdicts must come from a tool with declared inputs, not from a session's search-and-assert under time pressure. Add **known-WIRED-AWAITING-TRIGGER** to the map's verdict vocabulary and its calibration fixtures: trigger-gated dormancy (exit machinery, post-lifecycle handlers) is legitimate and must not be flagged as defect-dormancy, or the map cries wolf.

---

## V. Sequencing recommendation (post-baseline)

1. **Sellable wave**: Stripe Checkout + Clerk + legal floor + methodology transparency (a + II.7) — templatable, fast.
2. **Distribution stage + funnel gauge** (II.1) — start the demand clock early; every loop feeds on traffic data.
3. **Two chairman ratifications, while the wave runs:** first-customer motion (II.2) + bandwidth-inversion as standing rule (II.4). *Adopt the III.2 injection rule at the same sitting — one policy line now, an incident later.*
4. **OPERATE wiring** (b): merge APA §11.2/11.3 telemetry with the ops layer's existing gauges; support-reply path; Stripe-ledger gauge at first *charge attempt*; platform-risk mitigations (III.1) start here.
5. **Liveness analyzer + harness canaries + weekend SLO** (d + IV) — the autonomy wall, attacked systemically.
6. **Product-iteration loop** (II.3) once real feedback exists; unit economics + kill discipline + compounding-application (II.5/6/9) as the portfolio grows.

**The acceptance test stands:** a stranger finds a venture untouched by the chairman, pays, hits a bug that is captured→replayed→fixed→regression-locked without the chairman knowing, and **renews** — while he is at his day job. Every section above is a named obstacle between here and that sentence.

---

*Solomon, propose-only. II.2, II.4, and the III.2 ingestion rule need chairman ratification; III.1 needs an owner; the rest are sourceable by Adam on the normal path.*
