---
Category: Reference
Status: Approved
Version: 1.0.0
Author: DOCMON Sub-Agent
Last Updated: 2026-02-08
Tags: [cli-venture-lifecycle, eva, reference, promotion-gates]
Related SDs: [SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-001, SD-LEO-INFRA-STAGE-GATES-EXT-001]
---

# Promotion Gates Reference

Promotion Gates are approval checkpoints where the Chairman must verify that deliverables meet quality standards before the venture advances into a more resource-intensive phase. Unlike Kill Gates (which can terminate a venture), Promotion Gates either **approve** or **hold** -- a venture stays at its current stage until the gate passes.

There are 3 Promotion Gates in the 25-stage lifecycle.

## Architecture Overview

```
        THE BLUEPRINT              THE BUILD LOOP
        Stages 13-16               Stages 17-22
             |                          |
        +----+----+               +-----+-----+
        |         |               |           |
   Promotion    (none)       Promotion   Promotion
   Gate 16                   Gate 17     Gate 22
   (Schema                  (Env Ready) (GTM Ready)
    Firewall)                    |           |
        |                       v           v
        v                  Build Loop   Deployment
   Build phase              begins      approved
    begins
```

## Common Gate Behavior

All Promotion Gates share these characteristics:

- **Chairman approval required**: The Chairman must explicitly approve.
- **No kill option**: Promotion Gates cannot terminate a venture. Options are approve or hold.
- **Checklist-based**: Each gate has a specific set of items that must pass.
- **Decision recording**: All decisions stored in `chairman_decisions` with `decision_type = 'promotion_gate'`.
- **Artifact validation**: Reality Gates at the same boundary also validate that required artifacts exist and meet quality thresholds.

## Promotion Gate 16: Schema Firewall

**Stage**: 16 (Spec-Driven Schema Generation) -- end of THE BLUEPRINT phase
**Purpose**: Ensure the data model, user stories, and schema are complete and consistent before any code is written. This is the "measure twice, cut once" gate.

### Approval Criteria

The Schema Firewall uses a 12-check validation across 4 categories:

**Category 1: Entity Completeness (3 checks)**

| Check | Requirement |
|-------|-------------|
| All entities named | Every data entity from Stage 14 has a name |
| Relationships explicit | All entity relationships defined (1:1, 1:N, N:N) |
| Fields typed | Every field has a data type, nullability, and default |

**Category 2: Constraint Coverage (3 checks)**

| Check | Requirement |
|-------|-------------|
| Primary keys defined | Every entity has a primary key |
| Foreign keys defined | All relationships have foreign key constraints |
| RLS policies stated | Row-level security rules defined for multi-tenant data |

**Category 3: API Contract (3 checks)**

| Check | Requirement |
|-------|-------------|
| Endpoints generated | API contracts generated from schema |
| Auth requirements stated | Each endpoint has authentication/authorization rules |
| Request/response schemas | Input/output types for each endpoint defined |

**Category 4: Story Coverage (3 checks)**

| Check | Requirement |
|-------|-------------|
| All epics have stories | No orphan epics without user stories |
| Stories have acceptance criteria | Every user story has As a/I want/So that + criteria |
| MoSCoW prioritization complete | All stories tagged Must/Should/Could/Won't |

### Scoring

```
12 checks total, each scored PASS/FAIL

Pass threshold: 80% (10 of 12 checks must pass)

Chairman Signature Required: YES (even if 12/12 pass)
```

### Devil's Advocate Review

**Included**: Yes. GPT-4o reviews the schema against the original problem statement (Stage 1) and business model (Stage 8) to identify potential misalignment.

Devil's Advocate specifically looks for:
- Schema over-engineering (entities that don't map to user stories)
- Missing entities (user stories without data model support)
- Security gaps (data without RLS coverage)
- Scalability concerns (schema patterns that won't scale)

### Decision Flow

```
12-check validation runs automatically
         |
    Score >= 10/12 (80%)?
    |           |
   YES          NO
    |           |
    v           v
  Devil's     Chairman reviews
  Advocate    failing checks
  reviews         |
    |        Specific feedback
    v        on what to fix
  Chairman        |
  reviews         v
    |         HOLD at Stage 16
    v         (fix and re-submit)
  APPROVE
  or HOLD
    |
    v
  Advance to Stage 17
  (THE BUILD LOOP begins)
```

### On Approval

- Stage advances to Stage 17 (Environment & Agent Config)
- Venture crosses from THE BLUEPRINT into THE BUILD LOOP
- Schema becomes the binding contract for all development work
- Reality Gate at the 16-to-17 boundary also fires

### On Hold (Rejection)

- Venture stays at Stage 16
- Chairman provides specific feedback on failing checks
- Feedback stored in `chairman_decisions.metadata.failing_checks`
- Team revises and re-submits (Stage 16 re-runs with updated artifacts)
- No rollback to earlier stages -- just re-validation at current stage

### Relationship to Reality Gates

The Stage 16 Promotion Gate overlaps with the Reality Gate at the Phase 4-to-5 boundary (stages 16->17). Both gates must pass:

| Gate | What It Checks | Fail Behavior |
|------|----------------|---------------|
| Promotion Gate 16 | 12-check schema quality | Hold at Stage 16 |
| Reality Gate (16->17) | Artifact existence + quality scores | Block transition |

The Reality Gate fires first (are artifacts present?), then the Promotion Gate fires (are artifacts good enough?).

### Implementation

- Gate logic: `lib/agents/modules/venture-state-machine/stage-gates.js`
- Schema template: `lib/eva/stage-templates/stage-16.js`
- 12-check validator: Part of stage-16 template output validation
- Reality Gate: `lib/eva/reality-gates.js` (boundary check at stages 16->17)
- Devil's Advocate: `lib/eva/devils-advocate.js`

---

## Promotion Gate 17: Environment Ready

**Stage**: 17 (Environment & Agent Config) -- start of THE BUILD LOOP phase
**Purpose**: Verify that the development environment, CI/CD pipeline, and operational tooling are properly configured before any feature development begins.

### Approval Criteria

| Check | Requirement |
|-------|-------------|
| Dev environment | Local development setup documented and functional |
| Staging environment | Staging environment provisioned and accessible |
| CI/CD pipeline | Build, test, deploy pipeline configured |
| Secrets management | API keys, database credentials securely stored |
| System prompts | AI agent configurations (if applicable) defined |
| Monitoring baseline | Basic health checks and logging in place |

### Scoring

```
6 checks, each scored PASS/FAIL

All checks must pass for approval

Chairman Approval Required: YES
```

### Devil's Advocate Review

**Not included** at Gate 17. The environment readiness check is primarily operational, not strategic. Devil's Advocate is reserved for gates with strategic implications (Kill Gates and Promotion Gates 16/22).

### Decision Flow

```
Environment readiness checks run
         |
    All 6 checks pass?
    |           |
   YES          NO
    |           |
    v           v
  Chairman    Chairman reviews
  reviews     failing checks
    |              |
  APPROVE       Specific guidance
  or HOLD       on what to configure
    |              |
    v              v
  Advance to   HOLD at Stage 17
  Stage 18     (fix and re-submit)
```

### On Approval

- Stage advances to Stage 18 (MVP Development Loop)
- The LIFECYCLE-TO-SD BRIDGE activates -- sprint items become real LEO SDs
- Development work can begin

### On Hold (Rejection)

- Venture stays at Stage 17
- Missing infrastructure must be provisioned
- Common hold reasons: CI/CD not configured, secrets not managed, no staging environment

### Implementation

- Gate logic: `lib/agents/modules/venture-state-machine/stage-gates.js`
- Environment template: `lib/eva/stage-templates/stage-17.js`
- Readiness validator: Part of stage-17 template output validation

---

## Promotion Gate 22: Go-to-Market Ready

**Stage**: 22 (Deployment & Infrastructure) -- end of THE BUILD LOOP phase
**Purpose**: Final verification before production launch that all deployment infrastructure, monitoring, and operational procedures are in place.

### Approval Criteria

The Go-to-Market readiness gate uses a 14-item pre-deployment checklist:

**Category 1: Infrastructure (4 items)**

| Item | Requirement |
|------|-------------|
| Production environment | Provisioned, configured, secured |
| Database | Schema applied, seeds loaded, backups configured |
| CDN/Static assets | Configured for production traffic |
| DNS/SSL | Domain configured, SSL certificates active |

**Category 2: Monitoring (3 items)**

| Item | Requirement |
|------|-------------|
| Error tracking | Sentry or equivalent configured |
| Performance monitoring | APM tool configured with baselines |
| Uptime monitoring | Health check endpoints, alerting rules |

**Category 3: Operations (4 items)**

| Item | Requirement |
|------|-------------|
| Runbooks | Operational procedures documented |
| Incident response | Escalation paths, on-call rotation defined |
| Rollback procedure | Tested rollback mechanism in place |
| Deployment strategy | Blue/green, canary, or rolling deploy configured |

**Category 4: Compliance (3 items)**

| Item | Requirement |
|------|-------------|
| Security scan | Final security audit passed (Stage 20 output) |
| Performance test | Load test results within SLA (Stage 20 output) |
| UAT sign-off | All UAT test cases passed (Stage 21 output) |

### Scoring

```
14 items, each scored PASS/FAIL

All 14 items must pass for approval

Chairman Signature Required: YES
```

### Devil's Advocate Review

**Included**: Yes. GPT-4o reviews the deployment plan against the original risk matrix (Stage 6) to identify unmitigated risks.

Devil's Advocate specifically looks for:
- Deployment risks not addressed in the rollback plan
- Monitoring gaps relative to identified risks
- Operational readiness vs. team capacity
- Single points of failure in the infrastructure

### Decision Flow

```
14-item checklist runs automatically
         |
    All 14 items pass?
    |           |
   YES          NO
    |           |
    v           v
  Devil's     Chairman reviews
  Advocate    failing items
  reviews         |
    |        Specific feedback
    v        on what to fix
  Chairman        |
  reviews         v
    |         HOLD at Stage 22
    v         (fix and re-submit)
  APPROVE
  or HOLD
    |
    v
  Advance to Stage 23
  (LAUNCH & LEARN begins)
  Kill Gate 23 awaits
```

### On Approval

- Stage advances to Stage 23 (Production Launch)
- Venture crosses from THE BUILD LOOP into LAUNCH & LEARN
- **Kill Gate 23** (Go/No-Go) is the next gate -- this is the final decision point
- Reality Gate at the 22-to-23 boundary also validates

### On Hold (Rejection)

- Venture stays at Stage 22
- Failing items must be addressed
- Common hold reasons: missing runbooks, incomplete monitoring, failed security scan
- Feedback stored in `chairman_decisions.metadata.failing_items`

### Relationship to Reality Gates

The Stage 22 Promotion Gate overlaps with the Reality Gate at the Build-to-Launch boundary (stages 20->21). The sequence is:

```
Stage 20 (Security/Perf) --> Reality Gate (20->21) --> Stage 21 (QA/UAT)
    --> Stage 22 (Deployment) --> Promotion Gate 22 --> Stage 23 (Launch)
```

| Gate | What It Checks | Fail Behavior |
|------|----------------|---------------|
| Reality Gate (20->21) | Security/perf artifacts exist | Block transition |
| Promotion Gate 22 | 14-item deployment readiness | Hold at Stage 22 |

### Implementation

- Gate logic: `lib/agents/modules/venture-state-machine/stage-gates.js`
- Deployment template: `lib/eva/stage-templates/stage-22.js`
- 14-item checklist: Part of stage-22 template output validation
- Reality Gate: `lib/eva/reality-gates.js` (boundary check at stages 20->21)
- Devil's Advocate: `lib/eva/devils-advocate.js`
- Prerequisite: Validates Stage 21 QA/UAT sign-off artifact exists

---

## Promotion Gate Comparison

| Aspect | Gate 16 | Gate 17 | Gate 22 |
|--------|---------|---------|---------|
| Phase boundary | BLUEPRINT -> BUILD | BUILD start | BUILD -> LAUNCH |
| Focus | Schema quality | Environment setup | Deployment readiness |
| Check count | 12 items | 6 items | 14 items |
| Pass threshold | 80% (10/12) | 100% (6/6) | 100% (14/14) |
| Devil's Advocate | Yes | No | Yes |
| Reality Gate overlap | Yes (16->17) | No | Yes (20->21) |
| Common hold reason | Missing RLS, orphan epics | No CI/CD, no staging | Missing runbooks |

## Promotion vs Kill Gates

```
+------------------+--------------------+--------------------+
|                  | KILL GATES         | PROMOTION GATES    |
+------------------+--------------------+--------------------+
| Purpose          | Should we continue | Are we ready to    |
|                  | this venture?      | advance?           |
+------------------+--------------------+--------------------+
| Options          | Kill / Revise /    | Approve / Hold     |
|                  | Proceed            |                    |
+------------------+--------------------+--------------------+
| Can terminate    | YES                | NO                 |
| venture?         |                    |                    |
+------------------+--------------------+--------------------+
| Rollback target  | Often Stage 1      | Same stage         |
|                  | (full restart)     | (fix and retry)    |
+------------------+--------------------+--------------------+
| Devil's Advocate | All 4 gates        | Gates 16, 22 only  |
+------------------+--------------------+--------------------+
| Chairman         | All gates          | All gates          |
| required?        |                    |                    |
+------------------+--------------------+--------------------+
| Stages           | 3, 5, 13, 23      | 16, 17, 22         |
+------------------+--------------------+--------------------+
```

## Lifecycle Position Diagram

```
Stage:  1 .. 5    6 .. 12   13 .. 16   17   18 .. 22   23 .. 25
        |    |    |         |     |     |    |     |    |
        v    v    v         v     v     v    v     v    v
       [...][KILL][...]    [KILL][PROMO][PROMO][..][PROMO][KILL]
             G5            G13   G16   G17        G22   G23
                                  |     |          |
                           Schema  Env    Go-to-
                           Firewall Ready  Market
                                          Ready
```
