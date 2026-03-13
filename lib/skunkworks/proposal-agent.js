/**
 * Proposal Agent — LLM-powered proposal synthesis with template fallback
 * Takes aggregated signals and generates structured R&D proposals.
 *
 * SD: SD-AUTONOMOUS-SKUNKWORKS-RD-DEPARTMENT-ORCH-001-A (FR-005)
 */

import { getLLMClient } from '../llm/client-factory.js';

/**
 * Generate proposals from aggregated signals.
 * Uses LLM for synthesis; falls back to template-based generation on failure.
 *
 * @param {Object} deps - { supabase, logger }
 * @param {Array} signals - Array of signal objects from readers
 * @returns {Promise<Array<Object>>} Array of proposal objects ready for DB insertion
 */
export async function generateProposals(deps, signals) {
  const { logger = console } = deps;

  if (!signals || signals.length === 0) {
    logger.log('[proposal-agent] No signals to process');
    return [];
  }

  // Sort signals by priority descending, take top 10
  const topSignals = [...signals]
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 10);

  try {
    const proposals = await generateWithLLM(deps, topSignals);
    logger.log(`[proposal-agent] LLM generated ${proposals.length} proposals`);
    return proposals;
  } catch (err) {
    logger.warn(`[proposal-agent] LLM failed (${err.message}), falling back to templates`);
    return generateFromTemplates(topSignals);
  }
}

async function generateWithLLM(deps, signals) {
  const { logger = console } = deps;
  const client = getLLMClient('haiku');

  const signalSummary = signals.map((s, i) =>
    `${i + 1}. [${s.type}] ${s.title} (priority: ${Math.round(s.priority)})\n   Evidence: ${JSON.stringify(s.evidence)}`
  ).join('\n\n');

  const prompt = `You are a research director at a venture evaluation platform. Given these signals from our automated monitoring, generate R&D experiment proposals.

SIGNALS:
${signalSummary}

For each proposal, output valid JSON (array of objects). Each object must have:
- title: concise experiment title
- hypothesis: what we expect to discover
- methodology: brief approach description
- expected_outcome: what success looks like
- priority_score: 0-100 based on signal urgency and potential impact
- signal_source: which signal type generated this ("calibration", "codebase_health", "venture_portfolio", or "composite")

Group related signals into single proposals where appropriate. Aim for 3-7 proposals total.
Output ONLY the JSON array, no surrounding text.`;

  const response = await client.messages.create({
    model: client._model || 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0]?.text || '';
  // Extract JSON array from response
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('No JSON array in LLM response');

  const parsed = JSON.parse(match[0]);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Empty or invalid proposal array');
  }

  return parsed.map(p => ({
    title: p.title || 'Untitled proposal',
    hypothesis: p.hypothesis || 'Hypothesis pending',
    methodology: p.methodology,
    expected_outcome: p.expected_outcome,
    priority_score: Math.max(0, Math.min(100, Number(p.priority_score) || 50)),
    signal_source: ['calibration', 'codebase_health', 'venture_portfolio', 'composite'].includes(p.signal_source)
      ? p.signal_source : 'composite',
    evidence: signals
      .filter(s => s.type === p.signal_source || p.signal_source === 'composite')
      .map(s => s.evidence)
      .slice(0, 5),
  }));
}

function generateFromTemplates(signals) {
  const proposals = [];
  const byType = {};

  for (const s of signals) {
    if (!byType[s.type]) byType[s.type] = [];
    byType[s.type].push(s);
  }

  for (const [type, typeSignals] of Object.entries(byType)) {
    const top = typeSignals[0];
    const template = TEMPLATES[type] || TEMPLATES.default;

    proposals.push({
      title: template.title(top),
      hypothesis: template.hypothesis(top),
      methodology: template.methodology,
      expected_outcome: template.expected_outcome,
      priority_score: Math.round(top.priority),
      signal_source: type,
      evidence: typeSignals.map(s => s.evidence).slice(0, 5),
    });
  }

  return proposals;
}

const TEMPLATES = {
  calibration: {
    title: (s) => `Investigate ${s.evidence?.dimension || 'scoring'} dimension accuracy`,
    hypothesis: (s) => `Recalibrating the ${s.evidence?.dimension || 'scoring'} dimension will improve gate prediction accuracy`,
    methodology: 'Run controlled experiment comparing current vs adjusted dimension weights',
    expected_outcome: 'Improved correlation between dimension scores and gate outcomes',
  },
  codebase_health: {
    title: (s) => `Address ${s.evidence?.dimension || 'code quality'} degradation`,
    hypothesis: (s) => `Targeted refactoring of ${s.evidence?.dimension || 'degraded'} areas will reverse declining health scores`,
    methodology: 'Identify root cause of score decline, implement targeted fixes, measure improvement',
    expected_outcome: 'Health score returns to warning threshold or above',
  },
  venture_portfolio: {
    title: (s) => `Re-evaluate ${s.evidence?.venture_name || 'stale'} venture progression`,
    hypothesis: (s) => `Fresh evaluation with updated criteria will clarify path forward for ${s.evidence?.venture_name || 'stagnant ventures'}`,
    methodology: 'Run re-evaluation with current scoring dimensions, compare to original scores',
    expected_outcome: 'Clear go/no-go decision for stale ventures',
  },
  default: {
    title: (s) => `Investigate: ${s.title}`,
    hypothesis: (s) => 'Addressing the identified signal will improve system reliability',
    methodology: 'Analyze root cause, propose and test remediation',
    expected_outcome: 'Signal resolved or mitigated',
  },
};
