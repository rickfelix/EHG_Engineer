/**
 * Genesis Oath v3.1 Strategic Directive Definitions
 * Contains all 14 SD data objects for the Simulation Chamber implementation
 */

// LEVEL 0: PARENT SD (Orchestrator)
export const parentSD = {
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
      supporting_specs: ['docs/vision/GENESIS_SPRINT_ROADMAP.md', 'docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md', 'docs/vision/GENESIS_RITUAL_SPECIFICATION.md', 'docs/vision/GENESIS_SD_STRUCTURE.md']
    },
    must_read_before_prd: ['docs/vision/GENESIS_OATH_V3.md', 'docs/vision/GENESIS_SPRINT_ROADMAP.md'],
    must_read_before_exec: ['docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'],
    implementation_guidance: { creation_mode: 'CREATE_FROM_NEW', target_date: '2026-02-14', ritual_time: '09:00 AM EST', cosmic_alignment: 'Saturn enters Aries Feb 13, 2026 at 19:11 EST' },
    capacity: { total_sds: 330, total_hours: 110, children: ['SD-GENESIS-V31-MASON', 'SD-GENESIS-V31-DREAMCATCHER', 'SD-GENESIS-V31-MIRROR', 'SD-GENESIS-V31-RITUAL'] }
  },
  dependencies: [],
  risks: [
    { risk: 'Sprint timeline too aggressive', mitigation: 'Buffer built into Dreamcatcher, fallback to PRD-only Genesis if needed' },
    { risk: 'Hard isolation adds infrastructure complexity', mitigation: 'Separate Supabase projects, Vercel teams, GitHub orgs - no shared credentials' },
    { risk: 'Mercury retrograde shadow starts Feb 12', mitigation: 'No new logic after Feb 10, final days are integration/testing only' }
  ]
};

// LEVEL 1: SPRINT SDs
export const masonSD = {
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
  strategic_objectives: ['Create ehg-simulations GitHub organization with proper isolation', 'Configure *.possible.ehg.dev wildcard DNS for simulation deployments', 'Implement schema_sim_* database namespace convention', 'Build TTL enforcement and garbage collection systems', 'Create simulation deployment pipeline with watermark overlay'],
  success_criteria: ['ehg-simulations GitHub org exists and is accessible', '*.possible.ehg.dev wildcard DNS resolves correctly', 'schema_sim_* tables can be created with proper namespace isolation', 'epistemic_status field present in simulation_artifacts table', 'TTL countdown triggers auto-archive after 90 days', 'Simulation deployment includes SIMULATION watermark banner', 'Stage 3 rejection triggers infrastructure cleanup'],
  metadata: {
    vision_spec_references: { version: 'GENESIS-V3.1', primary_spec: 'docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md', sections: ['The Two Namespaces (Hard Isolation)', 'Database Schema', 'Infrastructure Components', 'Lifecycle Management'] },
    must_read_before_prd: ['docs/vision/GENESIS_OATH_V3.md', 'docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'],
    must_read_before_exec: ['docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'],
    implementation_guidance: { creation_mode: 'CREATE_FROM_NEW', zodiac: 'Capricorn', archetype: 'The Mason', theme: 'Structure' },
    timeline: { start: '2025-12-29', end: '2026-01-19', duration_days: 22 },
    capacity: { sds: 110, hours: 37, children: ['SD-GENESIS-V31-MASON-P1', 'SD-GENESIS-V31-MASON-P2', 'SD-GENESIS-V31-MASON-P3'] }
  },
  dependencies: [],
  risks: [{ risk: 'GitHub org creation requires account verification', mitigation: 'Set up org early, document configuration steps' }, { risk: 'DNS propagation delays', mitigation: 'Configure 24h before needed, use low TTL values' }]
};

export const dreamcatcherSD = {
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
  strategic_objectives: ['Parse raw venture seed text into structured data', 'Generate PRD as official Stage 1-2 artifact (not simulation)', 'Generate schema as simulation artifact with epistemic tagging', 'Generate repo scaffold as simulation artifact', 'Implement /ratify command with Contract of Pain ceremony', 'Create venture at Stage 1 with simulation artifacts linked'],
  success_criteria: ['Text input generates valid, quality-gated PRD', 'PRD scoped to Stage 1-2 validation target (not solution commitment)', 'PRD-to-Schema intelligence extracts data model correctly', 'PRD-to-Repo intelligence generates customized scaffold', 'All simulation artifacts tagged epistemic_status: simulation', '/ratify command displays 25-stage Contract of Pain', 'Post-ratify venture created at Stage 1 with Stage 3 date scheduled', 'Simulation remains as North Star visible at *.possible.ehg.dev'],
  metadata: {
    vision_spec_references: { version: 'GENESIS-V3.1', primary_spec: 'docs/vision/GENESIS_OATH_V3.md', sections: ['PRD Scope Clarification', 'The /ratify Command: Scope Definition', 'Epistemic Tagging (Canon Law)'] },
    must_read_before_prd: ['docs/vision/GENESIS_OATH_V3.md', 'docs/vision/GENESIS_RITUAL_SPECIFICATION.md'],
    must_read_before_exec: ['docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'],
    implementation_guidance: { creation_mode: 'CREATE_FROM_NEW', zodiac: 'Aquarius', archetype: 'The Dreamcatcher', theme: 'Intelligence' },
    timeline: { start: '2026-01-20', end: '2026-02-08', duration_days: 20 },
    capacity: { sds: 140, hours: 47, children: ['SD-GENESIS-V31-DREAM-P1', 'SD-GENESIS-V31-DREAM-P2', 'SD-GENESIS-V31-DREAM-P3'] }
  },
  dependencies: ['SD-GENESIS-V31-MASON'],
  risks: [{ risk: 'LLM hallucination in generated artifacts', mitigation: 'Structured output validation, quality gates on PRD' }, { risk: 'Schema inference accuracy', mitigation: 'Template library of validated patterns, human review option' }]
};

export const mirrorSD = {
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
  strategic_objectives: ['Integrate Dreamcatcher output with Mason infrastructure', 'Implement error recovery and retry logic for resilience', 'Build elevation mechanics for Stages 16, 17, and 22', 'Create elevation audit trail with Chairman signature requirement', 'Complete reflex testing before Mercury shadow'],
  success_criteria: ['End-to-end simulation flow works without manual intervention', 'Error recovery gracefully handles generation failures', 'Retry logic is idempotent (safe to re-run)', 'Stage 16 elevation copies schema from simulation to production', 'Stage 17 elevation forks repo from simulation to production', 'All elevations require Chairman signature in audit log', 'Stage 3 rejection triggers complete simulation cleanup', 'CLI leo status displays simulation state correctly'],
  metadata: {
    vision_spec_references: { version: 'GENESIS-V3.1', primary_spec: 'docs/vision/GENESIS_OATH_V3.md', sections: ['Elevation Mechanics (Simulation -> Reality)', 'TTL Enforcement (Non-Negotiable)'] },
    must_read_before_prd: ['docs/vision/GENESIS_OATH_V3.md', 'docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'],
    must_read_before_exec: ['docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'],
    implementation_guidance: { creation_mode: 'CREATE_FROM_NEW', zodiac: 'Pisces', archetype: 'The Mirror', theme: 'Integration', critical_constraint: 'NO NEW LOGIC AFTER FEB 10 - Mercury shadow starts Feb 12' },
    timeline: { start: '2026-02-09', end: '2026-02-13', duration_days: 5, logic_cutoff: '2026-02-10' },
    capacity: { sds: 80, hours: 27, children: ['SD-GENESIS-V31-MIRROR-INT', 'SD-GENESIS-V31-MIRROR-ELEV', 'SD-GENESIS-V31-MIRROR-TEST'] }
  },
  dependencies: ['SD-GENESIS-V31-MASON', 'SD-GENESIS-V31-DREAMCATCHER'],
  risks: [{ risk: 'Compressed timeline (5 days)', mitigation: 'Prioritize integration over new features, defer nice-to-haves' }, { risk: 'Mercury shadow introduces confusion', mitigation: 'No new logic after Feb 10, testing only' }]
};

export const ritualSD = {
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
  strategic_objectives: ['Complete all pre-ritual verification checklists', 'Prepare Genesis-001 venture seed text', 'Execute ritual at 09:00 AM EST on Feb 14, 2026', 'Validate all artifacts generated correctly', 'Document the first Genesis for posterity'],
  success_criteria: ['All systems verified green on Feb 13 evening', 'Genesis-001 seed text locked and ready', 'Ritual executes without errors at 09:00 AM EST', 'PRD generated as official artifact', 'Schema, Repo, Deployment generated as simulations', 'Simulation visible at genesis-001.possible.ehg.dev', 'Venture created at Stage 1 with Stage 3 date scheduled', 'Post-ritual validation checklist complete', 'Celebration documented'],
  metadata: {
    vision_spec_references: { version: 'GENESIS-V3.1', primary_spec: 'docs/vision/GENESIS_RITUAL_SPECIFICATION.md' },
    must_read_before_prd: ['docs/vision/GENESIS_RITUAL_SPECIFICATION.md'],
    must_read_before_exec: ['docs/vision/GENESIS_RITUAL_SPECIFICATION.md'],
    implementation_guidance: { creation_mode: 'CEREMONY', prep_start: '2026-02-13', ritual_date: '2026-02-14', ritual_time: '09:00 AM EST', cosmic_alignment: { event: 'Saturn enters Aries', timestamp: '2026-02-13T19:11:00-05:00', significance: 'First morning of the new reign' } },
    timeline: { prep_date: '2026-02-13', ritual_date: '2026-02-14', ritual_time: '09:00' },
    capacity: { sds: 0, hours: 2 }
  },
  dependencies: ['SD-GENESIS-V31-MASON', 'SD-GENESIS-V31-DREAMCATCHER', 'SD-GENESIS-V31-MIRROR'],
  risks: [{ risk: 'System failure during ritual', mitigation: 'Fallback to PRD-only mode, retry logic, rollback procedures' }, { risk: 'Seed text incomplete', mitigation: 'Lock seed 24h before, have backup seed ready' }]
};
