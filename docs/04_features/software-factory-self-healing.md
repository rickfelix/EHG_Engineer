---
Category: Feature
Status: Draft
Version: 1.0.0
Author: LEO Orchestrator
Last Updated: 2026-04-01
Tags: software-factory, sentry, self-healing, monitoring, venture-health
---

# Feature: Software Factory Self-Healing Loop

## Overview

The Software Factory self-healing loop automates error detection, diagnosis, and correction across the EHG venture portfolio. It connects Sentry runtime monitoring to the LEO Protocol's corrective SD pipeline, enabling sub-linear maintenance scaling as ventures grow.

**Problem**: Maintenance burden grows O(N) with ventures while engineering hours remain O(1). Without automated error detection, bugs are discovered reactively.

**Solution**: Sentry SDK in each venture captures runtime errors. A scheduled poller ingests errors into the central feedback table. The existing heal scoring loop evaluates impact. Corrective SDs are auto-generated for fixable issues. The chairman reviews and approves PRs.

### Relationship to Post-Pipeline Operations

This system complements the [EVA Post-Pipeline Operations Mode](./eva-post-pipeline-operations.md):

| System | Scope | When Active | Data Source |
|--------|-------|-------------|-------------|
| **Post-Pipeline Ops** | Health scoring, feedback classification, financial sync, metrics | After Stage 25 (venture live) | Internal health checks, feedback table |
| **Software Factory** | Runtime error detection, auto-correction via SDs | After Stage 18 (build execution) | Sentry SDK in deployed venture |

The Software Factory feeds errors into the same `feedback` table that Post-Pipeline Ops classifies. They work together: Software Factory detects errors, Post-Pipeline Ops classifies and monitors health trends.

---

## Architecture

### Data Flow

```
Venture App (Sentry SDK)
  → Sentry Cloud (error storage)
    → poll-errors.js (scheduled every 30min via GitHub Actions)
      → content-sanitizer.js (prompt injection defense)
        → feedback-writer.js (central feedback table, error_hash dedup)
          → /heal scoring loop (evaluates error impact)
            → corrective-sd-generator.js (auto-creates SDs)
              → LEO Protocol (LEAD→PLAN→EXEC)
                → Chairman reviews PR
```

### Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `sentry-poller.js` | `lib/factory/` | Polls Sentry REST API per venture with rate limit handling |
| `content-sanitizer.js` | `lib/factory/` | Prompt injection defense — strips control chars, truncates, XML-wraps |
| `feedback-writer.js` | `lib/factory/` | Writes to feedback table with SHA-256 error_hash dedup |
| `guardrails.js` | `lib/factory/` | Enforces 10 CRO guardrails (rate limits, kill switch, etc.) |
| `daily-digest.js` | `lib/factory/` | Chairman portfolio health summary |
| `poll-errors.js` | `scripts/factory/` | CLI entry point for scheduled polling |
| `venture-provisioner.js` Step 18 | `lib/eva/bridge/` | Auto-creates Sentry project + stores config |
| `software-factory-poll.yml` | `.github/workflows/` | Clockwork schedule: every 30min, 8AM-10PM UTC |

### Database Tables

| Table | Purpose |
|-------|---------|
| `feedback` | Central error storage. Extended with `sentry_issue_id`, `sentry_first_seen`, `auto_correction_status` columns. |
| `factory_guardrail_state` | Per-venture guardrail state: corrections_today, kill_switch_active, canary_expires_at |
| `ventures.metadata.sentry` | Sentry config per venture: org, project, token, baseUrl, dsn |

---

## Venture Lifecycle Integration

### When Monitoring Starts

Monitoring is configured at **Stage 18 (Build Execution)** via the venture provisioner:

1. **Provisioner Step 18** (`monitoring_baseline`) runs automatically during venture creation
2. Creates Sentry project via API (Internal Integration token with project:write scope)
3. Fetches DSN and stores in `ventures.metadata.sentry`
4. Initializes `factory_guardrail_state` for the venture
5. Build prompt includes Sentry SDK installation instructions for Replit agent

### Chairman Experience

The chairman's interaction with the self-healing loop:

1. **No setup required** — Sentry project created automatically at Stage 18
2. **Build prompt handles SDK** — Replit agent installs `@sentry/node` as part of normal build
3. **Daily digest** — `node scripts/factory/poll-errors.js --digest` shows portfolio health
4. **PR review** — Corrective SDs produce PRs for chairman approval (Phase 1: human-in-the-loop)
5. **Kill switch** — Available via `factory_guardrail_state.kill_switch_active` if needed

---

## CRO Guardrails

All 10 guardrails from the board's Chief Risk Officer are enforced:

| # | Guardrail | Enforcement |
|---|-----------|-------------|
| 1 | Max 3 corrections/venture/24h | `factory_guardrail_state.corrections_today` counter |
| 2 | Depth limit 2 | No fix-the-fix-the-fix chains |
| 3 | Rollback-before-retry | Previous fix must be rolled back before retrying |
| 4 | Global kill switch | `factory_guardrail_state.kill_switch_active` |
| 5 | Tests must pass | Corrective SD requires passing test suite |
| 6 | 30 LOC limit | Maximum lines of code per correction |
| 7 | 30-min canary period | `factory_guardrail_state.canary_expires_at` |
| 8 | Freshness check | Errors older than 72h are skipped |
| 9 | Venture isolation | No cross-venture changes in a single correction |
| 10 | Daily digest | Chairman receives portfolio summary |

---

## Prompt Injection Defense

Error messages from Sentry are sanitized before LLM consumption to prevent prompt injection:

1. **Control character stripping** — removes zero-width chars, RTL/LTR marks, escape sequences
2. **Truncation** — messages capped at 500 chars, stack traces at 1000 chars
3. **XML wrapping** — content wrapped in `<error-title>`, `<error-message>`, `<error-stacktrace>` tags
4. **Pattern detection** — 6 injection patterns flagged: `system:`, `assistant:`, `<system>` tags, `ignore previous instructions`, etc.
5. **Human review** — Phase 1 requires chairman PR approval for all corrections

---

## Phasing

| Phase | Status | Description |
|-------|--------|-------------|
| **Phase 1** | Shipped (PR #2623, #2626, #2629, #2630) | Full pipeline: poller, sanitizer, writer, guardrails, digest, provisioner Step 18, build prompt integration, scheduled polling |
| **Phase 2** | Planned | Tier 1 auto-execution for corrections ≤30 LOC with passing tests. Requires 50+ successful manual reviews as trust threshold. |
| **Phase 3** | Planned | Cross-venture pattern detection — same error class across ventures triggers portfolio-wide fix. |

---

## CLI Reference

```bash
# Poll all active ventures for errors
node scripts/factory/poll-errors.js

# Poll a specific venture
node scripts/factory/poll-errors.js --venture CronRead

# Preview without writing to database
node scripts/factory/poll-errors.js --dry-run

# Generate daily digest
node scripts/factory/poll-errors.js --digest

# Show help
node scripts/factory/poll-errors.js --help
```

---

## Related Documentation

- [EVA Post-Pipeline Operations Mode](./eva-post-pipeline-operations.md) — Health workers for live ventures
- [Venture Factory Architecture (ADR-002)](../01_architecture/adr-002-venture-factory-architecture.md) — Factory architecture overview
- [Clockwork Scheduling Standard](../reference/clockwork-scheduling-standard.md) — GitHub Actions schedule grid
- Vision: `VISION-SOFTWARE-FACTORY-L2-001` (database)
- Architecture: `ARCH-SOFTWARE-FACTORY-001` (database)
- Brainstorm: Session `6c680141-925e-4360-980a-e19af2ca983c` (database)

---

## SDs

| SD | Status | PRs |
|----|--------|-----|
| SD-LEO-INFRA-SOFTWARE-FACTORY-AUTOMATED-001 | Completed | #2623 |
| SD-LEO-INFRA-STAGE-BUILD-PROMPT-001 | Completed | #2629 |
| Gap fixes | Completed | #2626, #2630 |
