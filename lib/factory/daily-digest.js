/**
 * Daily Digest Generator
 *
 * Generates a chairman-facing summary of portfolio health across all ventures.
 * Shows errors found, SDs created, corrections applied per venture.
 *
 * SD: SD-LEO-INFRA-SOFTWARE-FACTORY-AUTOMATED-001
 */

import { createSupabaseServiceClient } from '../supabase-client.js';

/**
 * Generate a daily digest of portfolio health.
 *
 * @returns {Promise<object>} Digest with per-venture summaries
 */
export async function generateDigest() {
  const supabase = createSupabaseServiceClient();
  const since = new Date(Date.now() - 24 * 3600000).toISOString();

  // Fetch active ventures
  const { data: ventures } = await supabase
    .from('ventures')
    .select('id, name')
    .eq('status', 'active');

  if (!ventures?.length) return { ventures: [], summary: 'No active ventures.' };

  const ventureSummaries = [];

  for (const venture of ventures) {
    // Errors found in last 24h
    const { count: errorsFound } = await supabase
      .from('feedback')
      .select('id', { count: 'exact', head: true })
      .eq('source_application', venture.name)
      .gte('created_at', since);

    // Corrective SDs created in last 24h
    const { count: sdsCreated } = await supabase
      .from('strategic_directives_v2')
      .select('id', { count: 'exact', head: true })
      .eq('category', 'corrective')
      .gte('created_at', since);

    // Guardrail state
    const { data: guardrailState } = await supabase
      .from('factory_guardrail_state')
      .select('corrections_today, kill_switch_active')
      .eq('venture_id', venture.id)
      .single();

    ventureSummaries.push({
      name: venture.name,
      errorsFound: errorsFound || 0,
      sdsCreated: sdsCreated || 0,
      correctionsToday: guardrailState?.corrections_today || 0,
      killSwitchActive: guardrailState?.kill_switch_active || false
    });
  }

  const totalErrors = ventureSummaries.reduce((sum, v) => sum + v.errorsFound, 0);
  const totalSDs = ventureSummaries.reduce((sum, v) => sum + v.sdsCreated, 0);

  return {
    generatedAt: new Date().toISOString(),
    period: '24h',
    ventures: ventureSummaries,
    summary: `${ventures.length} ventures monitored. ${totalErrors} errors detected, ${totalSDs} corrective SDs created.`
  };
}

/**
 * Format digest as readable text for chairman consumption.
 */
export function formatDigest(digest) {
  const lines = [
    'Software Factory — Daily Digest',
    '================================',
    `Generated: ${digest.generatedAt}`,
    `Period: Last ${digest.period}`,
    '',
    digest.summary,
    ''
  ];

  for (const v of digest.ventures) {
    const killSwitch = v.killSwitchActive ? ' [KILL SWITCH ACTIVE]' : '';
    lines.push(`${v.name}${killSwitch}`);
    lines.push(`  Errors: ${v.errorsFound} | SDs: ${v.sdsCreated} | Corrections: ${v.correctionsToday}/3`);
  }

  return lines.join('\n');
}
