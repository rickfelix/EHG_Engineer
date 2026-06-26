/**
 * Stage 13 Analysis Step - Product Roadmap Generation
 * Part of SD-EVA-FEAT-TEMPLATES-BLUEPRINT-001
 *
 * Consumes Stages 1-12 data and generates a structured product roadmap
 * with milestones prioritized as now/next/later.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-13-product-roadmap
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';
// evaluateKillGate is a hoisted function declaration, safe for circular dependency import.
// stage-13.js imports analyzeStage13 from this file; this file imports evaluateKillGate back.
import { evaluateKillGate } from '../stage-13.js';
import { sanitizeForPrompt } from '../../utils/sanitize-for-prompt.js';
import { EHG_VENTURE_DEFAULT_CAPABILITIES } from '../../config/venture-default-capabilities.js';

// NOTE: MIN_MILESTONES intentionally duplicated from stage-13.js to avoid circular dependency —
// stage-13.js imports analyzeStage13 from this file, and SYSTEM_PROMPT uses ${MIN_MILESTONES}
// at module-level evaluation.
const MIN_MILESTONES = 3;
const VALID_PRIORITIES = ['now', 'next', 'later'];

// Render EHG_VENTURE_DEFAULT_CAPABILITIES as inline exclusion text. Imported from config so
// updates flow from one source. SD-LEO-INFRA-S13-ROADMAP-DEFAULT-CAPABILITIES-CONSTRAINT-001.
// Inverse of the MANDATORY_CAPABILITIES_BLOCK in stage-19-sprint-planning.js: S19 mandates
// presence; S13 mandates absence (these are standard auto-injected at S19, not bespoke milestones).
const EXCLUDED_CAPABILITIES_BLOCK = EHG_VENTURE_DEFAULT_CAPABILITIES
  .map((c, i) => `  ${i + 1}. "${c.name}" (capability_id: ${c.capability_id})\n     ${c.description}`)
  .join('\n');

const SYSTEM_PROMPT = `You are EVA's Product Roadmap Engine. Generate a structured product roadmap for a venture based on analysis from prior stages.

You MUST output valid JSON with exactly this structure:
{
  "vision_statement": "Clear product vision statement (min 20 chars)",
  "milestones": [
    {
      "name": "Milestone name",
      "date": "YYYY-MM-DD",
      "deliverables": ["Deliverable 1", "Deliverable 2"],
      "dependencies": ["Dependency if any"],
      "priority": "now|next|later"
    }
  ],
  "phases": [
    {
      "name": "Phase name",
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD"
    }
  ]
}

Rules:
- Generate at least ${MIN_MILESTONES} milestones
- Each milestone MUST have priority: "now", "next", or "later"
- "now" = immediate (0-3 months), "next" = near-term (3-6 months), "later" = future (6+ months)
- Each milestone MUST have at least 1 deliverable
- Dates must span at least 3 months total
- Use upstream financial/market/competitive data to inform priority
- Milestones should be concrete and actionable, not vague
- At least 1 phase grouping the milestones

EXCLUDED (EHG portfolio defaults — SD-LEO-INFRA-S13-ROADMAP-DEFAULT-CAPABILITIES-CONSTRAINT-001): The following capabilities are standard EHG portfolio defaults auto-injected at Stage 19 Sprint Planning. They are NOT bespoke product work and must NOT appear as roadmap milestones:

${EXCLUDED_CAPABILITIES_BLOCK}

  Do NOT list any of the above as roadmap milestones. Focus milestones on venture-specific build priorities only.`;

/**
 * Generate a product roadmap from upstream stage data.
 *
 * @param {Object} params
 * @param {Object} params.stage1Data - Stage 1 Draft Idea
 * @param {Object} [params.stage5Data] - Stage 5 financial model
 * @param {Object} [params.stage8Data] - Stage 8 BMC
 * @param {Object} [params.stage9Data] - Stage 9 exit strategy
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} Product roadmap
 */
export async function analyzeStage13({ stage1Data, stage5Data, stage8Data, stage9Data, ventureName, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage13] Starting analysis', { ventureName });
  if (!stage1Data?.description) {
    throw new Error('Stage 13 product roadmap requires Stage 1 data with description');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  const financialContext = stage5Data
    ? `Financial Model:
  Initial Investment: $${stage5Data.initialInvestment || 'N/A'}
  Year 1 Revenue: $${stage5Data.year1?.revenue || 'N/A'}
  Break-even: Month ${stage5Data.breakEvenMonth || 'N/A'}`
    : 'No financial model available';

  const bmcContext = stage8Data
    ? `BMC: ${Object.keys(stage8Data).filter(k => stage8Data[k]?.items?.length > 0).length}/9 blocks populated`
    : '';

  const exitContext = stage9Data?.exit_paths
    ? `Exit Strategies: ${stage9Data.exit_paths.length} defined`
    : '';

  const userPrompt = `Generate a product roadmap for this venture.

Venture: ${ventureName || 'Unnamed'}
Description: ${sanitizeForPrompt(stage1Data.description)}
Target Market: ${sanitizeForPrompt(stage1Data.targetMarket || 'N/A')}
Problem: ${sanitizeForPrompt(stage1Data.problemStatement || 'N/A')}

${financialContext}
${bmcContext}
${exitContext}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { timeout: 120000 });
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  if (!Array.isArray(parsed.milestones) || parsed.milestones.length === 0) {
    throw new Error('Stage 13 product roadmap: LLM returned no milestones');
  }

  // Normalize milestones
  const normalizedMilestones = parsed.milestones.map((m, i) => ({
    name: String(m.name || `Milestone ${i + 1}`).substring(0, 200),
    date: String(m.date || ''),
    deliverables: Array.isArray(m.deliverables) && m.deliverables.length > 0
      ? m.deliverables.map(d => String(d).substring(0, 300))
      : ['TBD'],
    dependencies: Array.isArray(m.dependencies) ? m.dependencies.map(d => String(d)) : [],
    priority: VALID_PRIORITIES.includes(m.priority) ? m.priority : 'later',
  }));

  // Belt-and-suspenders: strip any milestone that matches an EHG portfolio default
  // capability (they are auto-injected at S19 and must not appear as bespoke milestones).
  // SD-LEO-INFRA-S13-ROADMAP-DEFAULT-CAPABILITIES-CONSTRAINT-001
  const stripped = excludeDefaultCapabilityMilestones(normalizedMilestones);
  if (stripped.length < normalizedMilestones.length) {
    logger.warn('[Stage13] Stripped default-capability milestones from roadmap', {
      count: normalizedMilestones.length - stripped.length,
      ventureName,
    });
  }
  const milestones = stripped;

  // Normalize phases
  const phases = Array.isArray(parsed.phases) && parsed.phases.length > 0
    ? parsed.phases.map(p => ({
      name: String(p.name || 'Phase').substring(0, 200),
      start_date: String(p.start_date || ''),
      end_date: String(p.end_date || ''),
    }))
    : [{ name: 'Phase 1', start_date: milestones[0]?.date || '', end_date: milestones[milestones.length - 1]?.date || '' }];

  const vision_statement = String(parsed.vision_statement || '').length >= 20
    ? String(parsed.vision_statement).substring(0, 500)
    : `Product roadmap for ${ventureName || 'venture'}: ${sanitizeForPrompt(stage1Data.description.substring(0, 200))}`;

  // Compute aggregate metrics
  const priorityCounts = { now: 0, next: 0, later: 0 };
  for (const m of milestones) {
    priorityCounts[m.priority] = (priorityCounts[m.priority] || 0) + 1;
  }

  // Track LLM fallback fields
  let llmFallbackCount = 0;
  if (!Array.isArray(parsed.milestones) || parsed.milestones.length < MIN_MILESTONES) llmFallbackCount++;
  if (!Array.isArray(parsed.phases) || parsed.phases.length === 0) llmFallbackCount++;
  if (!parsed.vision_statement || String(parsed.vision_statement).length < 20) llmFallbackCount++;
  if (llmFallbackCount > 0) {
    logger.warn('[Stage13] LLM fallback fields detected', { llmFallbackCount });
  }

  // Compute timeline from milestone dates for kill gate
  const dates = milestones.map(m => new Date(m.date)).filter(d => !isNaN(d.getTime()));
  let timeline_months = 0;
  if (dates.length >= 2) {
    const earliest = new Date(Math.min(...dates));
    const latest = new Date(Math.max(...dates));
    timeline_months = Math.round((latest.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  }

  // Evaluate kill gate (moved from dead-code computeDerived)
  const { decision, blockProgression, reasons } = evaluateKillGate({
    milestone_count: milestones.length,
    milestones,
    timeline_months,
  });

  logger.log('[Stage13] Analysis complete', { duration: Date.now() - startTime, decision });
  return {
    vision_statement,
    milestones,
    phases,
    timeline_months,
    milestone_count: milestones.length,
    decision,
    blockProgression,
    reasons,
    priorityCounts,
    totalMilestones: milestones.length,
    totalPhases: phases.length,
    llmFallbackCount,
    fourBuckets, usage,
  };
}


/**
 * Return true if the milestone matches an EHG portfolio default capability.
 * Uses the same permissive case-insensitive matching as isCapabilityPresent in
 * validate-venture-default-capabilities.js, applied in the inverse direction.
 *
 * @param {Object} milestone - Normalized milestone object with .name
 * @returns {boolean}
 */
function isDefaultCapabilityMilestone(milestone) {
  const title = String(milestone.name || '').toLowerCase();
  if (!title) return false;
  for (const cap of EHG_VENTURE_DEFAULT_CAPABILITIES) {
    const nameLower = String(cap.name || '').toLowerCase();
    const idLower = String(cap.capability_id || '').toLowerCase();
    const idNoHyphens = idLower.replace(/-/g, ' ');
    if (
      title.startsWith(nameLower) ||
      title.includes(idLower) ||
      title.includes(idNoHyphens) ||
      nameLower.split(' ').slice(-2).every(w => title.includes(w))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Filter out any milestones that match EHG_VENTURE_DEFAULT_CAPABILITIES entries.
 * These are auto-injected at Stage 19 and should not appear as bespoke roadmap milestones.
 *
 * @param {Array} milestones - Normalized milestone array
 * @returns {Array} Milestones with default-capability entries removed
 */
export function excludeDefaultCapabilityMilestones(milestones) {
  if (!Array.isArray(milestones)) return milestones;
  return milestones.filter(m => !isDefaultCapabilityMilestone(m));
}

export { MIN_MILESTONES, VALID_PRIORITIES, EXCLUDED_CAPABILITIES_BLOCK };
