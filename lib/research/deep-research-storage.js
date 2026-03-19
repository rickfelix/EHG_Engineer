/**
 * Deep Research Dual Storage
 * SD-LEO-FEAT-DEEP-RESEARCH-API-001 (FR-004)
 *
 * Dual-write: DB table for metadata/querying + .research/ files for full traces.
 */

import { createSupabaseServiceClient } from '../supabase-client.js';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const RESEARCH_DIR = join(process.cwd(), '.research');

/** Store a deep research result in both DB and filesystem. */
export async function storeResult(result) {
  const supabase = createSupabaseServiceClient();

  const { data, error } = await supabase
    .from('deep_research_results')
    .insert({
      query: result.query, provider: result.provider, model: result.model,
      status: 'completed', thinking: result.thinking || null, result: result.result,
      summary: result.result?.substring(0, 500), tokens_used: result.tokens_used,
      cost_estimate: result.cost_estimate, duration_ms: result.duration_ms,
      completed_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) throw error;

  // Filesystem write (non-blocking, supplementary)
  try {
    await mkdir(RESEARCH_DIR, { recursive: true });
    const slug = result.query.replace(/[^a-zA-Z0-9]+/g, '-').substring(0, 50).toLowerCase();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await writeFile(join(RESEARCH_DIR, `${timestamp}-${result.provider}-${slug}.json`), JSON.stringify(result, null, 2), 'utf8');
  } catch (fsErr) {
    console.warn(`[DeepResearch] Filesystem write failed (non-fatal): ${fsErr.message}`);
  }

  return data.id;
}

/** Update a deep research record status. */
export async function updateResultStatus(id, status, updates = {}) {
  const supabase = createSupabaseServiceClient();
  await supabase.from('deep_research_results')
    .update({ status, ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
}
