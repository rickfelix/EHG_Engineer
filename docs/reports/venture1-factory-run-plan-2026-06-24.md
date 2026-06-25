# Venture-1 Factory-Run + Operations Plan (2026-06-24)

**Source:** workflow `wf_3d6ada37-aca` (9 agents, code+DB-grounded, verify-gated). Companion to the scoping + triangulation reports. This is the comprehensive plan for running venture-1 (standalone AI persona+WTP SaaS for consultants) **through EHG's own 26-stage factory and into the operations route** — the dogfood that proves the factory produces an *earning* venture.

## How venture-1 is instantiated + driven (verified)
- **Seed ONE `ventures` row** at `current_lifecycle_stage=1`, `status='active'`, `orchestrator_state='idle'`, `build_model='leo_bridge'`, explicit own `company_id`, `archetype='saas'`. Stage 0 idea-gen is dormant + the idea is chosen, so **skip Stage 0** (the `eva-venture-new.js` paths only *generate* ideas).
- **Highest-risk step:** Stage-1 hydration *throws* without a Stage-0 synthesis. Hand-author the synthesis object at `ventures.metadata.stage_zero` (description/problemStatement/valueProp/targetMarket/archetype/moat). This is the genetic material for every downstream LLM prompt — it must encode persona+WTP, **consultants/agencies as payer**, $49/mo + $79-99 lifetime, engine reuse, standalone.
- **The worker drives it:** `start-stage-worker.js` polls `active`+`idle`+`stage<26`, advances mode-by-mode (EVALUATION 1-5 / STRATEGY 6-12 / PLANNING 13-17 / BUILD 18-22 / LAUNCH 23-26), pausing at hard/kill gates **[3,5,10,13,17,18,19,23,24,25]** for chairman adjudication. **The worker is currently DOWN (heartbeat 4 days stale) — nothing advances until it's started and kept alive.**
- **BUILD handoff (S18→S19→S20):** S18 marketing copy = binding contract (persona_target=consultants) → **S19 SD-bridge** turns the blueprint into a LEO orchestrator SD + child build SDs that the normal LEAD→PLAN→EXEC pipeline ships to **venture-1's own repo** → S20 refuses to fabricate (reads real CI/build/security). **S19 routing is fail-closed and WILL misroute build code into the ehg app unless venture-1 is pre-registered as a standalone target** (proven on DataDistill).

## Operations = the continuation past stage 26
After a **real** S24 go-live (deploy reachable, Stripe LIVE, channels publishing — *not* a metadata-only "activated"), venture-1 enters the operations route (ehg `/chairman/operations` + decision stack). The earn loop requires building: the **missing `venture_revenue_entries` writer** (Stripe→`ops_payment_events`→ledger, deploy-constant attribution), the **unwired marketing publisher + a new LinkedIn adapter**, the daily `income_capture_monthly` cron (the working operator North-Star path), `RevenueTab` wiring, `/v1/metrics`, the **S26 terminal flip repair**, and `financial_targets` so the sustain monitor alerts. **v1 done-condition = a real live-mode Stripe charge from a non-EHG payer, recorded once, surfaced on the operator gauge.**

## The load-bearing risks (skeptic-verified)
1. **Missing revenue writer** (`venture_revenue_entries` = 0 rows, no writer in either repo) — first dollar can never be recorded until built.
2. **Marketing execution unwired + LinkedIn unrepresentable** — `executePipeline`/publisher never called by S22/S24; LinkedIn dropped by the CHANNELS enum, no adapter. The entire acquisition funnel is unbuilt (why no venture has earned).
3. **Fail-closed S19 routing misroutes the build** into the ehg app without standalone registration.
4. **Worker down + gates wait forever** — unmanaged worker or unresponsive chairman parks the run.
5. **Fictional economics at the truth-gates** — S5/S16 are LLM-generated with no pricing param (S16 hardcodes $50k/$8k); ungrounded inputs → false KILL/PASS. Feed real CAC/price/cost (+ web grounding).
6. **Auto-override defeats the test** — at L2+ `monitoring_agent` auto-stamps gates (DataDistill auto-overrode both its KILLs). Run at L0/L1 and adjudicate personally or the dogfood proves nothing.
7. **S26 terminal flip never lands** (DataDistill stuck stage-26-pending) → operations never formally begins.
8. **Theatrical launch** — S24 'activated' opens no charges/spend; launch must be genuinely live.
9. **Legal/compliance exposure** — S23 lets legal/analytics/monitoring PASS on attestation alone; a paid multi-tenant SaaS storing client data needs real ToS/privacy/DPA.

## The 35-step plan (condensed)
Repair S26 flip → register standalone target → author+approve synthesis → provision company/Stripe → seed venture → (web grounding) → start+keep-alive worker → ride/adjudicate S1-S9 (esp. S3/S5 kill gates with **real economics**) → set autonomy + brand/name (verify domain outside factory) → GTM shape → ride S13-17 + ground S16 financials → blueprint review → approve S18 copy → **S19 bridge → LEO builds the standalone product (auth/Stripe/persona-WTP UI/landing)** → S20 build gate → **build LinkedIn adapter + marketing execution bridge + revenue writer + income cron + RevenueTab + /v1/metrics** → legal/analytics → Stripe LIVE + **chairman go-live trigger** → **OPERATE→EARN: first non-EHG charge recorded (FIRST DOLLAR)** → S25/S26 on real data → SUSTAIN: targets + monitor loop. (Full per-step list in the run output.)

## Chairman Decision Register — 36 items (the headline deliverable)
Ordered by urgency. Each carries my recommendation (full rationale in the run output). **Triage:** most have a clear default I can proceed on; ~9-10 are genuine chairman-authority calls (marked ★).

**BLOCKS-START**
- CD-01 — approve the hand-authored Stage-0 synthesis text. *Rec: I draft, you ratify.*
- CD-02 ★ — narrow payer (consultants) vs wide. *Rec: narrow (you confirmed).*
- CD-03 ★ — venture-1's own `company_id`/portfolio vs under EHG. *Rec: own companies row.*
- CD-04 — who keeps the worker alive. *Rec: wire into leo-stack/babysit loop.*
- CD-05 ★ — autonomy level (L0-L4) + personally adjudicate gates? *Rec: L0/L1, adjudicate S3/S5 personally.*
- CD-06 — standalone repo + register target before S19. *Rec: yes (settled).*
- CD-07 — approve S18 copy + persona_target=consultants. *Rec: approve consultant-framed.*
- CD-08 — human attribution on gates vs auto-resolution. *Rec: require human.*

**BLOCKS-MID**
- CD-09 ★ — S3 kill-gate threshold policy. *Rec: ride canonical; treat KILL as real.*
- CD-10 — web grounding (Tavily) on? *Rec: enable.*
- CD-11 — S14 arch constraints + data-classification for stored client descriptions. *Rec: seed; treat as confidential 3rd-party data.*
- CD-12 — S7 pricing tiers + lifetime cap. *Rec: pre-approve, cap lifetime.*
- CD-13 ★ — brand direction + name/domain/trademark. *Rec: you pick a real available name outside the factory.*
- CD-14 — S12 GTM shape (self-serve, LinkedIn-primary). *Rec: as stated.*
- CD-15 ★ — DB tenancy (dedicated project vs schema) + RLS model. *Rec: dedicated project or strict-RLS schema, per-org tenancy.*
- CD-16 — override S19 default capabilities (drop portfolio/chairman panels). *Rec: override.*
- CD-17 — perform S17 blueprint review manually. *Rec: yes.*
- CD-18 — fix S26 terminal flip before venture-1 reaches 26. *Rec: fix first.*
- CD-19 — which ops signals to instrument for v1. *Rec: income gauge + product health + failed-payments; defer per-venture MRR/churn.*
- CD-20 — turn on the monitor loop? *Rec: wire income gauge daily; defer per-venture loop.*
- CD-21 — financial targets. *Rec: target_mrr ~$490, churn <10%.*
- CD-22 ★ — legal/analytics: attest vs build. *Rec: build ToS/privacy/DPA + analytics before launch.*

**BLOCKS-FIRST-DOLLAR**
- CD-23 — Stripe→venture_id attribution. *Rec: deploy-constant venture_id.*
- CD-24 — revenue substrate + build the writer. *Rec: ops_payment_events → income_capture + new venture_revenue_entries writer.*
- CD-25 — build LinkedIn adapter + creds. *Rec: build (mirror x.js), dry-run first.*
- CD-26 — wire marketing execution bridge. *Rec: wire S24/ops → executePipeline.*
- CD-27 ★ — Stripe TEST vs LIVE + exact pricing + lifetime terms. *Rec: build TEST, flip LIVE for first dollar.*
- CD-28 ★ — marketing budget + paid vs organic. *Rec: organic-first, small budget, CAC ceiling.*
- CD-29 ★ — real economic inputs (build cost/CAC/churn) for S5/S16. *Rec: you provide real numbers.*
- CD-30 ★ — what counts as first dollar. *Rec: real live-mode charge from a non-EHG payer.*
- CD-31 — go-live authority + READY bar. *Rec: chairman sole authority; QA≥95%/legal/adapter/deploy/Stripe-live.*

**DEFERRABLE**
- CD-32 remove stale S8 auto-proceed · CD-33 wireframe hard-gating/Stitch · CD-34 income-capture cron · CD-35 defer exit-readiness + per-venture ops loop · CD-36 confirm decision-stack table.
