#!/usr/bin/env node
/**
 * Update Documentation Child SDs with Required Fields
 * Adds success_metrics and key_principles to all child SDs
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
    success_metrics: [
      { metric: 'Documentation structure defined', target: 'Clear folder hierarchy with naming conventions' },
      { metric: 'Cross-reference system', target: 'Linking system between related docs' }
    ],
    key_principles: ['Database-first documentation', 'Single source of truth', 'Validation-backed claims'],
    status: 'active'
  },
  {
    id: 'SD-DOCS-OBSERVE-001',
    success_metrics: [
      { metric: 'Observations table operational', target: 'leo_protocol_observations table with insert capability' },
      { metric: 'Capture process documented', target: 'Clear workflow for capturing insights' }
    ],
    key_principles: ['Capture important insights during work', 'Database storage for observations', 'Categorized severity levels'],
    status: 'active'
  },
  {
    id: 'SD-DOCS-VALIDATE-001',
    success_metrics: [
      { metric: 'Validation framework defined', target: 'Process for code-to-doc verification' },
      { metric: 'Validation checklist created', target: 'Reusable checklist for all doc SDs' }
    ],
    key_principles: ['Documentation must match code', 'No assumptions without verification', 'Systematic validation process'],
    status: 'active'
  },
  {
    id: 'SD-DOCS-TEMPLATE-001',
    success_metrics: [
      { metric: 'Standard templates created', target: 'Templates for API, guide, reference docs' },
      { metric: 'Template usage documented', target: 'Clear instructions for each template' }
    ],
    key_principles: ['Consistency across all documentation', 'Reusable patterns', 'Minimal boilerplate'],
    status: 'active'
  },
  {
    id: 'SD-DOCS-WORKFLOW-001',
    success_metrics: [
      { metric: '25-stage workflow documented', target: 'All 25 stages with descriptions' },
      { metric: 'Stage dependencies mapped', target: 'Clear progression path' }
    ],
    key_principles: ['Accurate stage definitions', 'Validated against VENTURE_STAGES', 'Clear stage transitions'],
    status: 'active'
  },
  {
    id: 'SD-DOCS-LEO-001',
    success_metrics: [
      { metric: 'LEO Protocol fully documented', target: 'LEAD, PLAN, EXEC phases explained' },
      { metric: 'Handoff scripts documented', target: 'All handoff types with examples' }
    ],
    key_principles: ['Protocol accuracy verified against code', 'Practical examples', 'Database-first approach'],
    status: 'active'
  },
  {
    id: 'SD-DOCS-API-001',
    success_metrics: [
      { metric: 'API endpoints documented', target: 'All public endpoints with request/response' },
      { metric: 'Database tables documented', target: 'Schema documentation for key tables' }
    ],
    key_principles: ['OpenAPI format where applicable', 'Request/response examples', 'Error handling documented'],
    status: 'active'
  },
  {
    id: 'SD-DOCS-ARCH-002',
    success_metrics: [
      { metric: 'System architecture documented', target: 'Component diagrams and data flow' },
      { metric: 'Integration points mapped', target: 'EHG, EHG_Engineer, Agent Platform connections' }
    ],
    key_principles: ['High-level overview first', 'Detailed diagrams for complex systems', 'Validated against codebase'],
    status: 'active'
  },
  {
    id: 'SD-DOCS-DEV-001',
    success_metrics: [
      { metric: 'Developer setup guide created', target: 'Getting started in under 30 minutes' },
      { metric: 'Common tasks documented', target: 'How-to guides for frequent operations' }
    ],
    key_principles: ['Beginner-friendly', 'Step-by-step instructions', 'Tested setup process'],
    status: 'active'
  },
  {
    id: 'SD-DOCS-CLEANUP-001',
    success_metrics: [
      { metric: 'Orphaned docs removed', target: 'Zero outdated or unreferenced docs' },
      { metric: 'Cross-references verified', target: 'All links functional' }
    ],
    key_principles: ['Clean up before adding', 'Verify all references', 'Final validation pass'],
    status: 'active'
  }
];

async function updateChildSDs() {
  console.log('Updating documentation child SDs with required fields...\n');

  for (const update of childSDUpdates) {
    const { id, ...fields } = update;

    const { data: _data, error } = await supabase
      .from('strategic_directives_v2')
      .update(fields)
      .eq('id', id)
      .select('id, title, status');

    if (error) {
      console.log(`❌ ${id}: ${error.message}`);
    } else {
      console.log(`✅ ${id}: Updated (status: ${data[0]?.status})`);
    }
  }

  console.log('\n✅ All child SDs updated with success_metrics, key_principles, and active status');
}

updateChildSDs().catch(console.error);
