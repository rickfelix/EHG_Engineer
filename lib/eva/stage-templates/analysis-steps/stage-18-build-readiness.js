/**
 * Stage 18 Analysis Step - Build Readiness Assessment
 * Phase: THE BUILD LOOP (Stages 18-22)
 * Part of SD-EVA-FEAT-TEMPLATES-BUILDLOOP-001
 *
 * Consumes Stages 13-17 (blueprint) data and generates a build readiness
 * assessment with checklist synthesis, blocker analysis, and go/no-go decision.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-18-build-readiness
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';

// NOTE: These constants intentionally duplicated from stage-17.js
// to avoid circular dependency — stage-17.js imports analyzeStage17 from this file,
// and SYSTEM_PROMPT uses these constants at module-level evaluation.
const READINESS_DECISIONS = ['go', 'conditional_go', 'no_go'];
const PRIORITY_LEVELS = ['critical', 'high', 'medium', 'low'];
const SEVERITY_LEVELS = ['critical', 'high', 'medium', 'low'];
const CHECKLIST_CATEGORIES = ['architecture', 'team_readiness', 'tooling', 'environment', 'dependencies'];
const MIN_READINESS_ITEMS = 3;
const MIN_CATEGORIES = 3;

const SYSTEM_PROMPT = `You are EVA's Build Readiness Analyst. Assess whether a venture is ready to begin its build sprint based on blueprint-phase outputs.

You MUST output valid JSON with exactly this structure:
{
  "readinessItems": [
    {
      "name": "Item name (e.g., Architecture Design Complete)",
      "description": "What this item covers",
      "status": "complete|in_progress|not_started|blocked",
      "priority": "critical|high|medium|low",
      "category": "architecture|team_readiness|tooling|environment|dependencies"
    }
  ],
  "blockers": [
    {
      "description": "What is blocking progress",
      "owner": "Who must resolve this",
      "severity": "critical|high|medium|low"
    }
  ],
  "buildReadiness": {
    "decision": "go|conditional_go|no_go",
    "rationale": "2-3 sentence explanation of the decision",
    "conditions": ["Condition that must be met (only if conditional_go)"]
  }
}

Rules:
- Generate at least ${MIN_READINESS_ITEMS} readiness items across at least ${MIN_CATEGORIES} categories
- Each item must have a clear status and priority
- Blockers should only include items with status "blocked"
- buildReadiness.decision: "go" if all critical/high items complete, "conditional_go" if non-critical items pending, "no_go" if critical blockers exist
- conditions array is required if decision is "conditional_go", empty otherwise
- Assess architecture, team readiness, tooling, environment, and dependencies
- Base assessment on the venture's roadmap, technical architecture, and resource plan`;

/**
 * Generate build readiness assessment from blueprint-phase data.
 *
 * @param {Object} params
 * @param {Object} params.stage13Data - Product roadmap
 * @param {Object} [params.stage14Data] - Technical architecture
 * @param {Object} [params.stage15Data] - Resource planning
 * @param {Object} [params.stage16Data] - Financial projections
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} Build readiness assessment
 */
export async function analyzeStage17({ stage13Data, stage14Data, stage15Data, stage16Data, ventureName, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage17] Starting analysis', { ventureName });
  if (!stage13Data) {
    throw new Error('Stage 17 build readiness requires Stage 13 (product roadmap) data');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  const roadmapContext = stage13Data.milestones
    ? `Milestones: ${JSON.stringify(stage13Data.milestones.slice(0, 5))}`
    : `Roadmap: ${JSON.stringify(stage13Data).substring(0, 500)}`;

  const archContext = stage14Data?.layers
    ? `Architecture: ${stage14Data.total_components || 'N/A'} components across ${stage14Data.layer_count || 5} layers (${Object.keys(stage14Data.layers).join(', ')})`
    : '';

  const riskContext = stage15Data?.risks
    ? `Risks: ${stage15Data.total_risks || stage15Data.risks.length} identified (${stage15Data.severity_breakdown?.critical || 0} critical, ${stage15Data.severity_breakdown?.high || 0} high)`
    : '';

  const financialContext = stage16Data
    ? `Runway: ${stage16Data.runway_months || 'N/A'} months, Burn: $${stage16Data.burn_rate || 'N/A'}/mo`
    : '';

  const userPrompt = `Assess build readiness for this venture.

Venture: ${ventureName || 'Unnamed'}
${roadmapContext}
${archContext}
${riskContext}
${financialContext}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { timeout: 120000 });
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  // Normalize readiness items
  let readinessItems = Array.isArray(parsed.readinessItems)
    ? parsed.readinessItems.filter(item => item?.name)
    : [];

  if (readinessItems.length < MIN_READINESS_ITEMS) {
    readinessItems = [
      { name: 'Architecture Design', description: 'System architecture defined', status: 'complete', priority: 'critical', category: 'architecture' },
      { name: 'Development Environment', description: 'Dev environment configured', status: 'complete', priority: 'high', category: 'environment' },
      { name: 'Dependency Audit', description: 'Dependencies identified and vetted', status: 'in_progress', priority: 'medium', category: 'dependencies' },
    ];
  } else {
    readinessItems = readinessItems.map(item => ({
      name: String(item.name).substring(0, 200),
      description: String(item.description || '').substring(0, 500),
      status: ['complete', 'in_progress', 'not_started', 'blocked'].includes(item.status) ? item.status : 'not_started',
      priority: PRIORITY_LEVELS.includes(item.priority) ? item.priority : 'medium',
      category: ['architecture', 'team_readiness', 'tooling', 'environment', 'dependencies'].includes(item.category) ? item.category : 'architecture',
    }));
  }

  // Normalize blockers (template expects mitigation, not just owner)
  const blockers = Array.isArray(parsed.blockers)
    ? parsed.blockers.filter(b => b?.description).map(b => ({
        description: String(b.description).substring(0, 500),
        severity: SEVERITY_LEVELS.includes(b.severity) ? b.severity : 'medium',
        mitigation: String(b.mitigation || b.owner || 'TBD').substring(0, 500),
      }))
    : [];

  // Track LLM fallback fields
  let llmFallbackCount = 0;
  if (!Array.isArray(parsed.readinessItems) || parsed.readinessItems.length < MIN_READINESS_ITEMS) llmFallbackCount++;
  for (const item of parsed.readinessItems || []) {
    if (!['complete', 'in_progress', 'not_started', 'blocked'].includes(item?.status)) llmFallbackCount++;
    if (!CHECKLIST_CATEGORIES.includes(item?.category)) llmFallbackCount++;
  }
  if (llmFallbackCount > 0) {
    logger.warn('[Stage17] LLM fallback fields detected', { llmFallbackCount });
  }

  // Transform flat readinessItems into checklist object grouped by category
  const checklist = {};
  for (const cat of CHECKLIST_CATEGORIES) {
    checklist[cat] = readinessItems
      .filter(item => item.category === cat)
      .map(item => ({
        name: item.name,
        status: item.status,
        owner: item.owner || '',
        notes: item.description || '',
      }));
    // Ensure at least 1 item per category
    if (checklist[cat].length === 0) {
      checklist[cat] = [{ name: `${cat} assessment`, status: 'not_started', owner: '', notes: '' }];
    }
  }

  // Compute derived fields (these live in computeDerived but that path is dead code when analysisStep exists)
  let total_items = 0;
  let completed_items = 0;
  let categoriesPresent = 0;
  for (const cat of CHECKLIST_CATEGORIES) {
    const items = checklist[cat] || [];
    if (items.length > 0) categoriesPresent++;
    total_items += items.length;
    completed_items += items.filter(item => item.status === 'complete').length;
  }
  const readiness_pct = total_items > 0
    ? Math.round((completed_items / total_items) * 10000) / 100
    : 0;
  const all_categories_present = categoriesPresent === CHECKLIST_CATEGORIES.length;
  const blocker_count = blockers.length;

  // Normalize buildReadiness decision
  const br = parsed.buildReadiness || {};
  const hasCriticalBlockers = blockers.some(b => b.severity === 'critical');
  let decision;
  if (READINESS_DECISIONS.includes(br.decision)) {
    decision = br.decision;
  } else if (hasCriticalBlockers) {
    decision = 'no_go';
  } else if (blocker_count > 0 || readiness_pct < 100) {
    decision = 'conditional_go';
  } else {
    decision = 'go';
  }
  const conditions = decision === 'conditional_go' && Array.isArray(br.conditions)
    ? br.conditions.map(c => String(c).substring(0, 300))
    : [];

  const buildReadiness = {
    decision,
    rationale: String(br.rationale || (decision === 'go'
      ? 'All checklist items complete, no blockers'
      : decision === 'no_go'
        ? `Critical blockers present (${blocker_count} blocker(s))`
        : `Readiness at ${readiness_pct}% with ${blocker_count} non-critical blocker(s)`)).substring(0, 500),
    conditions,
  };

  logger.log('[Stage17] Analysis complete', { duration: Date.now() - startTime });
  return {
    checklist,
    blockers,
    total_items,
    completed_items,
    readiness_pct,
    all_categories_present,
    blocker_count,
    buildReadiness,
    llmFallbackCount,
    fourBuckets, usage,
  };
}


export { READINESS_DECISIONS, PRIORITY_LEVELS, SEVERITY_LEVELS, MIN_READINESS_ITEMS };
