#!/usr/bin/env node

/**
 * Create Strategic Directive for Documentation Excellence
 * SD-DOC-EXCELLENCE-001
 *
 * Based on comprehensive audit by 3 DOCMON agents:
 * - Cleanup Agent: Version consistency, database-first compliance
 * - Gap Analysis Agent: Missing documentation identification
 * - Structure Agent: Information architecture improvements
 */

import { createDatabaseClient } from '../lib/supabase-connection.js';

async function createDocumentationSD() {
  console.log('🔍 Creating SD-DOC-EXCELLENCE-001 database record...\n');

  const client = await createDatabaseClient('engineer', { verbose: true });

  try {
    const sdId = 'SD-DOC-EXCELLENCE-001';

    const description = `Comprehensive documentation improvement initiative based on audit by 3 DOCMON sub-agents.

**Current State:**
- Documentation Health Score: 65/100 (regressed from 75 in Oct 2024)
- Structure Score: 7.2/10
- Total Files Audited: 1,778 markdown files
- 57 subdirectories (target: ~15)
- 53 files at root level (target: 8)

**Critical Issues Identified:**
1. VERSION INCONSISTENCY - CLAUDE.md says v4.3.3, but docs reference v4.0, v4.1, v4.2, v3.x
2. DATABASE-FIRST VIOLATIONS - File directories exist for SDs, PRDs, handoffs
3. ROOT-LEVEL CLUTTER - 45 orphaned files need relocation
4. MISSING NAVIGATION - 60+ guides and 70+ references have zero categorization
5. BROKEN CROSS-REFERENCES - ~10% of internal links broken
6. SLOW ONBOARDING - 15-20 min to orient (target: <5 min)

**Gap Analysis (Critical Missing Docs):**
1. Scripts Directory Index (1,432+ scripts with no catalog)
2. Environment Setup Troubleshooting Guide
3. Sub-Agent Catalog (27 agents with unclear triggers)
4. Module-level READMEs (20+ modules undocumented)`;

    const rationale = `Three DOCMON sub-agents conducted parallel audits and identified:
- 10+ critical/high priority issues blocking developer efficiency
- 15+ documentation gaps affecting onboarding
- ~20 hours of work for 3x improvement in navigation time

**Business Impact:**
- New developer onboarding: 15-20 min → <5 min (3x faster)
- Documentation health: 65/100 → 85/100 (+31% improvement)
- Zero confusion about protocol versions
- 100% database-first compliance

**Source Documents:**
- docs/DOCUMENTATION_CLEANUP_AUDIT_2025-12-29.md
- docs/analysis/DOCUMENTATION_STRUCTURE_ASSESSMENT.md
- docs/DOCUMENTATION_IMPROVEMENT_SUMMARY.md
- docs/DOCUMENTATION_MAP.md (created)`;

    const scope = `**IN SCOPE:**

Phase 1 - Critical Fixes (4-6 hours):
- Fix version inconsistency (update all to v4.3.3)
- Database-first compliance (verify/archive file-based SDs/PRDs)
- Update core documentation dates
- Create guide and reference indexes

Phase 2 - Organization (6-8 hours):
- Move 45 orphaned root files to proper directories
- Consolidate duplicate directories (architecture/, testing/, etc.)
- Add READMEs to 11+ directories without them
- Fix broken cross-references (~10%)

Phase 3 - Gap Resolution (6-8 hours):
- Create Scripts Directory Index
- Create Environment Setup Troubleshooting Guide
- Create Sub-Agent Catalog with trigger conditions
- Add Module-level READMEs (20+ modules)

**OUT OF SCOPE:**
- Code changes (documentation only)
- API documentation (OpenAPI spec - separate SD)
- Performance optimization guides (separate SD)
- ADR creation (architecture decisions - separate SD)

**Deliverables:**
1. All docs reference v4.3.3 consistently
2. Zero file-based SDs/PRDs/handoffs directories
3. ≤10 root-level markdown files
4. ≤20 subdirectories in docs/
5. Guide index (docs/guides/README.md)
6. Reference index (docs/reference/README.md)
7. Scripts Directory Index
8. Environment Troubleshooting Guide
9. Sub-Agent Catalog
10. Documentation health score: 85+/100`;

    const strategicObjectives = JSON.stringify([
      {
        objective: 'Reduce new developer onboarding time',
        metrics: ['Navigation time < 5 minutes', 'Clear entry points documented'],
        timeline: 'Phase 1'
      },
      {
        objective: 'Achieve 100% version consistency',
        metrics: ['All docs reference v4.3.3', 'Zero v3.x/v4.0-4.2 in active docs'],
        timeline: 'Phase 1'
      },
      {
        objective: 'Enforce database-first compliance',
        metrics: ['Zero file-based SDs/PRDs', 'All strategic data in database'],
        timeline: 'Phase 1'
      },
      {
        objective: 'Improve documentation discoverability',
        metrics: ['Guide index created', 'Reference index created', 'Scripts catalog'],
        timeline: 'Phase 2-3'
      }
    ]);

    const successCriteria = JSON.stringify([
      'Documentation health score ≥85/100',
      'New developer navigation time <5 minutes',
      '100% version consistency (all docs reference v4.3.3)',
      '100% database-first compliance',
      'Root-level files ≤10',
      'Subdirectories ≤20',
      'All directories have README.md',
      'Zero broken cross-references',
      'Scripts Directory Index exists and is complete',
      'Environment Troubleshooting Guide exists',
      'Sub-Agent Catalog exists with trigger conditions'
    ]);

    const metadata = JSON.stringify({
      audit_date: '2025-12-29',
      audited_by: ['DOCMON-Cleanup', 'DOCMON-Gap', 'DOCMON-Structure'],
      total_files_audited: 1778,
      current_health_score: 65,
      target_health_score: 85,
      estimated_effort_hours: 20,
      phase_1_hours: 6,
      phase_2_hours: 8,
      phase_3_hours: 6,
      sd_type: 'documentation',  // Store in metadata for reference
      source_documents: [
        'docs/DOCUMENTATION_CLEANUP_AUDIT_2025-12-29.md',
        'docs/analysis/DOCUMENTATION_STRUCTURE_ASSESSMENT.md',
        'docs/DOCUMENTATION_IMPROVEMENT_SUMMARY.md',
        'docs/DOCUMENTATION_MAP.md'
      ]
    });

    console.log('\nStep 1: Inserting Strategic Directive...');
    const sdResult = await client.query(`
      INSERT INTO strategic_directives_v2 (
        id,
        sd_key,
        title,
        description,
        category,
        priority,
        rationale,
        scope,
        strategic_objectives,
        success_criteria,
        metadata,
        sequence_rank,
        status,
        current_phase,
        created_by,
        created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        scope = EXCLUDED.scope,
        metadata = EXCLUDED.metadata
      RETURNING *;
    `, [
      sdId,
      sdId,
      'Documentation Excellence Initiative - Comprehensive Cleanup & Gap Resolution',
      description,
      'documentation',
      'high',
      rationale,
      scope,
      strategicObjectives,
      successCriteria,
      metadata,
      100,  // High priority sequence rank for Track C (Quality)
      'draft',  // Start in draft, LEAD will approve
      'LEAD',
      'DOCMON-SUB-AGENT'
    ]);

    const sd = sdResult.rows[0];
    console.log('✅ Strategic Directive created:', sd.id);
    console.log(`   Title: ${sd.title}`);
    console.log(`   Category: ${sd.category}`);
    console.log(`   Priority: ${sd.priority}`);
    console.log(`   Status: ${sd.status}`);
    console.log(`   Phase: ${sd.current_phase}\n`);

    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ SD-DOC-EXCELLENCE-001 Created Successfully!');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log('📊 Metrics:');
    console.log('   - Current Health Score: 65/100');
    console.log('   - Target Health Score: 85/100');
    console.log('   - Estimated Effort: 20 hours');
    console.log('');
    console.log('📁 Source Documents:');
    console.log('   - docs/DOCUMENTATION_CLEANUP_AUDIT_2025-12-29.md');
    console.log('   - docs/analysis/DOCUMENTATION_STRUCTURE_ASSESSMENT.md');
    console.log('   - docs/DOCUMENTATION_MAP.md');
    console.log('');
    console.log('🚀 Next Steps:');
    console.log('   1. Run: npm run sd:next (to see in queue)');
    console.log('   2. LEAD approval of SD');
    console.log('   3. Create PRD with detailed tasks');
    console.log('   4. Execute documentation improvements');
    console.log('');
    console.log('💡 Note: This is a documentation-only SD (sd_type in metadata).');
    console.log('   TESTING/GITHUB sub-agents will be skipped per LEO v4.3.3.');

  } finally {
    await client.end();
  }
}

createDocumentationSD().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
