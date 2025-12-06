#!/usr/bin/env node

/**
 * Insert SD-STAGE-12-001 retrospective into database
 * User requested migration of existing retrospective file to database
 */

import { createSupabaseServiceClient } from './lib/supabase-connection.js';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function insertRetrospective() {
  const supabase = await createSupabaseServiceClient('engineer', { verbose: true });

  try {
    // Read the retrospective file
    const retroPath = join(__dirname, '../docs/retrospectives/SD-STAGE-12-001-RETROSPECTIVE.md');
    const content = await readFile(retroPath, 'utf8');

    // Extract lessons learned from the content
    const lessonsLearned = [
      {
        category: 'technical',
        lesson: 'Manual Migration is the Established Pattern',
        details: 'Port 5432 is blocked in this environment. All psql/CLI commands will timeout. Supabase Dashboard SQL Editor is the solution. Skip automation attempts, go directly to manual.',
        time_savings: '30 minutes per migration'
      },
      {
        category: 'technical',
        lesson: 'JSONB Column Design Works Well',
        details: 'brand_variants JSONB DEFAULT \'[]\'::jsonb is clean. GIN indexes enable efficient querying. No separate junction table needed for variant data.'
      },
      {
        category: 'technical',
        lesson: 'Layer Separation Enables Testing',
        details: 'Validation layer: Pure functions, easy unit tests. Service layer: Business logic, mockable dependencies. UI layer: Component tests with test IDs. Pattern: validation -> service -> UI'
      },
      {
        category: 'process',
        lesson: 'DONE Phase Must Be Blocking',
        details: 'Retrospective is organizational memory. Skipping retrospective loses institutional knowledge. Merge should require DONE phase verification.',
        action: 'Create pre-merge check'
      },
      {
        category: 'process',
        lesson: 'Sub-Agent Invocation Must Be Proactive',
        details: 'Database tasks should IMMEDIATELY trigger database-agent. Don\'t attempt migrations without sub-agent. Pattern: Error -> STOP -> Invoke sub-agent',
        reference: 'database-agent.md "FIRST RESPONDER, NOT LAST RESORT"'
      },
      {
        category: 'process',
        lesson: 'Lessons Learned Query Should Be Mandatory',
        details: 'SD-GTM-INTEL-DISCOVERY-001 solved this exact problem. Consulting issue_patterns table prevents rework. Script exists: node scripts/search-prior-issues.js',
        action: 'Add to phase preflight'
      },
      {
        category: 'architecture',
        lesson: 'Component Sizing Matters',
        details: '300-600 LOC optimal range confirmed. Smaller components are testable and maintainable. Chairman approval deserves dedicated component.'
      },
      {
        category: 'architecture',
        lesson: 'Domain Validation Abstraction Works',
        details: 'MockDomainProvider enables testing. Future: Plug in GoDaddy/Namecheap APIs. Clean interface: checkDomainAvailability(domain, tlds[])'
      }
    ];

    // Extract what went well
    const whatWentWell = [
      {
        title: 'Component Architecture Excellence',
        score: 10,
        details: 'All components within 300-600 LOC optimal range. Clear separation of concerns (form, approval, table). Each component single-responsibility.',
        evidence: ['BrandVariantForm.tsx: 276 LOC', 'ChairmanApprovalCard.tsx: 318 LOC', 'VariantsTable.tsx: 473 LOC']
      },
      {
        title: 'Comprehensive Test Coverage',
        score: 9,
        details: '76+ tests total. Unit tests: 50+ (validation + service layers). E2E tests: 26 tests across 5 spec files. 48 data-testid attributes for resilient selectors.',
        evidence: ['Dual test requirement satisfied', '100% coverage for validation and service layers', 'All 12 PRD scenarios covered']
      },
      {
        title: 'Database-Agent Comprehensive Documentation',
        score: 9,
        details: 'When explicitly invoked, database-agent created detailed guides, status tracking, verification scripts, and established pattern discovery.',
        evidence: ['MIGRATION_MANUAL_STEPS_STAGE12.md', 'MIGRATION_APPLICATION_STATUS.md', 'verify-stage12-migration.js']
      },
      {
        title: 'Clean Layer Separation',
        score: 9,
        details: 'Validation Layer: Complete Zod schemas, type-safe validation. Service Layer: Business logic isolated. UI Layer: 3 components (1,000 LOC total).',
        impact: 'Testing each layer independently. Business logic isolated from UI.'
      },
      {
        title: 'Pre-commit Hooks Passed',
        score: 8,
        details: 'TypeScript compilation: PASSED. Build verification: PASSED. All commits merged without hook failures.',
        impact: 'Code quality maintained throughout. No bypass of quality gates during implementation.'
      }
    ];

    // Extract what needs improvement
    const whatNeedsImprovement = [
      {
        title: 'DONE Phase Bypassed - CRITICAL',
        score: 2,
        details: 'PR merged to main without running handoff script. No retrospective generated before merge. DONE phase checklist not executed.',
        root_cause: 'Eager merge after PR approval. No automated enforcement of DONE phase. Manual handoff process easy to skip.',
        time_lost: 'N/A (issue discovered post-merge)',
        impact: 'LEO Protocol violation. Institutional learning delayed. Pattern not captured in database.'
      },
      {
        title: 'Database Migration Blocker',
        score: 5,
        details: 'Port 5432 blocked by network/firewall. Direct psql connection timed out. Supabase CLI (db push) timed out. Multiple REST API approaches failed.',
        root_cause: 'Network environment blocks port 5432. This is an ESTABLISHED PATTERN (SD-GTM-INTEL-DISCOVERY-001).',
        time_lost: '~30 minutes troubleshooting before accepting manual workaround',
        resolution: 'Manual application via Supabase Dashboard SQL Editor'
      },
      {
        title: 'Sub-Agent Not Proactively Invoked',
        score: 4,
        details: 'User explicitly said "use the database sub-agent". Database-agent trigger keywords exist but weren\'t activated. Schema design and migration creation done without sub-agent.',
        root_cause: 'Trigger keywords not detected or ignored. No enforcement mechanism for sub-agent invocation.',
        impact: 'Delayed discovery of established migration pattern. Extra troubleshooting before finding solution.'
      },
      {
        title: 'Lessons Learned Not Consulted',
        score: 3,
        details: 'Database-agent needed explicit prompt to check repository lessons. Pattern existed in SD-GTM-INTEL-DISCOVERY-001 but wasn\'t found initially.',
        root_cause: 'No mandatory lessons-learned query before migration attempts. Proactive learning integration not enforced.',
        impact: '30 minutes of troubleshooting could have been avoided. Pattern discovery should happen BEFORE attempting automation.'
      }
    ];

    // Action items
    const actionItems = [
      {
        category: 'immediate',
        title: 'Update database-agent.md with environment pattern',
        priority: 'MEDIUM',
        effort: '1 hour',
        impact: 'Prevents repeated troubleshooting',
        status: 'PENDING'
      },
      {
        category: 'short_term',
        title: 'Create GitHub Action for DONE phase verification',
        priority: 'HIGH',
        effort: '2-4 hours',
        impact: 'Prevents retrospective skipping',
        status: 'PENDING'
      },
      {
        category: 'short_term',
        title: 'Add lessons query to phase-preflight.js',
        priority: 'MEDIUM',
        effort: '2 hours',
        impact: 'Prevents 2-4 hours rework per known pattern',
        status: 'PENDING'
      },
      {
        category: 'short_term',
        title: 'Update CLAUDE_EXEC.md with database task detection',
        priority: 'HIGH',
        effort: '1 hour',
        impact: 'Eliminates user reminders for sub-agent usage',
        status: 'PENDING'
      },
      {
        category: 'long_term',
        title: 'Automated sub-agent invocation based on task analysis',
        priority: 'MEDIUM',
        effort: 'TBD',
        status: 'PLANNED'
      },
      {
        category: 'long_term',
        title: 'Pre-merge hooks for LEO Protocol compliance',
        priority: 'HIGH',
        effort: 'TBD',
        status: 'PLANNED'
      }
    ];

    // Key learnings formatted
    const keyLearnings = [
      {
        id: 1,
        learning: 'Manual Migration is the Established Pattern',
        category: 'technical',
        impact: 'high',
        time_savings: '30 minutes per migration'
      },
      {
        id: 2,
        learning: 'DONE Phase Must Be Blocking',
        category: 'process',
        impact: 'critical',
        action_required: 'Create pre-merge check'
      },
      {
        id: 3,
        learning: 'Sub-Agent Invocation Must Be Proactive',
        category: 'process',
        impact: 'high',
        reference: 'database-agent.md "FIRST RESPONDER, NOT LAST RESORT"'
      },
      {
        id: 4,
        learning: 'Component Sizing: 300-600 LOC optimal range confirmed',
        category: 'architecture',
        impact: 'medium'
      },
      {
        id: 5,
        learning: 'Layer Separation Enables Testing (validation -> service -> UI)',
        category: 'architecture',
        impact: 'high'
      },
      {
        id: 6,
        learning: 'Lessons Learned Query Should Be Mandatory',
        category: 'process',
        impact: 'high',
        time_savings: '2-4 hours per known pattern'
      },
      {
        id: 7,
        learning: 'JSONB Column Design Works Well for array-based variant storage',
        category: 'technical',
        impact: 'medium'
      },
      {
        id: 8,
        learning: 'Domain Validation Abstraction enables future API integration',
        category: 'architecture',
        impact: 'medium'
      }
    ];

    console.log('\n📝 Inserting retrospective into database...\n');

    // Insert the retrospective
    const { data, error } = await supabase
      .from('retrospectives')
      .insert({
        sd_id: 'SD-STAGE-12-001',
        retro_type: 'SD_COMPLETION',
        title: 'SD-STAGE-12-001 - Stage 12: Adaptive Naming (Brand Variants System)',
        description: 'Completed Brand Variants management system for multi-market localization. Code-complete, well-tested, properly architected. However, completion process violated LEO Protocol DONE phase requirements by merging without retrospective generation.',
        conducted_date: '2025-12-05T00:00:00Z',
        agents_involved: ['EXEC', 'database-agent', 'retro-agent'],
        sub_agents_involved: ['database-agent'],
        human_participants: ['User'],
        what_went_well: whatWentWell,
        what_needs_improvement: whatNeedsImprovement,
        action_items: actionItems,
        key_learnings: keyLearnings,
        quality_score: 72,
        tests_added: 76,
        objectives_met: true,
        on_schedule: true,
        within_scope: true,
        success_patterns: [
          'Component Architecture Excellence (300-600 LOC)',
          'Comprehensive Test Coverage (76+ tests)',
          'Clean Layer Separation (validation -> service -> UI)',
          'Pre-commit Hooks Integration'
        ],
        failure_patterns: [
          'DONE Phase Bypassed',
          'Sub-Agent Not Proactively Invoked',
          'Lessons Learned Not Consulted',
          'Database Migration Required Manual Execution'
        ],
        improvement_areas: [
          'Enforce DONE phase before merge',
          'Proactive sub-agent invocation',
          'Mandatory lessons-learned query',
          'Encode manual migration pattern in agent knowledge'
        ],
        generated_by: 'SUB_AGENT',
        status: 'PUBLISHED',
        auto_generated: false,
        target_application: 'EHG',
        learning_category: 'PROCESS_IMPROVEMENT',
        applies_to_all_apps: true,
        related_files: [
          'src/components/brand-variants/BrandVariantForm.tsx',
          'src/components/brand-variants/ChairmanApprovalCard.tsx',
          'src/components/brand-variants/VariantsTable.tsx',
          'src/lib/validations/brand-variants.ts',
          'src/lib/services/brandVariantsService.ts',
          'src/lib/services/domainValidationService.ts'
        ],
        related_commits: [
          '262a1745',
          'f8b9f893',
          '08dbc7ed',
          '8dccbaed',
          '5cfd619b',
          '8d5ec18e',
          'e24005a5',
          'ddb5c90c'
        ],
        related_prs: ['#44'],
        affected_components: [
          'Brand Variants Management',
          'Chairman Approval Workflow',
          'Domain Validation Service',
          'Database Schema'
        ],
        tags: [
          'brand-variants',
          'multi-market-localization',
          'chairman-approval',
          'domain-validation',
          'database-migration',
          'done-phase-violation',
          'process-improvement',
          'testing-strategy'
        ]
      })
      .select();

    if (error) {
      console.error('❌ Error inserting retrospective:', error);
      throw error;
    }

    console.log('✅ Retrospective inserted successfully!');
    console.log('\n📊 Record Details:');
    console.log(`   ID: ${data[0].id}`);
    console.log(`   SD ID: ${data[0].sd_id}`);
    console.log(`   Quality Score: ${data[0].quality_score}`);
    console.log(`   Status: ${data[0].status}`);
    console.log(`   Target Application: ${data[0].target_application}`);
    console.log(`   Learning Category: ${data[0].learning_category}`);
    console.log(`   Applies to All Apps: ${data[0].applies_to_all_apps}`);
    console.log(`   Created At: ${data[0].created_at}`);
    console.log(`\n   What Went Well: ${data[0].what_went_well.length} items`);
    console.log(`   What Needs Improvement: ${data[0].what_needs_improvement.length} items`);
    console.log(`   Action Items: ${data[0].action_items.length} items`);
    console.log(`   Key Learnings: ${data[0].key_learnings.length} items`);

    // Verify the record exists
    const { data: verify, error: verifyError } = await supabase
      .from('retrospectives')
      .select('id, sd_id, quality_score, status')
      .eq('sd_id', 'SD-STAGE-12-001')
      .single();

    if (verifyError) {
      console.error('\n❌ Verification failed:', verifyError);
    } else {
      console.log('\n✅ Verification successful:');
      console.log(`   Record found with ID: ${verify.id}`);
      console.log(`   Quality Score: ${verify.quality_score}`);
      console.log(`   Status: ${verify.status}`);
    }

    return data[0];

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

// Execute
insertRetrospective()
  .then(() => {
    console.log('\n✅ Retrospective migration complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
