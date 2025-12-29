#!/usr/bin/env node

/**
 * Create Genesis Oath v3.1 Strategic Directives
 *
 * Inserts all 14 SDs for the Simulation Chamber implementation:
 * - 1 Parent SD (orchestrator)
 * - 4 Sprint SDs (Mason, Dreamcatcher, Mirror, Ritual)
 * - 9 Phase SDs (3 per sprint for Mason/Dreamcatcher/Mirror)
 *
 * Per LEO Protocol v4.3.3 and Vision Version GENESIS-V3.1
 * Target Date: February 14, 2026
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// ============================================================================
// SD DEFINITIONS - All 14 Strategic Directives for Genesis Oath v3.1
// ============================================================================

const GENESIS_SDS = {
  // -------------------------------------------------------------------------
  // LEVEL 0: PARENT SD (Orchestrator)
  // -------------------------------------------------------------------------
  parent: {
    id: 'SD-GENESIS-V31-PARENT',
    sd_key: 'genesis-v31-parent',
    legacy_id: 'SD-GENESIS-V31-PARENT',
    title: 'Genesis Oath v3.1 - The Simulation Chamber',

    description: 'Implement the Genesis Oath v3.1 Simulation Chamber architecture - the infrastructure for generating "possible futures" as simulations that exist in parallel until elevated to production through the 25-stage validation workflow. This parent SD orchestrates three sprints (Mason, Dreamcatcher, Mirror) culminating in the Genesis Ritual on February 14, 2026 at 09:00 AM EST, aligned with Saturn\'s ingress into Aries. The Chamber enables autonomous venture creation while preserving validation discipline through hard technical isolation between Aries (simulation) and Saturn (production) namespaces.',

    scope: 'Full implementation of Simulation Chamber: ephemeral infrastructure (GitHub org, DNS, database namespace), text-to-simulation intelligence (PRD/schema/repo generation), elevation mechanics (Stage 16/17/22 transitions), and the /ratify command ceremony.',

    rationale: 'The Genesis Oath transforms EHG from "platform built" to "platform activated" by enabling autonomous venture creation. The Simulation Chamber architecture preserves validation discipline by generating all artifacts as simulations first, only elevating to production after surviving kill gates. This approach satisfies both the need for speed (see possible future immediately) and rigor (earn reality through 25-stage workflow).',

    category: 'infrastructure',
    priority: 'critical',
    status: 'draft',
    relationship_type: 'parent',
    parent_sd_id: null,
    sequence_rank: 1,
    created_by: 'LEO',
    version: '3.1',

    strategic_objectives: [
      'Enable autonomous venture creation through text-to-simulation pipeline',
      'Preserve validation discipline with kill gates and elevation ceremonies',
      'Implement hard technical isolation between simulation and production',
      'Execute Genesis Ritual on February 14, 2026 aligned with Saturn ingress Aries',
      'Demonstrate platform sovereignty - founder inputs idea, walks away, possible future appears'
    ],

    success_criteria: [
      'Simulation Chamber infrastructure fully operational',
      'Text-to-Simulation pipeline generates PRD, Schema, Repo, and Deployment',
      'All simulation artifacts tagged with epistemic_status: simulation',
      '/ratify command displays Contract of Pain and creates venture at Stage 1',
      'Elevation logic promotes simulation to production at Stages 16, 17, 22',
      'Genesis Ritual on Feb 14 completes successfully with Genesis-001 venture created'
    ],

    metadata: {
      vision_spec_references: {
        version: 'GENESIS-V3.1',
        primary_spec: 'docs/vision/GENESIS_OATH_V3.md',
        supporting_specs: [
          'docs/vision/GENESIS_SPRINT_ROADMAP.md',
          'docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md',
          'docs/vision/GENESIS_RITUAL_SPECIFICATION.md',
          'docs/vision/GENESIS_SD_STRUCTURE.md'
        ]
      },
      must_read_before_prd: [
        'docs/vision/GENESIS_OATH_V3.md',
        'docs/vision/GENESIS_SPRINT_ROADMAP.md'
      ],
      must_read_before_exec: [
        'docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'
      ],
      implementation_guidance: {
        creation_mode: 'CREATE_FROM_NEW',
        target_date: '2026-02-14',
        ritual_time: '09:00 AM EST',
        cosmic_alignment: 'Saturn enters Aries Feb 13, 2026 at 19:11 EST'
      },
      capacity: {
        total_sds: 330,
        total_hours: 110,
        children: [
          'SD-GENESIS-V31-MASON',
          'SD-GENESIS-V31-DREAMCATCHER',
          'SD-GENESIS-V31-MIRROR',
          'SD-GENESIS-V31-RITUAL'
        ]
      }
    },

    dependencies: [],

    risks: [
      {
        risk: 'Sprint timeline too aggressive',
        mitigation: 'Buffer built into Dreamcatcher, fallback to PRD-only Genesis if needed'
      },
      {
        risk: 'Hard isolation adds infrastructure complexity',
        mitigation: 'Separate Supabase projects, Vercel teams, GitHub orgs - no shared credentials'
      },
      {
        risk: 'Mercury retrograde shadow starts Feb 12',
        mitigation: 'No new logic after Feb 10, final days are integration/testing only'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // LEVEL 1: SPRINT SDs (Children of Parent)
  // -------------------------------------------------------------------------

  mason: {
    id: 'SD-GENESIS-V31-MASON',
    sd_key: 'genesis-v31-mason',
    legacy_id: 'SD-GENESIS-V31-MASON',
    title: 'Sprint 1: The Mason - Simulation Infrastructure',

    description: 'Build the Simulation Chamber infrastructure during the Capricorn sprint (Dec 29 - Jan 19). Establish ephemeral systems for generating simulation artifacts: GitHub organization (ehg-simulations), wildcard DNS (*.possible.ehg.dev), database namespace (schema_sim_*), epistemic tagging system, TTL lifecycle management, and deployment pipeline with watermark overlay. This sprint creates the "Aries Namespace" - the realm of possible futures that exists in hard technical isolation from the "Saturn Namespace" (production).',

    scope: 'Infrastructure for simulation environment: GitHub org creation, DNS configuration, Supabase namespace conventions, epistemic_status field implementation, TTL auto-archive triggers, Vercel deployment pipeline, SIMULATION watermark middleware.',

    rationale: 'Infrastructure must exist before intelligence can generate into it. The Mason sprint builds the container (Aries Namespace) that will receive the Dreamcatcher\'s generated artifacts. Capricorn energy (structure, foundation, authority) aligns with this architectural work.',

    category: 'infrastructure',
    priority: 'critical',
    status: 'draft',
    relationship_type: 'child',
    parent_sd_id: 'SD-GENESIS-V31-PARENT',
    sequence_rank: 1,
    created_by: 'LEO',
    version: '3.1',

    strategic_objectives: [
      'Create ehg-simulations GitHub organization with proper isolation',
      'Configure *.possible.ehg.dev wildcard DNS for simulation deployments',
      'Implement schema_sim_* database namespace convention',
      'Build TTL enforcement and garbage collection systems',
      'Create simulation deployment pipeline with watermark overlay'
    ],

    success_criteria: [
      'ehg-simulations GitHub org exists and is accessible',
      '*.possible.ehg.dev wildcard DNS resolves correctly',
      'schema_sim_* tables can be created with proper namespace isolation',
      'epistemic_status field present in simulation_artifacts table',
      'TTL countdown triggers auto-archive after 90 days',
      'Simulation deployment includes SIMULATION watermark banner',
      'Stage 3 rejection triggers infrastructure cleanup'
    ],

    metadata: {
      vision_spec_references: {
        version: 'GENESIS-V3.1',
        primary_spec: 'docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md',
        sections: [
          'The Two Namespaces (Hard Isolation)',
          'Database Schema',
          'Infrastructure Components',
          'Lifecycle Management'
        ]
      },
      must_read_before_prd: [
        'docs/vision/GENESIS_OATH_V3.md',
        'docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'
      ],
      must_read_before_exec: [
        'docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'
      ],
      implementation_guidance: {
        creation_mode: 'CREATE_FROM_NEW',
        zodiac: 'Capricorn',
        archetype: 'The Mason',
        theme: 'Structure'
      },
      timeline: {
        start: '2025-12-29',
        end: '2026-01-19',
        duration_days: 22
      },
      capacity: {
        sds: 110,
        hours: 37,
        children: [
          'SD-GENESIS-V31-MASON-P1',
          'SD-GENESIS-V31-MASON-P2',
          'SD-GENESIS-V31-MASON-P3'
        ]
      }
    },

    dependencies: [],

    risks: [
      {
        risk: 'GitHub org creation requires account verification',
        mitigation: 'Set up org early, document configuration steps'
      },
      {
        risk: 'DNS propagation delays',
        mitigation: 'Configure 24h before needed, use low TTL values'
      }
    ]
  },

  dreamcatcher: {
    id: 'SD-GENESIS-V31-DREAMCATCHER',
    sd_key: 'genesis-v31-dreamcatcher',
    legacy_id: 'SD-GENESIS-V31-DREAMCATCHER',
    title: 'Sprint 2: The Dreamcatcher - Text-to-Simulation Intelligence',

    description: 'Build the intelligence layer for autonomous artifact generation during the Aquarius sprint (Jan 20 - Feb 8). Create text-to-simulation pipeline: venture seed parser, PRD template engine, problem/solution extraction, schema generator, repo customizer, and the /ratify approval gate. This sprint implements the "Quantum Leap" - the moment raw text transforms into a visible possible future. PRD is generated as OFFICIAL (Stage 1-2 artifact), while Schema, Repo, and Deployment are generated as SIMULATION (epistemic_status: simulation).',

    scope: 'Text-to-simulation intelligence: seed parsing, PRD generation, schema inference, repo scaffolding, deployment automation, /ratify command, Contract of Pain UI, venture creation at Stage 1, EVA integration.',

    rationale: 'With infrastructure in place (Mason), the Dreamcatcher can generate artifacts into the simulation namespace. This is the core value proposition of Genesis Oath - autonomous creation of possible futures from raw ideas. Aquarius energy (innovation, intelligence, vision) aligns with this AI-powered generation work.',

    category: 'feature',
    priority: 'critical',
    status: 'draft',
    relationship_type: 'child',
    parent_sd_id: 'SD-GENESIS-V31-PARENT',
    sequence_rank: 2,
    created_by: 'LEO',
    version: '3.1',

    strategic_objectives: [
      'Parse raw venture seed text into structured data',
      'Generate PRD as official Stage 1-2 artifact (not simulation)',
      'Generate schema as simulation artifact with epistemic tagging',
      'Generate repo scaffold as simulation artifact',
      'Implement /ratify command with Contract of Pain ceremony',
      'Create venture at Stage 1 with simulation artifacts linked'
    ],

    success_criteria: [
      'Text input generates valid, quality-gated PRD',
      'PRD scoped to Stage 1-2 validation target (not solution commitment)',
      'PRD-to-Schema intelligence extracts data model correctly',
      'PRD-to-Repo intelligence generates customized scaffold',
      'All simulation artifacts tagged epistemic_status: simulation',
      '/ratify command displays 25-stage Contract of Pain',
      'Post-ratify venture created at Stage 1 with Stage 3 date scheduled',
      'Simulation remains as North Star visible at *.possible.ehg.dev'
    ],

    metadata: {
      vision_spec_references: {
        version: 'GENESIS-V3.1',
        primary_spec: 'docs/vision/GENESIS_OATH_V3.md',
        sections: [
          'PRD Scope Clarification',
          'The /ratify Command: Scope Definition',
          'Epistemic Tagging (Canon Law)'
        ]
      },
      must_read_before_prd: [
        'docs/vision/GENESIS_OATH_V3.md',
        'docs/vision/GENESIS_RITUAL_SPECIFICATION.md'
      ],
      must_read_before_exec: [
        'docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'
      ],
      implementation_guidance: {
        creation_mode: 'CREATE_FROM_NEW',
        zodiac: 'Aquarius',
        archetype: 'The Dreamcatcher',
        theme: 'Intelligence'
      },
      timeline: {
        start: '2026-01-20',
        end: '2026-02-08',
        duration_days: 20
      },
      capacity: {
        sds: 140,
        hours: 47,
        children: [
          'SD-GENESIS-V31-DREAM-P1',
          'SD-GENESIS-V31-DREAM-P2',
          'SD-GENESIS-V31-DREAM-P3'
        ]
      }
    },

    dependencies: ['SD-GENESIS-V31-MASON'],

    risks: [
      {
        risk: 'LLM hallucination in generated artifacts',
        mitigation: 'Structured output validation, quality gates on PRD'
      },
      {
        risk: 'Schema inference accuracy',
        mitigation: 'Template library of validated patterns, human review option'
      }
    ]
  },

  mirror: {
    id: 'SD-GENESIS-V31-MIRROR',
    sd_key: 'genesis-v31-mirror',
    legacy_id: 'SD-GENESIS-V31-MIRROR',
    title: 'Sprint 3: The Mirror - Integration & Elevation',

    description: 'Connect all systems and implement elevation logic during the Pisces sprint (Feb 9 - Feb 13). Focus on end-to-end pipeline integration, error recovery, retry logic, and the elevation mechanics that transform simulation artifacts to production at Stages 16, 17, and 22. CRITICAL CONSTRAINT: No new logic after Feb 10 due to Mercury pre-retrograde shadow starting Feb 12. Final days are integration testing only.',

    scope: 'End-to-end pipeline integration, error recovery, retry logic, CLI status commands, Stage 16 schema elevation, Stage 17 repo elevation, Stage 22 deployment elevation, elevation audit trail with Chairman signature, reflex testing.',

    rationale: 'With infrastructure (Mason) and intelligence (Dreamcatcher) complete, the Mirror sprint connects everything and ensures simulation-to-production elevation works correctly. Pisces energy (connection, transcendence, completion) aligns with this integration work. The compressed timeline requires discipline - testing only after Feb 10.',

    category: 'integration',
    priority: 'critical',
    status: 'draft',
    relationship_type: 'child',
    parent_sd_id: 'SD-GENESIS-V31-PARENT',
    sequence_rank: 3,
    created_by: 'LEO',
    version: '3.1',

    strategic_objectives: [
      'Integrate Dreamcatcher output with Mason infrastructure',
      'Implement error recovery and retry logic for resilience',
      'Build elevation mechanics for Stages 16, 17, and 22',
      'Create elevation audit trail with Chairman signature requirement',
      'Complete reflex testing before Mercury shadow'
    ],

    success_criteria: [
      'End-to-end simulation flow works without manual intervention',
      'Error recovery gracefully handles generation failures',
      'Retry logic is idempotent (safe to re-run)',
      'Stage 16 elevation copies schema from simulation to production',
      'Stage 17 elevation forks repo from simulation to production',
      'All elevations require Chairman signature in audit log',
      'Stage 3 rejection triggers complete simulation cleanup',
      'CLI leo status displays simulation state correctly'
    ],

    metadata: {
      vision_spec_references: {
        version: 'GENESIS-V3.1',
        primary_spec: 'docs/vision/GENESIS_OATH_V3.md',
        sections: [
          'Elevation Mechanics (Simulation -> Reality)',
          'TTL Enforcement (Non-Negotiable)'
        ]
      },
      must_read_before_prd: [
        'docs/vision/GENESIS_OATH_V3.md',
        'docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'
      ],
      must_read_before_exec: [
        'docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'
      ],
      implementation_guidance: {
        creation_mode: 'CREATE_FROM_NEW',
        zodiac: 'Pisces',
        archetype: 'The Mirror',
        theme: 'Integration',
        critical_constraint: 'NO NEW LOGIC AFTER FEB 10 - Mercury shadow starts Feb 12'
      },
      timeline: {
        start: '2026-02-09',
        end: '2026-02-13',
        duration_days: 5,
        logic_cutoff: '2026-02-10'
      },
      capacity: {
        sds: 80,
        hours: 27,
        children: [
          'SD-GENESIS-V31-MIRROR-INT',
          'SD-GENESIS-V31-MIRROR-ELEV',
          'SD-GENESIS-V31-MIRROR-TEST'
        ]
      }
    },

    dependencies: ['SD-GENESIS-V31-MASON', 'SD-GENESIS-V31-DREAMCATCHER'],

    risks: [
      {
        risk: 'Compressed timeline (5 days)',
        mitigation: 'Prioritize integration over new features, defer nice-to-haves'
      },
      {
        risk: 'Mercury shadow introduces confusion',
        mitigation: 'No new logic after Feb 10, testing only'
      }
    ]
  },

  ritual: {
    id: 'SD-GENESIS-V31-RITUAL',
    sd_key: 'genesis-v31-ritual',
    legacy_id: 'SD-GENESIS-V31-RITUAL',
    title: 'Genesis Ritual Preparation and Execution',

    description: 'Prepare for and execute the February 14, 2026 Genesis Oath ritual - the Collapse of the Wave Function. This SD covers pre-ritual verification (Feb 13), ritual execution (Feb 14 at 09:00 AM EST), and post-ritual validation. The ritual marks the first morning of Saturn\'s new reign in Aries, cosmically aligned with "structure meets initiation." On ritual completion, Genesis-001 will exist as an active venture at Stage 1 with its simulation visible as North Star.',

    scope: 'Pre-ritual checklist completion, seed text finalization, systems verification, ritual execution, post-ritual validation, documentation and celebration.',

    rationale: 'The Genesis Ritual is the culmination of the entire Genesis Oath vision. It transforms abstract architecture into lived experience - the Chairman inputs a seed, walks away for coffee, and returns to find a possible future visible and a venture entered into the 25-stage pipeline. This is platform sovereignty demonstrated.',

    category: 'ceremony',
    priority: 'critical',
    status: 'draft',
    relationship_type: 'child',
    parent_sd_id: 'SD-GENESIS-V31-PARENT',
    sequence_rank: 4,
    created_by: 'LEO',
    version: '3.1',

    strategic_objectives: [
      'Complete all pre-ritual verification checklists',
      'Prepare Genesis-001 venture seed text',
      'Execute ritual at 09:00 AM EST on Feb 14, 2026',
      'Validate all artifacts generated correctly',
      'Document the first Genesis for posterity'
    ],

    success_criteria: [
      'All systems verified green on Feb 13 evening',
      'Genesis-001 seed text locked and ready',
      'Ritual executes without errors at 09:00 AM EST',
      'PRD generated as official artifact',
      'Schema, Repo, Deployment generated as simulations',
      'Simulation visible at genesis-001.possible.ehg.dev',
      'Venture created at Stage 1 with Stage 3 date scheduled',
      'Post-ritual validation checklist complete',
      'Celebration documented'
    ],

    metadata: {
      vision_spec_references: {
        version: 'GENESIS-V3.1',
        primary_spec: 'docs/vision/GENESIS_RITUAL_SPECIFICATION.md'
      },
      must_read_before_prd: [
        'docs/vision/GENESIS_RITUAL_SPECIFICATION.md'
      ],
      must_read_before_exec: [
        'docs/vision/GENESIS_RITUAL_SPECIFICATION.md'
      ],
      implementation_guidance: {
        creation_mode: 'CEREMONY',
        prep_start: '2026-02-13',
        ritual_date: '2026-02-14',
        ritual_time: '09:00 AM EST',
        cosmic_alignment: {
          event: 'Saturn enters Aries',
          timestamp: '2026-02-13T19:11:00-05:00',
          significance: 'First morning of the new reign'
        }
      },
      timeline: {
        prep_date: '2026-02-13',
        ritual_date: '2026-02-14',
        ritual_time: '09:00'
      },
      capacity: {
        sds: 0,
        hours: 2
      }
    },

    dependencies: [
      'SD-GENESIS-V31-MASON',
      'SD-GENESIS-V31-DREAMCATCHER',
      'SD-GENESIS-V31-MIRROR'
    ],

    risks: [
      {
        risk: 'System failure during ritual',
        mitigation: 'Fallback to PRD-only mode, retry logic, rollback procedures'
      },
      {
        risk: 'Seed text incomplete',
        mitigation: 'Lock seed 24h before, have backup seed ready'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // LEVEL 2: PHASE SDs - MASON (Children of Mason)
  // -------------------------------------------------------------------------

  masonP1: {
    id: 'SD-GENESIS-V31-MASON-P1',
    sd_key: 'genesis-v31-mason-p1',
    legacy_id: 'SD-GENESIS-V31-MASON-P1',
    title: 'Mason Phase 1: Ephemeral Foundation',

    description: 'Establish the foundational infrastructure for the Simulation Chamber. Create the ehg-simulations GitHub organization with proper isolation, configure *.possible.ehg.dev wildcard DNS, implement schema_sim_* database namespace convention in Supabase, build the epistemic_status tagging system, create simulation_artifacts table with full tracking, implement TTL auto-archive triggers, and set up GitHub API integration for the simulation org.',

    scope: 'GitHub org creation, DNS configuration, database namespace setup, epistemic tagging schema, TTL system implementation, simulation metadata table, GitHub API auth.',

    rationale: 'The ephemeral foundation creates the isolated container where simulations will live. Hard technical isolation (different accounts, credentials, orgs) prevents accidental production contamination.',

    category: 'infrastructure',
    priority: 'critical',
    status: 'draft',
    relationship_type: 'child',
    parent_sd_id: 'SD-GENESIS-V31-MASON',
    sequence_rank: 1,
    created_by: 'LEO',
    version: '3.1',

    strategic_objectives: [
      'Create ehg-simulations GitHub org with isolated credentials',
      'Configure *.possible.ehg.dev wildcard DNS',
      'Implement schema_sim_* namespace convention',
      'Build epistemic_status tagging into all artifact tables',
      'Create simulation_artifacts table with TTL tracking'
    ],

    success_criteria: [
      'ehg-simulations org accessible at github.com/ehg-simulations',
      'DNS *.possible.ehg.dev configured and resolving',
      'CREATE SCHEMA schema_sim_test works in Supabase',
      'epistemic_status enum exists: simulation, pending_elevation, elevated, archived',
      'simulation_artifacts table includes expires_at calculation',
      'TTL cleanup job scheduled and tested'
    ],

    metadata: {
      vision_spec_references: {
        version: 'GENESIS-V3.1',
        primary_spec: 'docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md',
        sections: ['The Two Namespaces (Hard Isolation)', 'Database Schema']
      },
      must_read_before_prd: ['docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'],
      must_read_before_exec: ['docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'],
      implementation_guidance: { creation_mode: 'CREATE_FROM_NEW' },
      timeline: { start: '2025-12-29', end: '2026-01-05', duration_days: 8 },
      capacity: { sds: 40, hours: 13 }
    },

    dependencies: [],

    risks: []
  },

  masonP2: {
    id: 'SD-GENESIS-V31-MASON-P2',
    sd_key: 'genesis-v31-mason-p2',
    legacy_id: 'SD-GENESIS-V31-MASON-P2',
    title: 'Mason Phase 2: Simulation Scaffolder',

    description: 'Build the repository and schema scaffolding systems. Create venture scaffold templates (Next.js SaaS starter, API service), implement automated repo creation in ehg-simulations org, set up git init and initial commit automation, build schema template library with pre-validated patterns, and create migration generator that converts JSON schema definitions to SQL migrations.',

    scope: 'Repo template system, gh repo create automation, git init automation, schema template library, JSON-to-SQL migration generator.',

    rationale: 'With foundation in place, the scaffolder enables rapid generation of venture infrastructure. Templates ensure consistency while automation enables speed.',

    category: 'infrastructure',
    priority: 'critical',
    status: 'draft',
    relationship_type: 'child',
    parent_sd_id: 'SD-GENESIS-V31-MASON',
    sequence_rank: 2,
    created_by: 'LEO',
    version: '3.1',

    strategic_objectives: [
      'Create reusable venture scaffold templates',
      'Automate GitHub repo creation in simulation org',
      'Build schema template library with validated patterns',
      'Implement migration generator from JSON schema'
    ],

    success_criteria: [
      'next-saas-starter template available and customizable',
      'gh repo create automation creates repos in ehg-simulations',
      'Initial commit automation pushes template with venture config',
      'Schema templates cover common SaaS patterns (users, subscriptions, etc.)',
      'Migration generator produces valid SQL from JSON schema'
    ],

    metadata: {
      vision_spec_references: {
        version: 'GENESIS-V3.1',
        primary_spec: 'docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md',
        sections: ['Infrastructure Components', 'GitHub Integration']
      },
      must_read_before_prd: ['docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'],
      must_read_before_exec: ['docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'],
      implementation_guidance: { creation_mode: 'CREATE_FROM_NEW' },
      timeline: { start: '2026-01-06', end: '2026-01-12', duration_days: 7 },
      capacity: { sds: 35, hours: 12 }
    },

    dependencies: ['SD-GENESIS-V31-MASON-P1'],

    risks: []
  },

  masonP3: {
    id: 'SD-GENESIS-V31-MASON-P3',
    sd_key: 'genesis-v31-mason-p3',
    legacy_id: 'SD-GENESIS-V31-MASON-P3',
    title: 'Mason Phase 3: Ephemeral Deploy',

    description: 'Build the ephemeral deployment pipeline. Set up Vercel simulation project with separate team account, implement deploy automation from repo push to live URL, create SIMULATION watermark overlay middleware, add health check endpoint with simulation metadata, implement cost cap enforcement to prevent runaway spending, and build garbage collection for Stage 3 rejection cleanup.',

    scope: 'Vercel project setup, deploy automation, watermark middleware, health endpoints, cost caps, garbage collection.',

    rationale: 'The deployment pipeline makes simulations visible as running applications. The watermark ensures users never mistake simulation for production. Cost caps and garbage collection prevent resource waste.',

    category: 'infrastructure',
    priority: 'critical',
    status: 'draft',
    relationship_type: 'child',
    parent_sd_id: 'SD-GENESIS-V31-MASON',
    sequence_rank: 3,
    created_by: 'LEO',
    version: '3.1',

    strategic_objectives: [
      'Deploy simulations to *.possible.ehg.dev automatically',
      'Display SIMULATION watermark on all simulation URLs',
      'Implement cost controls for simulation infrastructure',
      'Clean up rejected simulations automatically'
    ],

    success_criteria: [
      'Vercel simulation project with separate team credentials',
      'Repo push triggers automatic deployment',
      'SIMULATION banner displays on all simulation pages',
      '/health endpoint returns 200 with simulation metadata',
      'Daily cost stays under $5 per simulation limit',
      'Stage 3 rejection triggers infrastructure destruction'
    ],

    metadata: {
      vision_spec_references: {
        version: 'GENESIS-V3.1',
        primary_spec: 'docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md',
        sections: ['Deployment Infrastructure', 'Lifecycle Management']
      },
      must_read_before_prd: ['docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'],
      must_read_before_exec: ['docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'],
      implementation_guidance: { creation_mode: 'CREATE_FROM_NEW' },
      timeline: { start: '2026-01-13', end: '2026-01-19', duration_days: 7 },
      capacity: { sds: 35, hours: 12 }
    },

    dependencies: ['SD-GENESIS-V31-MASON-P1', 'SD-GENESIS-V31-MASON-P2'],

    risks: []
  },

  // -------------------------------------------------------------------------
  // LEVEL 2: PHASE SDs - DREAMCATCHER (Children of Dreamcatcher)
  // -------------------------------------------------------------------------

  dreamP1: {
    id: 'SD-GENESIS-V31-DREAM-P1',
    sd_key: 'genesis-v31-dream-p1',
    legacy_id: 'SD-GENESIS-V31-DREAM-P1',
    title: 'Dreamcatcher Phase 1: PRD Generation',

    description: 'Build the text-to-PRD intelligence layer. Create venture seed parser that extracts structure from raw text, implement PRD template engine for Stage 1-2 artifact generation, build problem/solution extraction using NLP, generate functional requirements from seed analysis, and implement PRD quality validator with pass/fail gates.',

    scope: 'Seed parser, PRD template engine, NLP extraction, requirements generation, PRD validation gates.',

    rationale: 'The PRD is the official artifact (not simulation) that captures validated understanding of the venture concept. It scopes Stage 1-2 validation target, not solution commitment.',

    category: 'feature',
    priority: 'critical',
    status: 'draft',
    relationship_type: 'child',
    parent_sd_id: 'SD-GENESIS-V31-DREAMCATCHER',
    sequence_rank: 1,
    created_by: 'LEO',
    version: '3.1',

    strategic_objectives: [
      'Parse raw venture seed into structured data',
      'Generate PRD as official Stage 1-2 artifact',
      'Extract problem statement and solution hypothesis',
      'Generate actionable functional requirements',
      'Validate PRD quality before proceeding'
    ],

    success_criteria: [
      'Seed parser handles various input formats',
      'PRD template produces complete Stage 1-2 document',
      'Problem/solution extraction accuracy > 80%',
      'Generated requirements are specific and testable',
      'PRD validator catches incomplete/low-quality output'
    ],

    metadata: {
      vision_spec_references: {
        version: 'GENESIS-V3.1',
        primary_spec: 'docs/vision/GENESIS_OATH_V3.md',
        sections: ['PRD Scope Clarification']
      },
      must_read_before_prd: ['docs/vision/GENESIS_OATH_V3.md'],
      must_read_before_exec: ['docs/vision/GENESIS_OATH_V3.md'],
      implementation_guidance: { creation_mode: 'CREATE_FROM_NEW' },
      timeline: { start: '2026-01-20', end: '2026-01-26', duration_days: 7 },
      capacity: { sds: 45, hours: 15 }
    },

    dependencies: ['SD-GENESIS-V31-MASON'],

    risks: []
  },

  dreamP2: {
    id: 'SD-GENESIS-V31-DREAM-P2',
    sd_key: 'genesis-v31-dream-p2',
    legacy_id: 'SD-GENESIS-V31-DREAM-P2',
    title: 'Dreamcatcher Phase 2: Schema/Repo Simulation',

    description: 'Build PRD-to-artifact intelligence. Create PRD-to-schema extraction that infers data model from requirements, implement schema generator producing SQL tables with relationships, build RLS policy generator for automatic security rules, implement PRD-to-repo extraction for tech requirements, and create repo customizer that applies PRD context to scaffold templates.',

    scope: 'PRD-to-schema intelligence, schema generator, RLS generator, PRD-to-repo intelligence, repo customizer.',

    rationale: 'With PRD generated, the system can now infer what database schema and application structure the venture needs. All generated artifacts are tagged as simulations (epistemic_status: simulation).',

    category: 'feature',
    priority: 'critical',
    status: 'draft',
    relationship_type: 'child',
    parent_sd_id: 'SD-GENESIS-V31-DREAMCATCHER',
    sequence_rank: 2,
    created_by: 'LEO',
    version: '3.1',

    strategic_objectives: [
      'Extract data model from PRD requirements',
      'Generate SQL schema with proper relationships',
      'Auto-generate RLS security policies',
      'Extract technology requirements from PRD',
      'Customize repo scaffold with venture specifics'
    ],

    success_criteria: [
      'PRD-to-schema identifies entities and relationships',
      'Schema generator produces valid SQL with foreign keys',
      'RLS policies enforce basic access control',
      'Tech requirements identify stack components',
      'Repo customizer updates package.json, README, config'
    ],

    metadata: {
      vision_spec_references: {
        version: 'GENESIS-V3.1',
        primary_spec: 'docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md',
        sections: ['Database Schema', 'Infrastructure Components']
      },
      must_read_before_prd: ['docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'],
      must_read_before_exec: ['docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'],
      implementation_guidance: { creation_mode: 'CREATE_FROM_NEW' },
      timeline: { start: '2026-01-27', end: '2026-02-02', duration_days: 7 },
      capacity: { sds: 50, hours: 17 }
    },

    dependencies: ['SD-GENESIS-V31-DREAM-P1'],

    risks: []
  },

  dreamP3: {
    id: 'SD-GENESIS-V31-DREAM-P3',
    sd_key: 'genesis-v31-dream-p3',
    legacy_id: 'SD-GENESIS-V31-DREAM-P3',
    title: 'Dreamcatcher Phase 3: EVA + Approval Gate',

    description: 'Build the approval ceremony and venture creation. Implement /ratify CLI command for the Contract of Pain, create approval prompt UI showing 25-stage commitment, build venture creation flow for post-ratify instantiation, implement stage scheduler to auto-schedule Stage 3 kill gate, integrate with EVA orchestration, and create simulation summary generator for the "Possible Future" display.',

    scope: '/ratify command, Contract of Pain UI, venture creation, stage scheduling, EVA integration, simulation summary.',

    rationale: 'The /ratify command is the threshold moment - the Chairman commits to 25 stages of labor to earn reality. This is not permission to skip validation; it\'s acceptance of the work required.',

    category: 'feature',
    priority: 'critical',
    status: 'draft',
    relationship_type: 'child',
    parent_sd_id: 'SD-GENESIS-V31-DREAMCATCHER',
    sequence_rank: 3,
    created_by: 'LEO',
    version: '3.1',

    strategic_objectives: [
      'Implement /ratify CLI command with ceremony',
      'Display Contract of Pain with 25 stages visible',
      'Create venture at Stage 1 after ratification',
      'Auto-schedule Stage 3 kill gate date',
      'Integrate simulation lifecycle with EVA'
    ],

    success_criteria: [
      '/ratify command triggers approval ceremony',
      'Contract of Pain displays all 25 stages and 4 kill gates',
      'Venture created in database at Stage 1 post-ratify',
      'Stage 3 date calculated and stored',
      'EVA receives notification of new venture',
      'Simulation summary shows all generated artifacts'
    ],

    metadata: {
      vision_spec_references: {
        version: 'GENESIS-V3.1',
        primary_spec: 'docs/vision/GENESIS_OATH_V3.md',
        sections: ['The /ratify Command: Scope Definition']
      },
      must_read_before_prd: ['docs/vision/GENESIS_OATH_V3.md', 'docs/vision/GENESIS_RITUAL_SPECIFICATION.md'],
      must_read_before_exec: ['docs/vision/GENESIS_RITUAL_SPECIFICATION.md'],
      implementation_guidance: { creation_mode: 'CREATE_FROM_NEW' },
      timeline: { start: '2026-02-03', end: '2026-02-08', duration_days: 6 },
      capacity: { sds: 45, hours: 15 }
    },

    dependencies: ['SD-GENESIS-V31-DREAM-P1', 'SD-GENESIS-V31-DREAM-P2'],

    risks: []
  },

  // -------------------------------------------------------------------------
  // LEVEL 2: PHASE SDs - MIRROR (Children of Mirror)
  // -------------------------------------------------------------------------

  mirrorInt: {
    id: 'SD-GENESIS-V31-MIRROR-INT',
    sd_key: 'genesis-v31-mirror-int',
    legacy_id: 'SD-GENESIS-V31-MIRROR-INT',
    title: 'Mirror: Integration',

    description: 'Connect Dreamcatcher intelligence with Mason infrastructure. Build end-to-end pipeline that flows from seed text through all artifact generation, implement error recovery for graceful failure handling, add retry logic with idempotent re-execution, and create CLI status command for simulation display.',

    scope: 'End-to-end pipeline integration, error recovery, retry logic, CLI status command.',

    rationale: 'Integration connects the intelligence layer to the infrastructure layer. Error handling ensures the system degrades gracefully rather than failing catastrophically.',

    category: 'integration',
    priority: 'critical',
    status: 'draft',
    relationship_type: 'child',
    parent_sd_id: 'SD-GENESIS-V31-MIRROR',
    sequence_rank: 1,
    created_by: 'LEO',
    version: '3.1',

    strategic_objectives: [
      'Connect full text-to-simulation pipeline',
      'Handle failures gracefully with recovery',
      'Enable safe re-execution of failed steps',
      'Provide visibility into simulation status'
    ],

    success_criteria: [
      'Seed input triggers full artifact generation automatically',
      'PRD failure does not corrupt downstream artifacts',
      'Retry of failed step does not duplicate artifacts',
      'leo status shows simulation state accurately'
    ],

    metadata: {
      vision_spec_references: {
        version: 'GENESIS-V3.1',
        primary_spec: 'docs/vision/GENESIS_OATH_V3.md'
      },
      must_read_before_prd: ['docs/vision/GENESIS_OATH_V3.md'],
      must_read_before_exec: ['docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'],
      implementation_guidance: { creation_mode: 'CREATE_FROM_NEW' },
      timeline: { start: '2026-02-09', end: '2026-02-10', duration_days: 2 },
      capacity: { sds: 35, hours: 12 }
    },

    dependencies: ['SD-GENESIS-V31-MASON', 'SD-GENESIS-V31-DREAMCATCHER'],

    risks: []
  },

  mirrorElev: {
    id: 'SD-GENESIS-V31-MIRROR-ELEV',
    sd_key: 'genesis-v31-mirror-elev',
    legacy_id: 'SD-GENESIS-V31-MIRROR-ELEV',
    title: 'Mirror: Elevation Logic',

    description: 'Implement the elevation mechanics that transform simulation to production. Build Stage 16 schema elevation (copy simulation schema to production namespace), Stage 17 repo elevation (fork simulation repo to production org), and elevation audit trail with Chairman signature requirement. CONSTRAINT: Complete by Feb 10 - no new logic after.',

    scope: 'Stage 16 schema elevation, Stage 17 repo elevation, elevation audit trail with Chairman signature.',

    rationale: 'Elevation is the ceremonial transformation from possible to real. The Chairman\'s signature requirement ensures human accountability for production changes.',

    category: 'integration',
    priority: 'critical',
    status: 'draft',
    relationship_type: 'child',
    parent_sd_id: 'SD-GENESIS-V31-MIRROR',
    sequence_rank: 2,
    created_by: 'LEO',
    version: '3.1',

    strategic_objectives: [
      'Copy simulation schema to production at Stage 16',
      'Fork simulation repo to production at Stage 17',
      'Log all elevations with Chairman signature',
      'Archive simulation after successful elevation'
    ],

    success_criteria: [
      'Stage 16 creates production schema from simulation',
      'Stage 17 forks repo to ehg-ventures org',
      'elevation_log records Chairman signature for each elevation',
      'Simulation marked elevated after promotion',
      'Elevation fails if Chairman signature missing'
    ],

    metadata: {
      vision_spec_references: {
        version: 'GENESIS-V3.1',
        primary_spec: 'docs/vision/GENESIS_OATH_V3.md',
        sections: ['Elevation Mechanics (Simulation -> Reality)']
      },
      must_read_before_prd: ['docs/vision/GENESIS_OATH_V3.md'],
      must_read_before_exec: ['docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'],
      implementation_guidance: {
        creation_mode: 'CREATE_FROM_NEW',
        critical_constraint: 'COMPLETE BY FEB 10 - NO NEW LOGIC AFTER'
      },
      timeline: { start: '2026-02-10', end: '2026-02-11', duration_days: 2 },
      capacity: { sds: 25, hours: 8 }
    },

    dependencies: ['SD-GENESIS-V31-MIRROR-INT'],

    risks: []
  },

  mirrorTest: {
    id: 'SD-GENESIS-V31-MIRROR-TEST',
    sd_key: 'genesis-v31-mirror-test',
    legacy_id: 'SD-GENESIS-V31-MIRROR-TEST',
    title: 'Mirror: Reflex Testing',

    description: 'Comprehensive testing of the complete Genesis system. Execute happy path testing with full flow success scenarios, failure mode testing for error handling validation, and edge case testing for unusual inputs, timeouts, and boundary conditions. NOTE: Testing only - no new features during this phase.',

    scope: 'Happy path testing, failure mode testing, edge case testing. NO NEW FEATURES.',

    rationale: 'The final days before ritual must focus on verification, not creation. Mercury\'s pre-retrograde shadow increases confusion risk - best to test what exists rather than build new.',

    category: 'testing',
    priority: 'critical',
    status: 'draft',
    relationship_type: 'child',
    parent_sd_id: 'SD-GENESIS-V31-MIRROR',
    sequence_rank: 3,
    created_by: 'LEO',
    version: '3.1',

    strategic_objectives: [
      'Verify happy path works end-to-end',
      'Confirm error handling works correctly',
      'Test edge cases and unusual inputs',
      'Document any issues for future resolution'
    ],

    success_criteria: [
      'Happy path: seed -> simulation -> ratify -> venture works',
      'Failure mode: partial failures recover gracefully',
      'Edge cases: empty input, huge input, special chars handled',
      'All critical paths documented with test evidence',
      'Zero new features added during this phase'
    ],

    metadata: {
      vision_spec_references: {
        version: 'GENESIS-V3.1',
        primary_spec: 'docs/vision/GENESIS_RITUAL_SPECIFICATION.md',
        sections: ['Success Criteria']
      },
      must_read_before_prd: ['docs/vision/GENESIS_RITUAL_SPECIFICATION.md'],
      must_read_before_exec: ['docs/vision/GENESIS_RITUAL_SPECIFICATION.md'],
      implementation_guidance: {
        creation_mode: 'TEST_ONLY',
        critical_constraint: 'NO NEW FEATURES - TESTING ONLY'
      },
      timeline: { start: '2026-02-11', end: '2026-02-13', duration_days: 3 },
      capacity: { sds: 20, hours: 7 }
    },

    dependencies: ['SD-GENESIS-V31-MIRROR-INT', 'SD-GENESIS-V31-MIRROR-ELEV'],

    risks: []
  }
};

// ============================================================================
// INSERTION ORDER - Respects parent-child hierarchy
// ============================================================================

const INSERTION_ORDER = [
  // Level 0: Parent
  'parent',
  // Level 1: Sprint SDs (children of parent)
  'mason',
  'dreamcatcher',
  'mirror',
  'ritual',
  // Level 2: Phase SDs (children of sprint SDs)
  'masonP1',
  'masonP2',
  'masonP3',
  'dreamP1',
  'dreamP2',
  'dreamP3',
  'mirrorInt',
  'mirrorElev',
  'mirrorTest'
];

// ============================================================================
// MAIN INSERTION FUNCTION
// ============================================================================

async function createGenesisSDs() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║       GENESIS OATH v3.1 - STRATEGIC DIRECTIVE CREATION        ║');
  console.log('╠═══════════════════════════════════════════════════════════════╣');
  console.log('║  Target: February 14, 2026 at 09:00 AM EST                    ║');
  console.log('║  Cosmic Alignment: Saturn enters Aries                        ║');
  console.log('║  Total SDs: 14 (1 parent, 4 sprints, 9 phases)                ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials in .env file');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Track results
  const results = {
    inserted: [],
    updated: [],
    failed: []
  };

  console.log('📋 Inserting SDs in hierarchy order...\n');

  for (const key of INSERTION_ORDER) {
    const sd = GENESIS_SDS[key];

    // Prepare the record for database insertion
    const record = {
      id: sd.id,
      sd_key: sd.sd_key,
      legacy_id: sd.legacy_id,
      title: sd.title,
      description: sd.description,
      scope: sd.scope,
      rationale: sd.rationale,
      category: sd.category,
      priority: sd.priority,
      status: sd.status,
      relationship_type: sd.relationship_type,
      parent_sd_id: sd.parent_sd_id,
      sequence_rank: sd.sequence_rank,
      created_by: sd.created_by,
      version: sd.version,
      strategic_objectives: sd.strategic_objectives,
      success_criteria: sd.success_criteria,
      metadata: sd.metadata,
      dependencies: sd.dependencies,
      risks: sd.risks
    };

    try {
      // Try to insert, on conflict update
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .upsert(record, { onConflict: 'id' })
        .select()
        .single();

      if (error) {
        console.error(`   ❌ ${sd.id}: ${error.message}`);
        results.failed.push({ id: sd.id, error: error.message });
      } else {
        console.log(`   ✅ ${sd.id}`);
        results.inserted.push(sd.id);
      }
    } catch (err) {
      console.error(`   ❌ ${sd.id}: ${err.message}`);
      results.failed.push({ id: sd.id, error: err.message });
    }
  }

  // Summary
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                         SUMMARY                               ║');
  console.log('╠═══════════════════════════════════════════════════════════════╣');
  console.log(`║  ✅ Inserted/Updated: ${results.inserted.length} SDs                                  ║`);
  console.log(`║  ❌ Failed: ${results.failed.length} SDs                                         ║`);
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  if (results.failed.length > 0) {
    console.log('Failed SDs:');
    results.failed.forEach(f => console.log(`  - ${f.id}: ${f.error}`));
    process.exit(1);
  }

  console.log('📝 Next steps:');
  console.log('1. Run validation: node scripts/validate-child-sd-completeness.js SD-GENESIS-V31-PARENT');
  console.log('2. Begin execution with SD-GENESIS-V31-MASON-P1 (Dec 29)');
  console.log('3. Follow LEAD→PLAN→EXEC for each SD');
  console.log('\n🌟 Saturn enters Aries on Feb 13, 2026 at 19:11 EST');
  console.log('   The Genesis Ritual awaits on Feb 14, 2026 at 09:00 AM EST\n');
}

// Run
createGenesisSDs().catch(console.error);
