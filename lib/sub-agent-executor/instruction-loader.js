/**
 * Instruction Loader
 * Loads and formats sub-agent instructions from database
 *
 * Enhanced with Agent Experience Factory for dynamic knowledge composition
 * SD-LEO-REFACTOR-SUBAGENT-EXEC-001
 * SD-LEO-ORCH-AGENT-EXPERIENCE-FACTORY-001-A
 */

import { getSupabaseClient } from './supabase-client.js';
import { loadRelevantPatterns } from './pattern-loader.js';
import { SUB_AGENT_CATEGORY_MAPPING } from './phase-model-config.js';

/**
 * Load sub-agent instructions from database
 * Enhanced: Composes dynamic knowledge via Agent Experience Factory
 *
 * @param {string} code - Sub-agent code (e.g., 'VALIDATION', 'TESTING', 'DATABASE')
 * @param {Object} [compositionContext] - Context for Agent Experience Factory
 * @param {string} [compositionContext.sessionId] - Session ID for caching
 * @param {string} [compositionContext.sdId] - Current SD ID
 * @param {number} [compositionContext.maxPromptTokens] - Token budget for dynamic knowledge
 * @returns {Promise<Object>} Sub-agent data with formatted instructions
 */
export async function loadSubAgentInstructions(code, compositionContext = {}) {
  console.log(`\nLoading sub-agent instructions: ${code}...`);

  const supabase = await getSupabaseClient();

  const { data: subAgent, error } = await supabase
    .from('leo_sub_agents')
    .select('*')
    .eq('code', code)
    .single();

  if (error) {
    throw new Error(`Failed to load sub-agent ${code} from database: ${error.message}`);
  }

  if (!subAgent) {
    throw new Error(`Sub-agent ${code} not found in database`);
  }

  // LEO Protocol v4.3.2 Enhancement: Load relevant patterns (legacy path)
  const relevantPatterns = await loadRelevantPatterns(code);

  // Agent Experience Factory: Compose dynamic knowledge
  let compositionResult = null;
  if (compositionContext.sessionId) {
    compositionResult = await _composeExperience(code, compositionContext);
  }

  // Format instructions for Claude to read (includes patterns + factory preamble)
  const formatted = formatInstructionsForClaude(subAgent, relevantPatterns, compositionResult);

  console.log(`Loaded: ${subAgent.name} (v${subAgent.metadata?.version || '1.0.0'})`);

  return {
    ...subAgent,
    relevantPatterns,
    compositionResult,
    formatted,
    // SD-LEO-INFRA-SUB-AGENT-EXECUTION-001-A (FR-002): Attach brief injection hook
    injectBrief(briefTemplate) {
      return briefTemplate
        ? `${formatted}\n${briefTemplate}\n`
        : formatted;
    },
  };
}

/**
 * Compose dynamic knowledge via Agent Experience Factory
 * Fail-open: returns null on any error (factory is additive, not blocking)
 * @private
 */
async function _composeExperience(code, context) {
  try {
    const { compose } = await import('../agent-experience-factory/index.js');
    const categories = SUB_AGENT_CATEGORY_MAPPING[code] || [];
    const domain = categories[0] || code.toLowerCase();

    const result = await compose({
      agentCode: code,
      domain,
      category: categories[1] || null,
      sessionId: context.sessionId,
      sdId: context.sdId || null,
      maxPromptTokens: context.maxPromptTokens || 600
    });

    if (result.promptPreamble) {
      console.log(`   [Factory] Composed ${result.metadata.tokenBudgetSummary.estimatedTokensAfter} tokens from ${result.metadata.tokenBudgetSummary.sectionsIncluded} sources (${result.metadata.composeElapsedMs}ms)`);
    }

    return result;
  } catch (err) {
    console.log(`   [Factory] Composition skipped: ${err.message}`);
    return null;
  }
}

/**
 * Format sub-agent instructions for Claude to read
 * LEO Protocol v4.3.2: Now includes relevant patterns and prevention checklists
 * Enhanced: Injects Agent Experience Factory preamble when available
 *
 * @param {Object} subAgent - Sub-agent record from database
 * @param {Array} relevantPatterns - Relevant issue patterns (optional)
 * @param {Object|null} compositionResult - Agent Experience Factory result (optional)
 * @returns {string} Formatted instructions
 */
/**
 * Coerce a proven_solutions entry to displayable text, whatever shape it arrived in.
 *
 * Returns '' (never null/undefined) so the caller's `|| 'No proven solution yet'` fallback is the
 * single place the default lives. Object solutions are unwrapped by preferred key rather than
 * JSON.stringify'd, because "[object Object]" or a raw blob in a sub-agent prompt is noise that
 * looks like content — the pattern text is there to be READ by the agent.
 *
 * @param {Object|null|undefined} entry - a proven_solutions[] element
 * @returns {string}
 */
export function solutionToText(entry) {
  if (!entry) return '';
  for (const candidate of [entry.solution, entry.method]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
    if (candidate && typeof candidate === 'object') {
      for (const key of ['action', 'solution', 'description', 'summary', 'text']) {
        if (typeof candidate[key] === 'string' && candidate[key].trim()) return candidate[key];
      }
      return 'See pattern details';
    }
  }
  return entry.solution || entry.method ? 'See pattern details' : '';
}

export function formatInstructionsForClaude(subAgent, relevantPatterns = [], compositionResult = null) {
  const metadata = subAgent.metadata || {};
  const capabilities = subAgent.capabilities || [];
  const sources = metadata.sources || [];

  // Format pattern section
  let patternSection = '';
  if (relevantPatterns && relevantPatterns.length > 0) {
    patternSection = `
────────────────────────────────────────────────────────────────
KNOWN ISSUES & PROVEN SOLUTIONS (from issue_patterns)
────────────────────────────────────────────────────────────────
`;
    relevantPatterns.forEach((p, i) => {
      const severityIcon = p.severity === 'critical' ? '[CRITICAL]' : p.severity === 'high' ? '[HIGH]' : '[MEDIUM]';
      // `.solution` is an OBJECT in some rows (e.g. {action, is_boilerplate}), so calling
      // .substring on it threw TypeError and killed the WHOLE sub-agent run. The failure then
      // wrote verdict=ERROR/confidence=0, which add-prd-to-database.js renders as
      // "BLOCKED, N CRITICAL sub-agent(s) failed" — a CRASH wearing a REJECTION's clothes, which
      // is worse than the crash: two SDs already shipped through it believing they were reviewed.
      // Same class as the prevention_checklist coercion 15 lines below; handled the same way.
      const topSolution = solutionToText(p.proven_solutions?.[0]) || 'No proven solution yet';

      patternSection += `
${i + 1}. ${severityIcon} [${p.pattern_id}] ${p.issue_summary}
   Category: ${p.category} | Occurrences: ${p.occurrence_count} | Trend: ${p.trend}
   Proven Solution: ${topSolution.substring(0, 100)}${topSolution.length > 100 ? '...' : ''}
`;
    });

    // Add aggregated prevention checklist
    const preventionItems = new Set();
    relevantPatterns.forEach(p => {
      if (p.prevention_checklist) {
        let checklist = p.prevention_checklist;
        // Handle JSONB stored as string (PAT-DATA-TYPE-MISMATCH-001)
        if (typeof checklist === 'string') {
          try { checklist = JSON.parse(checklist); } catch { checklist = null; }
        }
        if (Array.isArray(checklist)) {
          checklist.slice(0, 2).forEach(item => preventionItems.add(item));
        }
      }
    });

    if (preventionItems.size > 0) {
      patternSection += `
────────────────────────────────────────────────────────────────
PREVENTION CHECKLIST (Apply Before Proceeding)
────────────────────────────────────────────────────────────────
`;
      Array.from(preventionItems).slice(0, 5).forEach((item, i) => {
        patternSection += `[ ] ${i + 1}. ${item}\n`;
      });
    }
  }

  return `
════════════════════════════════════════════════════════════════
${subAgent.name} (${subAgent.code})
Version: ${metadata.version || '1.0.0'}
Priority: ${subAgent.priority || 50}
════════════════════════════════════════════════════════════════

${subAgent.description || 'No description available'}

${capabilities.length > 0 ? `
────────────────────────────────────────────────────────────────
CAPABILITIES
────────────────────────────────────────────────────────────────
${capabilities.map((c, i) => `${i + 1}. ${c}`).join('\n')}
` : ''}

${sources.length > 0 ? `
────────────────────────────────────────────────────────────────
LESSONS SOURCES
────────────────────────────────────────────────────────────────
${sources.map((s, i) => `${i + 1}. ${s}`).join('\n')}
` : ''}
${patternSection}
${metadata.success_patterns ? `
────────────────────────────────────────────────────────────────
SUCCESS PATTERNS
────────────────────────────────────────────────────────────────
${metadata.success_patterns.map((p, i) => `${i + 1}. ${p}`).join('\n')}
` : ''}

${metadata.failure_patterns ? `
────────────────────────────────────────────────────────────────
FAILURE PATTERNS TO AVOID
────────────────────────────────────────────────────────────────
${metadata.failure_patterns.map((p, i) => `${i + 1}. ${p}`).join('\n')}
` : ''}
${compositionResult?.promptPreamble || ''}
════════════════════════════════════════════════════════════════
END OF INSTRUCTIONS
════════════════════════════════════════════════════════════════
`;
}
