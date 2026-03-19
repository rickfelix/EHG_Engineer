/**
 * Deep Research Async Job Manager
 * SD-LEO-FEAT-DEEP-RESEARCH-API-001 (FR-002)
 *
 * Manages long-running deep research jobs with budget checking,
 * timeout, and state tracking.
 */

import { runDeepResearch, estimateCost } from './deep-research-adapters.js';
import { checkBudget, recordSpending } from './deep-research-budget.js';
import { storeResult, updateResultStatus } from './deep-research-storage.js';
import { createSupabaseServiceClient } from '../supabase-client.js';

const DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes

/** Submit a deep research job with budget checking and timeout. */
export async function submitDeepResearch(query, options = {}) {
  const supabase = createSupabaseServiceClient();
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const onStatus = options.onStatus || (() => {});

  // Pre-flight budget check
  const estimatedCost = estimateCost(options.provider || 'anthropic', 10000);
  const budget = await checkBudget(options.provider || 'anthropic', estimatedCost);
  if (!budget.allowed) {
    onStatus('blocked', budget.reason);
    throw new Error(`Budget blocked: ${budget.reason}`);
  }

  // Create initial DB record
  const { data: job } = await supabase
    .from('deep_research_results')
    .insert({ query, provider: options.provider || 'anthropic', status: 'queued' })
    .select('id')
    .single();

  const jobId = job?.id;
  onStatus('queued', `Job ${jobId} queued`);

  try {
    await updateResultStatus(jobId, 'running');
    onStatus('running', 'Deep research in progress...');

    const result = await Promise.race([
      runDeepResearch(query, options),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Deep research timed out')), timeoutMs)),
    ]);

    await storeResult(result);
    await recordSpending(result.provider, result.tokens_used, result.cost_estimate);
    await updateResultStatus(jobId, 'completed', {
      completed_at: new Date().toISOString(), tokens_used: result.tokens_used,
      cost_estimate: result.cost_estimate, duration_ms: result.duration_ms,
    });

    onStatus('completed', `Research complete (${result.duration_ms}ms, $${result.cost_estimate})`);
    return result;
  } catch (err) {
    const status = err.message.includes('timed out') ? 'timed_out' : 'failed';
    await updateResultStatus(jobId, status, { error_message: err.message });
    onStatus(status, err.message);
    throw err;
  }
}
