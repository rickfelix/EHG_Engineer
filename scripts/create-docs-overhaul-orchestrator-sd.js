#!/usr/bin/env node
/**
 * Create Documentation Overhaul Orchestrator SD with Child SDs
 *
 * Creates the parent orchestrator and child SDs for comprehensive documentation
 * review, restructuring, validation, and organization.
 *
 * Key Features:
 * - Parent orchestrator for coordinated documentation effort
 * - Validation sub-agent integration (don't assume docs are correct)
 * - Observations/findings capture system
 * - Well organized, well structured, thorough documentation
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Parent Orchestrator SD
const parentSD = {
  id: 'SD-DOCS-OVERHAUL-ORCHESTRATOR',
  sd_key: 'SD-DOCS-OVERHAUL-ORCHESTRATOR',
  title: 'Documentation Overhaul Orchestrator',
  category: 'Documentation',
  priority: 'high',
  status: 'draft',
  current_phase: 'LEAD',
  sd_type: 'orchestrator',
  description: 'Parent orchestrator for comprehensive documentation overhaul across EHG and EHG_Engineer repositories. Goal: Create documentation that is well-organized, well-structured, thorough, and validated against actual code.',
  rationale: 'Documentation across both repositories has grown organically without consistent structure. Many docs reference the deprecated 40-stage workflow instead of the current 25-stage workflow. Documentation claims need validation against actual code to ensure accuracy.',
  scope: 'All documentation in EHG/docs, EHG_Engineer/docs, README files, CLAUDE.md files, and inline documentation. Includes restructuring, validation, cleanup, and standardization.',
  strategic_objectives: JSON.stringify([
    'Establish clear documentation information architecture',
    'Validate all documentation claims against actual codebase',
    'Update all 40-stage references to 25-stage workflow',
    'Create consistent templates and formatting standards',
    'Capture and preserve important observations during overhaul',
    'Ensure comprehensive coverage of all systems and features'
  ]),
  success_criteria: JSON.stringify([
    'All documentation follows consistent structure and templates',
    'Zero references to deprecated 40-stage workflow',
    'All technical claims validated against actual code',
    'Documentation hierarchy clear and navigable',
    'Observations/findings captured in dedicated system',
    'Complete coverage of 25-stage venture workflow'
  ]),
  relationship_type: 'parent',
  parent_sd_id: null,
  sequence_rank: 1,
  metadata: JSON.stringify({
    doc_locations: [
      '../ehg/docs/',
      './docs/',
      'README files',
      'CLAUDE.md files'
    ],
    validation_required: true,
    observations_capture: true,
    target_workflow: '25-stage',
    deprecated_workflow: '40-stage'
  }),
  created_by: 'DOCUMENTATION_INITIATIVE',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

// Child SDs
const childSDs = [
  {
    id: 'SD-DOCS-ARCH-001',
    sd_key: 'SD-DOCS-ARCH-001',
    title: 'Documentation Information Architecture',
    category: 'Documentation',
    priority: 'critical',
    status: 'draft',
    current_phase: 'LEAD',
    sd_type: 'infrastructure',
    description: 'Design the documentation structure and hierarchy BEFORE any content work begins. Establish folder structure, naming conventions, and navigation patterns.',
    rationale: 'Information architecture must be designed first to avoid reorganizing content multiple times. A clear structure enables consistent documentation across all areas.',
    scope: 'Design documentation hierarchy for both EHG and EHG_Engineer repos. Define folder structure, file naming conventions, cross-linking patterns, and navigation system.',
    relationship_type: 'child',
    parent_sd_id: 'SD-DOCS-OVERHAUL-ORCHESTRATOR',
    sequence_rank: 1,
    dependency_chain: JSON.stringify({ dependencies: [], execution_order: 1 }),
    metadata: JSON.stringify({
      deliverables: [
        'Documentation hierarchy diagram',
        'Folder structure specification',
        'File naming conventions',
        'Navigation/linking patterns'
      ],
      complexity: 'medium'
    })
  },
  {
    id: 'SD-DOCS-OBSERVE-001',
    sd_key: 'SD-DOCS-OBSERVE-001',
    title: 'Observations & Findings Capture System',
    category: 'Documentation',
    priority: 'critical',
    status: 'draft',
    current_phase: 'LEAD',
    sd_type: 'infrastructure',
    description: 'Create a system to capture important observations, discrepancies, and insights discovered during the documentation overhaul. Ensures valuable findings are not lost.',
    rationale: 'During documentation review, many issues and insights will be discovered that are not directly related to documentation but are important to capture (e.g., code issues, architectural concerns, missing features).',
    scope: 'Design and implement observations capture system. Could be a database table, structured document, or dedicated findings log. Must support categorization and prioritization.',
    relationship_type: 'child',
    parent_sd_id: 'SD-DOCS-OVERHAUL-ORCHESTRATOR',
    sequence_rank: 2,
    dependency_chain: JSON.stringify({ dependencies: [], execution_order: 1 }),
    metadata: JSON.stringify({
      deliverables: [
        'Observations table schema or document structure',
        'Categorization system (docs, code, architecture, etc.)',
        'Priority levels',
        'Process for recording observations'
      ],
      complexity: 'low'
    })
  },
  {
    id: 'SD-DOCS-VALIDATE-001',
    sd_key: 'SD-DOCS-VALIDATE-001',
    title: 'Documentation Validation Framework',
    category: 'Documentation',
    priority: 'critical',
    status: 'draft',
    current_phase: 'LEAD',
    sd_type: 'infrastructure',
    description: 'Establish framework for validating documentation claims against actual code. Integrate validation sub-agent to verify technical accuracy. Never assume documentation is correct.',
    rationale: 'Documentation often contains outdated or incorrect information. A systematic validation approach ensures all claims are verified against the actual codebase before being published.',
    scope: 'Create validation checklist, integrate validation sub-agent, define verification process for different documentation types (API docs, architecture docs, workflow docs, etc.).',
    relationship_type: 'child',
    parent_sd_id: 'SD-DOCS-OVERHAUL-ORCHESTRATOR',
    sequence_rank: 3,
    dependency_chain: JSON.stringify({ dependencies: ['SD-DOCS-ARCH-001'], execution_order: 2 }),
    metadata: JSON.stringify({
      deliverables: [
        'Validation checklist by doc type',
        'Sub-agent integration plan',
        'Verification process documentation',
        'Code-to-doc traceability approach'
      ],
      complexity: 'medium',
      subagent_required: 'validation-agent'
    })
  },
  {
    id: 'SD-DOCS-TEMPLATE-001',
    sd_key: 'SD-DOCS-TEMPLATE-001',
    title: 'Documentation Template Standardization',
    category: 'Documentation',
    priority: 'high',
    status: 'draft',
    current_phase: 'LEAD',
    sd_type: 'infrastructure',
    description: 'Create standardized templates for all documentation types: API docs, component docs, workflow docs, guides, READMEs, etc. Ensures consistency across all documentation.',
    rationale: 'Consistent templates make documentation easier to write, read, and maintain. Templates enforce completeness and provide a familiar structure for readers.',
    scope: 'Design templates for: API reference, component documentation, workflow guides, developer guides, user guides, README files, architecture documents.',
    relationship_type: 'child',
    parent_sd_id: 'SD-DOCS-OVERHAUL-ORCHESTRATOR',
    sequence_rank: 4,
    dependency_chain: JSON.stringify({ dependencies: ['SD-DOCS-ARCH-001'], execution_order: 2 }),
    metadata: JSON.stringify({
      deliverables: [
        'API documentation template',
        'Component documentation template',
        'Workflow guide template',
        'Developer guide template',
        'README template',
        'Architecture document template'
      ],
      complexity: 'medium'
    })
  },
  {
    id: 'SD-DOCS-WORKFLOW-001',
    sd_key: 'SD-DOCS-WORKFLOW-001',
    title: '25-Stage Venture Workflow Documentation',
    category: 'Documentation',
    priority: 'high',
    status: 'draft',
    current_phase: 'LEAD',
    sd_type: 'feature',
    description: 'Create comprehensive, validated documentation for the 25-stage venture workflow. Remove ALL references to deprecated 40-stage workflow. Document each stage, phase, and lifecycle.',
    rationale: 'The venture workflow is the core product. Current documentation still references the old 40-stage workflow. Complete, accurate workflow documentation is essential for users and developers.',
    scope: 'Document all 25 stages, 6 lifecycle phases (THE TRUTH, THE ENGINE, THE IDENTITY, THE BLUEPRINT, THE BUILD LOOP, LAUNCH & LEARN). Include stage components, data flow, decision gates.',
    relationship_type: 'child',
    parent_sd_id: 'SD-DOCS-OVERHAUL-ORCHESTRATOR',
    sequence_rank: 5,
    dependency_chain: JSON.stringify({ dependencies: ['SD-DOCS-VALIDATE-001', 'SD-DOCS-TEMPLATE-001'], execution_order: 3 }),
    metadata: JSON.stringify({
      deliverables: [
        'Stage-by-stage documentation (25 stages)',
        'Phase overview documents (6 phases)',
        'Workflow diagram',
        'Data flow documentation',
        'Decision gate documentation'
      ],
      complexity: 'high',
      validation_required: true
    })
  },
  {
    id: 'SD-DOCS-LEO-001',
    sd_key: 'SD-DOCS-LEO-001',
    title: 'LEO Protocol Documentation',
    category: 'Documentation',
    priority: 'high',
    status: 'draft',
    current_phase: 'LEAD',
    sd_type: 'feature',
    description: 'Ensure LEO Protocol documentation is complete, accurate, and validated. Document LEAD→PLAN→EXEC workflow, sub-agents, handoffs, and all protocol rules.',
    rationale: 'LEO Protocol is the development methodology. Complete documentation is essential for consistent SD execution and onboarding new team members.',
    scope: 'Document LEO Protocol v4.3.3 including: phases, handoffs, sub-agents, validation gates, SD lifecycle, PRD structure, retrospectives.',
    relationship_type: 'child',
    parent_sd_id: 'SD-DOCS-OVERHAUL-ORCHESTRATOR',
    sequence_rank: 6,
    dependency_chain: JSON.stringify({ dependencies: ['SD-DOCS-VALIDATE-001', 'SD-DOCS-TEMPLATE-001'], execution_order: 3 }),
    metadata: JSON.stringify({
      deliverables: [
        'LEO Protocol overview',
        'Phase documentation (LEAD, PLAN, EXEC)',
        'Sub-agent documentation',
        'Handoff documentation',
        'SD lifecycle documentation'
      ],
      complexity: 'medium',
      validation_required: true
    })
  },
  {
    id: 'SD-DOCS-API-001',
    sd_key: 'SD-DOCS-API-001',
    title: 'API Documentation',
    category: 'Documentation',
    priority: 'high',
    status: 'draft',
    current_phase: 'LEAD',
    sd_type: 'feature',
    description: 'Create comprehensive API documentation for all endpoints. Validate each endpoint exists and behaves as documented. Include request/response examples.',
    rationale: 'API documentation is essential for frontend-backend integration and external integrations. Current API docs may be incomplete or outdated.',
    scope: 'Document all API endpoints in EHG application including: ventures API, stages API, chairman API, auth API, etc. Include request/response formats, error codes, examples.',
    relationship_type: 'child',
    parent_sd_id: 'SD-DOCS-OVERHAUL-ORCHESTRATOR',
    sequence_rank: 7,
    dependency_chain: JSON.stringify({ dependencies: ['SD-DOCS-VALIDATE-001', 'SD-DOCS-TEMPLATE-001'], execution_order: 3 }),
    metadata: JSON.stringify({
      deliverables: [
        'API endpoint reference',
        'Request/response examples',
        'Error code documentation',
        'Authentication documentation',
        'Rate limiting documentation'
      ],
      complexity: 'high',
      validation_required: true
    })
  },
  {
    id: 'SD-DOCS-ARCH-002',
    sd_key: 'SD-DOCS-ARCH-002',
    title: 'Architecture Documentation',
    category: 'Documentation',
    priority: 'medium',
    status: 'draft',
    current_phase: 'LEAD',
    sd_type: 'feature',
    description: 'Document system architecture including: component structure, data flow, database schema, service interactions, and deployment architecture.',
    rationale: 'Architecture documentation helps developers understand the system structure and make informed decisions about changes and extensions.',
    scope: 'Document frontend architecture (React components, state management), backend architecture (Supabase, Edge Functions), database schema, and deployment infrastructure.',
    relationship_type: 'child',
    parent_sd_id: 'SD-DOCS-OVERHAUL-ORCHESTRATOR',
    sequence_rank: 8,
    dependency_chain: JSON.stringify({ dependencies: ['SD-DOCS-VALIDATE-001', 'SD-DOCS-TEMPLATE-001'], execution_order: 3 }),
    metadata: JSON.stringify({
      deliverables: [
        'Architecture overview diagram',
        'Component structure documentation',
        'Data flow diagrams',
        'Database schema documentation',
        'Deployment architecture'
      ],
      complexity: 'high',
      validation_required: true
    })
  },
  {
    id: 'SD-DOCS-DEV-001',
    sd_key: 'SD-DOCS-DEV-001',
    title: 'Developer Guides',
    category: 'Documentation',
    priority: 'medium',
    status: 'draft',
    current_phase: 'LEAD',
    sd_type: 'feature',
    description: 'Create comprehensive developer guides including: setup guide, contribution guide, coding standards, testing guide, and debugging guide.',
    rationale: 'Developer guides enable new team members to quickly become productive and ensure consistent development practices across the team.',
    scope: 'Create guides for: local development setup, contribution workflow, coding standards, testing practices, debugging techniques, common issues and solutions.',
    relationship_type: 'child',
    parent_sd_id: 'SD-DOCS-OVERHAUL-ORCHESTRATOR',
    sequence_rank: 9,
    dependency_chain: JSON.stringify({ dependencies: ['SD-DOCS-TEMPLATE-001'], execution_order: 3 }),
    metadata: JSON.stringify({
      deliverables: [
        'Local development setup guide',
        'Contribution guide',
        'Coding standards document',
        'Testing guide',
        'Debugging guide',
        'Troubleshooting FAQ'
      ],
      complexity: 'medium'
    })
  },
  {
    id: 'SD-DOCS-CLEANUP-001',
    sd_key: 'SD-DOCS-CLEANUP-001',
    title: 'Documentation Cleanup & Consolidation',
    category: 'Documentation',
    priority: 'medium',
    status: 'draft',
    current_phase: 'LEAD',
    sd_type: 'infrastructure',
    description: 'Remove outdated documentation, consolidate duplicates, and archive obsolete content. Clean up all 40-stage workflow references.',
    rationale: 'Outdated and duplicate documentation causes confusion. A cleanup pass ensures all remaining documentation is current and accurate.',
    scope: 'Identify and remove outdated docs, merge duplicate content, archive obsolete docs, update all 40-stage references to 25-stage, remove broken links.',
    relationship_type: 'child',
    parent_sd_id: 'SD-DOCS-OVERHAUL-ORCHESTRATOR',
    sequence_rank: 10,
    dependency_chain: JSON.stringify({
      dependencies: [
        'SD-DOCS-WORKFLOW-001',
        'SD-DOCS-LEO-001',
        'SD-DOCS-API-001',
        'SD-DOCS-ARCH-002',
        'SD-DOCS-DEV-001'
      ],
      execution_order: 4
    }),
    metadata: JSON.stringify({
      deliverables: [
        'List of removed/archived docs',
        'List of consolidated docs',
        'Updated 40→25 stage references log',
        'Broken links fixed',
        'Final documentation inventory'
      ],
      complexity: 'medium'
    })
  }
];

async function createSDs() {
  console.log('📚 Creating Documentation Overhaul Orchestrator SD...\n');

  // Create parent SD
  const { data: parentData, error: parentError } = await supabase
    .from('strategic_directives_v2')
    .upsert(parentSD, { onConflict: 'id' })
    .select()
    .single();

  if (parentError) {
    console.error('❌ Failed to create parent SD:', parentError.message);
    process.exit(1);
  }

  console.log('✅ Parent SD created:', parentData.id);
  console.log(`   Title: ${parentData.title}`);
  console.log(`   Status: ${parentData.status}\n`);

  // Create child SDs
  console.log('📝 Creating child SDs...\n');

  for (const childSD of childSDs) {
    const { data: childData, error: childError } = await supabase
      .from('strategic_directives_v2')
      .upsert({
        ...childSD,
        created_by: 'DOCUMENTATION_INITIATIVE',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' })
      .select()
      .single();

    if (childError) {
      console.error(`❌ Failed to create ${childSD.id}:`, childError.message);
    } else {
      console.log(`✅ ${childData.id}: ${childData.title}`);
    }
  }

  console.log('\n📊 Summary:');
  console.log('   Parent SD: SD-DOCS-OVERHAUL-ORCHESTRATOR');
  console.log(`   Child SDs: ${childSDs.length}`);
  console.log('\n🎯 Next Steps:');
  console.log('   1. Run: npm run sd:next to see the new SDs in queue');
  console.log('   2. Start with SD-DOCS-ARCH-001 (Information Architecture)');
  console.log('   3. Follow dependency chain for execution order');
}

createSDs().catch(console.error);
