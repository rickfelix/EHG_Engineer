/**
 * lib/agent-readiness/llm-txt-version-store.js
 * SD-LEO-FEAT-AGENT-READINESS-SERVICE-001 FR-2 / US-004.
 *
 * Persists public.llm_txt_version rows. The publish gate (published_at may only be set when
 * content_lint_passed=true) is enforced by the DB trigger llm_txt_version_publish_only — this
 * module does not re-implement that check, it just must not attempt to bypass it by writing
 * published_at on insert for a lint-failing draft (draftVersion() never sets published_at at all;
 * publishVersion() is a separate, explicit call).
 */

import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function normalizeVentureUrl(url) {
  const trimmed = String(url || '').trim().toLowerCase();
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

/**
 * Insert a draft version (published_at left NULL).
 * @returns {Promise<{id:string}>}
 */
export async function draftVersion({ ventureUrl, content, contentLintPassed, lintReport }) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('llm_txt_version')
    .insert({
      venture_url: normalizeVentureUrl(ventureUrl),
      content,
      content_lint_passed: contentLintPassed,
      lint_report: lintReport || null
    })
    .select('id')
    .single();
  if (error) throw new Error(`llm_txt_version insert failed: ${error.message}`);
  return data;
}

/**
 * Mark a draft published. Refused by the DB trigger if content_lint_passed is false or the version
 * was already published (once-only).
 */
export async function publishVersion(id) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('llm_txt_version')
    .update({ published_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, published_at')
    .single();
  if (error) throw new Error(`llm_txt_version publish refused for ${id}: ${error.message}`);
  return data;
}

/** The live version for a venture: most recently published, per llm_txt_version_live_idx. */
export async function getLiveVersion(ventureUrl) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('llm_txt_version')
    .select('id, content, published_at')
    .eq('venture_url', normalizeVentureUrl(ventureUrl))
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`llm_txt_version live lookup failed: ${error.message}`);
  return data;
}
