#!/usr/bin/env node
/**
 * Query all Strategic Directives from database
 */
import { createDatabaseClient } from './lib/supabase-connection.js';

async function queryAllStrategicDirectives() {
  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    const result = await client.query(`
      SELECT
        id,
        title,
        status,
        current_phase,
        priority,
        category,
        parent_sd_id,
        target_application,
        created_at
      FROM strategic_directives_v2
      ORDER BY
        CASE WHEN parent_sd_id IS NULL THEN 0 ELSE 1 END,
        id
    `);

    console.log('\n=== STRATEGIC DIRECTIVES ===\n');
    console.log('Total Records:', result.rows.length);
    console.log('\n');

    // Format as table
    console.log('ID'.padEnd(40) + ' | ' +
                'Title'.padEnd(60) + ' | ' +
                'Status'.padEnd(12) + ' | ' +
                'Phase'.padEnd(12) + ' | ' +
                'Priority'.padEnd(10) + ' | ' +
                'Category'.padEnd(15) + ' | ' +
                'Parent SD'.padEnd(40) + ' | ' +
                'Target App');
    console.log('-'.repeat(250));

    result.rows.forEach(row => {
      console.log(
        (row.id || '').padEnd(40) + ' | ' +
        (row.title || '').substring(0, 60).padEnd(60) + ' | ' +
        (row.status || '').padEnd(12) + ' | ' +
        (row.current_phase || '').padEnd(12) + ' | ' +
        (row.priority || '').padEnd(10) + ' | ' +
        (row.category || '').padEnd(15) + ' | ' +
        (row.parent_sd_id || '').padEnd(40) + ' | ' +
        (row.target_application || '')
      );
    });

    // Summary statistics
    console.log('\n=== SUMMARY STATISTICS ===\n');

    // By Status
    const statusCounts = {};
    result.rows.forEach(row => {
      statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
    });
    console.log('By Status:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log('  ' + status + ': ' + count);
    });

    // By Priority
    console.log('\nBy Priority:');
    const priorityCounts = {};
    result.rows.forEach(row => {
      priorityCounts[row.priority] = (priorityCounts[row.priority] || 0) + 1;
    });
    Object.entries(priorityCounts).forEach(([priority, count]) => {
      console.log('  ' + priority + ': ' + count);
    });

    // By Category
    console.log('\nBy Category:');
    const categoryCounts = {};
    result.rows.forEach(row => {
      categoryCounts[row.category] = (categoryCounts[row.category] || 0) + 1;
    });
    Object.entries(categoryCounts).forEach(([category, count]) => {
      console.log('  ' + category + ': ' + count);
    });

    // By Target Application
    console.log('\nBy Target Application:');
    const appCounts = {};
    result.rows.forEach(row => {
      const app = row.target_application || 'null';
      appCounts[app] = (appCounts[app] || 0) + 1;
    });
    Object.entries(appCounts).forEach(([app, count]) => {
      console.log('  ' + app + ': ' + count);
    });

    // Parent vs Child
    const parentCount = result.rows.filter(row => row.parent_sd_id === null).length;
    const childCount = result.rows.filter(row => row.parent_sd_id !== null).length;
    console.log('\nHierarchy:');
    console.log('  Parent SDs: ' + parentCount);
    console.log('  Child SDs: ' + childCount);

  } finally {
    await client.end();
  }
}

queryAllStrategicDirectives().catch(err => {
  console.error('Error querying Strategic Directives:', err);
  process.exit(1);
});
