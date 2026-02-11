/**
 * Deeper Analysis Router
 * SD: SD-LEO-ENH-EVA-INTAKE-DISPOSITION-001
 *
 * Routes needs_triage items to the appropriate analysis tool based on item characteristics:
 * - Triangulation Protocol: Claims about codebase state ("we already have X", "X is broken")
 * - Multi-Model Debate: Proposals with tradeoffs ("should we use X vs Y?")
 * - Deep Research: Needs exploration of approaches ("how should we implement X?")
 */

/**
 * Analysis tool types
 */
export const ANALYSIS_TOOLS = {
  TRIANGULATION: 'triangulation',
  DEBATE: 'debate',
  RESEARCH: 'research'
};

/**
 * Keyword patterns for routing decisions
 */
const TRIANGULATION_SIGNALS = [
  /already\s+(has|have|exists?|built|implemented)/i,
  /currently\s+(has|have|supports?|uses?)/i,
  /is\s+(broken|failing|not\s+working|down)/i,
  /does\s+(not|n't)\s+(work|exist|support)/i,
  /codebase\s+(has|lacks|missing)/i,
  /we\s+(already|currently)\s+(have|use|support)/i,
  /existing\s+(feature|capability|implementation)/i,
  /duplicate\s+of/i,
  /conflicts?\s+with/i
];

const DEBATE_SIGNALS = [
  /should\s+we\s+(use|adopt|switch|migrate|implement|choose)/i,
  /vs\.?\s/i,
  /versus/i,
  /trade-?offs?/i,
  /pros?\s+and\s+cons?/i,
  /compare|comparison/i,
  /alternative/i,
  /better\s+(approach|way|option|solution)/i,
  /which\s+(is|would\s+be)\s+(better|best|preferred)/i,
  /evaluate\s+(the\s+)?(proposal|approach|option)/i
];

const RESEARCH_SIGNALS = [
  /how\s+(should|could|would|do)\s+we\s+(implement|build|create|design)/i,
  /what\s+(is|are)\s+the\s+best\s+(way|approach|practice)/i,
  /explore|investigation|investigate/i,
  /research\s+(needed|required|first)/i,
  /feasibility/i,
  /prototype|proof\s+of\s+concept|poc/i,
  /what\s+options?\s+(do|are)/i,
  /unknown|uncertain|unclear/i,
  /need\s+to\s+(understand|learn|figure\s+out)/i,
  /architectural?\s+(decision|review|consideration)/i
];

/**
 * Route a needs_triage item to the appropriate deeper analysis tool
 *
 * @param {Object} item - The intake/feedback item
 * @param {string} item.title - Item title
 * @param {string} [item.description] - Item description
 * @param {Object} [item.dispositionResult] - The disposition result from triage
 * @returns {{ tool: string, confidence: number, reasoning: string }}
 */
export function routeToAnalysis(item) {
  const text = `${item.title || ''} ${item.description || ''}`.toLowerCase();

  const scores = {
    [ANALYSIS_TOOLS.TRIANGULATION]: 0,
    [ANALYSIS_TOOLS.DEBATE]: 0,
    [ANALYSIS_TOOLS.RESEARCH]: 0
  };

  // Score each tool based on keyword matches
  for (const pattern of TRIANGULATION_SIGNALS) {
    if (pattern.test(text)) scores[ANALYSIS_TOOLS.TRIANGULATION] += 10;
  }

  for (const pattern of DEBATE_SIGNALS) {
    if (pattern.test(text)) scores[ANALYSIS_TOOLS.DEBATE] += 10;
  }

  for (const pattern of RESEARCH_SIGNALS) {
    if (pattern.test(text)) scores[ANALYSIS_TOOLS.RESEARCH] += 10;
  }

  // Check disposition result for additional hints
  if (item.dispositionResult?.conflict_with) {
    scores[ANALYSIS_TOOLS.TRIANGULATION] += 20;
  }

  if (item.dispositionResult?.suggestion) {
    const suggestion = item.dispositionResult.suggestion.toLowerCase();
    if (suggestion.includes('verify') || suggestion.includes('confirm')) {
      scores[ANALYSIS_TOOLS.TRIANGULATION] += 10;
    }
    if (suggestion.includes('evaluate') || suggestion.includes('compare')) {
      scores[ANALYSIS_TOOLS.DEBATE] += 10;
    }
    if (suggestion.includes('research') || suggestion.includes('explore') || suggestion.includes('investigate')) {
      scores[ANALYSIS_TOOLS.RESEARCH] += 10;
    }
  }

  // Find the winning tool
  const entries = Object.entries(scores);
  entries.sort((a, b) => b[1] - a[1]);

  const [topTool, topScore] = entries[0];
  const [, secondScore] = entries[1];

  // If no signals matched, default to research
  if (topScore === 0) {
    return {
      tool: ANALYSIS_TOOLS.RESEARCH,
      confidence: 30,
      reasoning: 'No clear signals detected; defaulting to research for exploratory analysis'
    };
  }

  // Calculate confidence based on margin between top two
  const margin = topScore - secondScore;
  const confidence = Math.min(95, 50 + margin * 2);

  const toolDescriptions = {
    [ANALYSIS_TOOLS.TRIANGULATION]: 'Codebase verification claim detected; routing to Triangulation Protocol to verify ground truth',
    [ANALYSIS_TOOLS.DEBATE]: 'Proposal with tradeoffs detected; routing to Multi-Model Debate for quality evaluation',
    [ANALYSIS_TOOLS.RESEARCH]: 'Exploration needed; routing to Deep Research for approach investigation'
  };

  return {
    tool: topTool,
    confidence,
    reasoning: toolDescriptions[topTool]
  };
}

/**
 * Get the CLI command or invocation pattern for a given analysis tool
 *
 * @param {string} tool - The analysis tool type
 * @param {Object} item - The item being analyzed
 * @returns {string} The command or invocation pattern
 */
export function getAnalysisCommand(tool, item) {
  const title = item.title || 'Untitled item';

  switch (tool) {
    case ANALYSIS_TOOLS.TRIANGULATION:
      return `/triangulation-protocol "${title}"`;
    case ANALYSIS_TOOLS.DEBATE:
      return `Task tool with subagent_type="rca-agent": "Evaluate tradeoffs for: ${title}"`;
    case ANALYSIS_TOOLS.RESEARCH:
      return `WebSearch: "${title} best practices implementation"`;
    default:
      return `Manual review required for: ${title}`;
  }
}
