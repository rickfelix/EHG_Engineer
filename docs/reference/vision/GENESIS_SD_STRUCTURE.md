# Genesis Oath v3.1: Strategic Directive Structure


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: database, api, testing, migration

> **Document Version: GENESIS-V3.1**
> **Vision Version: 3.1**
> **Status: LEO PROTOCOL COMPLIANT**
> **Last Updated: 2025-12-29**

---

## Purpose

This document defines the Strategic Directive (SD) hierarchy for implementing the Genesis Oath v3.1 vision. All SDs are structured to comply with LEO Protocol v4.3.3 database schema requirements and include proper vision spec references.

---

## LEO Protocol Compliance

All SDs in this structure include:
- Required fields: `id`, `sd_key`, `title`, `description`, `scope`, `rationale`, `category`, `priority`, `status`, `relationship_type`, `parent_sd_id`, `sequence_rank`, `strategic_objectives`, `success_criteria`
- Vision V2 metadata: `vision_spec_references`, `must_read_before_prd`, `must_read_before_exec`, `implementation_guidance`
- Proper relationship types: `parent` or `child` (no "grandchild" - use nested parent references)

---

## Velocity Assumptions

| Metric | Value |
|--------|-------|
| **SD Completion Rate** | ~3 SDs per hour |
| **Total SDs** | ~330 |
| **Total Hours** | ~110 hours |
| **Timeline** | Dec 29, 2025 – Feb 14, 2026 |

---

## Vision Reference Metadata (Required in All SDs)

All SDs MUST include this metadata block:

```javascript
metadata: {
  vision_spec_references: {
    version: "GENESIS-V3.1",
    primary_spec: "docs/vision/GENESIS_OATH_V3.md",
    supporting_specs: [
      "docs/vision/GENESIS_SPRINT_ROADMAP.md",
      "docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md",
      "docs/vision/GENESIS_RITUAL_SPECIFICATION.md"
    ]
  },
  must_read_before_prd: [
    "docs/vision/GENESIS_OATH_V3.md",
    "docs/vision/GENESIS_SPRINT_ROADMAP.md"
  ],
  must_read_before_exec: [
    "docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md"
  ],
  implementation_guidance: {
    creation_mode: "CREATE_FROM_NEW",
    target_date: "2026-02-14",
    ritual_time: "09:00 AM EST"
  }
}
```

---

## SD Hierarchy Overview

```
SD-GENESIS-V31-PARENT (Parent - Orchestrator)
│
├── SD-GENESIS-V31-MASON (Child of PARENT - Sprint 1)
│   ├── SD-GENESIS-V31-MASON-P1 (Child of MASON - Phase 1)
│   ├── SD-GENESIS-V31-MASON-P2 (Child of MASON - Phase 2)
│   └── SD-GENESIS-V31-MASON-P3 (Child of MASON - Phase 3)
│
├── SD-GENESIS-V31-DREAMCATCHER (Child of PARENT - Sprint 2)
│   ├── SD-GENESIS-V31-DREAM-P1 (Child of DREAMCATCHER - Phase 1)
│   ├── SD-GENESIS-V31-DREAM-P2 (Child of DREAMCATCHER - Phase 2)
│   └── SD-GENESIS-V31-DREAM-P3 (Child of DREAMCATCHER - Phase 3)
│
├── SD-GENESIS-V31-MIRROR (Child of PARENT - Sprint 3)
│   ├── SD-GENESIS-V31-MIRROR-INT (Child of MIRROR - Integration)
│   ├── SD-GENESIS-V31-MIRROR-ELEV (Child of MIRROR - Elevation)
│   └── SD-GENESIS-V31-MIRROR-TEST (Child of MIRROR - Testing)
│
└── SD-GENESIS-V31-RITUAL (Child of PARENT - Ceremony)
```

---

## Level 0: Parent SD (Orchestrator)

### SD-GENESIS-V31-PARENT

```javascript
{
  // Identity
  id: "SD-GENESIS-V31-PARENT",
  sd_key: "genesis-v31-parent",
  title: "Genesis Oath v3.1 - The Simulation Chamber",

  // Strategic Content (scored by LEAD autoScore)
  description: `Implement the Genesis Oath v3.1 Simulation Chamber architecture - the infrastructure
for generating "possible futures" as simulations that exist in parallel until elevated to production
through the 25-stage validation workflow. This parent SD orchestrates three sprints (Mason,
Dreamcatcher, Mirror) culminating in the Genesis Ritual on February 14, 2026 at 09:00 AM EST,
aligned with Saturn's ingress into Aries. The Chamber enables autonomous venture creation while
preserving validation discipline through hard technical isolation between Aries (simulation) and
Saturn (production) namespaces.`,

  scope: `Full implementation of Simulation Chamber: ephemeral infrastructure (GitHub org, DNS,
database namespace), text-to-simulation intelligence (PRD/schema/repo generation), elevation
mechanics (Stage 16/17/22 transitions), and the /ratify command ceremony.`,

  rationale: `The Genesis Oath transforms EHG from "platform built" to "platform activated" by
enabling autonomous venture creation. The Simulation Chamber architecture preserves validation
discipline by generating all artifacts as simulations first, only elevating to production after
surviving kill gates. This approach satisfies both the need for speed (see possible future
immediately) and rigor (earn reality through 25-stage workflow).`,

  // Classification
  category: "infrastructure",
  priority: "critical",
  status: "draft",

  // Hierarchy
  relationship_type: "parent",
  parent_sd_id: null,
  sequence_rank: 1,

  // Strategic Alignment
  strategic_objectives: [
    "Enable autonomous venture creation through text-to-simulation pipeline",
    "Preserve validation discipline with kill gates and elevation ceremonies",
    "Implement hard technical isolation between simulation and production",
    "Execute Genesis Ritual on February 14, 2026 aligned with Saturn ingress Aries",
    "Demonstrate platform sovereignty - founder inputs idea, walks away, possible future appears"
  ],

  success_criteria: [
    "Simulation Chamber infrastructure fully operational",
    "Text-to-Simulation pipeline generates PRD, Schema, Repo, and Deployment",
    "All simulation artifacts tagged with epistemic_status: 'simulation'",
    "/ratify command displays Contract of Pain and creates venture at Stage 1",
    "Elevation logic promotes simulation to production at Stages 16, 17, 22",
    "Genesis Ritual on Feb 14 completes successfully with Genesis-001 venture created"
  ],

  // Metadata
  metadata: {
    vision_spec_references: {
      version: "GENESIS-V3.1",
      primary_spec: "docs/vision/GENESIS_OATH_V3.md",
      supporting_specs: [
        "docs/vision/GENESIS_SPRINT_ROADMAP.md",
        "docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md",
        "docs/vision/GENESIS_RITUAL_SPECIFICATION.md",
        "docs/vision/GENESIS_SD_STRUCTURE.md"
      ]
    },
    must_read_before_prd: [
      "docs/vision/GENESIS_OATH_V3.md",
      "docs/vision/GENESIS_SPRINT_ROADMAP.md"
    ],
    must_read_before_exec: [
      "docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md"
    ],
    implementation_guidance: {
      creation_mode: "CREATE_FROM_NEW",
      target_date: "2026-02-14",
      ritual_time: "09:00 AM EST",
      cosmic_alignment: "Saturn enters Aries Feb 13, 2026 at 19:11 EST"
    },
    capacity: {
      total_sds: 330,
      total_hours: 110,
      children: [
        "SD-GENESIS-V31-MASON",
        "SD-GENESIS-V31-DREAMCATCHER",
        "SD-GENESIS-V31-MIRROR",
        "SD-GENESIS-V31-RITUAL"
      ]
    }
  },

  dependencies: [],

  risks: [
    {
      risk: "Sprint timeline too aggressive",
      mitigation: "Buffer built into Dreamcatcher, fallback to PRD-only Genesis if needed"
    },
    {
      risk: "Hard isolation adds infrastructure complexity",
      mitigation: "Separate Supabase projects, Vercel teams, GitHub orgs - no shared credentials"
    },
    {
      risk: "Mercury retrograde shadow starts Feb 12",
      mitigation: "No new logic after Feb 10, final days are integration/testing only"
    }
  ]
}
```

---

## Level 1: Sprint SDs (Children of Parent)

### SD-GENESIS-V31-MASON (Sprint 1: The Mason)

```javascript
{
  // Identity
  id: "SD-GENESIS-V31-MASON",
  sd_key: "genesis-v31-mason",
  title: "Sprint 1: The Mason - Simulation Infrastructure",

  // Strategic Content
  description: `Build the Simulation Chamber infrastructure during the Capricorn sprint (Dec 29 -
Jan 19). Establish ephemeral systems for generating simulation artifacts: GitHub organization
(ehg-simulations), wildcard DNS (*.possible.ehg.dev), database namespace (schema_sim_*),
epistemic tagging system, TTL lifecycle management, and deployment pipeline with watermark
overlay. This sprint creates the "Aries Namespace" - the realm of possible futures that exists
in hard technical isolation from the "Saturn Namespace" (production).`,

  scope: `Infrastructure for simulation environment: GitHub org creation, DNS configuration,
Supabase namespace conventions, epistemic_status field implementation, TTL auto-archive
triggers, Vercel deployment pipeline, SIMULATION watermark middleware.`,

  rationale: `Infrastructure must exist before intelligence can generate into it. The Mason
sprint builds the container (Aries Namespace) that will receive the Dreamcatcher's generated
artifacts. Capricorn energy (structure, foundation, authority) aligns with this architectural
work.`,

  // Classification
  category: "infrastructure",
  priority: "critical",
  status: "draft",

  // Hierarchy
  relationship_type: "child",
  parent_sd_id: "SD-GENESIS-V31-PARENT",
  sequence_rank: 1,

  // Strategic Alignment
  strategic_objectives: [
    "Create ehg-simulations GitHub organization with proper isolation",
    "Configure *.possible.ehg.dev wildcard DNS for simulation deployments",
    "Implement schema_sim_* database namespace convention",
    "Build TTL enforcement and garbage collection systems",
    "Create simulation deployment pipeline with watermark overlay"
  ],

  success_criteria: [
    "ehg-simulations GitHub org exists and is accessible",
    "*.possible.ehg.dev wildcard DNS resolves correctly",
    "schema_sim_* tables can be created with proper namespace isolation",
    "epistemic_status field present in simulation_artifacts table",
    "TTL countdown triggers auto-archive after 90 days",
    "Simulation deployment includes SIMULATION watermark banner",
    "Stage 3 rejection triggers infrastructure cleanup"
  ],

  // Metadata
  metadata: {
    vision_spec_references: {
      version: "GENESIS-V3.1",
      primary_spec: "docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md",
      sections: [
        "The Two Namespaces (Hard Isolation)",
        "Database Schema",
        "Infrastructure Components",
        "Lifecycle Management"
      ]
    },
    must_read_before_prd: [
      "docs/vision/GENESIS_OATH_V3.md",
      "docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md"
    ],
    must_read_before_exec: [
      "docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md"
    ],
    implementation_guidance: {
      creation_mode: "CREATE_FROM_NEW",
      zodiac: "Capricorn",
      archetype: "The Mason",
      theme: "Structure"
    },
    timeline: {
      start: "2025-12-29",
      end: "2026-01-19",
      duration_days: 22
    },
    capacity: {
      sds: 110,
      hours: 37,
      children: [
        "SD-GENESIS-V31-MASON-P1",
        "SD-GENESIS-V31-MASON-P2",
        "SD-GENESIS-V31-MASON-P3"
      ]
    }
  },

  dependencies: [],

  risks: [
    {
      risk: "GitHub org creation requires account verification",
      mitigation: "Set up org early, document configuration steps"
    },
    {
      risk: "DNS propagation delays",
      mitigation: "Configure 24h before needed, use low TTL values"
    }
  ]
}
```

### SD-GENESIS-V31-DREAMCATCHER (Sprint 2: The Dreamcatcher)

```javascript
{
  // Identity
  id: "SD-GENESIS-V31-DREAMCATCHER",
  sd_key: "genesis-v31-dreamcatcher",
  title: "Sprint 2: The Dreamcatcher - Text-to-Simulation Intelligence",

  // Strategic Content
  description: `Build the intelligence layer for autonomous artifact generation during the
Aquarius sprint (Jan 20 - Feb 8). Create text-to-simulation pipeline: venture seed parser,
PRD template engine, problem/solution extraction, schema generator, repo customizer, and the
/ratify approval gate. This sprint implements the "Quantum Leap" - the moment raw text
transforms into a visible possible future. PRD is generated as OFFICIAL (Stage 1-2 artifact),
while Schema, Repo, and Deployment are generated as SIMULATION (epistemic_status: simulation).`,

  scope: `Text-to-simulation intelligence: seed parsing, PRD generation, schema inference,
repo scaffolding, deployment automation, /ratify command, Contract of Pain UI, venture
creation at Stage 1, EVA integration.`,

  rationale: `With infrastructure in place (Mason), the Dreamcatcher can generate artifacts
into the simulation namespace. This is the core value proposition of Genesis Oath - autonomous
creation of possible futures from raw ideas. Aquarius energy (innovation, intelligence,
vision) aligns with this AI-powered generation work.`,

  // Classification
  category: "feature",
  priority: "critical",
  status: "draft",

  // Hierarchy
  relationship_type: "child",
  parent_sd_id: "SD-GENESIS-V31-PARENT",
  sequence_rank: 2,

  // Strategic Alignment
  strategic_objectives: [
    "Parse raw venture seed text into structured data",
    "Generate PRD as official Stage 1-2 artifact (not simulation)",
    "Generate schema as simulation artifact with epistemic tagging",
    "Generate repo scaffold as simulation artifact",
    "Implement /ratify command with Contract of Pain ceremony",
    "Create venture at Stage 1 with simulation artifacts linked"
  ],

  success_criteria: [
    "Text input generates valid, quality-gated PRD",
    "PRD scoped to Stage 1-2 validation target (not solution commitment)",
    "PRD-to-Schema intelligence extracts data model correctly",
    "PRD-to-Repo intelligence generates customized scaffold",
    "All simulation artifacts tagged epistemic_status: 'simulation'",
    "/ratify command displays 25-stage Contract of Pain",
    "Post-ratify venture created at Stage 1 with Stage 3 date scheduled",
    "Simulation remains as North Star visible at *.possible.ehg.dev"
  ],

  // Metadata
  metadata: {
    vision_spec_references: {
      version: "GENESIS-V3.1",
      primary_spec: "docs/vision/GENESIS_OATH_V3.md",
      sections: [
        "PRD Scope Clarification",
        "The /ratify Command: Scope Definition",
        "Epistemic Tagging (Canon Law)"
      ]
    },
    must_read_before_prd: [
      "docs/vision/GENESIS_OATH_V3.md",
      "docs/vision/GENESIS_RITUAL_SPECIFICATION.md"
    ],
    must_read_before_exec: [
      "docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md"
    ],
    implementation_guidance: {
      creation_mode: "CREATE_FROM_NEW",
      zodiac: "Aquarius",
      archetype: "The Dreamcatcher",
      theme: "Intelligence"
    },
    timeline: {
      start: "2026-01-20",
      end: "2026-02-08",
      duration_days: 20
    },
    capacity: {
      sds: 140,
      hours: 47,
      children: [
        "SD-GENESIS-V31-DREAM-P1",
        "SD-GENESIS-V31-DREAM-P2",
        "SD-GENESIS-V31-DREAM-P3"
      ]
    }
  },

  dependencies: ["SD-GENESIS-V31-MASON"],

  risks: [
    {
      risk: "LLM hallucination in generated artifacts",
      mitigation: "Structured output validation, quality gates on PRD"
    },
    {
      risk: "Schema inference accuracy",
      mitigation: "Template library of validated patterns, human review option"
    }
  ]
}
```

### SD-GENESIS-V31-MIRROR (Sprint 3: The Mirror)

```javascript
{
  // Identity
  id: "SD-GENESIS-V31-MIRROR",
  sd_key: "genesis-v31-mirror",
  title: "Sprint 3: The Mirror - Integration & Elevation",

  // Strategic Content
  description: `Connect all systems and implement elevation logic during the Pisces sprint
(Feb 9 - Feb 13). Focus on end-to-end pipeline integration, error recovery, retry logic, and
the elevation mechanics that transform simulation artifacts to production at Stages 16, 17,
and 22. CRITICAL CONSTRAINT: No new logic after Feb 10 due to Mercury pre-retrograde shadow
starting Feb 12. Final days are integration testing only.`,

  scope: `End-to-end pipeline integration, error recovery, retry logic, CLI status commands,
Stage 16 schema elevation, Stage 17 repo elevation, Stage 22 deployment elevation, elevation
audit trail with Chairman signature, reflex testing.`,

  rationale: `With infrastructure (Mason) and intelligence (Dreamcatcher) complete, the Mirror
sprint connects everything and ensures simulation-to-production elevation works correctly.
Pisces energy (connection, transcendence, completion) aligns with this integration work. The
compressed timeline requires discipline - testing only after Feb 10.`,

  // Classification
  category: "integration",
  priority: "critical",
  status: "draft",

  // Hierarchy
  relationship_type: "child",
  parent_sd_id: "SD-GENESIS-V31-PARENT",
  sequence_rank: 3,

  // Strategic Alignment
  strategic_objectives: [
    "Integrate Dreamcatcher output with Mason infrastructure",
    "Implement error recovery and retry logic for resilience",
    "Build elevation mechanics for Stages 16, 17, and 22",
    "Create elevation audit trail with Chairman signature requirement",
    "Complete reflex testing before Mercury shadow"
  ],

  success_criteria: [
    "End-to-end simulation flow works without manual intervention",
    "Error recovery gracefully handles generation failures",
    "Retry logic is idempotent (safe to re-run)",
    "Stage 16 elevation copies schema from simulation to production",
    "Stage 17 elevation forks repo from simulation to production",
    "All elevations require Chairman signature in audit log",
    "Stage 3 rejection triggers complete simulation cleanup",
    "CLI 'leo status' displays simulation state correctly"
  ],

  // Metadata
  metadata: {
    vision_spec_references: {
      version: "GENESIS-V3.1",
      primary_spec: "docs/vision/GENESIS_OATH_V3.md",
      sections: [
        "Elevation Mechanics (Simulation → Reality)",
        "TTL Enforcement (Non-Negotiable)"
      ]
    },
    must_read_before_prd: [
      "docs/vision/GENESIS_OATH_V3.md",
      "docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md"
    ],
    must_read_before_exec: [
      "docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md"
    ],
    implementation_guidance: {
      creation_mode: "CREATE_FROM_NEW",
      zodiac: "Pisces",
      archetype: "The Mirror",
      theme: "Integration",
      critical_constraint: "NO NEW LOGIC AFTER FEB 10 - Mercury shadow starts Feb 12"
    },
    timeline: {
      start: "2026-02-09",
      end: "2026-02-13",
      duration_days: 5,
      logic_cutoff: "2026-02-10"
    },
    capacity: {
      sds: 80,
      hours: 27,
      children: [
        "SD-GENESIS-V31-MIRROR-INT",
        "SD-GENESIS-V31-MIRROR-ELEV",
        "SD-GENESIS-V31-MIRROR-TEST"
      ]
    }
  },

  dependencies: ["SD-GENESIS-V31-MASON", "SD-GENESIS-V31-DREAMCATCHER"],

  risks: [
    {
      risk: "Compressed timeline (5 days)",
      mitigation: "Prioritize integration over new features, defer nice-to-haves"
    },
    {
      risk: "Mercury shadow introduces confusion",
      mitigation: "No new logic after Feb 10, testing only"
    }
  ]
}
```

### SD-GENESIS-V31-RITUAL (Genesis Ritual Preparation)

```javascript
{
  // Identity
  id: "SD-GENESIS-V31-RITUAL",
  sd_key: "genesis-v31-ritual",
  title: "Genesis Ritual Preparation and Execution",

  // Strategic Content
  description: `Prepare for and execute the February 14, 2026 Genesis Oath ritual - the Collapse
of the Wave Function. This SD covers pre-ritual verification (Feb 13), ritual execution (Feb 14
at 09:00 AM EST), and post-ritual validation. The ritual marks the first morning of Saturn's new
reign in Aries, cosmically aligned with "structure meets initiation." On ritual completion,
Genesis-001 will exist as an active venture at Stage 1 with its simulation visible as North Star.`,

  scope: `Pre-ritual checklist completion, seed text finalization, systems verification, ritual
execution, post-ritual validation, documentation and celebration.`,

  rationale: `The Genesis Ritual is the culmination of the entire Genesis Oath vision. It
transforms abstract architecture into lived experience - the Chairman inputs a seed, walks away
for coffee, and returns to find a possible future visible and a venture entered into the 25-stage
pipeline. This is platform sovereignty demonstrated.`,

  // Classification
  category: "ceremony",
  priority: "critical",
  status: "draft",

  // Hierarchy
  relationship_type: "child",
  parent_sd_id: "SD-GENESIS-V31-PARENT",
  sequence_rank: 4,

  // Strategic Alignment
  strategic_objectives: [
    "Complete all pre-ritual verification checklists",
    "Prepare Genesis-001 venture seed text",
    "Execute ritual at 09:00 AM EST on Feb 14, 2026",
    "Validate all artifacts generated correctly",
    "Document the first Genesis for posterity"
  ],

  success_criteria: [
    "All systems verified green on Feb 13 evening",
    "Genesis-001 seed text locked and ready",
    "Ritual executes without errors at 09:00 AM EST",
    "PRD generated as official artifact",
    "Schema, Repo, Deployment generated as simulations",
    "Simulation visible at genesis-001.possible.ehg.dev",
    "Venture created at Stage 1 with Stage 3 date scheduled",
    "Post-ritual validation checklist complete",
    "Celebration documented"
  ],

  // Metadata
  metadata: {
    vision_spec_references: {
      version: "GENESIS-V3.1",
      primary_spec: "docs/vision/GENESIS_RITUAL_SPECIFICATION.md"
    },
    must_read_before_prd: [
      "docs/vision/GENESIS_RITUAL_SPECIFICATION.md"
    ],
    must_read_before_exec: [
      "docs/vision/GENESIS_RITUAL_SPECIFICATION.md"
    ],
    implementation_guidance: {
      creation_mode: "CEREMONY",
      prep_start: "2026-02-13",
      ritual_date: "2026-02-14",
      ritual_time: "09:00 AM EST",
      cosmic_alignment: {
        event: "Saturn enters Aries",
        timestamp: "2026-02-13T19:11:00-05:00",
        significance: "First morning of the new reign"
      }
    },
    timeline: {
      prep_date: "2026-02-13",
      ritual_date: "2026-02-14",
      ritual_time: "09:00"
    },
    capacity: {
      sds: 0,
      hours: 2
    }
  },

  dependencies: [
    "SD-GENESIS-V31-MASON",
    "SD-GENESIS-V31-DREAMCATCHER",
    "SD-GENESIS-V31-MIRROR"
  ],

  risks: [
    {
      risk: "System failure during ritual",
      mitigation: "Fallback to PRD-only mode, retry logic, rollback procedures"
    },
    {
      risk: "Seed text incomplete",
      mitigation: "Lock seed 24h before, have backup seed ready"
    }
  ]
}
```

---

## Level 2: Phase SDs (Children of Sprint SDs)

### Mason Phases

#### SD-GENESIS-V31-MASON-P1 (Ephemeral Foundation)

```javascript
{
  id: "SD-GENESIS-V31-MASON-P1",
  sd_key: "genesis-v31-mason-p1",
  title: "Mason Phase 1: Ephemeral Foundation",

  description: `Establish the foundational infrastructure for the Simulation Chamber. Create the
ehg-simulations GitHub organization with proper isolation, configure *.possible.ehg.dev wildcard
DNS, implement schema_sim_* database namespace convention in Supabase, build the epistemic_status
tagging system, create simulation_artifacts table with full tracking, implement TTL auto-archive
triggers, and set up GitHub API integration for the simulation org.`,

  scope: `GitHub org creation, DNS configuration, database namespace setup, epistemic tagging
schema, TTL system implementation, simulation metadata table, GitHub API auth.`,

  rationale: `The ephemeral foundation creates the isolated container where simulations will
live. Hard technical isolation (different accounts, credentials, orgs) prevents accidental
production contamination.`,

  category: "infrastructure",
  priority: "critical",
  status: "draft",
  relationship_type: "child",
  parent_sd_id: "SD-GENESIS-V31-MASON",
  sequence_rank: 1,

  strategic_objectives: [
    "Create ehg-simulations GitHub org with isolated credentials",
    "Configure *.possible.ehg.dev wildcard DNS",
    "Implement schema_sim_* namespace convention",
    "Build epistemic_status tagging into all artifact tables",
    "Create simulation_artifacts table with TTL tracking"
  ],

  success_criteria: [
    "ehg-simulations org accessible at github.com/ehg-simulations",
    "DNS *.possible.ehg.dev configured and resolving",
    "CREATE SCHEMA schema_sim_test works in Supabase",
    "epistemic_status enum exists: simulation, pending_elevation, elevated, archived",
    "simulation_artifacts table includes expires_at calculation",
    "TTL cleanup job scheduled and tested"
  ],

  metadata: {
    vision_spec_references: {
      version: "GENESIS-V3.1",
      primary_spec: "docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md",
      sections: ["The Two Namespaces (Hard Isolation)", "Database Schema"]
    },
    must_read_before_prd: ["docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md"],
    must_read_before_exec: ["docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md"],
    implementation_guidance: { creation_mode: "CREATE_FROM_NEW" },
    timeline: { start: "2025-12-29", end: "2026-01-05", duration_days: 8 },
    capacity: { sds: 40, hours: 13 }
  },

  dependencies: []
}
```

#### SD-GENESIS-V31-MASON-P2 (Simulation Scaffolder with Agentic Layer)

```javascript
{
  id: "SD-GENESIS-V31-MASON-P2",
  sd_key: "genesis-v31-mason-p2",
  title: "Mason Phase 2: Simulation Scaffolder with Agentic Layer",

  description: `Build the repository and schema scaffolding systems with embedded Agentic Layer
support and Grade 4 Feedback Loop mechanisms. Create venture scaffold templates (Next.js SaaS
starter, API service) that include a canonical .claude/ directory structure matching EHG_Engineer
patterns. Implement automated repo creation in ehg-simulations org, set up git init and initial
commit automation, build schema template library with pre-validated patterns, and create migration
generator that converts JSON schema definitions to SQL migrations. CRITICAL: Every generated repo
must include the .claude/ directory containing agents/, commands/, context/, hooks/, and logs/
subdirectories. The scaffold must seed the Grade 4 Feedback Loop mechanisms including build-wrapper
hooks that capture output to .claude/logs/ for autonomous self-correction.`,

  scope: `Repo template system with .claude/ directory scaffold, gh repo create automation, git init
automation, schema template library, JSON-to-SQL migration generator, agentic layer directory
structure (.claude/agents/, .claude/commands/, .claude/context/, .claude/hooks/, .claude/logs/),
Grade 4 Feedback Loop hooks (build-wrapper.sh, session-state auto-update).`,

  rationale: `With foundation in place, the scaffolder enables rapid generation of venture
infrastructure. Templates ensure consistency while automation enables speed. The Agentic Layer
(.claude/ directory) is the critical innovation - it ensures that future Builder Crews can "read
the manual" directly from the repo, enabling true autonomous operation without relying solely
on ephemeral database memory. Structure matches EHG_Engineer for consistency. The Grade 4
Feedback Loop hooks enable autonomous self-correction by capturing build output and updating
session state automatically.`,

  category: "infrastructure",
  priority: "critical",
  status: "draft",
  relationship_type: "child",
  parent_sd_id: "SD-GENESIS-V31-MASON",
  sequence_rank: 2,

  strategic_objectives: [
    "Create reusable venture scaffold templates with embedded .claude/ directory",
    "Automate GitHub repo creation in simulation org",
    "Build schema template library with validated patterns",
    "Implement migration generator from JSON schema",
    "Establish canonical Agentic Layer structure matching EHG_Engineer: .claude/agents/, .claude/commands/, .claude/context/, .claude/hooks/, .claude/logs/",
    "Include placeholder files: .claude/session-state.md, .claude/settings.json, .claude/context/VENTURE-SPEC.md",
    "Implement 'Grade 4' Feedback Hooks: Scaffold includes hooks/build-wrapper.sh to capture stdout/stderr to .claude/logs/",
    "Seed .claude/logs/build-history.md template for tracking build pass/fail cycles"
  ],

  success_criteria: [
    "next-saas-starter template available and customizable",
    "gh repo create automation creates repos in ehg-simulations",
    "Initial commit automation pushes template with venture config",
    "Schema templates cover common SaaS patterns (users, subscriptions, etc.)",
    "Migration generator produces valid SQL from JSON schema",
    "Every generated repo includes .claude/ directory with agents/, commands/, context/, hooks/, logs/ subdirectories",
    ".claude/session-state.md exists with venture state placeholder",
    ".claude/context/VENTURE-SPEC.md exists with template for technical specifications",
    ".claude/agents/ directory includes venture-agents.md for Builder/Reviewer/QA prompts",
    ".claude/settings.json exists with venture configuration",
    "Scaffold includes .claude/hooks/build-wrapper.sh that captures stdout/stderr to .claude/logs/build-output.log",
    "Scaffold includes standard hooks that auto-update .claude/session-state.md with build pass/fail status",
    ".claude/logs/build-history.md exists with template for tracking build cycles"
  ],

  metadata: {
    vision_spec_references: {
      version: "GENESIS-V3.1",
      primary_spec: "docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md",
      sections: ["Infrastructure Components", "GitHub Integration"]
    },
    must_read_before_prd: ["docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md"],
    must_read_before_exec: ["docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md"],
    implementation_guidance: {
      creation_mode: "CREATE_FROM_NEW",
      agentic_layer: {
        directory: ".claude/",
        subdirectories: ["agents/", "commands/", "context/", "hooks/", "logs/"],
        required_files: [
          ".claude/session-state.md",
          ".claude/settings.json",
          ".claude/context/VENTURE-SPEC.md",
          ".claude/context/TECH-STACK.md",
          ".claude/context/CONSTRAINTS.md",
          ".claude/agents/venture-agents.md",
          ".claude/logs/decisions.md",
          ".claude/logs/build-history.md",
          ".claude/hooks/build-wrapper.sh"
        ],
        note: "Structure matches EHG_Engineer .claude/ directory for consistency"
      },
      grade4_feedback_loop: {
        principle: "Plan → Build → Review (.claude/logs/) → Fix",
        hooks: {
          "build-wrapper.sh": "Wraps npm/yarn build to capture stdout/stderr to .claude/logs/build-output.log",
          "post-build.sh": "Updates .claude/session-state.md with build status (PASS/FAIL) and timestamp"
        },
        logs: {
          "build-output.log": "Raw stdout/stderr from most recent build",
          "build-history.md": "Chronological record of build attempts with pass/fail status"
        },
        auto_update: ".claude/session-state.md updated after each build with status and next action"
      }
    },
    timeline: { start: "2026-01-06", end: "2026-01-12", duration_days: 7 },
    capacity: { sds: 35, hours: 12 }
  },

  dependencies: ["SD-GENESIS-V31-MASON-P1"],

  risks: [
    {
      risk: "Agentic Layer structure may vary by venture type",
      mitigation: "Define minimal canonical structure matching EHG_Engineer, allow venture-specific extensions"
    },
    {
      risk: "Build hooks may not work across all build systems",
      mitigation: "Provide npm/yarn/pnpm variants, document extension points"
    }
  ]
}
```

#### SD-GENESIS-V31-MASON-P3 (Ephemeral Deploy)

```javascript
{
  id: "SD-GENESIS-V31-MASON-P3",
  sd_key: "genesis-v31-mason-p3",
  title: "Mason Phase 3: Ephemeral Deploy",

  description: `Build the ephemeral deployment pipeline. Set up Vercel simulation project with
separate team account, implement deploy automation from repo push to live URL, create SIMULATION
watermark overlay middleware, add health check endpoint with simulation metadata, implement cost
cap enforcement to prevent runaway spending, and build garbage collection for Stage 3 rejection
cleanup.`,

  scope: `Vercel project setup, deploy automation, watermark middleware, health endpoints, cost
caps, garbage collection.`,

  rationale: `The deployment pipeline makes simulations visible as running applications. The
watermark ensures users never mistake simulation for production. Cost caps and garbage collection
prevent resource waste.`,

  category: "infrastructure",
  priority: "critical",
  status: "draft",
  relationship_type: "child",
  parent_sd_id: "SD-GENESIS-V31-MASON",
  sequence_rank: 3,

  strategic_objectives: [
    "Deploy simulations to *.possible.ehg.dev automatically",
    "Display SIMULATION watermark on all simulation URLs",
    "Implement cost controls for simulation infrastructure",
    "Clean up rejected simulations automatically"
  ],

  success_criteria: [
    "Vercel simulation project with separate team credentials",
    "Repo push triggers automatic deployment",
    "SIMULATION banner displays on all simulation pages",
    "/health endpoint returns 200 with simulation metadata",
    "Daily cost stays under $5 per simulation limit",
    "Stage 3 rejection triggers infrastructure destruction"
  ],

  metadata: {
    vision_spec_references: {
      version: "GENESIS-V3.1",
      primary_spec: "docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md",
      sections: ["Deployment Infrastructure", "Lifecycle Management"]
    },
    must_read_before_prd: ["docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md"],
    must_read_before_exec: ["docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md"],
    implementation_guidance: { creation_mode: "CREATE_FROM_NEW" },
    timeline: { start: "2026-01-13", end: "2026-01-19", duration_days: 7 },
    capacity: { sds: 35, hours: 12 }
  },

  dependencies: ["SD-GENESIS-V31-MASON-P1", "SD-GENESIS-V31-MASON-P2"]
}
```

### Dreamcatcher Phases

#### SD-GENESIS-V31-DREAM-P1 (PRD Generation)

```javascript
{
  id: "SD-GENESIS-V31-DREAM-P1",
  sd_key: "genesis-v31-dream-p1",
  title: "Dreamcatcher Phase 1: PRD Generation",

  description: `Build the text-to-PRD intelligence layer. Create venture seed parser that
extracts structure from raw text, implement PRD template engine for Stage 1-2 artifact
generation, build problem/solution extraction using NLP, generate functional requirements
from seed analysis, and implement PRD quality validator with pass/fail gates.`,

  scope: `Seed parser, PRD template engine, NLP extraction, requirements generation, PRD
validation gates.`,

  rationale: `The PRD is the official artifact (not simulation) that captures validated
understanding of the venture concept. It scopes Stage 1-2 validation target, not solution
commitment.`,

  category: "feature",
  priority: "critical",
  status: "draft",
  relationship_type: "child",
  parent_sd_id: "SD-GENESIS-V31-DREAMCATCHER",
  sequence_rank: 1,

  strategic_objectives: [
    "Parse raw venture seed into structured data",
    "Generate PRD as official Stage 1-2 artifact",
    "Extract problem statement and solution hypothesis",
    "Generate actionable functional requirements",
    "Validate PRD quality before proceeding"
  ],

  success_criteria: [
    "Seed parser handles various input formats",
    "PRD template produces complete Stage 1-2 document",
    "Problem/solution extraction accuracy > 80%",
    "Generated requirements are specific and testable",
    "PRD validator catches incomplete/low-quality output"
  ],

  metadata: {
    vision_spec_references: {
      version: "GENESIS-V3.1",
      primary_spec: "docs/vision/GENESIS_OATH_V3.md",
      sections: ["PRD Scope Clarification"]
    },
    must_read_before_prd: ["docs/vision/GENESIS_OATH_V3.md"],
    must_read_before_exec: ["docs/vision/GENESIS_OATH_V3.md"],
    implementation_guidance: { creation_mode: "CREATE_FROM_NEW" },
    timeline: { start: "2026-01-20", end: "2026-01-26", duration_days: 7 },
    capacity: { sds: 45, hours: 15 }
  },

  dependencies: ["SD-GENESIS-V31-MASON"]
}
```

#### SD-GENESIS-V31-DREAM-P2 (Schema/Repo Simulation with Context Crystallization)

```javascript
{
  id: "SD-GENESIS-V31-DREAM-P2",
  sd_key: "genesis-v31-dream-p2",
  title: "Dreamcatcher Phase 2: Schema/Repo Simulation with Context Crystallization",

  description: `Build PRD-to-artifact intelligence with Context Crystallization. Create PRD-to-schema
extraction that infers data model from requirements, implement schema generator producing SQL tables
with relationships, build RLS policy generator for automatic security rules, implement PRD-to-repo
extraction for tech requirements, and create repo customizer that applies PRD context to scaffold
templates. CRITICAL NEW REQUIREMENT: Implement "Context Crystallization" - the Dreamcatcher must
write the generated PRD, Tech Spec, and initial System Prompts into the .claude/ directory using
EHG_Engineer structure (.claude/session-state.md, .claude/context/TECH-STACK.md, .claude/agents/venture-agents.md).
The simulation is not just code; it is a "frozen agent state" that future Builder Crews can resume.`,

  scope: `PRD-to-schema intelligence, schema generator, RLS generator, PRD-to-repo intelligence,
repo customizer, Context Crystallization (.claude/ population using EHG_Engineer structure: context/, agents/, logs/).`,

  rationale: `With PRD generated, the system can now infer what database schema and application
structure the venture needs. All generated artifacts are tagged as simulations (epistemic_status:
simulation). The Context Crystallization step is essential for autonomous operation - by writing
PRD insights, tech specs, and system prompts directly into .claude/context/ and .claude/agents/, we create
a "frozen agent state" that preserves the Dreamcatcher's understanding for future Builder Crews.
This is "memory-as-code" - the agent's brain and body (code) stay in sync.`,

  category: "feature",
  priority: "critical",
  status: "draft",
  relationship_type: "child",
  parent_sd_id: "SD-GENESIS-V31-DREAMCATCHER",
  sequence_rank: 2,

  strategic_objectives: [
    "Extract data model from PRD requirements",
    "Generate SQL schema with proper relationships",
    "Auto-generate RLS security policies",
    "Extract technology requirements from PRD",
    "Customize repo scaffold with venture specifics",
    "Implement Context Crystallization: write venture overview to .claude/session-state.md",
    "Crystallize Tech Spec: extract and write technical decisions to .claude/context/TECH-STACK.md",
    "Generate System Prompts: create agent-specific prompts in .claude/agents/venture-agents.md",
    "Record decision log: capture generation decisions in .claude/logs/decisions.md"
  ],

  success_criteria: [
    "PRD-to-schema identifies entities and relationships",
    "Schema generator produces valid SQL with foreign keys",
    "RLS policies enforce basic access control",
    "Tech requirements identify stack components",
    "Repo customizer updates package.json, README, config",
    ".claude/session-state.md contains: venture name, problem statement, solution hypothesis, current stage, key decisions",
    ".claude/context/TECH-STACK.md contains: stack components, architecture decisions, data model summary, API patterns",
    ".claude/agents/venture-agents.md contains: role-specific prompts for Builder, Reviewer, and QA agents",
    ".claude/logs/decisions.md contains: chronological log of generation decisions with rationale",
    "Context Crystallization completes before simulation is marked 'generated'"
  ],

  metadata: {
    vision_spec_references: {
      version: "GENESIS-V3.1",
      primary_spec: "docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md",
      sections: ["Database Schema", "Infrastructure Components"]
    },
    must_read_before_prd: ["docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md"],
    must_read_before_exec: ["docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md"],
    implementation_guidance: {
      creation_mode: "CREATE_FROM_NEW",
      context_crystallization: {
        purpose: "Create frozen agent state that Builder Crews can resume",
        structure_note: "Uses EHG_Engineer .claude/ structure for consistency",
        outputs: {
          "session-state.md": "Venture overview, current state, immediate next steps",
          "context/TECH-STACK.md": "Technical decisions, architecture, constraints",
          "context/VENTURE-SPEC.md": "Problem statement, solution hypothesis, requirements",
          "agents/venture-agents.md": "Role-specific prompts for Builder/Reviewer/QA agents",
          "logs/decisions.md": "Chronological record of why decisions were made"
        },
        principle: "The simulation is not just code; it is a frozen agent state"
      }
    },
    timeline: { start: "2026-01-27", end: "2026-02-02", duration_days: 7 },
    capacity: { sds: 50, hours: 17 }
  },

  dependencies: ["SD-GENESIS-V31-DREAM-P1"],

  risks: [
    {
      risk: "Context Crystallization may produce low-quality prompts",
      mitigation: "Use structured templates, validate outputs, allow human override"
    },
    {
      risk: "session-state.md may become stale",
      mitigation: "Include last_updated timestamp, design for update-in-place"
    }
  ]
}
```

#### SD-GENESIS-V31-DREAM-P3 (EVA + Approval Gate)

```javascript
{
  id: "SD-GENESIS-V31-DREAM-P3",
  sd_key: "genesis-v31-dream-p3",
  title: "Dreamcatcher Phase 3: EVA + Approval Gate",

  description: `Build the approval ceremony and venture creation with EVA token optimization.
Implement /ratify CLI command for the Contract of Pain, create approval prompt UI showing
25-stage commitment, build venture creation flow for post-ratify instantiation, implement
stage scheduler to auto-schedule Stage 3 kill gate, integrate with EVA orchestration using
LOCAL_CONTEXT_PRIORITY pattern, and create simulation summary generator for the "Possible
Future" display. EVA must read .claude/session-state.md before querying Supabase to minimize
token usage. Generated agent prompts must explicitly instruct the Grade 4 Feedback Loop.`,

  scope: `/ratify command, Contract of Pain UI, venture creation, stage scheduling, EVA
integration with LOCAL_CONTEXT_PRIORITY, simulation summary, Grade 4 agent instructions
in venture-agents.md.`,

  rationale: `The /ratify command is the threshold moment - the Chairman commits to 25
stages of labor to earn reality. This is not permission to skip validation; it is acceptance
of the work required. EVA token optimization through local context priority reduces costs
and improves response latency. The Grade 4 Feedback Loop instructions ensure Builder Crews
operate autonomously with self-correction capabilities.`,

  category: "feature",
  priority: "critical",
  status: "draft",
  relationship_type: "child",
  parent_sd_id: "SD-GENESIS-V31-DREAMCATCHER",
  sequence_rank: 3,

  strategic_objectives: [
    "Implement /ratify CLI command with ceremony",
    "Display Contract of Pain with 25 stages visible",
    "Create venture at Stage 1 after ratification",
    "Auto-schedule Stage 3 kill gate date",
    "Integrate simulation lifecycle with EVA",
    "Implement EVA_LOCAL_CONTEXT_PRIORITY: EVA reads .claude/session-state.md before querying Supabase to optimize token usage",
    "Generate venture-agents.md with explicit Grade 4 Feedback Loop instructions for Builder Crews"
  ],

  success_criteria: [
    "/ratify command triggers approval ceremony",
    "Contract of Pain displays all 25 stages and 4 kill gates",
    "Venture created in database at Stage 1 post-ratify",
    "Stage 3 date calculated and stored",
    "EVA receives notification of new venture",
    "Simulation summary shows all generated artifacts",
    "EVA reads .claude/session-state.md FIRST before any Supabase query (LOCAL_CONTEXT_PRIORITY)",
    "EVA token usage reduced by >30% through local context caching",
    "Generated venture-agents.md explicitly instructs Builder Crews to execute the Plan → Build → Review (.claude/logs/) → Fix loop",
    "venture-agents.md includes section: 'After each build, read .claude/logs/build-output.log and update .claude/session-state.md with findings'"
  ],

  metadata: {
    vision_spec_references: {
      version: "GENESIS-V3.1",
      primary_spec: "docs/vision/GENESIS_OATH_V3.md",
      sections: ["The /ratify Command: Scope Definition"]
    },
    must_read_before_prd: ["docs/vision/GENESIS_OATH_V3.md", "docs/vision/GENESIS_RITUAL_SPECIFICATION.md"],
    must_read_before_exec: ["docs/vision/GENESIS_RITUAL_SPECIFICATION.md"],
    implementation_guidance: {
      creation_mode: "CREATE_FROM_NEW",
      eva_optimization: {
        principle: "LOCAL_CONTEXT_PRIORITY - read .claude/ before Supabase",
        read_order: [
          "1. .claude/session-state.md (current context)",
          "2. .claude/logs/build-output.log (if build-related)",
          "3. .claude/context/VENTURE-SPEC.md (if requirements-related)",
          "4. Supabase (only if local context insufficient)"
        ],
        token_savings_target: "30% reduction through local caching"
      },
      grade4_agent_instructions: {
        principle: "Plan → Build → Review → Fix autonomous loop",
        venture_agents_template: {
          builder_crew: [
            "1. Read .claude/session-state.md for current task",
            "2. Read .claude/context/TECH-STACK.md for constraints",
            "3. Implement changes in src/",
            "4. Run build via .claude/hooks/build-wrapper.sh",
            "5. Read .claude/logs/build-output.log for errors",
            "6. If errors: diagnose, fix, return to step 4",
            "7. If success: update .claude/session-state.md with completion"
          ]
        }
      }
    },
    timeline: { start: "2026-02-03", end: "2026-02-08", duration_days: 6 },
    capacity: { sds: 45, hours: 15 }
  },

  dependencies: ["SD-GENESIS-V31-DREAM-P1", "SD-GENESIS-V31-DREAM-P2"],

  risks: [
    {
      risk: "EVA local context may become stale",
      mitigation: "Use last_updated timestamp in session-state.md, invalidate cache if >1hr old"
    },
    {
      risk: "Builder Crews may not follow Grade 4 loop instructions",
      mitigation: "Embed instructions in venture-agents.md header as CRITICAL, validate in DREAM-P2 generation"
    }
  ]
}
```

### Mirror Phases

#### SD-GENESIS-V31-MIRROR-INT (Integration)

```javascript
{
  id: "SD-GENESIS-V31-MIRROR-INT",
  sd_key: "genesis-v31-mirror-int",
  title: "Mirror: Integration",

  description: `Connect Dreamcatcher intelligence with Mason infrastructure. Build end-to-end
pipeline that flows from seed text through all artifact generation, implement error recovery
for graceful failure handling, add retry logic with idempotent re-execution, and create CLI
status command for simulation display.`,

  scope: `End-to-end pipeline integration, error recovery, retry logic, CLI status command.`,

  rationale: `Integration connects the intelligence layer to the infrastructure layer. Error
handling ensures the system degrades gracefully rather than failing catastrophically.`,

  category: "integration",
  priority: "critical",
  status: "draft",
  relationship_type: "child",
  parent_sd_id: "SD-GENESIS-V31-MIRROR",
  sequence_rank: 1,

  strategic_objectives: [
    "Connect full text-to-simulation pipeline",
    "Handle failures gracefully with recovery",
    "Enable safe re-execution of failed steps",
    "Provide visibility into simulation status"
  ],

  success_criteria: [
    "Seed input triggers full artifact generation automatically",
    "PRD failure doesn't corrupt downstream artifacts",
    "Retry of failed step doesn't duplicate artifacts",
    "'leo status' shows simulation state accurately"
  ],

  metadata: {
    vision_spec_references: {
      version: "GENESIS-V3.1",
      primary_spec: "docs/vision/GENESIS_OATH_V3.md"
    },
    must_read_before_prd: ["docs/vision/GENESIS_OATH_V3.md"],
    must_read_before_exec: ["docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md"],
    implementation_guidance: { creation_mode: "CREATE_FROM_NEW" },
    timeline: { start: "2026-02-09", end: "2026-02-10", duration_days: 2 },
    capacity: { sds: 35, hours: 12 }
  },

  dependencies: ["SD-GENESIS-V31-MASON", "SD-GENESIS-V31-DREAMCATCHER"]
}
```

#### SD-GENESIS-V31-MIRROR-ELEV (Elevation Logic with Agentic Layer Preservation)

```javascript
{
  id: "SD-GENESIS-V31-MIRROR-ELEV",
  sd_key: "genesis-v31-mirror-elev",
  title: "Mirror: Elevation Logic with Agentic Layer Preservation",

  description: `Implement the elevation mechanics that transform simulation to production with full
Agentic Layer preservation. Build Stage 16 schema elevation (copy simulation schema to production
namespace), Stage 17 repo elevation (fork simulation repo to production org), and elevation audit
trail with Chairman signature requirement. CRITICAL: When elevating from Simulation (Aries) to
Production (Saturn), the .claude/ directory MUST be preserved and git committed. The operational
agents in production inherit the context crystallized during simulation - this is the "brain
transplant" that ensures continuity. The .claude/session-state.md must be updated to reflect
elevation status. CONSTRAINT: Complete by Feb 10 - no new logic after.`,

  scope: `Stage 16 schema elevation, Stage 17 repo elevation with .claude/ preservation (agents/, commands/,
context/, hooks/, logs/), elevation audit trail with Chairman signature, Agentic Layer continuity verification.`,

  rationale: `Elevation is the ceremonial transformation from possible to real. The Chairman's
signature requirement ensures human accountability for production changes. The Agentic Layer
preservation is essential for production autonomy - without the .claude/ directory, production
Builder Crews would lose all context from the simulation phase. This is the "brain transplant" -
the frozen agent state from Dreamcatcher becomes the operational memory for production agents.`,

  category: "integration",
  priority: "critical",
  status: "draft",
  relationship_type: "child",
  parent_sd_id: "SD-GENESIS-V31-MIRROR",
  sequence_rank: 2,

  strategic_objectives: [
    "Copy simulation schema to production at Stage 16",
    "Fork simulation repo to production at Stage 17",
    "Log all elevations with Chairman signature",
    "Archive simulation after successful elevation",
    "Preserve .claude/ directory during elevation (git commit to production)",
    "Update .claude/session-state.md with elevation metadata",
    "Verify Agentic Layer integrity post-elevation",
    "Add elevation record to .claude/logs/decisions.md"
  ],

  success_criteria: [
    "Stage 16 creates production schema from simulation",
    "Stage 17 forks repo to ehg-ventures org",
    "elevation_log records Chairman signature for each elevation",
    "Simulation marked 'elevated' after promotion",
    "Elevation fails if Chairman signature missing",
    ".claude/ directory present in production repo after elevation",
    ".claude/session-state.md updated with: elevated_at, elevated_by, production_repo_url, production_schema",
    ".claude/logs/decisions.md contains elevation event with Chairman signature",
    "All files in .claude/context/ and .claude/agents/ preserved without modification",
    "Agentic Layer integrity check passes: all required files present post-elevation"
  ],

  metadata: {
    vision_spec_references: {
      version: "GENESIS-V3.1",
      primary_spec: "docs/vision/GENESIS_OATH_V3.md",
      sections: ["Elevation Mechanics (Simulation → Reality)"]
    },
    must_read_before_prd: ["docs/vision/GENESIS_OATH_V3.md"],
    must_read_before_exec: ["docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md"],
    implementation_guidance: {
      creation_mode: "CREATE_FROM_NEW",
      critical_constraint: "COMPLETE BY FEB 10 - NO NEW LOGIC AFTER",
      agentic_layer_elevation: {
        principle: "Brain transplant - simulation context becomes production memory",
        structure_note: "Uses EHG_Engineer .claude/ structure for consistency",
        preserved_paths: [".claude/agents/", ".claude/commands/", ".claude/context/", ".claude/hooks/", ".claude/logs/"],
        updated_on_elevation: [".claude/session-state.md", ".claude/logs/decisions.md"],
        integrity_check: "Verify all required .claude/ files present after fork",
        failure_mode: "Elevation BLOCKED if .claude/ directory missing or corrupt"
      }
    },
    timeline: { start: "2026-02-10", end: "2026-02-11", duration_days: 2 },
    capacity: { sds: 25, hours: 8 }
  },

  dependencies: ["SD-GENESIS-V31-MIRROR-INT"],

  risks: [
    {
      risk: ".claude/ directory lost during git fork operation",
      mitigation: "Explicit include in fork operation, post-fork integrity check"
    },
    {
      risk: "Production agents may have different context needs than simulation",
      mitigation: "Design .claude/ structure for extensibility, allow production-specific additions"
    }
  ]
}
```

#### SD-GENESIS-V31-MIRROR-TEST (Reflex Testing)

```javascript
{
  id: "SD-GENESIS-V31-MIRROR-TEST",
  sd_key: "genesis-v31-mirror-test",
  title: "Mirror: Reflex Testing",

  description: `Comprehensive testing of the complete Genesis system. Execute happy path
testing with full flow success scenarios, failure mode testing for error handling validation,
and edge case testing for unusual inputs, timeouts, and boundary conditions. NOTE: Testing
only - no new features during this phase.`,

  scope: `Happy path testing, failure mode testing, edge case testing. NO NEW FEATURES.`,

  rationale: `The final days before ritual must focus on verification, not creation.
Mercury's pre-retrograde shadow increases confusion risk - best to test what exists rather
than build new.`,

  category: "testing",
  priority: "critical",
  status: "draft",
  relationship_type: "child",
  parent_sd_id: "SD-GENESIS-V31-MIRROR",
  sequence_rank: 3,

  strategic_objectives: [
    "Verify happy path works end-to-end",
    "Confirm error handling works correctly",
    "Test edge cases and unusual inputs",
    "Document any issues for future resolution"
  ],

  success_criteria: [
    "Happy path: seed → simulation → ratify → venture works",
    "Failure mode: partial failures recover gracefully",
    "Edge cases: empty input, huge input, special chars handled",
    "All critical paths documented with test evidence",
    "Zero new features added during this phase"
  ],

  metadata: {
    vision_spec_references: {
      version: "GENESIS-V3.1",
      primary_spec: "docs/vision/GENESIS_RITUAL_SPECIFICATION.md",
      sections: ["Success Criteria"]
    },
    must_read_before_prd: ["docs/vision/GENESIS_RITUAL_SPECIFICATION.md"],
    must_read_before_exec: ["docs/vision/GENESIS_RITUAL_SPECIFICATION.md"],
    implementation_guidance: {
      creation_mode: "TEST_ONLY",
      critical_constraint: "NO NEW FEATURES - TESTING ONLY"
    },
    timeline: { start: "2026-02-11", end: "2026-02-13", duration_days: 3 },
    capacity: { sds: 20, hours: 7 }
  },

  dependencies: ["SD-GENESIS-V31-MIRROR-INT", "SD-GENESIS-V31-MIRROR-ELEV"]
}
```

---

## Time Budget Summary

| Component | SDs | Hours | % of Total |
|-----------|-----|-------|------------|
| **Mason P1** (Foundation) | 40 | 13 | 12% |
| **Mason P2** (Scaffolder) | 35 | 12 | 11% |
| **Mason P3** (Deploy) | 35 | 12 | 11% |
| **Dreamcatcher P1** (PRD) | 45 | 15 | 14% |
| **Dreamcatcher P2** (Schema/Repo) | 50 | 17 | 15% |
| **Dreamcatcher P3** (EVA/Ratify) | 45 | 15 | 14% |
| **Mirror INT** (Integration) | 35 | 12 | 11% |
| **Mirror ELEV** (Elevation) | 25 | 8 | 7% |
| **Mirror TEST** (Testing) | 20 | 7 | 6% |
| **Ritual** | 0 | 2 | — |
| **TOTAL** | **330** | **113** | 100% |

---

## Database Insertion

Use the following script to insert SDs into the database:

```bash
node scripts/create-genesis-v31-sds.js
```

This script reads this document's structure and inserts all SDs with proper:
- Required fields (id, sd_key, title, description, scope, rationale, category, priority, status)
- Hierarchy fields (relationship_type, parent_sd_id, sequence_rank)
- Strategic fields (strategic_objectives, success_criteria)
- Vision metadata (vision_spec_references, must_read_before_prd, must_read_before_exec, implementation_guidance)

---

## Next Steps

1. Run `node scripts/create-genesis-v31-sds.js` to insert all SDs
2. Run `node scripts/validate-child-sd-completeness.js SD-GENESIS-V31-PARENT` to verify
3. Begin execution with SD-GENESIS-V31-MASON-P1 (Dec 29)
4. Follow LEAD→PLAN→EXEC for each SD

---

*SD Structure document updated: 2025-12-29*
*Vision Version: GENESIS-V3.1*
*LEO Protocol Version: 4.3.3*
