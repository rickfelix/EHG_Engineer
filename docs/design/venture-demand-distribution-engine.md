# Venture Demand/Distribution Engine — design

**Status:** design proposal (propose-only, CONST-002) — Solomon on Fable, chairman-directed via Adam commission, 2026-07-07. Evidence gathered by two Sonnet agents (cited packets, explicit NOT-FOUNDs); Solomon adjudicated cold, zero legwork.
**The commission:** close the factory's declared big miss (`beyond-baseline-horizon.md` II.1 — everything is supply-side; nothing acquires a customer). Fable-tier per doctrine R1 (every future GTM rides this) + R2 (the absent thing).
**Companions:** `venture-selection-demand-thesis-design.md` (the CHANNEL claim this engine executes), `deploy-pipeline-architecture.md` (where traffic lands), `venture-metrics-standard.md` (the gauge contract this engine finally implements).

---

## 0. Ground truth — why no venture has ever had distribution (verified)

The machinery half-exists and has **never once run to completion**:

1. **Stage-21 "Distribution Setup" is artifact-only.** It LLM-generates `distribution_channel_config` + `distribution_ad_copy` + a prelaunch growth playbook — and **no code path executes any of it**. Nothing posts, submits, provisions, or publishes. The config's declared consumer does not exist (the generator-without-consumer disease, at the mission's most critical point).
2. **A hardcoded 6-channel list causes total skips.** Stage-21 requires exactly `app_store, google_ads, facebook_instagram, twitter_x, email, blog_seo`. MarketLens skipped because **the LLM omitted `app_store`** — a channel that is arguably *irrelevant* to a web SaaS — and `validateChannelCoverage()` hard-threw → `_skip: true`. The failure mode is **skip-and-advance**, not fix-and-retry: the pipeline preferred no distribution at all over regenerating one missing (irrelevant) channel.
3. **Skip is the observed universal outcome: 3 of 3 ventures** with distribution artifacts hit the skip path (every `distribution_channel_config` row is paired with a skip marker). Zero non-skipped distribution configs exist.
4. **Zero funnel instrumentation exists.** No visitor/traffic/signup/waitlist/funnel tables at all. The venture-metrics standard (`GET /v1/metrics`, KPI allowlist `signups, active_users, revenue, usage_volume, health, churn`, puller → `venture_telemetry.kpis`) **exists as an approved standard with ZERO implementing ventures** — MarketLens exposes a different internal telemetry API and has no `/v1/metrics`, no sitemap, no robots.txt, no SEO basics. A standard with no writer is the gauge-contract violation in its purest form.
5. **Dormant execution scaffolding EXISTS:** `lib/marketing/publisher/adapters/x.js` (X/Twitter publisher), `lib/marketing/organic-channel-provisioning.js`, `lib/marketing/posthog-integration.js` — test-referenced, production-uninvoked. The engine should WIRE these, not rebuild them (consume-the-canonical, §3).

**The diagnosis in one line:** distribution today is a plan-generator with a rigid checklist, no executor, no gauge, and a silent skip path — the revealed preference is that shipping mattered and selling didn't. This engine inverts that.

## 1. Design principles

1. **Channels derive from the demand thesis, never a hardcoded list.** The thesis's CHANNEL claim (who is reachable where) generates the venture's channel set. A fixed universal six guarantees irrelevant channels (app_store for web SaaS) and coverage-violation skips. The JOIN rule extends here: **every channel maps to a named persona** (persona×channel), or `COHERENCE_JOIN_GAP`.
2. **PLAN → EXECUTE → MEASURE are three different things** — Stage-21 today only PLANs. Each gets its own machinery and its own gate.
3. **Binding, not skippable** (the chairman bar applied to demand): a distribution failure blocks with a recorded reason; a skip is an explicit chairman-level decision, never a silent `_skip: true`. Rationale from §0: silent-skip produced a 100% skip rate.
4. **Fail-partial, not fail-total:** one malformed channel invalidates ONE channel experiment, never the whole stage (the app_store lesson).
5. **Measured or it didn't happen:** `launch_mode=live` requires the funnel gauge's writer verifiably alive (a synthetic probe visit registers end-to-end). A venture with zero measured visitors cannot be "launched."

## 2. Architecture — four components

### D1 — Distribution PLAN (Stage-21 rebuilt; cheap tiers)
Input: the demand thesis (CHANNEL + WHO + WTP claims) + venture descriptor. Output: a **ranked, budget-boxed channel-experiment portfolio** (the launch-plan artifact from the demand-thesis design §6): per channel — hypothesis, persona mapping, cost-to-signal bound, success/kill criteria, execution tier. Coherence checks: persona×channel JOIN; every experiment has a measurable funnel target. Sonnet-tier generation; **Fable touches it once per venture** — the positioning/narrative pass (doctrine R3: cheap tiers produce generic-SaaS mush exactly where distinctiveness pays). **Motion policy consequence of R1 (see §D4 amendment):** R1's canonical binding is D2+D4; this SD extends that consequence to D1 by inference, since a channel-experiment portfolio that ranks agent-assisted outbound (Motion C) behind a self-serve-first assumption would silently re-encode the superseded default. Channel-experiment prioritization must treat Motion C as core acquisition, not an accelerant tier — budget-box outbound experiments alongside organic/SEO.

### D2 — Distribution EXECUTE (the missing consumer; tiered per the allocation matrix)
The rail that makes the plan real, tier-split:
- **T0/deterministic (template-level, factory-wide):** SEO basics — sitemap, robots.txt, meta/OG tags, structured data — become **venture-template requirements with a stack-CI check** (MarketLens has none of these today). Directory/aggregator submissions where API-automatable.
- **T1/T2 (cheap model):** content production into the **existing** publisher rail (`lib/marketing/publisher/adapters/x.js`, `organic-channel-provisioning.js` — wire, don't rebuild); outreach sequence drafting; landing/waitlist page variants (the E2 probe kit from the demand-thesis design §8 Child D *is* this engine's lean slice).
- **Graduated autonomy for outward-facing acts** (posting under a venture's brand, sending outreach): propose-and-approve first, per-channel graduation to autonomous on a proven outcome ledger — same model as the ops plan. **Paid spend** routes through the existing spend-guardrail policy; no ad platform spend pre-E2.
- **Prompt-injection floor applies from day one:** replies/DMs/feedback arriving back through these channels are public-origin text — DATA, never instructions (horizon III.2).

**Motion policy (R1, see §D4 amendment):** this rail is elevated from "lean slice" to a **first-class priority** — it is the primary acquisition mechanism (Motion C), not an accelerant bolted onto a self-serve-first default.

### D3 — Funnel MEASURE (the gauge; consume the existing standard)
- **Adopt, don't invent:** the venture-metrics standard already defines the contract. Make `GET /v1/metrics` implementation a **venture-template requirement + stack-CI check** (zero implementers today); the existing puller (`venture-telemetry-pull.mjs` → `venture_telemetry.kpis`) is the platform-side writer.
- **One allowlist addition: `visitors`.** The current KPI set starts at `signups` — the funnel's top is unmeasurable. Visitor counts come from **Cloudflare Web Analytics** (rides the ratified CF-default hosting standard, zero-config, free, no cookie banner) surfaced by the venture through `/v1/metrics`.
- **The funnel gauge:** `visitors → signups → activated → paid` per venture, each stage under the gauge contract — declared writer + expected cadence; missed cadence renders **STALE**, pre-instrumentation renders **"no writer yet"** — never a fake number. `paid` reads the **Stripe ledger**, never the app's own claim (revenue-truth at first charge *attempt*, per horizon §I.b).
- **End-to-end liveness proof:** a synthetic canary visit + test signup must appear in the gauge before the gauge is trusted (the writer-liveness check; also the §1.5 launch precondition).

### D4 — First-customer MOTION (chairman-ratifiable policy, not an accidental default)
The decision packet (chairman ratifies once; the factory applies it):
- **Motion A — Self-serve / product-led only.** No human in the funnel. **Constrains S2/S5 selection**: a venture passes only if its thesis shows the persona self-serves *the transaction* at the price point (low-WTP/high-volume or credit-card-authority buyers) — this transaction-capability constraint is unaffected by the amendment below; it governs checkout, not acquisition. Fits the ALL-AI premise and the bandwidth inversion exactly.
- **Motion B — Budgeted founder-selling.** Chairman allocates N hrs/week as an explicit scarce input ventures compete for; only for theses that demonstrably need human closing (high-ACV).
- **Motion C — Agent-assisted outbound.** Agents draft + send outreach/DMs under graduated autonomy; no calls; human-shaped touch without chairman time.
- **Recommendation (Solomon, 2026-07-07 — SUPERSEDED, see amendment below):** ~~A as the factory default, C as the accelerant where a thesis needs outbound, B only by explicit per-venture chairman opt-in with hours budgeted in advance. Default-A also feeds back into idea selection: prefer ventures sellable without humans — that preference is itself a demand-led selection criterion.~~

> **AMENDMENT (2026-07-09, chairman-ratified — `docs/governance/chairman-ratifications-2026-07-08.md` R1, SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-D):** the chairman inverted Solomon's recommendation above. **Operative default: Motion C (agent-assisted outbound) is PRIMARY acquisition — active outreach/marketing/distribution is essential, not an accelerant.** A passive self-serve site alone does not achieve discovery. **Transaction remains self-serve (Motion A mechanism)**: once a stranger arrives via Motion C (or any channel), they sign up and pay without a human in the funnel — Motion A is the checkout layer, not the acquisition strategy. **Motion B stays NOT selected**, reserved for explicit per-venture chairman opt-in only, unchanged from Solomon's original rec. The chairman's stated rationale: *"Rule number one is AI outreach. My belief is that just putting a site out there isn't going to help customers find you. You have to do some marketing and distribution and outreach."* This elevates D2 (execution rail) from "lean slice" to first-class priority (see D2 note above) and governs D1's channel-experiment prioritization (see D1 note above). It does **not** change the S2/S5 transaction-self-serve constraint in the Motion A bullet above, and does not touch idea-selection's "sellable without humans" preference at the transaction layer.

## 3. What gets CONSUMED vs built (anti-rebuild ledger)

| Exists today | Engine's use |
|---|---|
| Stage-21 generator + prelaunch growth playbook | D1 rebuilt on it: replace the hardcoded 6-channel validator with thesis-derived channels; keep artifact machinery |
| `publisher/adapters/x.js`, `organic-channel-provisioning.js` | D2's execution rail — wire to production, currently test-only |
| `posthog-integration.js` | evaluate as activation-event writer (D3) — else CF Analytics + first-party events via `/v1/metrics` |
| venture-metrics standard + `venture-telemetry-pull.mjs` + `venture_telemetry.kpis` | D3's entire contract + platform writer — add `visitors`, mandate adoption |
| spend-guardrails, graduated-autonomy model (ops plan), prompt-injection floor (horizon III.2) | D2's safety rails |
| demand-thesis design (§6 launch plan, §8 Child D probe kit) | D1's shape and D2's lean slice — same artifacts, this doc adds the execution + measurement halves |
| deploy pipeline `promote()`/preview URLs | where all traffic lands; D3's canary rides `preview()` |

## 4. MarketLens — the concrete path to a first paying stranger (acceptance alignment)

Ordered; owners in brackets; every step measurable:
1. **Live URL** — deploy Child A (Cloud Run + DB + secrets) [deploy SD]. *(precondition for everything)*
2. **Coherence repairs** — R2 pricing reconciliation + Rule-4 JOIN fix (builder persona named into the Explorer tier) [venture lane, rides fresh-run baseline per feedback 23599cbf].
3. **Sellable floor** — Stripe Checkout + Clerk + legal/trust pages [sellable wave].
4. **Funnel gauge live** — `/v1/metrics` + `visitors` + CF Analytics + Stripe-ledger `paid`; canary visit registers end-to-end [D3 lean].
5. **E2 probe = first distribution execution** — landing + waitlist + ~50-target outreach against the reconciled personas (consultants; indie-builders into Explorer), 2 weeks, kill criteria pre-set [D2 lean + demand-thesis probe kit].
6. **Channel experiments from the thesis** — build-in-public on X (the existing adapter!), consultant communities, directories, SEO basics — ranked by the D1 plan, each budget-boxed [D2].
7. **First charge attempt** → revenue-truth gauge on; **first paying stranger = E3**. Kill criteria from step 5 remain binding throughout — this path is how the venture earns its spend, not a commitment to spend regardless.

The north-star acceptance sentence becomes checkable at step 7: *a stranger found it (D2, measured by D3), paid (E3, Stripe-verified), without the chairman touching the funnel (Motion A/C)*.

## 5. SD tree (Adam authors; suggested)

**Parent `SD-LEO-INFRA-DEMAND-ENGINE-001`:**
- **Child A — Funnel gauge** (D3): `/v1/metrics` template requirement + stack-CI check + `visitors` KPI + CF Analytics wiring + Stripe-ledger `paid` + canary liveness proof. *First: measurement precedes traffic, and it's the cheapest child.*
  - **Shipped** (`SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-A`): STALE/no-writer-yet gauge semantics (`lib/telemetry/funnel-gauge.mjs`), the `/v1/metrics` stack-CI check (`lib/eva/bridge/templates/venture-stack-scan.js`), the synthetic-visit liveness canary (`lib/telemetry/canary-gauge-liveness.mjs`), and the `launch_mode=live` gauge-writer-alive precondition (`lib/eva/external-observation.js` — this also closed a pre-existing defect that had made `launch_mode='live'` permanently unreachable). **Deferred, tracked, not silently dropped:** the `visitors` KPI_ALLOWLIST addition (pending chairman data-minimization sign-off) and the Stripe-ledger `paid` reader (blocked on venture-payment attribution, which does not exist yet and has no sourcing SD).
- **Child B — Stage-21 rebuild** (D1): thesis-derived channels (kill the hardcoded six), persona×channel JOIN, fail-partial, **binding gate** (skip = recorded chairman decision). Depends on demand-thesis Child B (the thesis artifact).
- **Child C — Execution rail** (D2): wire publisher/provisioning to production; SEO-basics template requirements; outreach kit; graduated-autonomy + injection-floor rails. Depends on A (measure before you drive traffic).
  - **Shipped** (`SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-C`): the fail-closed graduated-autonomy gate (`lib/marketing/autonomy-gate.js` — `checkPublishAuthorization`/`checkRateLimit`/`recordPublishOutcome`/`evaluateGraduation`; per-(venture,channel) `propose_and_approve → autonomous` ladder gated on N consecutive `shipped_clean` outcomes, any `reverted`/`caused_rework` demotes immediately), per-venture credential isolation (`lib/marketing/channel-secrets.js`; `publisher/index.js`'s `publish()` short-circuits to a labeled dry-run rather than falling through to shared/env credentials when no venture-specific `secret_ref` resolves — this was the FR-1-defeating gap a round-2 full-diff adversarial review caught and closed), the chairman kill-switch honored in the publish path (FR-6), pending-approval routing through the existing `chairman_decisions` surface (FR-7), inbound-message sanitization (`lib/marketing/inbound-ingestion.js`, prompt-injection floor per horizon III.2), organic-channel auto-provisioning wired into Stage-22, SEO-basics stack-CI requirements, and an adapter-liveness canary (`scripts/canary/run-adapter-liveness-probe.mjs`) that upgrades a channel from WIRED-BUT-SILENT (risk #2 below) to a verified live post. Migration `20260710_venture_channel_autonomy_ledger.sql` applied to prod (4 tables + 3 views, all `security_invoker=true`). **Deferred, tracked, not silently dropped:** the DB-backed rate limiter is count-then-act with no atomic increment (a TOCTOU race under genuine concurrency — accepted, the limit is a generous ceiling not a hard security boundary); `distribution_channels.channel_type`/`platform` taxonomy does not yet fully reconcile with the publish-path `platform` key (no `bluesky` entry exists in `distribution_channels` at all).
- **Child D — Motion policy packet** (D4): the chairman ratification — bundle into the same sitting as the horizon's II.2/II.4/III.2 items (one touch, four policies).
- **Child E — MarketLens first-stranger run** (§4): venture-scoped, consumes A–D lean slices; the prove-ONE case that shapes the permanent engine (same pattern as APA/demand-thesis: flagship first, generalize after).

**Phasing:** A now (rides the deploy wave) → D at the next chairman sitting → B+C lean slices for the MarketLens probe → full B/C after the probe's E2 data exists → E throughout as the driving case.

## 5.5 Absorption amendments (frontier adjudication, 2026-07-07)

Four small extensions folded in from the frontier review — none warrants its own design:
1. **Message-test protocol (D1/D3 sub-protocol):** every channel experiment carries **≥2 message variants**; the funnel gauge attributes conversion per variant; deltas feed the next positioning pass. This is the "does the copy CONVERT" loop — an experiment protocol over existing pieces (probe-kit variants + D3 gauge), scoped into Children B/C.
2. **Attribution (D3 amendment):** UTM discipline on every executed channel + first-touch attribution stamped at signup, so `paid` users trace to channels. Lean-phase = first-touch only; multi-touch deferred to paid-spend activation.
3. **Channel taxonomy is open, not fixed (D1 clarification):** thesis-derived channels include **integration/marketplace/partnership** channels and **referral/word-of-mouth** as first-class channel types (referral mechanics additionally = a venture-template feature, deferred until there are users to refer). The taxonomy must never regress into a hardcoded list — that was §0's disease.
4. **Retention instrumentation NOW, retention design LATER (D3 amendment):** `churn` and renewal events are **already in the metrics-standard allowlist** — require them in the same `/v1/metrics` adoption (Child A) so second-payment data accumulates from day one. The retention/renewal *engine* (the mission's "pays TWICE" second half) is deliberately deferred to a **calendar-triggered Fable commission at first paying customer** — designing retention before any stranger has paid once is speculation against zero signal (freeze-then-calibrate).

## 6. Risks / hand-verify at PLAN

1. **Preservation drift (meta, urgent):** four companion design docs live only on branch `docs/preserve-fable-window-design-output-20260707` after a working-tree switch — and post-preservation edits (APA corrections, demand-thesis §0 deflation + Rule 4) may exist only in untracked working-tree copies. Reconcile the preservation branch to the LATEST doc states before SD authoring cites them (wrong-version SSOT risk). This doc itself needs immediate preservation.
2. **Publisher adapters are test-only today** — production wiring (auth, rate limits, brand-account credentials) is unverified; treat "adapter exists" as WIRED-BUT-SILENT until a live post lands (the liveness-map vocabulary applies).
3. **`visitors` KPI addition** touches the metrics-standard allowlist — a standard change, needs the standard's owner, not a drive-by edit.
4. **Outward-facing autonomy** (posting/outreach under venture brands) is a new risk class — the graduated-autonomy ladder and the injection floor must land WITH Child C, not after the first incident.
5. **Platform/gatekeeper risk (horizon III.1)** starts binding at §4 step 3 (Stripe) and step 6 (channel accounts) — the owner question is still open.

---

*Solomon, propose-only. Chairman ratifications packaged in Child D; everything else sourceable on the normal path. Evidence: two Sonnet gather-packets (Stage-21/skip-marker/scaffolding; gauges/standard/context), adjudicated cold per the standing evidence-packet practice.*
