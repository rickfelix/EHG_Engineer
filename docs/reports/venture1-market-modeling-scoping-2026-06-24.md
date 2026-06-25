# Venture #1 Scoping — AI Audience/Market-Modeling SaaS (2026-06-24)

**Run:** `wf_6a43b558-58a`, 11 agents. Thesis (chairman): externalize EHG's own customer-intelligence engine as a standalone AI market-modeling SaaS for a broad, non-developer market (marketers/founders/agencies). Clone-and-differentiate the proven persona/market-research category.

## Verdict: ~30% of a sellable MVP exists — and it's the *defensible* 30%
This is a **real build, not a thin clone** — but with a genuine head start. The skeptic confirmed the core and challenged the optimistic specifics (3 of 4 load-bearing claims "overstated, not wrong" — instincts right, some details lean on things not yet built).

**The head start (real, verified):**
- **Persona-generation brain** (`lib/eva/stage-templates/analysis-steps/stage-10-customer-brand.js:192` `analyzeStage10`): a real multi-provider LLM call on plain inputs, **venture-free in practice**, proven by **198 real personas**. This is the asset.
- Multi-provider LLM adapter (`lib/llm`), the marketing publisher (working X + Bluesky adapters), content-generator + UTM + budget-governor + PostHog, the `customer_personas` table (RLS on), and the append-only `venture_revenue_entries` writer — all reusable.

**The honest gaps (shell / never-fired):**
- **ICP scoring + WTP + journey + segments are SHELL** — the tables (`icp_profiles`, `willingness_to_pay`, `customer_journeys`) **don't exist**, scores are hardcoded mock literals, the `/api/customer-intelligence/generate` route and its CrewAI agent **don't exist** (a dead "Generate" button today).
- **No multi-tenancy, no auth, no self-serve input flow, no billing, no Stripe** (grep-confirmed).

## MVP (thinnest sellable slice)
A marketer signs in → types a 4-field product/market description → gets **3+ rich personas (the real engine) + one LLM willingness-to-pay band per persona** → saves to their workspace → exports PDF/markdown. **Leads with personas** (real), **adds only a WTP band** (a prompt extension), **defers** ICP scoring, journeys, segments, persona-chat.

## First dollar (done-condition)
A **non-EHG** marketer clicks a **Stripe** checkout and pays for the $49 Pro plan, acquired via the automated loop: LLM-generated build-in-public post → published to X/Bluesky (UTM-tagged) → landing route → free single-persona teaser → signup → paid upgrade. Recorded once via `venture_revenue_entries` (rolls into portfolio MRR). NOT first dollar: an operator, a DM'd friend, or a test-mode charge.

## Price (the delegated decision, evidence-based)
**$49/mo single Pro plan** (3 modeled markets/mo, personas + WTP + export), fronted by a **free single-persona teaser** as the funnel hook. Optional **$79–99 lifetime impulse** tier (FounderPal mechanic) as the highest-conviction first-dollar lever. Evidence: paid self-serve in this category clears $29–99/mo (Minds €29/79, UXPressia $36–95, Delve $89, m1-project $99); $49 undercuts direct tiers while staying above the $0–8 commodity floor. Hold $149–199 Agency for later. *(Skeptic: directionally sound, treat as a starting hypothesis to validate.)*

## Build path (7 steps; only Stripe is zero-existing-code)
| # | Step | Category | Size |
|---|---|---|---|
| 1 | De-ventured generate endpoint over the persona core | REUSE-WIRE | small |
| 2 | Extend prompt to emit a WTP band | NEW-BUILD | small |
| 3 | Tenant scoping (`owner_id` + accounts model + RLS) | DECOUPLE | medium |
| 4 | Self-serve auth + 4-field input wizard + result/export view | NEW-BUILD | large |
| 5 | Free single-persona teaser + landing route (UTM) | GTM-SEAM | medium |
| 6 | Stripe checkout + webhook → revenue writer | NEW-BUILD | medium |
| 7 | Automated build-in-public campaign at the landing route | GTM-SEAM | medium |

**Deferred to scale:** real ICP-fit math, WTP rigor (Van Westendorp/conjoint), journey maps, user segments, persona-chat, Agency tier, full RLS/SSO/metering/dunning, decommissioning the dead CrewAI path.

## The biggest risk (it's GTM, not engineering)
The audience the automated X/Bluesky loop reaches best — **founders** — is the **worst payer** (defaults to free incumbents, churns); the audience that actually pays — **consultants/small agencies who resell the output** — needs proof and **converts slower than one automated post sequence can produce**. Load-bearing assumption: *engine-grade depth (a persona + WTP band free tools can't produce) at a free-tool funnel position converts a meaningful fraction of automated-funnel signups to a $49 card-swipe with no human sales touch.* If false, the loop fails on the **GTM seam, not the engine** — and first dollar would need manual selling, which doesn't prove the loop. Mitigation: lead with WTP, gate the teaser behind signup for retargeting, keep UTM attribution clean, and validate the payer early (step 5 teaser + step 7 campaign before over-investing).

## Chairman decisions that gate the build
1. **WTP as an LLM *estimate*** (labeled as such) acceptable for v1? (step 2)
2. Approve an **additive Supabase migration** (tenant column) via `apply-migration.js` + sign-off. (step 3)
3. **Host inside the ehg app** (favored, fastest) vs. a thin standalone deploy? (step 4)
4. Approve a **real live-mode Stripe account + keys** (test-mode doesn't count for first dollar). (step 6)
5. **Small real posting budget** vs. zero-spend organic posts for v1? (step 7)

## Recommendation
Strong, honest venture-#1 candidate: real ~30% head start (the proven brain), well-scoped gaps, and it dogfoods the tool we'd use to pick venture #2's market. But it's a **medium build (~6–7 SDs), not a thin clone**, and the **real risk is whether the automated-funnel audience pays** — so sequence to hit that assumption early (teaser + one real automated campaign) before over-building billing/tiers. Validate the payer before scaling the platform.
