#!/usr/bin/env node

/**
 * Accept EXEC→PLAN Handoff for SD-VWC-INTUITIVE-FLOW-001 (Checkpoint 1)
 * Database-first handoff acceptance per LEO Protocol v4.2.0
 *
 * Decision: Option A - Accept with Caveat
 * - All Checkpoint 1 work complete with zero defects
 * - Pre-existing accessibility errors to be handled in separate SD
 * - Proceed to Checkpoint 2 (Unit Tests + Accessibility)
 */

import { createDatabaseClient } from '../lib/supabase-connection.js';
import dotenv from 'dotenv';

dotenv.config();

async function acceptHandoff() {
  console.log('\n📋 Accepting EXEC→PLAN Handoff');
  console.log('='.repeat(60));

  let client;

  try {
    console.log('\n1️⃣  Connecting to EHG_Engineer database...');
    client = await createDatabaseClient('engineer', { verify: true });
    console.log('✅ Connection established');

    const sdId = 'SD-VWC-INTUITIVE-FLOW-001';
    const handoffType = 'EXEC-TO-PLAN';

    console.log(`\n2️⃣  Finding latest ${handoffType} handoff for ${sdId}...`);

    const findQuery = `
      SELECT id, status, created_at
      FROM sd_phase_handoffs
      WHERE sd_id = $1 AND handoff_type = $2
      ORDER BY created_at DESC
      LIMIT 1;
    `;

    const findResult = await client.query(findQuery, [sdId, handoffType]);

    if (findResult.rows.length === 0) {
      throw new Error(`No ${handoffType} handoff found for ${sdId}`);
    }

    const handoff = findResult.rows[0];
    console.log(`✅ Found handoff: ${handoff.id}`);
    console.log(`   Current status: ${handoff.status}`);
    console.log(`   Created: ${handoff.created_at}`);

    if (handoff.status === 'accepted') {
      console.log('⚠️  Handoff already accepted');
      return;
    }

    console.log('\n3️⃣  Updating handoff status to \'accepted\'...');

    const acceptanceNotes = `PLAN Supervisor Decision: Option A - Accept with Caveat

**Acceptance Rationale**:
1. ✅ All Checkpoint 1 work complete and clean (0 errors in EXEC code)
2. ✅ Bonus achievement: Fixed CI infrastructure issue (added missing eslint-plugin-jsx-a11y)
3. ⚠️ Pre-existing accessibility errors revealed in unrelated code
4. ❌ CI status red due to pre-existing issues (not Checkpoint 1 work)

**Decision**: Accept handoff despite red CI status because:
- EXEC delivered all requirements with zero defects
- Pre-existing issues are out of Checkpoint 1 scope
- Proper separation of concerns (separate SD for tech debt)
- Bonus CI fix improves overall codebase quality

**Next Actions**:
1. Create separate SD for pre-existing accessibility fixes (SD-A11Y-ONBOARDING-001)
2. Proceed to Checkpoint 2 planning (Unit Tests + Accessibility per PRD)
3. Consider /context-compact before Checkpoint 2 implementation (currently 62% budget)

**Pre-existing Issues** (to be addressed in separate SD):
- File: app/(onboarding)/getting-started/page.tsx
- Error 1 (Line 275): aria-pressed attribute not supported by role radio
- Error 2 (Line 287): Role radio missing required aria-checked attribute
- Estimated fix time: 15 minutes
- Priority: HIGH (blocks CI for all PRs)`;

    const updateQuery = `
      UPDATE sd_phase_handoffs
      SET
        status = 'accepted',
        accepted_at = NOW(),
        acceptance_notes = $1
      WHERE id = $2
      RETURNING id, status, accepted_at;
    `;

    const updateResult = await client.query(updateQuery, [acceptanceNotes, handoff.id]);

    console.log('✅ Handoff accepted successfully!');
    console.log(`   ID: ${updateResult.rows[0].id}`);
    console.log(`   Status: ${updateResult.rows[0].status}`);
    console.log(`   Accepted at: ${updateResult.rows[0].accepted_at}`);

    console.log('\n4️⃣  Updating SD status...');

    const updateSDQuery = `
      UPDATE strategic_directives_v2
      SET
        current_phase = 'PLAN',
        progress_percentage = 40,
        metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{checkpoint_1_status}',
          '"completed"'::jsonb
        )
      WHERE id = $1
      RETURNING id, current_phase, progress_percentage;
    `;

    const sdResult = await client.query(updateSDQuery, [sdId]);

    if (sdResult.rows.length > 0) {
      console.log('✅ SD status updated');
      console.log(`   Phase: ${sdResult.rows[0].current_phase}`);
      console.log(`   Progress: ${sdResult.rows[0].progress_percentage}%`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ HANDOFF ACCEPTANCE COMPLETE');
    console.log('='.repeat(60));
    console.log('\nNext Steps:');
    console.log('1. Create SD-A11Y-ONBOARDING-001 for pre-existing accessibility fixes');
    console.log('2. Plan Checkpoint 2: Unit Tests (FR-7) + Accessibility (FR-4)');
    console.log('3. Consider /context-compact (currently at 62% of budget)');
    console.log('4. Estimated Checkpoint 2 time: 9 hours (5h tests + 4h accessibility)\n');

  } catch (error) {
    console.error('\n❌ Error accepting handoff:', error);
    throw error;
  } finally {
    if (client) {
      await client.end();
      console.log('\n🔌 Database connection closed');
    }
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  acceptHandoff()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export default acceptHandoff;
