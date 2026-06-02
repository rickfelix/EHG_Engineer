# Venture Hosting Standard (Replit)

**Status:** Active standard — chairman directive, 2026-06-02
**Applies to:** ALL EHG **portfolio ventures** (the products built via the venture-build / leo_bridge pipeline — e.g. DataDistill, CronGenius).
**Does NOT apply to:** the **platform** — `EHG_Engineer` (LEO orchestrator) and the `EHG` management app — which remain on **Supabase**. This standard governs ventures, not the platform.

## The standard

Every EHG venture is hosted on **Replit** using the **Replit-native stack**:

| Concern | Standard | Not |
|---|---|---|
| **Hosting** | Replit Deployments — **Autoscale** (web apps / control planes), **Reserved VM** (always-on / background workers), **Scheduled** (cron, ≤11h timeout) | — |
| **Database** | **Replit Postgres** (Helium-backed — Replit's own managed Postgres infra as of the 2026 Neon→Helium migration) | ~~Supabase~~ |
| **Auth** | **Replit Auth** | ~~Supabase Auth~~ |
| **Secrets / credentials** | **Replit Secrets** (+ app-level encryption-at-rest for any third-party credentials stored) | ~~Supabase Vault~~ |

## Conditional sub-pattern — data-sensitive ventures

A venture that processes **sensitive EXTERNAL data** (e.g. a customer's *production* database) MUST build its heavy data-plane worker as a **portable worker** (connection-string + config in → result out) so the *same* worker can run:

- on a Replit **Reserved-VM background worker** for the MVP/demo (against own / non-sensitive data), **and**
- as a **customer-side agent/container** (in the customer's own VPC) for real sensitive data — which resolves the trust barrier, egress/static-IP constraints, and Replit's long-job limits **with zero rewrite**.

The **product remains the Replit-hosted SaaS control plane**; the agent is a *data-plane deployment unit*, **not** a CLI product. (First venture applying this: DataDistill — see `docs/` / the venture's vision.)

## Rationale

- Replit is the portfolio's standard build/host platform; one stack removes per-venture stack debates and lets ventures reuse Replit-native primitives (Autoscale, Postgres, Auth, Secrets).
- Replit Autoscale fits request-driven web apps; Reserved VM fits workers; the customer-side-agent sub-pattern covers what Replit-hosted compute can't safely do (long jobs, customer-prod-data trust, stable egress).

## Enforcement

- **Architecture plans** (EVA `archplan` / `/brainstorm` Step 9.5C "Stack & Repository Decisions") for any venture MUST specify this stack. A venture arch plan defaulting to Supabase/other hosting is non-conformant.
- **(Planned, not yet wired):** record `hosting_platform=replit` per venture in the applications registry; add a venture-stack protocol section to the DB (`leo_protocol_sections`) so it regenerates into `CLAUDE_PLAN.md`; teach the S19 sprint planner / lifecycle-sd-bridge to seed the Replit stack into generated venture SDs.

## Companion standard

- **Venture metrics** (`docs/03_protocols_and_standards/venture-metrics-standard.md`, SD-LEO-INFRA-PORTFOLIO-PRODUCT-KPI-001): every Replit-hosted venture exposes an authenticated, **aggregates-only** `GET /v1/metrics` that the platform PULLs one-way for portfolio analysis — the platform never opens a venture database. This is how cross-venture portfolio data is gathered despite per-venture isolation.

## Scope boundary (explicit)

- **Platform** (`EHG_Engineer`, `EHG` app): **Supabase** — unchanged, NOT migrated.
- **Ventures**: **Replit stack** per this document.
