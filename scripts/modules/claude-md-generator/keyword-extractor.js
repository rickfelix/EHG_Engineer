/**
 * Keyword Extractor for CLAUDE.md Generator
 *
 * ARCHITECTURE DECISION (2026-01-24):
 * Keywords are stored ONLY in lib/keyword-intent-scorer.js (code-only approach).
 * This extractor reads from that file to generate CLAUDE.md keyword sections.
 *
 * Benefits:
 * - Single source of truth (no database sync needed)
 * - Zero latency at runtime (no database queries)
 * - Simplest possible architecture
 *
 * The database is NOT used for keyword storage or retrieval.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the keyword scorer (source of truth)
const SCORER_PATH = path.join(__dirname, '../../../lib/keyword-intent-scorer.js');

/**
 * Extract AGENT_KEYWORDS object from the scorer file
 * @returns {Object} Agent keywords by agent code
 */
export function extractKeywordsFromScorer() {
  try {
    const content = fs.readFileSync(SCORER_PATH, 'utf-8');

    // Find the AGENT_KEYWORDS object using regex
    // This matches from "const AGENT_KEYWORDS = {" to the closing "};"
    const match = content.match(/const AGENT_KEYWORDS = \{[\s\S]*?\n\};/);

    if (!match) {
      console.warn('[keyword-extractor] Could not find AGENT_KEYWORDS in scorer file');
      return {};
    }

    // Parse the object using Function constructor (safer than eval - no local scope access)
    const keywords = new Function(`return (${match[0].replace('const AGENT_KEYWORDS = ', '').replace(/;$/, '')})`)();

    return keywords;
  } catch (error) {
    console.error('[keyword-extractor] Error reading scorer file:', error.message);
    return {};
  }
}

/**
 * Get flattened keyword list for an agent (for display in CLAUDE.md)
 * @param {Object} agentKeywords - Keywords object with primary/secondary/tertiary
 * @param {number} limit - Max keywords to return
 * @returns {string[]} Flattened keyword list
 */
export function flattenKeywords(agentKeywords, limit = 10) {
  const all = [
    ...(agentKeywords.primary || []),
    ...(agentKeywords.secondary || []),
    ...(agentKeywords.tertiary || [])
  ];
  return all.slice(0, limit);
}

/**
 * Generate trigger quick reference table from scorer keywords
 * @returns {string} Formatted markdown table
 */
export function generateKeywordQuickReference() {
  const keywords = extractKeywordsFromScorer();

  if (Object.keys(keywords).length === 0) {
    return '## Sub-Agent Trigger Keywords (Quick Reference)\n\n*Keywords not available*\n';
  }

  let section = `## Sub-Agent Trigger Keywords (Quick Reference)

**CRITICAL**: When user query contains these keywords, PROACTIVELY invoke the corresponding sub-agent via Task tool.

| Sub-Agent | Trigger Keywords |
|-----------|------------------|
`;

  // Sort agents alphabetically
  const sortedAgents = Object.keys(keywords).sort();

  for (const agent of sortedAgents) {
    const agentKw = keywords[agent];
    const flat = flattenKeywords(agentKw, 3);
    const moreCount = (agentKw.primary?.length || 0) +
                      (agentKw.secondary?.length || 0) +
                      (agentKw.tertiary?.length || 0) - flat.length;

    let keywordStr = flat.join(', ');
    if (moreCount > 0) {
      keywordStr += ` (+${moreCount} more)`;
    }

    section += `| \`${agent}\` | ${keywordStr} |\n`;
  }

  section += `
*Full trigger list in CLAUDE_CORE.md. Use Task tool with \`subagent_type="<agent-code>"\`*
`;

  return section;
}

/**
 * Get keyword statistics
 * @returns {Object} Stats about keywords
 */
export function getKeywordStats() {
  const keywords = extractKeywordsFromScorer();
  const agents = Object.keys(keywords);

  let totalPrimary = 0;
  let totalSecondary = 0;
  let totalTertiary = 0;

  for (const agent of agents) {
    totalPrimary += keywords[agent].primary?.length || 0;
    totalSecondary += keywords[agent].secondary?.length || 0;
    totalTertiary += keywords[agent].tertiary?.length || 0;
  }

  return {
    agentCount: agents.length,
    totalKeywords: totalPrimary + totalSecondary + totalTertiary,
    primary: totalPrimary,
    secondary: totalSecondary,
    tertiary: totalTertiary
  };
}

export default {
  extractKeywordsFromScorer,
  flattenKeywords,
  generateKeywordQuickReference,
  getKeywordStats
};
