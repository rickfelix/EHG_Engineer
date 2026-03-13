# Architecture Plan: Genesis — Public Venture Factory Offering

## Stack & Repository Decisions
- **Repositories**: New `genesis` repository (standalone SaaS product), with shared libraries extracted from EHG_Engineer
- **Frontend**: React + TypeScript + Vite + Tailwind CSS (EHG stack for consistency)
- **Backend**: Node.js + Supabase (PostgreSQL) — mirrors EHG_Engineer patterns
- **Auth**: Supabase Auth with multi-tenant RBAC
- **Billing**: Stripe (subscriptions + usage metering)
- **Deployment**: Vercel (frontend) + Supabase (backend/database)
- **LLM**: Claude Sonnet for EVA advisory, Claude Haiku for classification tasks. Uses client-factory.js pattern for LLM routing with per-customer token metering.
- **Existing Infrastructure (Extracted from EHG_Engineer)**: Venture State Machine (1,301 LOC), Stage Templates (14,690 LOC — stages 1-25), Stage-Zero Synthesis (7,597 LOC), Genesis Simulation (8,151 LOC), CEO Factory (474 LOC), Discovery Service (1,917 LOC), Cross-Venture Learning (871 LOC), Portfolio Optimizer (524 LOC)
- **New Dependencies**: `@stripe/stripe-js` (billing), `@supabase/auth-helpers-react` (multi-tenant auth)

## Legacy Deprecation Plan
N/A — Genesis is a new standalone product. EHG_Engineer's internal infrastructure remains unchanged. Shared libraries are extracted as read-only copies, not moved. EHG_Engineer continues to evolve independently; Genesis periodically syncs upstream improvements.

## Route & Component Structure

### Genesis Repository (New)
- `packages/core/` — Extracted venture lifecycle engine (state machine, stage templates, gates)
- `packages/eva-advisory/` — EVA strategic advisor API (chat, classification, assumption testing)
- `packages/simulation/` — Genesis simulation chamber (Aries sandbox)
- `packages/intelligence/` — Cross-venture learning and aggregate analytics
- `apps/web/` — Customer-facing SaaS dashboard (React + Vite)
  - `src/pages/Dashboard.tsx` — Portfolio overview with venture cards
  - `src/pages/VentureDetail.tsx` — Single venture lifecycle view
  - `src/pages/GateDecision.tsx` — Kill/promote gate decision interface
  - `src/pages/EVAChat.tsx` — EVA advisory chat interface
  - `src/pages/Settings.tsx` — Account, billing, team management
  - `src/pages/Onboarding.tsx` — New customer onboarding flow
- `apps/api/` — REST API server (Node.js + Express)
  - `routes/ventures.js` — Venture CRUD, stage advancement
  - `routes/gates.js` — Gate evaluation, decision recording
  - `routes/eva.js` — EVA advisory chat endpoint (streaming)
  - `routes/billing.js` — Stripe webhook handlers, usage reporting
  - `middleware/tenant.js` — Multi-tenant context injection
  - `middleware/metering.js` — Usage metering for billing

### EHG_Engineer (Source — no modifications)
- Existing infrastructure serves as source for extraction
- No changes to EHG_Engineer codebase required

## Data Layer

### New Tables (Genesis Database — separate Supabase project)
- `organizations` — Customer organizations (multi-tenant root)
  - `id` (uuid), `name` (text), `slug` (text, unique)
  - `plan` (text — free, pro, enterprise), `stripe_customer_id` (text)
  - `settings` (jsonb — gate thresholds, custom stages, branding)
  - `created_at` (timestamptz), `updated_at` (timestamptz)

- `org_members` — Organization membership with roles
  - `id` (uuid), `org_id` (fk → organizations), `user_id` (fk → auth.users)
  - `role` (text — owner, admin, member, viewer)
  - `invited_at` (timestamptz), `accepted_at` (timestamptz)

- `genesis_ventures` — Per-organization ventures
  - `id` (uuid), `org_id` (fk → organizations)
  - `name` (text), `description` (text), `venture_type` (text — saas, marketplace, api, content)
  - `current_stage` (int 1-25), `stage_history` (jsonb — transitions with timestamps)
  - `health_score` (numeric 0-10), `health_details` (jsonb)
  - `simulation_id` (uuid, nullable — if spawned via Aries)
  - `status` (active, paused, killed, graduated), `kill_reason` (text, nullable)
  - `metadata` (jsonb), `created_at` (timestamptz), `updated_at` (timestamptz)

- `genesis_gate_decisions` — Gate evaluation results
  - `id` (uuid), `venture_id` (fk → genesis_ventures)
  - `stage` (int), `gate_type` (text — kill, promotion, artifact)
  - `decision` (text — pass, fail, chairman_review)
  - `criteria_scores` (jsonb — per-criterion scores and evidence)
  - `decided_by` (fk → auth.users), `rationale` (text)
  - `created_at` (timestamptz)

- `genesis_eva_conversations` — EVA advisory chat threads
  - `id` (uuid), `venture_id` (fk → genesis_ventures)
  - `messages` (jsonb[] — role, content, canvas artifacts)
  - `token_count` (int), `model_used` (text)
  - `created_at` (timestamptz), `updated_at` (timestamptz)

- `genesis_venture_artifacts` — Per-venture documents and outputs
  - `id` (uuid), `venture_id` (fk → genesis_ventures)
  - `artifact_type` (text — prd, bmc, financial_model, pitch_deck, market_research)
  - `stage_produced` (int), `content` (jsonb)
  - `status` (draft, review, approved), `version` (int)
  - `created_at` (timestamptz)

- `genesis_aggregate_patterns` — Cross-venture anonymized patterns
  - `id` (uuid), `pattern_type` (text — failure_mode, success_factor, pivot_pattern)
  - `description` (text), `frequency` (int — how many ventures exhibit)
  - `stage_range` (int[] — which stages it typically appears)
  - `venture_types` (text[] — which venture types affected)
  - `recommendation` (text), `confidence` (numeric 0-1)
  - `created_at` (timestamptz), `updated_at` (timestamptz)

- `genesis_usage_events` — Billing usage metering
  - `id` (uuid), `org_id` (fk → organizations)
  - `event_type` (text — venture_created, gate_evaluated, eva_query, simulation_run)
  - `quantity` (int), `metadata` (jsonb)
  - `created_at` (timestamptz)

### RLS
- All tables enforce `org_id` isolation: users can only access their organization's data
- `organizations`: Only members can read; only owners can update
- `genesis_ventures`: Members of the venture's org can read; admin+ can write
- `genesis_aggregate_patterns`: Readable by all authenticated users (the shared intelligence layer)
- `genesis_usage_events`: Only service role can write; org owners can read their own

## API Surface

### REST Endpoints
- `POST /api/ventures` — Create new venture in org
- `GET /api/ventures` — List org's ventures with health scores
- `POST /api/ventures/:id/advance` — Advance venture to next stage (triggers gate evaluation)
- `POST /api/ventures/:id/gate-decision` — Record kill/promote decision
- `POST /api/eva/chat` — EVA advisory chat (SSE streaming response)
- `POST /api/simulation/spawn` — Create Aries sandbox for a venture
- `GET /api/intelligence/patterns` — Cross-venture aggregate patterns
- `GET /api/intelligence/benchmarks` — Venture health benchmarking vs cohort
- `POST /api/billing/webhook` — Stripe webhook handler
- `GET /api/billing/usage` — Current period usage summary

### Supabase RPC
- `get_org_portfolio_health(org_id)` — Aggregate health across ventures
- `get_stage_completion_rates(venture_type)` — Cross-platform stage analytics
- `get_similar_ventures(venture_id)` — Find ventures with similar profiles

## Implementation Phases
- **Phase 0** (4 weeks): Demand Validation — No code. Content marketing (blog posts about EHG methodology, case studies). 20+ customer discovery interviews. Landing page with waitlist. Success metric: 50+ qualified signups, clear willingness-to-pay signal from ≥5 prospects.
- **Phase 1** (6 weeks): MVP — New Genesis repository. Multi-tenant Supabase schema (organizations, org_members, genesis_ventures, genesis_gate_decisions). Customer auth via Supabase Auth. Core 10-stage workflow extracted from EHG stage templates. Basic EVA advisory chat. Free trial + $299/month pro tier via Stripe. Private beta with 5-10 founding customers.
- **Phase 2** (6 weeks): Product Completeness — Stages 11-25 with full gate engine. Genesis simulation chamber (Aries sandbox per customer). Usage metering and billing enforcement. Venture health dashboards. Support ticketing integration. Public launch.
- **Phase 3** (8 weeks): Intelligence Layer — Cross-venture aggregate patterns (genesis_aggregate_patterns). Benchmarking API. Enterprise tier with white-labeling, SSO, and data isolation. Accelerator partnership tier. $999+/month pricing.
- **Phase 4** (ongoing): Growth — Open-core community tier. API/SDK for custom integrations. Template marketplace. Equity track option. International expansion.

## Testing Strategy
- Unit tests for multi-tenant data isolation (org A cannot access org B's ventures)
- Unit tests for stage gate evaluation (known inputs → expected gate decisions)
- Integration tests for venture lifecycle (create → advance through stages → gate decisions → completion)
- Integration tests for Stripe billing (subscription creation, usage metering, tier enforcement)
- E2E tests for customer onboarding flow (signup → create org → create first venture → advance to stage 2)
- Security tests for RLS policies (verify cross-tenant data isolation at database level)
- Load tests for EVA advisory (concurrent chat sessions across multiple orgs)

## Risk Mitigation
- **Market risk (no demand)**: Phase 0 demand validation before any engineering. Hard kill metric (50+ signups, 5+ WTP signals). If Phase 0 fails, total investment is 4 weeks of content + interviews — minimal sunk cost.
- **Multi-tenancy data leakage**: RLS at database level (not application level). Integration tests verify cross-tenant isolation. Security audit before public launch. Bug bounty program for enterprise tier.
- **LLM cost explosion**: Per-customer token metering. Tier-based token budgets (free: 50K/month, pro: 500K/month, enterprise: custom). Usage alerts at 80% and 100% of budget. Haiku for classification (cheap), Sonnet for advisory (metered).
- **Resource drain on EHG**: Genesis team capped at 3 FTE. Support SLA limited to business hours. Self-serve documentation required before public launch. If support burden exceeds capacity, raise prices before adding headcount.
- **IP exposure**: Methodology is public (content marketing moat). Software is proprietary (product moat). Cross-venture intelligence is defensible (data moat). Competitors can read about the methodology but cannot replicate 200+ ventures worth of pattern data.
- **Competing with customers**: Terms of Service include non-compete clause for direct EHG venture categories. Genesis does not provide venture ideas or market intelligence about EHG's active markets.
- **Vercel deployment per customer**: Sandbox environments use Genesis Vercel team (metered). Production deployments require customer's own Vercel account. Clear separation of infrastructure costs.
