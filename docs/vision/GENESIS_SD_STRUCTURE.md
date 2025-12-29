# Genesis Oath v3.1: Strategic Directive Structure

> **Document Version: GENESIS-V3.1**
> **Vision Version: 3.1**
> **Status: DRAFT - AWAITING SD CREATION**
> **Last Updated: 2025-12-29**

---

## Purpose

This document defines the Strategic Directive (SD) hierarchy for implementing the Genesis Oath v3.1 vision. All SDs must reference the vision documents and adhere to the parent-child-grandchild architecture.

---

## Velocity Assumptions

| Metric | Value |
|--------|-------|
| **SD Completion Rate** | ~3 SDs per hour |
| **Total SDs** | ~330 |
| **Total Hours** | ~110 hours |
| **Timeline** | Dec 29, 2025 – Feb 14, 2026 |

---

## Vision Reference (Required in All SDs)

All SDs MUST include this reference block:

```yaml
vision_reference:
  version: "GENESIS-V3.1"
  documents:
    - path: "docs/vision/GENESIS_OATH_V3.md"
      purpose: "Master vision and philosophy"
    - path: "docs/vision/GENESIS_SPRINT_ROADMAP.md"
      purpose: "Sprint plan and SD breakdown"
    - path: "docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md"
      purpose: "Technical architecture"
    - path: "docs/vision/GENESIS_RITUAL_SPECIFICATION.md"
      purpose: "Ritual ceremony specification"
  target_date: "2026-02-14"
  ritual_time: "09:00 AM EST"
```

---

## SD Hierarchy

### Level 0: Parent SD (Umbrella)

```yaml
sd_id: "SD-GENESIS-V31-PARENT"
title: "Genesis Oath v3.1 - The Simulation Chamber"
type: "parent"
status: "draft"
priority: "critical"

description: |
  Implement the Genesis Oath v3.1 Simulation Chamber architecture.
  Enable autonomous venture creation through the "Collapse of the Wave Function" ritual.
  Target: February 14, 2026, 09:00 AM EST.

vision_reference:
  version: "GENESIS-V3.1"
  primary_document: "docs/vision/GENESIS_OATH_V3.md"

success_criteria:
  - "Simulation Chamber infrastructure operational"
  - "Text-to-Simulation pipeline functional"
  - "/ratify command executes successfully"
  - "Feb 14 ritual completes without errors"

children:
  - "SD-GENESIS-V31-MASON"
  - "SD-GENESIS-V31-DREAMCATCHER"
  - "SD-GENESIS-V31-MIRROR"
  - "SD-GENESIS-V31-RITUAL"

total_capacity:
  sds: 330
  hours: 110
```

---

### Level 1: Child SDs (Sprints)

#### Child 1: The Mason (Sprint 1)

```yaml
sd_id: "SD-GENESIS-V31-MASON"
title: "Sprint 1: The Mason - Simulation Infrastructure"
type: "child"
parent: "SD-GENESIS-V31-PARENT"
status: "draft"
priority: "critical"

description: |
  Build the Simulation Chamber infrastructure.
  Focus: Ephemeral repo, schema, and deployment systems.
  Zodiac: Capricorn (Structure)

vision_reference:
  version: "GENESIS-V3.1"
  primary_document: "docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md"
  sections:
    - "The Two Namespaces (Hard Isolation)"
    - "Database Schema"
    - "Infrastructure Components"

timeline:
  start: "2025-12-29"
  end: "2026-01-19"
  duration_days: 22

capacity:
  sds: 110
  hours: ~37

grandchildren:
  - "SD-GENESIS-V31-MASON-P1"
  - "SD-GENESIS-V31-MASON-P2"
  - "SD-GENESIS-V31-MASON-P3"

exit_criteria:
  - "ehg-simulations GitHub org exists"
  - "*.possible.ehg.dev domain resolves"
  - "schema_sim_* namespace functional"
  - "Simulation repo scaffolder works"
  - "Ephemeral deployment pipeline works"
  - "TTL and garbage collection functional"
```

#### Child 2: The Dreamcatcher (Sprint 2)

```yaml
sd_id: "SD-GENESIS-V31-DREAMCATCHER"
title: "Sprint 2: The Dreamcatcher - Text-to-Simulation Intelligence"
type: "child"
parent: "SD-GENESIS-V31-PARENT"
status: "draft"
priority: "critical"

description: |
  Build the intelligence layer for autonomous artifact generation.
  Focus: PRD generation, schema/repo simulation, approval gate.
  Zodiac: Aquarius (Intelligence)

vision_reference:
  version: "GENESIS-V3.1"
  primary_document: "docs/vision/GENESIS_OATH_V3.md"
  sections:
    - "PRD Scope Clarification"
    - "The /ratify Command: Scope Definition"
    - "Epistemic Tagging (Canon Law)"

timeline:
  start: "2026-01-20"
  end: "2026-02-08"
  duration_days: 20

capacity:
  sds: 140
  hours: ~47

grandchildren:
  - "SD-GENESIS-V31-DREAM-P1"
  - "SD-GENESIS-V31-DREAM-P2"
  - "SD-GENESIS-V31-DREAM-P3"

exit_criteria:
  - "Text → PRD generation works"
  - "PRD → Schema simulation works"
  - "PRD → Repo simulation works"
  - "/ratify command functional"
  - "Contract of Pain prompt displays"
  - "Venture creation at Stage 1 works"
```

#### Child 3: The Mirror (Sprint 3)

```yaml
sd_id: "SD-GENESIS-V31-MIRROR"
title: "Sprint 3: The Mirror - Integration & Elevation"
type: "child"
parent: "SD-GENESIS-V31-PARENT"
status: "draft"
priority: "critical"

description: |
  Connect all systems and implement elevation logic.
  Focus: End-to-end pipeline, elevation, garbage collection.
  Zodiac: Pisces (Integration)
  CONSTRAINT: No new logic after Feb 10 (Mercury Shadow)

vision_reference:
  version: "GENESIS-V3.1"
  primary_document: "docs/vision/GENESIS_OATH_V3.md"
  sections:
    - "Elevation Mechanics (Simulation → Reality)"
    - "TTL Enforcement (Non-Negotiable)"

timeline:
  start: "2026-02-09"
  end: "2026-02-13"
  duration_days: 5

capacity:
  sds: 80
  hours: ~27

grandchildren:
  - "SD-GENESIS-V31-MIRROR-INT"
  - "SD-GENESIS-V31-MIRROR-ELEV"
  - "SD-GENESIS-V31-MIRROR-TEST"

exit_criteria:
  - "End-to-end simulation flow works"
  - "Stage 16/17 elevation logic works"
  - "Stage 3 rejection cleanup works"
  - "CLI status command works"
  - "Error recovery tested"

constraints:
  - "NO NEW LOGIC AFTER FEB 10"
  - "Focus on integration and testing only"
```

#### Child 4: Genesis Ritual (Preparation)

```yaml
sd_id: "SD-GENESIS-V31-RITUAL"
title: "Genesis Ritual Preparation"
type: "child"
parent: "SD-GENESIS-V31-PARENT"
status: "draft"
priority: "critical"

description: |
  Prepare for the February 14, 2026 Genesis Oath ritual.
  Verify all systems, prepare seed, execute ceremony.

vision_reference:
  version: "GENESIS-V3.1"
  primary_document: "docs/vision/GENESIS_RITUAL_SPECIFICATION.md"

timeline:
  prep_start: "2026-02-13"
  ritual_date: "2026-02-14"
  ritual_time: "09:00 AM EST"

capacity:
  sds: 0  # Observation only
  hours: 2  # Ritual execution

exit_criteria:
  - "Pre-ritual checklist complete"
  - "Venture seed prepared"
  - "All systems verified green"
  - "Ritual executes successfully"
  - "Genesis-001 created at Stage 1"
```

---

### Level 2: Grandchild SDs (Phases)

#### Mason Phase 1: Ephemeral Foundation

```yaml
sd_id: "SD-GENESIS-V31-MASON-P1"
title: "Mason Phase 1: Ephemeral Foundation"
type: "grandchild"
parent: "SD-GENESIS-V31-MASON"
grandparent: "SD-GENESIS-V31-PARENT"
status: "draft"

description: |
  Establish the foundational infrastructure for simulations.

vision_reference:
  version: "GENESIS-V3.1"
  section: "The Two Namespaces (Hard Isolation)"

timeline:
  start: "2025-12-29"
  end: "2026-01-05"
  duration_days: 8

capacity:
  sds: 40
  hours: ~13

deliverables:
  - sd: "SD-MAS-001"
    title: "GitHub Simulations Org"
    description: "Create ehg-simulations GitHub organization"
    hours: 1
  - sd: "SD-MAS-002"
    title: "Simulation Domain Setup"
    description: "Configure *.possible.ehg.dev wildcard DNS"
    hours: 1.7
  - sd: "SD-MAS-003"
    title: "Simulation DB Namespace"
    description: "Create schema_sim_* namespace convention"
    hours: 1.7
  - sd: "SD-MAS-004"
    title: "Epistemic Tagging Schema"
    description: "Implement epistemic_status field"
    hours: 2.7
  - sd: "SD-MAS-005"
    title: "TTL System"
    description: "Auto-archive logic for expired simulations"
    hours: 2.3
  - sd: "SD-MAS-006"
    title: "Simulation Metadata Table"
    description: "simulation_artifacts table with tracking"
    hours: 2
  - sd: "SD-MAS-007"
    title: "GitHub API Integration"
    description: "Auth and permissions for simulation org"
    hours: 2

exit_criteria:
  - "GitHub org ehg-simulations exists"
  - "DNS *.possible.ehg.dev configured"
  - "schema_sim_* namespace pattern works"
  - "epistemic_status field in schema"
  - "TTL countdown functional"
```

#### Mason Phase 2: Simulation Scaffolder

```yaml
sd_id: "SD-GENESIS-V31-MASON-P2"
title: "Mason Phase 2: Simulation Scaffolder"
type: "grandchild"
parent: "SD-GENESIS-V31-MASON"
grandparent: "SD-GENESIS-V31-PARENT"
status: "draft"

description: |
  Build the repo and schema scaffolding systems.

vision_reference:
  version: "GENESIS-V3.1"
  section: "Infrastructure Components"

timeline:
  start: "2026-01-06"
  end: "2026-01-12"
  duration_days: 7

capacity:
  sds: 35
  hours: ~12

deliverables:
  - sd: "SD-MAS-008"
    title: "Repo Template System"
    description: "Venture scaffold templates"
    hours: 2.7
  - sd: "SD-MAS-009"
    title: "gh repo create Automation"
    description: "Create repos in simulation org"
    hours: 2.3
  - sd: "SD-MAS-010"
    title: "Git Init + Initial Commit"
    description: "Automated first push"
    hours: 1.7
  - sd: "SD-MAS-011"
    title: "Schema Template Library"
    description: "Pre-validated table patterns"
    hours: 2.7
  - sd: "SD-MAS-012"
    title: "Migration Generator"
    description: "JSON schema → SQL migration"
    hours: 2.3

exit_criteria:
  - "Repo scaffolder creates repos in ehg-simulations"
  - "Schema generator creates schema_sim_* tables"
  - "Templates applied correctly"
```

#### Mason Phase 3: Ephemeral Deploy

```yaml
sd_id: "SD-GENESIS-V31-MASON-P3"
title: "Mason Phase 3: Ephemeral Deploy"
type: "grandchild"
parent: "SD-GENESIS-V31-MASON"
grandparent: "SD-GENESIS-V31-PARENT"
status: "draft"

description: |
  Build the ephemeral deployment pipeline.

vision_reference:
  version: "GENESIS-V3.1"
  section: "Deployment Infrastructure"

timeline:
  start: "2026-01-13"
  end: "2026-01-19"
  duration_days: 7

capacity:
  sds: 35
  hours: ~12

deliverables:
  - sd: "SD-MAS-013"
    title: "Vercel Simulation Project"
    description: "Ephemeral deployment target"
    hours: 2
  - sd: "SD-MAS-014"
    title: "Deploy Automation"
    description: "Repo → Live URL pipeline"
    hours: 2.7
  - sd: "SD-MAS-015"
    title: "Watermark Overlay"
    description: "SIMULATION banner on preview URLs"
    hours: 1.7
  - sd: "SD-MAS-016"
    title: "Health Check Endpoint"
    description: "/health returns 200 with metadata"
    hours: 1.3
  - sd: "SD-MAS-017"
    title: "Cost Cap Enforcement"
    description: "Budget limits on simulation infra"
    hours: 1.7
  - sd: "SD-MAS-018"
    title: "Garbage Collection"
    description: "Stage 3 rejection cleanup"
    hours: 2.3

exit_criteria:
  - "Simulation deploys to *.possible.ehg.dev"
  - "Watermark displays on all simulation URLs"
  - "Health endpoint functional"
  - "Garbage collection destroys rejected simulations"
```

---

## Dreamcatcher Grandchildren

#### Dreamcatcher Phase 1: PRD Generation

```yaml
sd_id: "SD-GENESIS-V31-DREAM-P1"
title: "Dreamcatcher Phase 1: PRD Generation"
type: "grandchild"
parent: "SD-GENESIS-V31-DREAMCATCHER"
grandparent: "SD-GENESIS-V31-PARENT"
status: "draft"

timeline:
  start: "2026-01-20"
  end: "2026-01-26"
  duration_days: 7

capacity:
  sds: 45
  hours: ~15

deliverables:
  - sd: "SD-DRM-001"
    title: "Venture Seed Parser"
    description: "Raw text → structured intake"
    hours: 2.7
  - sd: "SD-DRM-002"
    title: "PRD Template Engine"
    description: "Stage 1-2 artifact generation"
    hours: 3.3
  - sd: "SD-DRM-003"
    title: "Problem/Solution Extraction"
    description: "NLP extraction from seed"
    hours: 2.7
  - sd: "SD-DRM-004"
    title: "Requirements Generator"
    description: "Functional requirements from seed"
    hours: 3.3
  - sd: "SD-DRM-005"
    title: "PRD Validator"
    description: "Quality gates for generated PRD"
    hours: 3

exit_criteria:
  - "Text input generates valid PRD"
  - "PRD scoped to Stage 1-2 (validation target)"
  - "PRD validation passes quality gates"
```

#### Dreamcatcher Phase 2: Schema/Repo Simulation

```yaml
sd_id: "SD-GENESIS-V31-DREAM-P2"
title: "Dreamcatcher Phase 2: Schema/Repo Simulation"
type: "grandchild"
parent: "SD-GENESIS-V31-DREAMCATCHER"
grandparent: "SD-GENESIS-V31-PARENT"
status: "draft"

timeline:
  start: "2026-01-27"
  end: "2026-02-02"
  duration_days: 7

capacity:
  sds: 50
  hours: ~17

deliverables:
  - sd: "SD-DRM-006"
    title: "PRD-to-Schema Intelligence"
    description: "Extract data model from PRD"
    hours: 4
  - sd: "SD-DRM-007"
    title: "Schema Generator"
    description: "PRD → SQL tables with relationships"
    hours: 3.3
  - sd: "SD-DRM-008"
    title: "RLS Policy Generator"
    description: "Auto-generate security policies"
    hours: 2.7
  - sd: "SD-DRM-009"
    title: "PRD-to-Repo Intelligence"
    description: "Extract tech requirements"
    hours: 2.7
  - sd: "SD-DRM-010"
    title: "Repo Customizer"
    description: "Template + PRD → customized scaffold"
    hours: 4

exit_criteria:
  - "PRD generates simulated schema"
  - "PRD generates simulated repo"
  - "All artifacts tagged epistemic_status: simulation"
```

#### Dreamcatcher Phase 3: EVA + Approval Gate

```yaml
sd_id: "SD-GENESIS-V31-DREAM-P3"
title: "Dreamcatcher Phase 3: EVA + Approval Gate"
type: "grandchild"
parent: "SD-GENESIS-V31-DREAMCATCHER"
grandparent: "SD-GENESIS-V31-PARENT"
status: "draft"

timeline:
  start: "2026-02-03"
  end: "2026-02-08"
  duration_days: 6

capacity:
  sds: 45
  hours: ~15

deliverables:
  - sd: "SD-DRM-011"
    title: "/ratify Command"
    description: "CLI command for Contract of Pain"
    hours: 2.7
  - sd: "SD-DRM-012"
    title: "Approval Prompt UI"
    description: "Will you do the work? display"
    hours: 2
  - sd: "SD-DRM-013"
    title: "Venture Creation Flow"
    description: "Post-ratify venture instantiation"
    hours: 3.3
  - sd: "SD-DRM-014"
    title: "Stage Scheduler"
    description: "Auto-schedule Stage 3 kill gate"
    hours: 2
  - sd: "SD-DRM-015"
    title: "EVA Integration"
    description: "Connect simulation to EVA"
    hours: 3.3
  - sd: "SD-DRM-016"
    title: "Simulation Summary Generator"
    description: "Possible Future display output"
    hours: 1.7

exit_criteria:
  - "/ratify command works"
  - "Contract of Pain displayed"
  - "Venture created at Stage 1 post-ratify"
  - "Stage 3 date scheduled"
```

---

## Mirror Grandchildren

#### Mirror: Integration

```yaml
sd_id: "SD-GENESIS-V31-MIRROR-INT"
title: "Mirror: Integration"
type: "grandchild"
parent: "SD-GENESIS-V31-MIRROR"
grandparent: "SD-GENESIS-V31-PARENT"
status: "draft"

timeline:
  start: "2026-02-09"
  end: "2026-02-10"
  duration_days: 2

capacity:
  sds: 35
  hours: ~12

deliverables:
  - sd: "SD-MIR-001"
    title: "End-to-End Pipeline"
    description: "Dreamcatcher → Mason integration"
    hours: 4
  - sd: "SD-MIR-002"
    title: "Error Recovery"
    description: "Graceful failure handling"
    hours: 2.7
  - sd: "SD-MIR-003"
    title: "Retry Logic"
    description: "Idempotent re-execution"
    hours: 2.7
  - sd: "SD-MIR-004"
    title: "CLI Status Command"
    description: "leo status for simulation display"
    hours: 2.3
```

#### Mirror: Elevation Logic

```yaml
sd_id: "SD-GENESIS-V31-MIRROR-ELEV"
title: "Mirror: Elevation Logic"
type: "grandchild"
parent: "SD-GENESIS-V31-MIRROR"
grandparent: "SD-GENESIS-V31-PARENT"
status: "draft"

timeline:
  start: "2026-02-10"
  end: "2026-02-11"
  duration_days: 2

capacity:
  sds: 25
  hours: ~8

deliverables:
  - sd: "SD-MIR-005"
    title: "Stage 16 Elevation"
    description: "Schema simulation → production"
    hours: 3.3
  - sd: "SD-MIR-006"
    title: "Stage 17 Elevation"
    description: "Repo simulation → production"
    hours: 3.3
  - sd: "SD-MIR-007"
    title: "Elevation Audit Trail"
    description: "Log with Chairman signature"
    hours: 1.7

constraint: "COMPLETE BY FEB 10 - NO NEW LOGIC AFTER"
```

#### Mirror: Reflex Testing

```yaml
sd_id: "SD-GENESIS-V31-MIRROR-TEST"
title: "Mirror: Reflex Testing"
type: "grandchild"
parent: "SD-GENESIS-V31-MIRROR"
grandparent: "SD-GENESIS-V31-PARENT"
status: "draft"

timeline:
  start: "2026-02-11"
  end: "2026-02-13"
  duration_days: 3

capacity:
  sds: 20
  hours: ~7

deliverables:
  - sd: "SD-MIR-008"
    title: "Happy Path Testing"
    description: "Full flow success scenarios"
    hours: 2.7
  - sd: "SD-MIR-009"
    title: "Failure Mode Testing"
    description: "Error handling validation"
    hours: 2.3
  - sd: "SD-MIR-010"
    title: "Edge Case Testing"
    description: "Unusual inputs, timeouts"
    hours: 1.7

note: "TESTING ONLY - No new features"
```

---

## SD Hierarchy Summary

```
SD-GENESIS-V31-PARENT (330 SDs, 110 hrs)
│
├── SD-GENESIS-V31-MASON (110 SDs, 37 hrs)
│   ├── SD-GENESIS-V31-MASON-P1 (40 SDs, 13 hrs) - Ephemeral Foundation
│   ├── SD-GENESIS-V31-MASON-P2 (35 SDs, 12 hrs) - Simulation Scaffolder
│   └── SD-GENESIS-V31-MASON-P3 (35 SDs, 12 hrs) - Ephemeral Deploy
│
├── SD-GENESIS-V31-DREAMCATCHER (140 SDs, 47 hrs)
│   ├── SD-GENESIS-V31-DREAM-P1 (45 SDs, 15 hrs) - PRD Generation
│   ├── SD-GENESIS-V31-DREAM-P2 (50 SDs, 17 hrs) - Schema/Repo Simulation
│   └── SD-GENESIS-V31-DREAM-P3 (45 SDs, 15 hrs) - EVA + Approval Gate
│
├── SD-GENESIS-V31-MIRROR (80 SDs, 27 hrs)
│   ├── SD-GENESIS-V31-MIRROR-INT (35 SDs, 12 hrs) - Integration
│   ├── SD-GENESIS-V31-MIRROR-ELEV (25 SDs, 8 hrs) - Elevation Logic
│   └── SD-GENESIS-V31-MIRROR-TEST (20 SDs, 7 hrs) - Reflex Testing
│
└── SD-GENESIS-V31-RITUAL (0 SDs, 2 hrs) - Genesis Ceremony
```

---

## Time Budget (at 3 SDs/hour)

| Component | SDs | Hours | % of Total |
|-----------|-----|-------|------------|
| **Mason (Sprint 1)** | 110 | 37 | 33% |
| **Dreamcatcher (Sprint 2)** | 140 | 47 | 43% |
| **Mirror (Sprint 3)** | 80 | 27 | 24% |
| **Ritual** | 0 | 2 | — |
| **TOTAL** | **330** | **113** | 100% |

---

## Next Steps

1. **Create Parent SD** in database: `SD-GENESIS-V31-PARENT`
2. **Create Child SDs**: Mason, Dreamcatcher, Mirror, Ritual
3. **Create Grandchild SDs** for each phase
4. **Begin execution** of Mason Phase 1 (Dec 29)

---

*SD Structure document generated: 2025-12-29*
*Vision Version: GENESIS-V3.1*
