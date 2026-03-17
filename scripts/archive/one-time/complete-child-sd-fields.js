#!/usr/bin/env node
/**
 * Complete Child SD Fields for LEAD-TO-PLAN Handoff
 * Adds strategic_objectives, additional success_metrics to meet 90% completeness
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

const childSDUpdates = [
  {
    id: 'SD-DOCS-ARCH-001',
    strategic_objectives: [
      'Define clear documentation folder structure that scales with project growth',
      'Establish naming conventions for consistent file organization',
      'Create cross-reference system to link related documentation'
    ],
    success_metrics: [
      { metric: 'Documentation structure defined', target: 'Clear folder hierarchy with naming conventions' },
      { metric: 'Cross-reference system', target: 'Linking system between related docs' },
      { metric: 'Migration guide', target: 'Document existing docs to new structure' }
    ]
  },
  {
    id: 'SD-DOCS-OBSERVE-001',
    strategic_objectives: [
      'Implement observations capture system in database',
      'Define observation categories and severity levels',
      'Create workflow for capturing insights during documentation work'
    ],
    success_metrics: [
      { metric: 'Observations table operational', target: 'leo_protocol_observations table with insert capability' },
      { metric: 'Capture process documented', target: 'Clear workflow for capturing insights' },
      { metric: 'Query patterns established', target: 'Standard queries for observation retrieval' }
    ]
  },
  {
    id: 'SD-DOCS-VALIDATE-001',
    strategic_objectives: [
      'Define validation framework for code-to-documentation verification',
      'Create reusable validation checklist for all documentation',
      'Establish process for flagging and fixing invalid claims'
    ],
    success_metrics: [
      { metric: 'Validation framework defined', target: 'Process for code-to-doc verification' },
      { metric: 'Validation checklist created', target: 'Reusable checklist for all doc SDs' },
      { metric: 'Invalid claims process', target: 'Workflow for flagging and fixing issues' }
    ]
  },
  {
    id: 'SD-DOCS-TEMPLATE-001',
    strategic_objectives: [
      'Create standardized documentation templates for consistency',
      'Define template types for API, guide, and reference docs',
      'Document template usage instructions'
    ],
    success_metrics: [
      { metric: 'Standard templates created', target: 'Templates for API, guide, reference docs' },
      { metric: 'Template usage documented', target: 'Clear instructions for each template' },
      { metric: 'Template adoption', target: 'All new docs use appropriate template' }
    ]
  },
  {
    id: 'SD-DOCS-WORKFLOW-001',
    strategic_objectives: [
      'Document all 25 stages of the venture workflow accurately',
      'Map stage dependencies and progression paths',
      'Validate documentation against VENTURE_STAGES constant'
    ],
    success_metrics: [
      { metric: '25-stage workflow documented', target: 'All 25 stages with descriptions' },
      { metric: 'Stage dependencies mapped', target: 'Clear progression path' },
      { metric: 'Code validation', target: 'Verified against VENTURE_STAGES' }
    ]
  },
  {
    id: 'SD-DOCS-LEO-001',
    strategic_objectives: [
      'Document LEO Protocol phases (LEAD, PLAN, EXEC) comprehensively',
      'Document all handoff scripts with usage examples',
      'Validate against actual handoff.js implementation'
    ],
    success_metrics: [
      { metric: 'LEO Protocol fully documented', target: 'LEAD, PLAN, EXEC phases explained' },
      { metric: 'Handoff scripts documented', target: 'All handoff types with examples' },
      { metric: 'Code validation', target: 'Verified against handoff.js' }
    ]
  },
  {
    id: 'SD-DOCS-API-001',
    strategic_objectives: [
      'Document all public API endpoints with request/response examples',
      'Create database schema documentation for key tables',
      'Document error codes and handling patterns'
    ],
    success_metrics: [
      { metric: 'API endpoints documented', target: 'All public endpoints with request/response' },
      { metric: 'Database tables documented', target: 'Schema documentation for key tables' },
      { metric: 'Error handling documented', target: 'Error codes and handling patterns' }
    ]
  },
  {
    id: 'SD-DOCS-ARCH-002',
    strategic_objectives: [
      'Document system architecture with component diagrams',
      'Map integration points between EHG, EHG_Engineer, and Agent Platform',
      'Create data flow documentation for key processes'
    ],
    success_metrics: [
      { metric: 'System architecture documented', target: 'Component diagrams and data flow' },
      { metric: 'Integration points mapped', target: 'EHG, EHG_Engineer, Agent Platform connections' },
      { metric: 'Data flow documented', target: 'Key process flows visualized' }
    ]
  },
  {
    id: 'SD-DOCS-DEV-001',
    strategic_objectives: [
      'Create developer setup guide for new team members',
      'Document common development tasks and workflows',
      'Test and validate setup instructions work end-to-end'
    ],
    success_metrics: [
      { metric: 'Developer setup guide created', target: 'Getting started in under 30 minutes' },
      { metric: 'Common tasks documented', target: 'How-to guides for frequent operations' },
      { metric: 'Setup verified', target: 'Tested setup process end-to-end' }
    ]
  },
  {
    id: 'SD-DOCS-CLEANUP-001',
    strategic_objectives: [
      'Remove orphaned and outdated documentation',
      'Verify all cross-references and links are functional',
      'Regenerate CLAUDE.md from database'
    ],
    success_metrics: [
      { metric: 'Orphaned docs removed', target: 'Zero outdated or unreferenced docs' },
      { metric: 'Cross-references verified', target: 'All links functional' },
      { metric: 'CLAUDE.md regenerated', target: 'Final generation from database' }
    ]
  }
];

async function completeChildSDFields() {
  console.log('Completing child SD fields for LEAD-TO-PLAN handoff...\n');

  for (const update of childSDUpdates) {
    const { id, ...fields } = update;

    const { data: _data, error } = await supabase
      .from('strategic_directives_v2')
      .update(fields)
      .eq('id', id)
      .select('id, title');

    if (error) {
      console.log(`❌ ${id}: ${error.message}`);
    } else {
      console.log(`✅ ${id}: Added strategic_objectives (${fields.strategic_objectives.length}), success_metrics (${fields.success_metrics.length})`);
    }
  }

  console.log('\n✅ All child SDs updated with strategic_objectives and enhanced success_metrics');
}

completeChildSDFields().catch(console.error);
