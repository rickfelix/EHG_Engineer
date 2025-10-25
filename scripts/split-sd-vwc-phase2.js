#!/usr/bin/env node
/**
 * Split SD-VWC-PHASE2-001 into 3 Independent Strategic Directives
 *
 * LEAD Decision: SD-VWC-PHASE2-001 bundled 3 unrelated features under misleading "Quick Wins" label.
 * Creating 3 separate SDs for better risk isolation and true incremental delivery.
 *
 * Operations:
 * 1. Create SD-VWC-PRESETS-001 (Preset Selector Component)
 * 2. Create SD-VWC-ERRORS-001 (Error Message Enhancement)
 * 3. Create SD-VWC-A11Y-001 (Accessibility Compliance)
 * 4. Update SD-VWC-PHASE2-001 to status='cancelled'
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

const NEW_SDS = [
  {
    id: 'SD-VWC-PRESETS-001',
    title: 'Venture Creation: Preset Selector Component',
    category: 'UI/UX',
    priority: 'medium',
    status: 'draft',
    target_application: 'EHG',
    description: 'Implement PresetSelector component to save and reuse venture configuration templates. Power users can create presets for frequently-used tier/ideation combinations, reducing venture creation time from 2-3 minutes to <30 seconds.',
    rationale: 'Reduces venture creation friction for power users. Estimated 40% time savings on repeat venture creation workflows.',
    scope: 'PresetSelector component with save/load/manage functionality. Database table for storing user presets. Integration with VentureCreationPage.',
    success_criteria: [
      'PresetSelector dropdown appears in VentureCreationPage',
      'Users can save current venture configuration as named preset',
      'Users can load saved presets to auto-populate tier/ideation selections',
      'Presets stored per user in venture_presets table',
      'Preset management UI (create, delete, rename)',
      'Unit tests for preset CRUD operations',
      'E2E test covering save/load preset workflow'
    ],
    implementation_guidelines: [
      'Requires database migration for venture_presets table (columns: id, user_id, name, config_json, created_at)',
      'Use existing shadcn/ui Select component',
      'Store presets as JSONB for flexibility',
      'Estimated 4 hours implementation time',
      'Estimated 220 lines of code'
    ],
    dependencies: ['SD-VWC-PHASE1-001'],
    metadata: {
      estimated_hours: 4,
      estimated_loc: 220,
      business_value: 'Reduces venture creation friction for power users. Estimated 40% time savings on repeat venture creation workflows.'
    }
  },
  {
    id: 'SD-VWC-ERRORS-001',
    title: 'Error Message Enhancement: User-Friendly Error Handling',
    category: 'Developer Experience',
    priority: 'low',
    status: 'draft',
    target_application: 'EHG',
    description: 'Replace cryptic error messages with user-friendly, actionable error text. Centralize error handling to provide consistent error experience across the application.',
    rationale: 'Reduces user confusion and support burden. Better error messages = less time debugging user issues.',
    scope: 'Centralized ErrorMessageMap, integration with toast system, user-friendly error translations for common error types.',
    success_criteria: [
      'Centralized ErrorMessageMap with user-friendly translations',
      'Common errors (network, auth, validation) have clear messages',
      'Error messages include actionable next steps (e.g., "Try again" vs "Contact support")',
      'Integration with existing toast notification system',
      'Unit tests for error message mapping',
      'E2E test verifying error display in UI'
    ],
    implementation_guidelines: [
      'Extend existing toast system (src/components/ui/toast.tsx)',
      'Create ErrorMessageService with fallback to raw error if no mapping exists',
      'Follow existing executeWithRetry pattern for network errors',
      'Estimated 3 hours implementation time',
      'Estimated 180 lines of code'
    ],
    dependencies: [],
    metadata: {
      estimated_hours: 3,
      estimated_loc: 180,
      business_value: 'Reduces user confusion and support burden. Better error messages = less time debugging user issues.'
    }
  },
  {
    id: 'SD-VWC-A11Y-001',
    title: 'Accessibility Compliance: WCAG 2.1 AA Audit & Remediation',
    category: 'Accessibility',
    priority: 'high',
    status: 'draft',
    target_application: 'EHG',
    description: 'Run comprehensive WCAG 2.1 AA accessibility audit on VentureCreationPage and fix all violations. Ensure keyboard navigation, screen reader support, color contrast, and focus management meet compliance standards.',
    rationale: 'Legal compliance (ADA/Section 508) + expanded user base to include users with disabilities. Risk mitigation for accessibility lawsuits.',
    scope: 'WCAG 2.1 AA audit using axe DevTools, remediation of all violations, automated a11y testing integration.',
    success_criteria: [
      'axe DevTools scan shows 0 WCAG 2.1 AA violations on VentureCreationPage',
      'All interactive elements have proper ARIA labels',
      'Color contrast ratios meet 4.5:1 minimum (text) and 3:1 (UI components)',
      'Full keyboard navigation support (Tab, Enter, Escape, Arrow keys)',
      'Screen reader testing confirms logical reading order',
      'Focus indicators visible on all interactive elements',
      'E2E tests using @axe-core/playwright for automated a11y checks'
    ],
    implementation_guidelines: [
      'Use axe DevTools for audit',
      'Leverage existing useKeyboardNav hook (from SD-VWC-PHASE1-001)',
      'Add eslint-plugin-jsx-a11y rules to CI/CD',
      'May require WCAG expertise or external audit consultation',
      'Estimated 5 hours implementation time',
      'Estimated 250 lines of code'
    ],
    dependencies: [],
    metadata: {
      estimated_hours: 5,
      estimated_loc: 250,
      business_value: 'Legal compliance (ADA/Section 508) + expanded user base to include users with disabilities. Risk mitigation for accessibility lawsuits.'
    }
  }
];

async function main() {
  let client;

  try {
    console.log('\n🚀 Starting SD Split Operation\n');
    console.log('LEAD Decision: Split SD-VWC-PHASE2-001 into 3 independent SDs');
    console.log('Reason: Bundled unrelated features, misleading "Quick Wins" label\n');

    // Connect to EHG_Engineer database
    client = await createDatabaseClient('engineer', { verbose: true });

    // Step 1: Get next sequence_rank
    console.log('\n📋 Step 1: Getting next sequence rank...');
    const seqResult = await client.query(`
      SELECT COALESCE(MAX(sequence_rank), 0) + 1 as next_rank
      FROM strategic_directives_v2;
    `);
    const baseRank = seqResult.rows[0].next_rank;
    console.log(`  Next sequence rank: ${baseRank}`);

    // Step 2: Check if SDs already exist
    console.log('\n📋 Step 2: Checking for existing SDs...');
    const existingCheck = await client.query(`
      SELECT id, title, status
      FROM strategic_directives_v2
      WHERE id IN ($1, $2, $3, $4)
    `, ['SD-VWC-PRESETS-001', 'SD-VWC-ERRORS-001', 'SD-VWC-A11Y-001', 'SD-VWC-PHASE2-001']);

    if (existingCheck.rows.length > 0) {
      console.log('Found existing SDs:');
      existingCheck.rows.forEach(sd => {
        console.log(`  - ${sd.id}: ${sd.title} (${sd.status})`);
      });

      // Check if any of the new SDs already exist
      const newSDIds = ['SD-VWC-PRESETS-001', 'SD-VWC-ERRORS-001', 'SD-VWC-A11Y-001'];
      const existingNewSDs = existingCheck.rows.filter(sd => newSDIds.includes(sd.id));
      if (existingNewSDs.length > 0) {
        console.log(`\n⚠️  SDs already exist: ${existingNewSDs.map(sd => sd.id).join(', ')}`);
        console.log('   Skipping creation step, proceeding to update SD-VWC-PHASE2-001...\n');
      }
    } else {
      console.log('No conflicts found. Proceeding...');
    }

    // Step 3: Create 3 new SDs (only if they don't exist)
    console.log('\n📋 Step 3: Creating 3 new Strategic Directives...\n');

    const createdSDs = [];
    const newSDIds = ['SD-VWC-PRESETS-001', 'SD-VWC-ERRORS-001', 'SD-VWC-A11Y-001'];
    const existingNewSDs = existingCheck.rows.filter(sd => newSDIds.includes(sd.id));

    for (let i = 0; i < NEW_SDS.length; i++) {
      const sd = NEW_SDS[i];

      // Skip if already exists
      if (existingNewSDs.some(existing => existing.id === sd.id)) {
        console.log(`Skipping ${sd.id} (already exists)`);
        const existingSD = await client.query(`
          SELECT * FROM strategic_directives_v2 WHERE id = $1
        `, [sd.id]);
        createdSDs.push(existingSD.rows[0]);
        continue;
      }

      console.log(`Creating ${sd.id}...`);

      const result = await client.query(`
        INSERT INTO strategic_directives_v2 (
          id, title, category, priority, status, target_application,
          description, rationale, scope,
          success_criteria, implementation_guidelines,
          dependencies, metadata, progress_percentage,
          sequence_rank, sd_key, version,
          created_at, updated_at, is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW(), true)
        RETURNING *;
      `, [
        sd.id,
        sd.title,
        sd.category,
        sd.priority,
        sd.status,
        sd.target_application,
        sd.description,
        sd.rationale,
        sd.scope,
        JSON.stringify(sd.success_criteria),
        JSON.stringify(sd.implementation_guidelines),
        JSON.stringify(sd.dependencies),
        JSON.stringify(sd.metadata),
        0, // progress_percentage
        baseRank + i,
        sd.id, // sd_key same as id
        '1.0.0' // version
      ]);

      createdSDs.push(result.rows[0]);
      console.log(`  ✅ Created: ${result.rows[0].id} (status: ${result.rows[0].status}, rank: ${result.rows[0].sequence_rank})`);
    }

    // Step 4: Update SD-VWC-PHASE2-001 to cancelled (not rejected - that's not a valid status)
    console.log('\n📋 Step 4: Updating SD-VWC-PHASE2-001 to cancelled status...');

    const cancellationReason = 'LEAD Strategic Validation Decision (2025-10-20): This SD bundled 3 unrelated features (PresetSelector, Error Messages, Accessibility) under misleading "Quick Wins" label. Split into 3 independent SDs for better risk isolation and true incremental delivery: SD-VWC-PRESETS-001, SD-VWC-ERRORS-001, SD-VWC-A11Y-001.';

    const updateResult = await client.query(`
      UPDATE strategic_directives_v2
      SET
        status = 'cancelled',
        metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
        updated_at = NOW()
      WHERE id = 'SD-VWC-PHASE2-001'
      RETURNING id, title, status, metadata;
    `, [JSON.stringify({ cancellation_reason: cancellationReason })]);

    if (updateResult.rows.length === 0) {
      console.log('  ⚠️  SD-VWC-PHASE2-001 not found in database (may not exist yet)');
    } else {
      console.log(`  ✅ Updated: ${updateResult.rows[0].id} (status: ${updateResult.rows[0].status})`);
    }

    // Summary Report
    console.log('\n' + '='.repeat(80));
    console.log('📊 OPERATION SUMMARY');
    console.log('='.repeat(80));

    console.log('\n✅ Created Strategic Directives:\n');
    createdSDs.forEach(sd => {
      const meta = typeof sd.metadata === 'string' ? JSON.parse(sd.metadata) : sd.metadata;
      const deps = typeof sd.dependencies === 'string' ? JSON.parse(sd.dependencies) : sd.dependencies;

      console.log(`📄 ${sd.id}`);
      console.log(`   Title: ${sd.title}`);
      console.log(`   Category: ${sd.category}`);
      console.log(`   Priority: ${sd.priority}`);
      console.log(`   Status: ${sd.status}`);
      console.log(`   Target: ${sd.target_application}`);
      console.log(`   Estimated: ${meta?.estimated_hours || 'N/A'}h / ${meta?.estimated_loc || 'N/A'} LOC`);
      console.log(`   Dependencies: ${JSON.stringify(deps)}`);
      console.log('');
    });

    if (updateResult.rows.length > 0) {
      const updatedSD = updateResult.rows[0];
      const meta = typeof updatedSD.metadata === 'string' ? JSON.parse(updatedSD.metadata) : updatedSD.metadata;

      console.log('🚫 Cancelled Strategic Directive:\n');
      console.log(`📄 ${updatedSD.id}`);
      console.log(`   Title: ${updatedSD.title}`);
      console.log(`   Status: ${updatedSD.status}`);
      console.log(`   Reason: ${meta?.cancellation_reason || 'N/A'}`);
      console.log('');
    }

    console.log('='.repeat(80));
    console.log('✅ All operations completed successfully!');
    console.log('='.repeat(80) + '\n');

    // Return data for LEAD
    return {
      success: true,
      created: createdSDs.map(sd => {
        const deps = typeof sd.dependencies === 'string' ? JSON.parse(sd.dependencies) : sd.dependencies;
        const meta = typeof sd.metadata === 'string' ? JSON.parse(sd.metadata) : sd.metadata;

        return {
          id: sd.id,
          title: sd.title,
          status: sd.status,
          dependencies: deps,
          priority: sd.priority,
          estimated_hours: meta?.estimated_hours,
          estimated_loc: meta?.estimated_loc
        };
      }),
      cancelled: updateResult.rows.length > 0 ? updateResult.rows[0] : null
    };

  } catch (error) {
    console.error('\n❌ Error during SD split operation:', error.message);
    console.error('\nStack trace:', error.stack);

    if (error.code === '23505') {
      console.error('\n⚠️  DUPLICATE KEY ERROR: One or more SDs already exist');
      console.error('   Run this query to check existing SDs:');
      console.error('   SELECT id, title, status FROM strategic_directives_v2 WHERE id LIKE \'SD-VWC-%\';');
    }

    throw error;
  } finally {
    if (client) {
      await client.end();
      console.log('🔌 Database connection closed\n');
    }
  }
}

// Execute
main()
  .then(result => {
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
