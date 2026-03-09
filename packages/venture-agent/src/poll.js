import { getEdgeFunctionUrl } from './client.js';

/**
 * Poll for pending service tasks.
 * Calls the service-tasks-poll Edge Function.
 */
export async function pollTasks(supabase, options = {}) {
  const { serviceId, taskType, limit = 20, offset = 0 } = options;
  const url = getEdgeFunctionUrl(process.env.SUPABASE_URL, 'service-tasks-poll');

  const params = new URLSearchParams();
  if (serviceId) params.set('service_id', serviceId);
  if (taskType) params.set('task_type', taskType);
  if (limit) params.set('limit', String(limit));
  if (offset) params.set('offset', String(offset));

  const queryString = params.toString();
  const fullUrl = queryString ? `${url}?${queryString}` : url;

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const apiKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  const response = await fetch(fullUrl, {
    method: 'GET',
    headers: {
      'Authorization': token ? `Bearer ${token}` : `Bearer ${apiKey}`,
      'apikey': apiKey,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Poll failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Format and display poll results as a table.
 */
export function displayPollResults(result) {
  const { tasks, count } = result;

  if (!tasks || tasks.length === 0) {
    console.log('No pending tasks found.');
    return;
  }

  console.log(`\nPending Tasks (${count}):\n`);
  console.log(
    'ID'.padEnd(38) +
    'Service'.padEnd(20) +
    'Type'.padEnd(16) +
    'Priority'.padEnd(10) +
    'Created'
  );
  console.log('-'.repeat(100));

  for (const task of tasks) {
    console.log(
      (task.id || '').substring(0, 36).padEnd(38) +
      (task.service_id || '-').padEnd(20) +
      (task.task_type || '-').padEnd(16) +
      String(task.priority ?? '-').padEnd(10) +
      (task.created_at ? new Date(task.created_at).toLocaleString() : '-')
    );
  }
  console.log('');
}
