#!/usr/bin/env node
/**
 * Verify SD-BOARD-GOVERNANCE-001 completion status
 * (Prerequisite for SD-BOARD-VISUAL-BUILDER-001)
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function verifyPrerequisite() {
  const client = await createDatabaseClient('engineer', { verbose: true });

  try {
    console.log('\n🔍 Verifying SD-BOARD-GOVERNANCE-001 Status');
    console.log('═'.repeat(70));

    // Query SD-BOARD-GOVERNANCE-001
    const sdResult = await client.query(`
      SELECT sd_key, title, status, progress_percentage, current_phase, updated_at
      FROM strategic_directives_v2
      WHERE sd_key = 'SD-BOARD-GOVERNANCE-001'
      OR title LIKE '%Board%Governance%'
      ORDER BY created_at DESC
      LIMIT 1;
    `);

    if (sdResult.rows.length === 0) {
      console.log('\n❌ SD-BOARD-GOVERNANCE-001 NOT FOUND');
      console.log('   This is a BLOCKER for SD-BOARD-VISUAL-BUILDER-001');
      console.log('   Board governance infrastructure must be implemented first');
      return { exists: false, complete: false, blocker: true };
    }

    const sd = sdResult.rows[0];
    console.log(`\n✅ Found: ${sd.sd_key}`);
    console.log(`   Title: ${sd.title}`);
    console.log(`   Status: ${sd.status}`);
    console.log(`   Progress: ${sd.progress_percentage || 0}%`);
    console.log(`   Current Phase: ${sd.current_phase || 'N/A'}`);
    console.log(`   Last Updated: ${sd.updated_at ? new Date(sd.updated_at).toLocaleString() : 'N/A'}`);

    const isComplete = sd.status === 'completed' && sd.progress_percentage === 100;

    // Check board-related tables
    console.log('\n🗄️ Checking Board Infrastructure Tables:');

    const boardMembersCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'board_members'
      );
    `);
    console.log(`   board_members: ${boardMembersCheck.rows[0].exists ? '✅ EXISTS' : '❌ MISSING'}`);

    const boardMeetingsCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'board_meetings'
      );
    `);
    console.log(`   board_meetings: ${boardMeetingsCheck.rows[0].exists ? '✅ EXISTS' : '❌ MISSING'}`);

    const attendanceCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'board_meeting_attendance'
      );
    `);
    console.log(`   board_meeting_attendance: ${attendanceCheck.rows[0].exists ? '✅ EXISTS' : '❌ MISSING'}`);

    const tablesExist = boardMembersCheck.rows[0].exists &&
                        boardMeetingsCheck.rows[0].exists &&
                        attendanceCheck.rows[0].exists;

    // Check if board members exist
    if (tablesExist) {
      const membersCount = await client.query(`SELECT COUNT(*) as count FROM board_members;`);
      console.log(`\n👥 Board Members: ${membersCount.rows[0].count} found`);

      if (membersCount.rows[0].count >= 7) {
        console.log('   ✅ 7+ board members exist (EVA + 6 specialists expected)');
      } else {
        console.log(`   ⚠️ Only ${membersCount.rows[0].count} board members (expected 7)`);
      }
    }

    console.log('\n' + '═'.repeat(70));

    if (isComplete && tablesExist) {
      console.log('✅ VERDICT: SD-BOARD-GOVERNANCE-001 is COMPLETE');
      console.log('   Safe to proceed with SD-BOARD-VISUAL-BUILDER-001');
      return { exists: true, complete: true, blocker: false };
    } else if (!isComplete && tablesExist) {
      console.log('⚠️ VERDICT: SD-BOARD-GOVERNANCE-001 is IN PROGRESS');
      console.log('   Tables exist but SD not marked complete');
      console.log('   Can proceed with PLAN phase (parallel work)');
      return { exists: true, complete: false, blocker: false };
    } else if (!tablesExist) {
      console.log('❌ VERDICT: Board infrastructure NOT READY');
      console.log('   BLOCKER: Cannot proceed without board tables');
      console.log('   Action: Complete SD-BOARD-GOVERNANCE-001 first');
      return { exists: true, complete: false, blocker: true };
    }

  } finally {
    await client.end();
  }
}

verifyPrerequisite().then(result => {
  process.exit(result.blocker ? 1 : 0);
}).catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
