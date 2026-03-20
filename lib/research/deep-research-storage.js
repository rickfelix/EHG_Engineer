/**
 * Deep Research Dual Storage
 * SD-LEO-FEAT-DEEP-RESEARCH-API-001 (FR-004)
 *
 * Writes deep research results to both:
 * 1. deep_research_results DB table (queryable, linkable)
 * 2. .research/ directory (accessible to manual AI sessions)
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const RESEARCH_DIR = path.join(process.cwd(), '.research');

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function ensureResearchDir() {
  if (!fs.existsSync(RESEARCH_DIR)) {
    fs.mkdirSync(RESEARCH_DIR, { recursive: true });
  }
  // Ensure .gitignore includes .research/
  const gitignorePath = path.join(process.cwd(), '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf8');
    if (!content.includes('.research/') && !content.includes('.research')) {
      fs.appendFileSync(gitignorePath, '\n# Deep research output (sensitive)\n.research/\n');
    }
  }
}

/**
 * Generate a slug from a query string for file naming.
 */
function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

/**
 * Create a pending DB record before the research call starts.
 * @param {Object} params
 * @returns {Promise<string>} Record ID
 */
export async function createPendingRecord({ query, provider, model, triggerSource, sdKey, ventureId, researchSessionId }) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('deep_research_results')
    .insert({
      query,
      provider,
      model,
      response: '',
      status: 'running',
      trigger_source: triggerSource || 'manual',
      sd_key: sdKey || null,
      venture_id: ventureId || null,
      research_session_id: researchSessionId || null,
    })
    .select('id')
    .single();

  if (error) {
    console.error(`[deep-storage] DB insert error: ${error.message}`);
    return null;
  }
  return data.id;
}

/**
 * Update a record with completed results and write to file.
 * @param {Object} params
 * @returns {Promise<{dbId: string, filePath: string}>}
 */
export async function saveResult({
  recordId,
  query,
  provider,
  model,
  response,
  thinking,
  costUsd,
  durationMs,
  tokensUsed,
  status = 'completed',
  errorMessage,
  triggerSource,
  sdKey,
  ventureId,
  researchSessionId,
}) {
  const supabase = getSupabase();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const slug = slugify(query);

  // Write file
  let filePath = null;
  try {
    ensureResearchDir();
    const fileName = `deep-${timestamp}-${provider}-${slug}.md`;
    filePath = path.join(RESEARCH_DIR, fileName);

    let fileContent = `# Deep Research: ${query}\n`;
    fileContent += `**Provider**: ${provider} (${model})\n`;
    fileContent += `**Date**: ${new Date().toISOString()}\n`;
    fileContent += `**Duration**: ${durationMs}ms | **Cost**: $${(costUsd || 0).toFixed(4)}\n\n`;

    if (thinking) {
      fileContent += `## Thinking\n\n${thinking}\n\n`;
    }
    fileContent += `## Response\n\n${response}\n`;

    fs.writeFileSync(filePath, fileContent, 'utf8');
  } catch (err) {
    console.error(`[deep-storage] File write error: ${err.message}`);
    // Continue — DB record still gets saved
  }

  // Update or insert DB record
  const record = {
    query,
    provider,
    model,
    response: response?.slice(0, 50000) || '',
    status,
    cost_usd: costUsd || 0,
    duration_ms: durationMs || 0,
    tokens_used: tokensUsed || {},
    file_path: filePath ? path.relative(process.cwd(), filePath) : null,
    error_message: errorMessage || null,
    trigger_source: triggerSource || 'manual',
    sd_key: sdKey || null,
    venture_id: ventureId || null,
    research_session_id: researchSessionId || null,
    completed_at: status === 'completed' ? new Date().toISOString() : null,
  };

  if (recordId) {
    const { error } = await supabase
      .from('deep_research_results')
      .update(record)
      .eq('id', recordId);
    if (error) console.error(`[deep-storage] DB update error: ${error.message}`);
    return { dbId: recordId, filePath };
  }

  const { data, error } = await supabase
    .from('deep_research_results')
    .insert(record)
    .select('id')
    .single();

  if (error) console.error(`[deep-storage] DB insert error: ${error.message}`);
  return { dbId: data?.id || null, filePath };
}

/**
 * Write a synthesis file combining all provider results.
 * @param {string} query
 * @param {Object} synthesis - Synthesized results
 * @param {Object[]} providerResults - Individual provider results
 * @returns {string|null} File path
 */
export function writeSynthesisFile(query, synthesis, providerResults) {
  try {
    ensureResearchDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const slug = slugify(query);
    const fileName = `deep-${timestamp}-synthesis-${slug}.md`;
    const filePath = path.join(RESEARCH_DIR, fileName);

    let content = `# Deep Research Synthesis: ${query}\n`;
    content += `**Date**: ${new Date().toISOString()}\n`;
    content += `**Providers**: ${providerResults.map(r => r.provider).join(', ')}\n\n`;

    if (synthesis.executive_takeaways?.length) {
      content += '## Key Takeaways\n\n';
      synthesis.executive_takeaways.forEach(t => { content += `- ${t}\n`; });
      content += '\n';
    }

    if (synthesis.recommended_path) {
      content += `## Recommended Path\n\n${synthesis.recommended_path}\n\n`;
    }

    if (synthesis.confidence_score) {
      content += `**Confidence**: ${synthesis.confidence_score} | **Consensus**: ${synthesis.consensus || 'N/A'}\n\n`;
    }

    content += '## Provider Results\n\n';
    providerResults.forEach(r => {
      content += `### ${r.provider} (${r.model})\n\n`;
      content += `${typeof r.response === 'string' ? r.response.slice(0, 2000) : JSON.stringify(r.data, null, 2).slice(0, 2000)}\n\n`;
    });

    fs.writeFileSync(filePath, content, 'utf8');
    return filePath;
  } catch (err) {
    console.error(`[deep-storage] Synthesis file error: ${err.message}`);
    return null;
  }
}
