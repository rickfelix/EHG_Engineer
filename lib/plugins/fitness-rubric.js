/**
 * Plugin Fitness Rubric
 * SD: SD-CAPABILITYAWARE-SCANNERS-AND-ANTHROPIC-ORCH-001-C
 *
 * Evaluates discovered plugins using format validation and heuristic keyword scoring.
 * No LLM calls in v1 — pure heuristic approach.
 */

// EHG-relevant keywords for heuristic scoring (weighted)
const RELEVANCE_KEYWORDS = {
  high: ['financial', 'investment', 'portfolio', 'venture', 'analysis', 'evaluation', 'scoring', 'assessment'],
  medium: ['data', 'api', 'integration', 'automation', 'workflow', 'agent', 'tool', 'search'],
  low: ['demo', 'example', 'tutorial', 'template', 'starter', 'hello'],
};

const WEIGHT = { high: 3, medium: 2, low: 1 };
const MAX_SCORE = 10;

/**
 * Evaluate a plugin's fitness for EHG adaptation.
 *
 * @param {Object} plugin - Plugin record from anthropic_plugin_registry
 * @param {Object} [metadata] - Optional metadata from GitHub (README content, file list)
 * @returns {{score: number, evaluation: Object}}
 */
export function evaluatePlugin(plugin, metadata = {}) {
  const formatResult = checkFormat(plugin, metadata);
  const relevanceScore = scoreRelevance(plugin, metadata);
  const securityResult = checkSecurity(plugin, metadata);

  const score = Math.min(MAX_SCORE, Math.round(
    (formatResult.compatible ? 3 : 0) +
    relevanceScore +
    (securityResult.ok ? 2 : 0)
  ));

  return {
    score,
    evaluation: {
      relevance: relevanceScore,
      format_compatible: formatResult.compatible,
      format_details: formatResult.details,
      security_ok: securityResult.ok,
      security_notes: securityResult.notes,
      adaptation_notes: generateAdaptationNotes(plugin, formatResult, relevanceScore),
    },
  };
}

/**
 * Check if the plugin has a recognizable format.
 */
function checkFormat(plugin, metadata) {
  const path = (plugin.source_path || '').toLowerCase();
  const files = metadata.files || [];

  const hasConfig = files.some(f =>
    f.endsWith('.json') || f.endsWith('.yaml') || f.endsWith('.yml')
  );
  const hasReadme = files.some(f =>
    f.toLowerCase().startsWith('readme')
  );
  const isDir = plugin.source_path && !plugin.source_path.includes('.');

  return {
    compatible: hasConfig || isDir,
    details: {
      has_config: hasConfig,
      has_readme: hasReadme,
      is_directory: isDir,
    },
  };
}

/**
 * Score EHG relevance using keyword matching.
 * Returns 0-5 based on keyword matches in plugin name, path, and metadata.
 */
function scoreRelevance(plugin, metadata) {
  const text = [
    plugin.plugin_name,
    plugin.source_path,
    metadata.description || '',
    metadata.readme || '',
  ].join(' ').toLowerCase();

  let score = 0;
  for (const [tier, keywords] of Object.entries(RELEVANCE_KEYWORDS)) {
    for (const kw of keywords) {
      if (text.includes(kw)) {
        score += WEIGHT[tier];
      }
    }
  }

  return Math.min(5, Math.round(score));
}

/**
 * Basic security check (heuristic only).
 */
function checkSecurity(plugin, metadata) {
  const files = metadata.files || [];
  const suspicious = files.some(f => {
    const name = f.toLowerCase();
    return name.includes('.env') || name.includes('credentials') || name.includes('secret');
  });

  return {
    ok: !suspicious,
    notes: suspicious ? 'Contains potentially sensitive files' : 'No security concerns detected',
  };
}

/**
 * Generate adaptation notes based on evaluation results.
 */
function generateAdaptationNotes(plugin, formatResult, relevanceScore) {
  const notes = [];
  if (relevanceScore >= 4) notes.push('High EHG relevance — prioritize adaptation');
  else if (relevanceScore >= 2) notes.push('Moderate relevance — review before adapting');
  else notes.push('Low relevance — may not be worth adapting');

  if (!formatResult.compatible) notes.push('Non-standard format — manual adaptation needed');
  if (formatResult.details.has_readme) notes.push('Has README — review for integration guidance');

  return notes.join('. ');
}

export { RELEVANCE_KEYWORDS, MAX_SCORE };
