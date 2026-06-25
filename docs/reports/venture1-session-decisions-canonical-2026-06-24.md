# Venture-1 — Canonical Session Decisions & Approach (2026-06-24)

**Purpose:** single durable capture of the venture-1 approach, every chairman decision, and the context provided this session — so nothing is lost on session close.

## Durability map (where everything lives)
| Artifact | Location | Durable? |
|---|---|---|
| All chairman decisions | `SD-EHG-VENTURE1-MARKET-MODELING-SAAS-001` → `metadata.chairman_decisions` (Supabase) | ✅ DB — survives session close |
| This record + all reports | `docs/reports/*.md` (pushed to remote branch) | ✅ once pushed |
| Methodology + reusable workflow | `docs/process/top-down-vision-assessment.md`, `.claude/workflows/ehg-top-down-vision-assessment.mjs` | ✅ once pushed |
| Lessons | memory: `reference-assess-ehg-cross-repo-not-app-alone`, `feedback-automate-dont-default-to-manual-chairman-steps` | ✅ outside repo |

## Strategic frame
EHG is substantively built (product pivot complete). **Venture-1 is the first REAL venture and the dogfood test that the factory produces an *earning* venture.** Venture-1 = a standalone, self-serve **AI market-modeling SaaS** (generates buyer personas + per-persona willingness-to-pay bands) for **consultants/agencies**.

## Chairman directives & context provided this session (in order)
1. **Standalone** — do NOT host venture-1 inside the EHG app.
2. **Test the venture development STAGES** — run venture-1 *through* the 26-stage factory (dogfood), not hand-built around it.
3. **Operations is the CONTINUATION** past stage 26 — the test extends through operate → earn → sustain, not just "launched."
4. **Automate, don't manualize** — venture economics (CAC/churn) should be factory-derived (web-grounding + research engine + build the gap), not hand-entered; chairman owns strategy only. (A standing rule now.)
5. **Database cost** — Supabase is expensive per-database at portfolio scale; the cheaper usage-based solution identified last month = **Neon** (serverless, scale-to-zero), already mandated by the venture-hosting standard.
6. **Holding-company COMPOUNDING** — capabilities + intelligence shared across ventures so each makes the next smarter.
7. **Considered** born-shared-then-peel-off; deep-research triangulation → **born-isolated on Neon + a three-layer hub wins** (Neon makes isolation free; peel-off carries exit/separation risk).
8. **Run at L0/L1, chairman personally adjudicates gates** (no L2+ auto-override).
9. **Own company entity + own repo** per venture.

## Decisions LOCKED (recorded in SD metadata)
- **Execution model:** run venture-1 THROUGH the EVA 26-stage factory (seed as a venture at Stage 1), ride built stages, build back-half gaps as hit. Operations is a first-class continuation.
- **Autonomy (CD-05):** L0/L1; chairman adjudicates every gate, esp. S3/S5 KILL gates.
- **Company (CD-03):** venture-1 gets its own `companies` row (separable for exit).
- **Payer (CD-02):** consultants/agencies (the payers), not founders.
- **Economics (CD-29/CD-10):** automated grounding (web-search + research engine + build the S16/learning gap); chairman owns strategy only.
- **Host:** standalone deploy, NOT the ehg app.
- **Stack (CD-15):** the approved Venture Hosting Standard — **Replit hosting + Neon Postgres + Clerk auth + TanStack/React/Vite + Replit Object Storage + Gemini + Sentry**; own repo; enforced fail-closed at S19.
- **Auth:** Clerk; code auto-scaffolded + CI-enforced; credentials = one-click manual at deploy.
- **Pricing:** $49/mo Pro + free single-persona teaser + capped $79–99 lifetime.
- **Kill-gate policy:** ride canonical S3/S5 thresholds; a KILL is a real signal.
- **First-dollar definition:** a real live-mode Stripe charge from a non-EHG payer.

## Architecture conclusion (triangulated + internally reviewed)
**Born-isolated on Neon + a three-layer architecture:**
1. **Per-venture customer-data layer** — isolated Neon DB per venture, never cross-accessed.
2. **Shared capability layer** — reusable code/modules (`sd_capabilities` reuse registry), zero data coupling.
3. **Shared intelligence hub** — non-PII metadata only (patterns, benchmarks, playbooks); ventures emit learnings UP (one-way) and consume capabilities DOWN. Customer data never crosses a venture boundary.

Compounding and isolation are NOT in tension — they operate on separate planes. Neon scale-to-zero (~$0.10–0.50/mo idle vs Supabase ~$10/mo/DB) makes isolation nearly free, so the cost concern points TOWARD born-isolated, not shared-then-peel. Externally validated by the deep-research triangulation (OpenAI+Gemini+Claude). The cross-venture **learning loop is the orphaned gap** to build; venture-1 should establish the hub emit/consume pattern.

## The plan (factory-run + operations)
Seed venture-1 at Stage 1 → ride/adjudicate S1–S17 (with automated-grounded real economics at S3/S5) → S18 copy → **S19 SD-bridge builds the standalone product** (auth/Stripe/persona-WTP UI/landing on the Replit/Neon stack) → S20 build gate → **build back-half gaps** (LinkedIn adapter, marketing execution bridge, the missing `venture_revenue_entries` writer, income cron, RevenueTab, `/v1/metrics`) → legal/analytics → **chairman pulls go-live (Stripe LIVE)** → **first dollar** → S25/S26 → **operate/earn/sustain** monitor loop. Full 35-step plan: `venture1-factory-run-plan-2026-06-24.md`.

## Manual-touch-at-launch (the ONLY irreducible chairman actions, both late)
1. **Clerk application + keys** (one-click in Replit UI).
2. **Live-mode Stripe account + keys.**

## Open / next steps
- **Re-spin a worker** — the only blocker to *starting* the build (chairman/coordinator action; fleet is wound down).
- **Internal architecture review** (`wf_f2a2d402-d95`) running — confirms hub built-vs-gap; fold into the plan when it lands.
- Live Stripe + Clerk provisioning at the launch stage.

## Detailed reports (companions)
- `venture1-market-modeling-scoping-2026-06-24.md` — the product/MVP scoping + skeptic verdicts.
- `venture1-deep-research-triangulation-2026-06-24.md` — GTM/pricing/payer/channel triangulation.
- `venture1-factory-run-plan-2026-06-24.md` — the 35-step factory+operations plan + 36-item decision register.
- `holding-architecture-triangulation-2026-06-24.md` — the born-isolated+Neon+3-layer-hub architecture verdict.
- `ehg-top-down-vision-assessment-2026-06-24-v2.md` — the build-vs-exercised factory assessment.
- `docs/process/top-down-vision-assessment.md` — the re-runnable assessment methodology.
