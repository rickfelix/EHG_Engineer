# Triangulation Synthesis: EHG Venture Factory + Shared Service Platform

## Models Consulted
- **OpenAI** (GPT-4-class) — full evaluator response
- **AntiGravity** (external model) — full evaluator response
- **Claude Code** (with codebase access) — synthesis and ground-truth validation

## Composite Scores
| Model | Score | Biggest Risk Identified |
|---|---|---|
| OpenAI | 7.0/10 | Governance and operational overload |
| AntiGravity | 7.5/10 | Single-operator PR review bottleneck |
| Average | 7.25/10 | Human bottleneck (consensus) |

## Claim Verdicts

| Claim | OpenAI | AntiGravity | Verdict |
|---|---|---|---|
| 1. API + GHA optimal | Agree | Agree | **Validated** — right starting point, plan for evolution |
| 2. Two-layer enables exits | Agree | Strongly Agree | **Validated** — necessary but add data export/credentials/inventory |
| 3. One person, 15+ ventures | Neutral (High) | Neutral (High) | **Highest risk** — both flag independently. Needs tiering + dashboard. |
| 4. Vendor exit supports all types | **Disagree** (High) | Agree (Low) | **Contested** — OpenAI says design for 30-day clean break instead |
| 5. Artifacts not direct push | Strongly Agree | Strongly Agree | **Strongly validated** |

## Architecture Adjustments (Post-Triangulation)

### Change 1: Adopt Poll Model (from AntiGravity)
**Original**: EHG pushes webhooks to venture repos → GitHub Actions apply artifacts
**Updated**: Venture Agent polls EHG API for tasks, applies locally, reports back with telemetry

Rationale:
- Venture controls its own execution (better exit isolation)
- EHG never needs write access to venture infrastructure
- Telemetry feedback loop is built into the poll/report cycle
- If EHG is down, polling returns empty — no dead webhooks
- Latency is acceptable for marketing/branding/CS (not real-time)

### Change 2: Design for 30-Day Clean Break (from OpenAI)
**Original**: Design for vendor-contract exit model
**Updated**: Design for 30-day full separation as the forcing function. If a buyer can detach in 30 days, vendor and transition models follow naturally.

Requirements this adds:
- Data export per venture (schema dump, asset manifest)
- Secret rotation procedure
- Dependency inventory per venture
- Documented third-party service alternatives

### Change 3: Centralized Operator Dashboard is Prerequisite (Consensus)
**Original**: Not mentioned in architecture
**Updated**: Build EHG Operator Control Plane that aggregates all venture PRs, service health, AI confidence scores, and costs into a single view.

Both AIs independently recommended this as critical for one-person operation at scale.

### Change 4: Confidence-Based Automation Policy (OpenAI)
- Low-risk tasks (metadata updates, content refreshes): auto-open PRs
- Medium-risk tasks (marketing campaigns, brand assets): PR with confidence score
- High-risk tasks (code changes, config modifications): draft artifacts requiring explicit approval

### Change 5: Telemetry Feedback Loop (AntiGravity)
Services need outcome data (conversion rates, engagement, bounce rates) to improve future generations. The poll model naturally supports this — when Venture Agent polls for next task, it bundles telemetry from the previous task.

## Updated Architecture Diagram

```
EHG Platform (Service Layer — substitutable at exit)
  ├─ Marketing Service API
  ├─ Branding Service API
  ├─ Customer Service API
  ├─ Task Queue (pending work per venture)
  ├─ Telemetry Store (outcomes per venture)
  └─ Operator Dashboard (centralized control plane)

       ▲ poll for tasks          ▲ report outcomes
       │                         │
       │    GET /api/tasks       │  POST /api/tasks/{id}/complete
       │                         │  { status, telemetry }
       │                         │
  ┌────┴─────────────────────────┴────┐
  │  Venture Agent (runs in venture)  │
  │  ├─ Polls EHG API on schedule    │
  │  ├─ Applies artifacts to repo    │
  │  ├─ Creates branch + PR          │
  │  ├─ Reports telemetry back       │
  │  └─ Confidence-gated approval    │
  └───────────────┬───────────────────┘
                  │
                  ▼
         Venture Repo (theirs to keep)

EXIT: Buyer disables Venture Agent cron. Done.
      No EHG access to venture infrastructure.
      Optional: continue polling as paid vendor.
```

## Missing Components Identified

Both AIs flagged these as gaps:
1. **Typed, versioned artifact contracts** per service type (not ad-hoc JSON)
2. **Tenant isolation model** — separate schemas per venture recommended (AntiGravity) or shared schema + strict RLS (OpenAI)
3. **Governance layer** — permissions, cost limits, retry policies, artifact lineage
4. **Venture capability matrix** — not every service should access every repo by default

## Open Questions Remaining

1. Polling interval — what's the right cadence? Per-service? Per-venture?
2. Venture Agent implementation — standalone CLI tool? GitHub Action on a cron? Node daemon?
3. Artifact contract schema — standard JSON Schema? Protobuf? TypeScript types?
4. Cost metering — should internal service usage be metered from day one?
5. Multi-tenancy — shared schema + RLS (OpenAI) vs separate schemas (AntiGravity)?
