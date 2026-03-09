import { getEdgeFunctionUrl } from './client.js';

/**
 * Claim a task atomically via the service-tasks-claim Edge Function.
 */
export async function claimTask(supabase, taskId, claimedBy) {
  const url = getEdgeFunctionUrl(process.env.SUPABASE_URL, 'service-tasks-claim');
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const apiKey = process.env.VENTURE_AGENT_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': token ? `Bearer ${token}` : `Bearer ${apiKey}`,
      'apikey': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ task_id: taskId, claimed_by: claimedBy }),
  });

  if (response.status === 409) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`Task already claimed: ${body.current_status || 'unknown'}`);
  }

  if (response.status === 404) {
    throw new Error('Task not found or not accessible');
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Claim failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Complete a claimed task via the service-tasks-complete Edge Function.
 */
export async function completeTask(supabase, taskId, result, confidenceScore) {
  const url = getEdgeFunctionUrl(process.env.SUPABASE_URL, 'service-tasks-complete');
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const apiKey = process.env.VENTURE_AGENT_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  const body = {
    task_id: taskId,
    action: 'complete',
    result: result,
  };
  if (confidenceScore !== undefined) {
    body.confidence_score = confidenceScore;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': token ? `Bearer ${token}` : `Bearer ${apiKey}`,
      'apikey': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Complete failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Report a task failure via the service-tasks-complete Edge Function.
 */
export async function failTask(supabase, taskId, errorMessage) {
  const url = getEdgeFunctionUrl(process.env.SUPABASE_URL, 'service-tasks-complete');
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const apiKey = process.env.VENTURE_AGENT_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': token ? `Bearer ${token}` : `Bearer ${apiKey}`,
      'apikey': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      task_id: taskId,
      action: 'fail',
      error_message: errorMessage,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Fail report failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Apply workflow: claim → process → complete/fail.
 * The processFn receives the claimed task and should return { result, confidence_score }.
 */
export async function applyTask(supabase, taskId, claimedBy, processFn) {
  console.log(`Claiming task ${taskId}...`);
  const claimResult = await claimTask(supabase, taskId, claimedBy);
  const task = claimResult.task;
  console.log(`Claimed: ${task.task_type} (service: ${task.service_id})`);

  try {
    if (processFn) {
      console.log('Processing task...');
      const output = await processFn(task);
      console.log('Completing task...');
      const completed = await completeTask(
        supabase,
        taskId,
        output.result,
        output.confidence_score
      );
      console.log(`Completed: ${completed.task.id}`);
      return completed;
    } else {
      // No processing function — just mark as complete with no result
      console.log('No processor provided, marking complete...');
      const completed = await completeTask(supabase, taskId, null, null);
      console.log(`Completed: ${completed.task.id}`);
      return completed;
    }
  } catch (err) {
    console.error(`Processing failed: ${err.message}`);
    console.log('Reporting failure...');
    await failTask(supabase, taskId, err.message);
    throw err;
  }
}
