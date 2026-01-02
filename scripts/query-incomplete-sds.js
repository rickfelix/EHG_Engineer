import { createDatabaseClient } from './lib/supabase-connection.js';

(async () => {
  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    // Get all SDs
    const allSDs = await client.query(`
      SELECT
        id,
        title,
        status,
        priority,
        progress,
        current_phase,
        sd_type,
        created_at,
        updated_at,
        is_working_on,
        is_active
      FROM strategic_directives_v2
      WHERE is_active = true
      ORDER BY
        CASE
          WHEN status = 'in_progress' THEN 1
          WHEN status = 'approved' THEN 2
          WHEN status = 'completed' THEN 3
          WHEN status = 'cancelled' THEN 4
          ELSE 5
        END,
        CASE
          WHEN priority = 'critical' THEN 1
          WHEN priority = 'high' THEN 2
          WHEN priority = 'medium' THEN 3
          WHEN priority = 'low' THEN 4
          ELSE 5
        END,
        created_at DESC
    `);

    console.log('\n========================================');
    console.log('STRATEGIC DIRECTIVES SUMMARY');
    console.log('========================================\n');
    console.log(`Total Active SDs: ${allSDs.rows.length}\n`);

    // Status breakdown
    const statusCounts = {};
    allSDs.rows.forEach(row => {
      statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
    });

    console.log('Status Breakdown:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });

    // Group by status
    const byStatus = {};
    allSDs.rows.forEach(row => {
      if (!byStatus[row.status]) byStatus[row.status] = [];
      byStatus[row.status].push(row);
    });

    // Show non-completed SDs in detail
    const nonCompleted = allSDs.rows.filter(row => row.status !== 'completed' && row.status !== 'cancelled');

    if (nonCompleted.length > 0) {
      console.log('\n========================================');
      console.log('INCOMPLETE WORK (NOT COMPLETED/CANCELLED)');
      console.log('========================================\n');

      nonCompleted.forEach(row => {
        const workingOn = row.is_working_on ? ' [WORKING ON]' : '';
        console.log(`SD: ${row.id}${workingOn}`);
        console.log(`Title: ${row.title}`);
        console.log(`Status: ${row.status}`);
        console.log(`Type: ${row.sd_type || 'N/A'}`);
        console.log(`Priority: ${row.priority}`);
        console.log(`Progress: ${row.progress || 0}%`);
        console.log(`Phase: ${row.current_phase || 'N/A'}`);
        console.log(`Updated: ${new Date(row.updated_at).toISOString().split('T')[0]}`);
        console.log('---\n');
      });
    } else {
      console.log('\n========================================');
      console.log('ALL WORK COMPLETED!');
      console.log('========================================\n');
      console.log('No incomplete SDs found - all active SDs are either completed or cancelled.\n');
    }

    // Summary table of recent SDs
    console.log('\n========================================');
    console.log('RECENT SDs (Last 30)');
    console.log('========================================\n');
    console.log('STATUS'.padEnd(12) + 'PRIORITY'.padEnd(10) + 'PROGRESS'.padEnd(10) + 'SD_ID');
    console.log('-'.repeat(100));

    const recent = allSDs.rows.slice(0, 30);
    recent.forEach(row => {
      const workingFlag = row.is_working_on ? '* ' : '  ';
      const status = row.status.padEnd(12);
      const priority = (row.priority || 'N/A').padEnd(10);
      const progress = ((row.progress || 0) + '%').padEnd(10);
      const sdId = workingFlag + row.id;
      console.log(`${status}${priority}${progress}${sdId}`);
    });

    if (nonCompleted.some(row => row.is_working_on)) {
      console.log('\n* = Currently working on');
    }

  } catch (error) {
    console.error('Error querying strategic_directives_v2:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
