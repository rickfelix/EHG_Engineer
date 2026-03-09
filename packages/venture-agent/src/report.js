import { getEdgeFunctionUrl } from './client.js';

/**
 * Fetch completed/failed tasks for reporting.
 * Uses direct Supabase query since the poll endpoint only returns pending tasks.
 */
export async function getTaskReport(supabase, options = {}) {
  const { serviceId, taskType, since, limit = 100 } = options;

  let query = supabase
    .from('service_tasks')
    .select('id, venture_id, service_id, task_type, status, priority, confidence_score, artifacts, error_message, created_at, completed_at, claimed_at')
    .in('status', ['completed', 'failed'])
    .order('completed_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (serviceId) {
    query = query.eq('service_id', serviceId);
  }

  if (taskType) {
    query = query.eq('task_type', taskType);
  }

  if (since) {
    query = query.gte('created_at', since);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Report query failed: ${error.message}`);
  }

  return data || [];
}

/**
 * Display a summary report of completed tasks.
 */
export function displayReport(tasks) {
  if (!tasks || tasks.length === 0) {
    console.log('No completed or failed tasks found.');
    return;
  }

  const completed = tasks.filter(t => t.status === 'completed');
  const failed = tasks.filter(t => t.status === 'failed');
  const total = tasks.length;
  const successRate = total > 0 ? ((completed.length / total) * 100).toFixed(1) : '0.0';

  const confidenceScores = completed
    .filter(t => t.confidence_score !== null && t.confidence_score !== undefined)
    .map(t => Number(t.confidence_score));
  const avgConfidence = confidenceScores.length > 0
    ? (confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length).toFixed(3)
    : 'N/A';

  // Group by task_type
  const byType = {};
  for (const task of tasks) {
    const key = task.task_type || 'unknown';
    if (!byType[key]) byType[key] = { completed: 0, failed: 0 };
    if (task.status === 'completed') byType[key].completed++;
    else byType[key].failed++;
  }

  // Group by service_id
  const byService = {};
  for (const task of tasks) {
    const key = task.service_id || 'unknown';
    if (!byService[key]) byService[key] = { completed: 0, failed: 0 };
    if (task.status === 'completed') byService[key].completed++;
    else byService[key].failed++;
  }

  console.log('\n' + '='.repeat(60));
  console.log('  Service Task Report');
  console.log('='.repeat(60));
  console.log(`  Total tasks:      ${total}`);
  console.log(`  Completed:        ${completed.length}`);
  console.log(`  Failed:           ${failed.length}`);
  console.log(`  Success rate:     ${successRate}%`);
  console.log(`  Avg confidence:   ${avgConfidence}`);

  if (Object.keys(byType).length > 0) {
    console.log('\n  By Task Type:');
    for (const [type, counts] of Object.entries(byType)) {
      console.log(`    ${type.padEnd(20)} ${counts.completed} completed, ${counts.failed} failed`);
    }
  }

  if (Object.keys(byService).length > 0) {
    console.log('\n  By Service:');
    for (const [service, counts] of Object.entries(byService)) {
      console.log(`    ${service.padEnd(20)} ${counts.completed} completed, ${counts.failed} failed`);
    }
  }

  if (failed.length > 0) {
    console.log('\n  Recent Failures:');
    for (const task of failed.slice(0, 5)) {
      console.log(`    [${task.id?.substring(0, 8)}] ${task.task_type}: ${task.error_message || 'No error message'}`);
    }
  }

  console.log('='.repeat(60) + '\n');
}
