#!/usr/bin/env node
/**
 * Fix priority mismatch for SD-BOARD-VISUAL-BUILDER-001
 * Database shows "critical" but displays as "⚪ MINIMAL"
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function fixPriority() {
  const client = await createDatabaseClient('engineer', { verbose: true });

  try {
    // Query current priority value
    const current = await client.query(`
      SELECT id, sd_key, title, priority, status
      FROM strategic_directives_v2
      WHERE sd_key = 'SD-BOARD-VISUAL-BUILDER-001';
    `);

    if (current.rows.length === 0) {
      console.error('❌ SD not found');
      process.exit(1);
    }

    const sd = current.rows[0];
    console.log('\n📊 CURRENT STATE:');
    console.log(`   SD Key: ${sd.sd_key}`);
    console.log(`   Title: ${sd.title}`);
    console.log(`   Priority: ${sd.priority} (${typeof sd.priority})`);
    console.log(`   Status: ${sd.status}`);

    // Determine correct priority
    let newPriority;
    if (sd.priority === 'critical' || sd.priority === 'CRITICAL') {
      newPriority = 90; // CRITICAL: 90+
    } else if (typeof sd.priority === 'number') {
      newPriority = sd.priority;
    } else {
      // Default to HIGH (70-89)
      newPriority = 75;
    }

    console.log(`\n🔧 FIXING: Setting priority to ${newPriority} (${newPriority >= 90 ? 'CRITICAL' : newPriority >= 70 ? 'HIGH' : newPriority >= 50 ? 'MEDIUM' : 'LOW'})`);

    // Update priority
    await client.query(`
      UPDATE strategic_directives_v2
      SET priority = $1, updated_at = NOW()
      WHERE sd_key = 'SD-BOARD-VISUAL-BUILDER-001';
    `, [newPriority]);

    // Verify update
    const updated = await client.query(`
      SELECT sd_key, title, priority
      FROM strategic_directives_v2
      WHERE sd_key = 'SD-BOARD-VISUAL-BUILDER-001';
    `);

    console.log('\n✅ UPDATED STATE:');
    console.log(`   Priority: ${updated.rows[0].priority}`);

    const label = updated.rows[0].priority >= 90 ? '🔴 CRITICAL' :
                  updated.rows[0].priority >= 70 ? '🟠 HIGH' :
                  updated.rows[0].priority >= 50 ? '🟡 MEDIUM' :
                  updated.rows[0].priority >= 30 ? '🔵 LOW' : '⚪ MINIMAL';

    console.log(`   Label: ${label}`);
    console.log('\n✅ Priority mismatch fixed!');

  } finally {
    await client.end();
  }
}

fixPriority().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
