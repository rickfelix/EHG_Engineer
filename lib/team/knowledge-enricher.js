/**
 * Knowledge Enricher - Task-Specific Knowledge at Spawn Time
 * SD-LEO-INFRA-DATABASE-DRIVEN-DYNAMIC-001, Phase 3
 *
 * Thin wrapper over Agent Experience Factory that adds semantic
 * task-description matching via IssueKnowledgeBase.search().
 * Produces a knowledge block ready to inject into teammate prompts.
 */

import { compose } from '../agent-experience-factory/index.js';
import IssueKnowledgeBase from '../learning/issue-knowledge-base.js';
import { CODE_TO_AGENT_NAME } from '../constants/agent-mappings.js';

const issueKB = new IssueKnowledgeBase();

/**
 * Enrich a teammate prompt with task-specific knowledge.
 *
 * @param {Object} options
 * @param {string} options.agentType - Agent type name (e.g., 'database-agent') or code (e.g., 'DATABASE')
 * @param {string} options.taskDescription - Task description for semantic matching
 * @param {string} [options.sdId] - SD context (optional)
 * @param {string} [options.sessionId] - Session ID (auto-generated if omitted)
 * @param {string} [options.domain] - Domain for AEF (auto-detected from DB category_mappings if omitted)
 * @param {number} [options.maxPromptTokens=1200] - Max tokens for knowledge block
 * @returns {Promise<{knowledgeBlock: string, metadata: Object, summary: string}>}
 */
export async function enrichTeammatePrompt({
  agentType,
  taskDescription,
  sdId: _sdId = null,
  sessionId = null,
  domain = null,
  maxPromptTokens = 1200,
}) {
  // Normalize agent type → code
  const agentCode = agentType.toUpperCase().replace(/-AGENT$/, '').replace(/-/g, '_');
  const agentName = CODE_TO_AGENT_NAME[agentCode] || agentType;

  // 1. Get standard AEF knowledge (category-based)
  let aefResult = { promptPreamble: '', metadata: {} };
  try {
    aefResult = await compose({
      agentCode,
      domain: domain || agentCode.toLowerCase(),
      sessionId: sessionId || `enrich-${Date.now()}`,
      maxPromptTokens: Math.floor(maxPromptTokens * 0.6), // 60% budget for AEF
    });
  } catch (err) {
    // AEF failure is non-fatal — we still have semantic search
    console.warn(`   ⚠️  AEF compose failed for ${agentCode}: ${err.message}`);
  }

  // 2. Semantic task-description matching via IssueKnowledgeBase
  let semanticPatterns = [];
  try {
    semanticPatterns = await issueKB.search(taskDescription, { limit: 3 });
  } catch (err) {
    console.warn(`   ⚠️  Issue KB search failed: ${err.message}`);
  }

  // 3. Compose enriched knowledge block
  const sections = [];

  if (aefResult.promptPreamble) {
    sections.push(aefResult.promptPreamble);
  }

  if (semanticPatterns.length > 0) {
    const patternLines = semanticPatterns.map(p => {
      const solution = Array.isArray(p.proven_solutions) && p.proven_solutions[0]
        ? (typeof p.proven_solutions[0] === 'string'
          ? p.proven_solutions[0]
          : p.proven_solutions[0].solution || '')
        : '';
      return `- **${p.pattern_id}** (score: ${p.overall_score.toFixed(2)}): ${p.issue_summary.substring(0, 120)}${solution ? `\n  Known fix: ${solution.substring(0, 100)}` : ''}`;
    });
    sections.push(`### Task-Relevant Issue Patterns\nMatched by semantic similarity to your task description:\n${patternLines.join('\n')}`);
  }

  const knowledgeBlock = sections.length > 0
    ? `## Enriched Knowledge (Runtime)\n\n${sections.join('\n\n')}`
    : '';

  const summary = [
    aefResult.promptPreamble ? 'AEF knowledge' : null,
    semanticPatterns.length > 0 ? `${semanticPatterns.length} semantic matches` : null,
  ].filter(Boolean).join(' + ') || 'no knowledge available';

  return {
    knowledgeBlock,
    metadata: {
      agentCode,
      agentName,
      aefTokens: aefResult.metadata?.totalTokens || 0,
      semanticMatches: semanticPatterns.length,
      topPattern: semanticPatterns[0]?.pattern_id || null,
    },
    summary,
  };
}
