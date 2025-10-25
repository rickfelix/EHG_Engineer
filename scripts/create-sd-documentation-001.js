#!/usr/bin/env node

/**
 * Create SD-DOCUMENTATION-001: Dynamic Documentation Platform
 * High priority SD to document CrewAI platform and all 3 prior SDs
 * Implementation: 4th (LAST - after other SDs complete)
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g'
);

async function createDocumentationSD() {
  console.log('🔄 Creating SD-DOCUMENTATION-001 (Dynamic Documentation Platform)...');
  console.log('='.repeat(80));

  const sd = {
    id: 'SD-DOCUMENTATION-001',
    sd_key: 'SD-DOCUMENTATION-001',
    title: 'Dynamic Documentation Platform',
    description: 'Comprehensive, dynamic documentation for CrewAI agent management platform and all implemented strategic directives. Documentation auto-discovers actual implementation using DOCMON sub-agent and adapts to what was actually built, not prescriptive requirements. Covers platform overview, API reference, developer guides, user guides, architecture diagrams, and operational procedures.',
    rationale: 'Documentation is critical for developer onboarding, user adoption, and system maintenance. Current lack of comprehensive documentation creates barriers to entry and increases support burden. Dynamic, DOCMON-driven approach ensures documentation stays synchronized with actual implementation, preventing documentation drift. Quality thresholds (80% code sync, 90% link validity, 70% API coverage) ensure trustworthiness. Implementation after other SDs complete ensures documentation reflects as-built system rather than speculative design. Supports organizational scalability by reducing tribal knowledge dependency.',
    scope: 'Dynamic documentation platform leveraging DOCMON (Documentation Sub-Agent V2) for intelligent gap analysis and auto-discovery. Comprehensive documentation covering CrewAI agent management platform organizational hierarchy, 11-department structure, 50+ agent roles, and all workflows. API reference documentation with auto-generated endpoints, authentication patterns, request/response examples, and real code validation (80% code sync threshold). Developer guides for onboarding new developers to CrewAI framework, agent development patterns, and troubleshooting. User guides for AI Agent Management UI workflows (agent list view, detail pages, creation wizard, tools management, real-time dashboards, version control, organization integration). Architecture documentation with living system diagrams, database schema docs, component relationships, and data flow visualizations. Operations documentation for deployment procedures, monitoring dashboards, and maintenance playbooks. Documentation structure: crewai-platform/, api/, guides/, architecture/, operations/. Quality standards: 80% code sync, 90% link validity, 70% API coverage, 30-day freshness threshold. DOCMON-driven continuous validation and automated gap detection. Implementation order: 4th (LAST) - executes after SD-VENTURE-IDEATION-MVP-001, SD-AGENT-PLATFORM-001, and SD-AGENT-ADMIN-001 complete. Documentation reflects as-built implementation, not prescriptive specifications.',
    category: 'infrastructure',
    priority: 'high',
    status: 'draft',
    current_phase: 'LEAD',
    progress: 0,
    metadata: {
      implementation_order: 4,
      depends_on: [
        'SD-VENTURE-IDEATION-MVP-001',
        'SD-AGENT-PLATFORM-001',
        'SD-AGENT-ADMIN-001'
      ],
      docmon_integration: true,
      quality_thresholds: {
        code_sync: 0.8,
        link_validity: 0.9,
        api_coverage: 0.7,
        freshness_days: 30
      },
      documentation_structure: [
        'crewai-platform/',
        'api/',
        'guides/',
        'architecture/',
        'operations/'
      ]
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .insert([sd])
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Successfully created SD-DOCUMENTATION-001!');
    console.log('');
    console.log('📊 SD Details:');
    console.log(`ID: ${data.id}`);
    console.log(`Title: ${data.title}`);
    console.log(`Priority: ${data.priority}`);
    console.log(`Status: ${data.status} (blocked until SDs 1-3 complete)`);
    console.log(`Category: ${data.category}`);
    console.log('Implementation Order: 4th (LAST)');
    console.log('');
    console.log('🔗 Dependencies:');
    console.log('  - SD-VENTURE-IDEATION-MVP-001');
    console.log('  - SD-AGENT-PLATFORM-001');
    console.log('  - SD-AGENT-ADMIN-001');
    console.log('');
    console.log('📏 Quality Thresholds:');
    console.log('  - Code Sync: 80%');
    console.log('  - Link Validity: 90%');
    console.log('  - API Coverage: 70%');
    console.log('  - Freshness: 30 days');
    console.log('');
    console.log('📂 Documentation Structure:');
    console.log('  - crewai-platform/');
    console.log('  - api/');
    console.log('  - guides/');
    console.log('  - architecture/');
    console.log('  - operations/');
    console.log('='.repeat(80));

    return data;
  } catch (error) {
    console.error('❌ Error creating SD:', error.message);
    if (error.details) console.error('Details:', error.details);
    if (error.hint) console.error('Hint:', error.hint);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createDocumentationSD();
}

export { createDocumentationSD };
