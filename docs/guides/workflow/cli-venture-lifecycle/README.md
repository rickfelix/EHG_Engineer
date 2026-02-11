---
Category: Architecture
Status: Approved
Version: 1.0.0
Author: DOCMON Sub-Agent
Last Updated: 2026-02-08
Tags: [cli-venture-lifecycle, eva, orchestrator, index]
Related SDs: [SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-001]
---

# CLI Venture Lifecycle Documentation Hub

Complete documentation for the **Eva Orchestrator** and the **25-Stage Venture Lifecycle** framework. This system implements a CLI-driven autonomous orchestrator that takes ventures from initial idea through to optimized, scaling product.

**Implementation Status**: All 28 Strategic Directives completed (2026-02-07)

---

## Quick Navigation

### System Architecture

| Document | Description |
|----------|-------------|
| [00-overview.md](./00-overview.md) | System architecture, component map, quick start |
| [01-foundation-infrastructure.md](./01-foundation-infrastructure.md) | 7 foundation components and dependency chain |
| [02-eva-orchestrator.md](./02-eva-orchestrator.md) | Core orchestration engine (`processStage()` flow) |

### Core Components

| Document | Description |
|----------|-------------|
| [03-decision-filter-engine.md](./03-decision-filter-engine.md) | 6 trigger types, deterministic risk evaluation |
| [04-reality-gates.md](./04-reality-gates.md) | Phase boundary enforcement, artifact validation |
| [05-chairman-preferences.md](./05-chairman-preferences.md) | Scoped preference resolution, threshold configuration |
| [06-lifecycle-to-sd-bridge.md](./06-lifecycle-to-sd-bridge.md) | Stage 18 sprint-to-SD conversion |
| [07-devils-advocate.md](./07-devils-advocate.md) | GPT-4o adversarial review system |
| [08-constraint-drift-detection.md](./08-constraint-drift-detection.md) | Stage 1 vs Stage 25 assumption comparison |

### Stage Documentation

| Document | Stages | Phase |
|----------|--------|-------|
| [stages/README.md](./stages/README.md) | Index | Visual map of all 25 stages |
| [stages/phase-01-the-truth.md](./stages/phase-01-the-truth.md) | 1-5 | Idea validation (2 kill gates) |
| [stages/phase-02-the-engine.md](./stages/phase-02-the-engine.md) | 6-9 | Business model foundation |
| [stages/phase-03-the-identity.md](./stages/phase-03-the-identity.md) | 10-12 | Brand and GTM strategy |
| [stages/phase-04-the-blueprint.md](./stages/phase-04-the-blueprint.md) | 13-16 | Technical specification |
| [stages/phase-05-the-build-loop.md](./stages/phase-05-the-build-loop.md) | 17-22 | Implementation (all SD-required) |
| [stages/phase-06-launch-and-learn.md](./stages/phase-06-launch-and-learn.md) | 23-25 | Deploy and optimize |

### Reference

| Document | Description |
|----------|-------------|
| [reference/kill-gates.md](./reference/kill-gates.md) | Kill gates at stages 3, 5, 13, 23 |
| [reference/promotion-gates.md](./reference/promotion-gates.md) | Promotion gates at stages 16, 17, 22 |
| [reference/sd-requirements.md](./reference/sd-requirements.md) | 12 stages requiring SD creation |
| [reference/gate-thresholds.md](./reference/gate-thresholds.md) | Quantitative thresholds per stage |
| [reference/filter-triggers.md](./reference/filter-triggers.md) | 6 Decision Filter trigger definitions |
| [reference/chairman-decisions.md](./reference/chairman-decisions.md) | D01-D06 design decisions |

### Guides

| Document | Description |
|----------|-------------|
| [guides/developer-setup.md](./guides/developer-setup.md) | Environment setup, dependencies |
| [guides/running-a-venture.md](./guides/running-a-venture.md) | End-to-end venture orchestration walkthrough |
| [guides/testing-guide.md](./guides/testing-guide.md) | Unit, integration, E2E testing strategies |
| [guides/troubleshooting.md](./guides/troubleshooting.md) | Common issues and recovery procedures |
| [guides/extending-stages.md](./guides/extending-stages.md) | Adding new stages or modifying templates |

### Implementation Details

| Document | Description |
|----------|-------------|
| [implementation/database-schema.md](./implementation/database-schema.md) | Complete schema with relationships |
| [implementation/api-reference.md](./implementation/api-reference.md) | Public API documentation |
| [implementation/error-handling.md](./implementation/error-handling.md) | Error taxonomy and recovery patterns |
| [implementation/performance-scaling.md](./implementation/performance-scaling.md) | Performance targets and scaling |

---

## System at a Glance

```
                          EVA ORCHESTRATOR
                    CLI Venture Lifecycle System

    ┌─────────────────────────────────────────────────┐
    │                                                   │
    │   25 Stages  ·  6 Phases  ·  4 Kill Gates        │
    │   3 Promotion Gates  ·  5 Reality Gates           │
    │   6 Filter Triggers  ·  12 SD-Required Stages     │
    │                                                   │
    │   ~6,500 LOC  ·  28 SDs  ·  10 DB Tables         │
    │                                                   │
    └─────────────────────────────────────────────────┘
```

**Key Entry Points:**

| What | Where |
|------|-------|
| Core orchestrator | `lib/eva/eva-orchestrator.js` (502 lines) |
| Module barrel export | `lib/eva/index.js` |
| Stage templates | `lib/eva/stage-templates/stage-{01-25}.js` |
| Template registry | `lib/eva/stage-templates/index.js` |
| Services layer | `lib/eva/services/` |
| Unit tests | `tests/unit/eva/` |
| UAT tests | `tests/uat/eva.spec.js` |

---

## SD Hierarchy

```
Level 0: SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-001 (Root)
  │
  ├── Level 1: SD-LEO-ORCH-CLI-VL-FOUNDATION-001
  │     ├── SD-LEO-INFRA-VENTURE-CONTEXT-001
  │     ├── SD-LEO-INFRA-SD-NAMESPACING-001
  │     ├── SD-LEO-INFRA-CHAIRMAN-PREFS-001
  │     ├── SD-LEO-INFRA-FILTER-ENGINE-001
  │     ├── SD-LEO-INFRA-REALITY-GATES-001
  │     ├── SD-LEO-INFRA-STAGE-GATES-EXT-001
  │     └── SD-LEO-FEAT-EVA-ORCHESTRATOR-001
  │
  ├── Level 1: SD-LEO-ORCH-CLI-VL-TEMPLATES-001
  │     ├── SD-LEO-FEAT-TMPL-TRUTH-001 (Stages 1-5)
  │     ├── SD-LEO-FEAT-TMPL-ENGINE-001 (Stages 6-9)
  │     ├── SD-LEO-FEAT-TMPL-IDENTITY-001 (Stages 10-12)
  │     ├── SD-LEO-FEAT-TMPL-BLUEPRINT-001 (Stages 13-16)
  │     ├── SD-LEO-FEAT-TMPL-BUILD-001 (Stages 17-22)
  │     └── SD-LEO-FEAT-TMPL-LAUNCH-001 (Stages 23-25)
  │
  ├── Level 1: SD-LEO-ORCH-CLI-VL-INTELLIGENCE-001
  │     ├── SD-LEO-FEAT-DEVILS-ADVOCATE-001
  │     ├── SD-LEO-FEAT-LIFECYCLE-SD-BRIDGE-001
  │     ├── SD-LEO-FEAT-SERVICE-PORTS-001
  │     └── SD-LEO-FEAT-CONSTRAINT-DRIFT-001
  │
  ├── Level 1: SD-LEO-ORCH-CLI-VL-DASHBOARD-001
  │     ├── SD-EHG-FEAT-DASH-OVERVIEW-001
  │     ├── SD-EHG-FEAT-DASH-FINANCIAL-001
  │     ├── SD-EHG-FEAT-DASH-COMPETITIVE-001
  │     └── SD-EHG-FEAT-DASH-BUILD-001
  │
  ├── SD-LEO-FEAT-CROSS-VENTURE-001 (Learning)
  └── SD-LEO-FEAT-FILTER-CALIBRATE-001 (Learning)
```

---

## Related Documentation

| Document | Location |
|----------|----------|
| 25-Stage Overview | `docs/workflow/25-stage-venture-lifecycle-overview.md` |
| Design Analysis | `eva-orchestrator-design-analysis.md` |
| Database Analysis | `docs/analysis/SD-LEO-FEAT-EVA-ORCHESTRATOR-001-DATABASE-ANALYSIS.md` |
| SD Hierarchy Migration | `database/migrations/20260207_cli_venture_lifecycle_sd_hierarchy_SUMMARY.md` |
| LEO Protocol | `CLAUDE.md` (auto-generated from database) |

---

**Total Documentation**: 32 files across 5 sections
**Generated**: 2026-02-08
