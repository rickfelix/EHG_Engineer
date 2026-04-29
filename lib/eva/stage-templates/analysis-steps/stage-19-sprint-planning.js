/**
 * Stage 18 Analysis Step - Sprint Planning
 * Phase: THE BUILD LOOP (Stages 17-22)
 * Part of SD-EVA-FEAT-TEMPLATES-BUILDLOOP-001
 *
 * Consumes Stage 17 readiness + Stages 13-14 roadmap/architecture to generate
 * sprint items with SD bridge payloads, architecture layer mapping, and milestone refs.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-19-sprint-planning
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';
import { resolveTargetApplication } from '../../bridge/sd-router.js';
import { inferDeviceType } from '../../bridge/device-type-resolver.js';
import { EHG_VENTURE_DEFAULT_CAPABILITIES } from '../../config/venture-default-capabilities.js';
import { validateVentureDefaultCapabilities, MissingDefaultCapabilityError } from '../../utils/validate-venture-default-capabilities.js';

// NOTE: These constants intentionally duplicated from stage-19.js
// to avoid circular dependency — stage-19.js imports analyzeStage19 from this file,
// and SYSTEM_PROMPT uses these constants at module-level evaluation.
const PRIORITY_VALUES = ['critical', 'high', 'medium', 'low'];
const SD_TYPES = ['feature', 'bugfix', 'enhancement', 'refactor', 'infra'];
const APP_TYPE_VALUES = ['mobile', 'web', 'desktop', 'tablet', 'agnostic'];
const ARCHITECTURE_LAYERS = ['frontend', 'backend', 'database', 'infrastructure', 'integration', 'security'];
const MIN_SPRINT_ITEMS = 1;

/**
 * Resolve dominant app type from Stage 15 wireframe screen data.
 * Uses majority vote of inferDeviceType() across screens.
 * Returns 'agnostic' when no data available.
 *
 * @param {Object} [stage15Data] - Stage 15 wireframe data
 * @returns {string} One of APP_TYPE_VALUES
 */
function resolveAppType(stage15Data) {
  if (!stage15Data) return 'agnostic';

  const screens = stage15Data.screens || stage15Data.wireframes || [];
  if (!Array.isArray(screens) || screens.length === 0) return 'agnostic';

  const counts = {};
  for (const screen of screens) {
    const deviceType = inferDeviceType(screen).toLowerCase();
    // Map Stitch device types to app_type values
    const appType = deviceType === 'desktop' ? 'web' : deviceType;
    counts[appType] = (counts[appType] || 0) + 1;
  }

  // Return majority vote, excluding 'agnostic' unless it's the only type
  const sorted = Object.entries(counts)
    .filter(([type]) => type !== 'agnostic')
    .sort((a, b) => b[1] - a[1]);

  return sorted.length > 0 ? sorted[0][0] : 'agnostic';
}

// Render EHG_VENTURE_DEFAULT_CAPABILITIES as inline prompt text. Imported
// from config so updates flow from one source. SD-LEO-ENH-CONSTRAIN-STAGE-EMIT-001.
const MANDATORY_CAPABILITIES_BLOCK = EHG_VENTURE_DEFAULT_CAPABILITIES
  .map((c, i) => `  ${i + 1}. "${c.name}" (capability_id: ${c.capability_id}, ${c.story_points} story points, priority: ${c.priority})
     Description: ${c.description}
     Acceptance criteria: ${c.acceptance_criteria}`)
  .join('\n');

const SYSTEM_PROMPT = `You are EVA's Sprint Planning Engine. Generate a sprint plan with actionable items that bridge to the LEO Protocol SD system.

You MUST output valid JSON with exactly this structure:
{
  "sprintGoal": "One-sentence goal for this sprint",
  "sprintItems": [
    {
      "title": "Sprint item title",
      "description": "What needs to be built (2-3 sentences)",
      "type": "feature|bugfix|enhancement|refactor|infra",
      "priority": "critical|high|medium|low",
      "estimatedLoc": 150,
      "acceptanceCriteria": "How to verify this item is done",
      "architectureLayer": "frontend|backend|database|infrastructure|integration|security",
      "milestoneRef": "Which roadmap milestone this supports",
      "designReference": {
        "wireframeName": "Name of the wireframe screen this item implements (from Stage 17 blueprint, or null)",
        "designLayer": "Which design layer applies: layout|branding|interaction|content"
      }
    }
  ]
}

Rules:
- Generate at least ${MIN_SPRINT_ITEMS} sprint item(s)
- Each item must have all required fields
- estimatedLoc should be realistic (50-500 for typical items)
- architectureLayer must reference the technical architecture from Stage 14
- milestoneRef should reference a Stage 13 roadmap milestone (use "now" tier milestone if available)
- Sprint goal should be specific and measurable
- Items should be ordered by priority (critical first)
- Each item should be independently deliverable
- designReference: If wireframe screens are available from the blueprint review (Stage 17), map each sprint item to the most relevant wireframe screen name and design layer. Set wireframeName to null if no wireframe applies.
- CRITICAL: At least one sprint item MUST have type "feature" that delivers core user-facing value. Infrastructure, refactoring, and bugfix items are important but a sprint with ONLY non-feature items fails to advance the venture toward its product goal.
- MANDATORY: Include a sprint item for a user-facing landing page or demo page that stakeholders can review. This artifact is required to pass the Stage 20 stakeholder review gate. The item should produce an accessible URL (e.g., /index.html, /demo, or /) that demonstrates the venture's core value proposition.
- MANDATORY (EHG portfolio defaults — SD-LEO-ENH-CONSTRAIN-STAGE-EMIT-001): You MUST always include the following EHG_VENTURE_DEFAULT_CAPABILITIES entries as sprintItems alongside venture-specific work, unless default_capabilities_override is set in user input authorizing omission of a specific capability:

${MANDATORY_CAPABILITIES_BLOCK}

  Reserve ~3 story points for the mandatory items; size venture-specific feature items to fit the remaining sprint budget. These are portfolio-default capabilities (chairman-level cross-venture quality visibility) and are not optional except via authorized override. Use the exact "name" string for each item's title so downstream validation can identify them.`;

/**
 * Generate sprint plan from readiness + blueprint data.
 *
 * @param {Object} params
 * @param {Object} params.stage18Data - Build readiness assessment
 * @param {Object} [params.stage17Data] - Blueprint review (quality scores, gap analysis)
 * @param {Object} [params.stage13Data] - Product roadmap
 * @param {Object} [params.stage14Data] - Technical architecture
 * @param {Object} [params.stage15Data] - Wireframe data (screens with device type info)
 * @param {string} [params.ventureName]
 * @param {number} [params.sprintIteration=0] - Current sprint iteration number (0 = first sprint)
 * @returns {Promise<Object>} Sprint plan with SD bridge items
 */
export async function analyzeStage19({ stage18Data, stage17Data, stage13Data, stage14Data, stage15Data, ventureName, sprintIteration = 0, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage19] Starting sprint planning analysis', { ventureName, sprintIteration });
  if (!stage18Data) {
    throw new Error('Stage 19 sprint planning requires Stage 18 (build readiness) data');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  const readinessContext = stage18Data.buildReadiness
    ? `Readiness: ${stage18Data.buildReadiness.decision} — ${stage18Data.buildReadiness.rationale || ''}`
    : '';

  // Blueprint review context from stage 17 (quality scores, gap analysis)
  const blueprintContext = stage17Data?.quality_scores
    ? `Blueprint Review: score ${stage17Data.quality_scores.overall || 'N/A'}/100, gaps: ${(stage17Data.gaps || []).map(g => g.area || g).join(', ') || 'none'}`
    : stage17Data?.decision
      ? `Blueprint Review: ${stage17Data.decision} — ${stage17Data.rationale || ''}`
      : '';

  const roadmapContext = stage13Data?.milestones
    ? `Roadmap milestones:\n${stage13Data.milestones.slice(0, 5).map(m => {
        const name = m.name || m.title || String(m);
        const desc = m.description || m.deliverables || '';
        const criteria = m.success_criteria || m.successCriteria || '';
        return `- ${name}${desc ? ': ' + String(desc).substring(0, 200) : ''}${criteria ? ' [Success: ' + String(criteria).substring(0, 150) + ']' : ''}`;
      }).join('\n')}`
    : '';

  const archContext = stage14Data?.layers
    ? `Architecture: ${stage14Data.total_components || 'N/A'} components across ${stage14Data.layer_count || Object.keys(stage14Data.layers).length} layers\n${Object.entries(stage14Data.layers).slice(0, 6).map(([layer, def]) => {
        const components = Array.isArray(def?.components) ? def.components.map(c => c.name || c).join(', ') : '';
        const responsibility = def?.responsibility || def?.description || '';
        return `- ${layer}${responsibility ? ': ' + String(responsibility).substring(0, 150) : ''}${components ? ' [Components: ' + components.substring(0, 150) + ']' : ''}`;
      }).join('\n')}`
    : '';

  // Venture problem/solution context for value-driven sprint planning
  const ventureContext = [];
  if (stage18Data?.ventureDescription || stage18Data?.description) {
    ventureContext.push(`Description: ${String(stage18Data.ventureDescription || stage18Data.description).substring(0, 300)}`);
  }
  if (stage18Data?.problemStatement || stage18Data?.problem) {
    ventureContext.push(`Problem: ${String(stage18Data.problemStatement || stage18Data.problem).substring(0, 300)}`);
  }
  if (stage18Data?.solutionHypothesis || stage18Data?.solution) {
    ventureContext.push(`Solution: ${String(stage18Data.solutionHypothesis || stage18Data.solution).substring(0, 300)}`);
  }
  const ventureContextStr = ventureContext.length > 0
    ? `Venture Context:\n${ventureContext.join('\n')}`
    : '';

  const sprintIterationContext = sprintIteration > 0
    ? `Sprint Iteration: ${sprintIteration} (previous sprints focused on infrastructure — this sprint MUST prioritize core user-facing features)`
    : '';

  // Build brief context from Stage 17 synthesis (SD-LEO-FEAT-STAGE-BUILD-BRIEF-001)
  const brief = stage17Data?.build_brief;
  const buildBriefContext = brief
    ? `Build Context:\n${[
        brief.problem_and_value && `Problem/Value: ${brief.problem_and_value}`,
        brief.customer_personas && `Personas: ${brief.customer_personas}`,
        brief.business_model && `Business Model: ${brief.business_model}`,
        brief.competitive_edge && `Competitive Edge: ${brief.competitive_edge}`,
        brief.pricing_strategy && `Pricing: ${brief.pricing_strategy}`,
        brief.gtm_strategy && `GTM: ${brief.gtm_strategy}`,
        brief.srip && `SRIP: ${brief.srip}`,
        brief.product_roadmap && `Roadmap: ${brief.product_roadmap}`,
      ].filter(Boolean).join('\n')}`
    : '';

  // Resolve dominant app type from Stage 15 wireframe data BEFORE building
  // platformContext (which references it). Was declared further down at the
  // post-LLM normalization block, causing a TDZ ReferenceError ("Cannot access
  // 'appType' before initialization") on every call. Caught live during the
  // S18→S19 chairman approval on 2026-04-28.
  const appType = resolveAppType(stage15Data);

  const platformContext = appType !== 'agnostic'
    ? `Platform Target: ${appType} (derived from wireframe analysis — prioritize ${appType}-appropriate UI patterns and frameworks)`
    : '';

  // Marketing copy context from Stage 18 (Marketing Copy Studio output).
  // The S18→S26 redesign (SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-B)
  // reframed S18 from "Build Readiness checklist" to "Marketing Copy Studio" —
  // the chairman-approved copy is the BINDING CONTRACT for what S19's sprint
  // items must deliver. Without these reads, the legacy `buildReadiness` /
  // `ventureDescription` paths (kept below for back-compat) silently fall
  // through to empty strings and the marketing-first vision is unenforced.
  // Read via __byType to avoid field collision when multiple marketing
  // artifacts merge into one stage18Data object.
  const marketingByType = stage18Data?.__byType || {};
  const marketingCopyParts = [];
  if (marketingByType.marketing_tagline?.text) {
    marketingCopyParts.push(`Tagline: "${marketingByType.marketing_tagline.text}"`);
  }
  if (marketingByType.marketing_landing_hero) {
    const hero = marketingByType.marketing_landing_hero;
    marketingCopyParts.push(
      `Landing Hero: headline="${hero.headline || ''}" subheadline="${hero.subheadline || ''}" cta="${hero.cta_text || ''}"`
    );
  }
  if (marketingByType.marketing_app_store_desc?.text) {
    marketingCopyParts.push(
      `App Store Description: ${String(marketingByType.marketing_app_store_desc.text).substring(0, 400)}`
    );
  }
  if (marketingByType.marketing_email_welcome) {
    const w = marketingByType.marketing_email_welcome;
    marketingCopyParts.push(
      `Welcome Email: subject="${w.subject || ''}" body="${String(w.body || '').substring(0, 200)}"`
    );
  }
  if (marketingByType.marketing_seo_meta?.keywords?.length) {
    marketingCopyParts.push(`SEO Keywords: ${marketingByType.marketing_seo_meta.keywords.join(', ')}`);
  }
  const personaTarget =
    marketingByType.marketing_tagline?.persona_target ||
    marketingByType.marketing_landing_hero?.persona_target ||
    marketingByType.marketing_app_store_desc?.persona_target ||
    null;
  if (personaTarget) {
    marketingCopyParts.push(`Approved Persona Target: ${personaTarget}`);
  }
  const marketingCopyContext = marketingCopyParts.length > 0
    ? `Approved Marketing Copy (S18 — chairman-approved binding contract for the build):\n${marketingCopyParts.join('\n')}`
    : '';

  const userPrompt = `Generate a sprint plan for this venture.

Venture: ${ventureName || 'Unnamed'}
${sprintIterationContext}
${platformContext}
${marketingCopyContext}
${ventureContextStr}
${buildBriefContext}
${readinessContext}
${blueprintContext}
${roadmapContext}
${archContext}

CRITICAL: The Approved Marketing Copy above (when present) is the
chairman-approved binding contract for what this build must deliver.
Sprint items MUST implement features that fulfill the promises made in
the marketing copy:
- The landing hero CTA must exist as a working, clickable feature
- The app store description's claimed features must be buildable in this sprint
- The welcome email's value proposition must be deliverable from the user's
  first session (i.e., onboarding flow exists by end of sprint)
- The named Approved Persona Target is the user the sprint items must serve;
  reject sprint items that primarily serve other personas

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { timeout: 120000 });
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  // Normalize sprint goal
  const sprintGoal = String(parsed.sprintGoal || 'Complete initial build sprint').substring(0, 300);

  // Normalize sprint items
  let sprintItems = Array.isArray(parsed.sprintItems)
    ? parsed.sprintItems.filter(item => item?.title)
    : [];

  if (sprintItems.length < MIN_SPRINT_ITEMS) {
    sprintItems = [{
      title: 'Initial Build Task',
      description: 'First implementation task from roadmap',
      type: 'feature',
      priority: 'high',
      estimatedLoc: 200,
      acceptanceCriteria: 'Feature implemented and tested',
      architectureLayer: 'backend',
      milestoneRef: 'MVP',
    }];
  } else {
    sprintItems = sprintItems.map(item => ({
      title: String(item.title).substring(0, 200),
      description: String(item.description || '').substring(0, 500),
      type: SD_TYPES.includes(item.type) ? item.type : 'feature',
      priority: PRIORITY_VALUES.includes(item.priority) ? item.priority : 'medium',
      estimatedLoc: typeof item.estimatedLoc === 'number' && item.estimatedLoc > 0
        ? Math.min(2000, Math.round(item.estimatedLoc))
        : 200,
      acceptanceCriteria: String(item.acceptanceCriteria || 'Item completed').substring(0, 500),
      architectureLayer: ARCHITECTURE_LAYERS.includes(item.architectureLayer)
        ? item.architectureLayer
        : 'backend',
      milestoneRef: String(item.milestoneRef || 'MVP').substring(0, 200),
    }));
  }

  // Value gate: verify sprint includes at least one core value-delivering feature
  const hasValueFeature = sprintItems.some(item => item.type === 'feature');
  if (!hasValueFeature) {
    logger.warn('[Stage19] VALUE GATE: Sprint contains no feature-type items — only infrastructure/refactor/bugfix tasks. Ventures need at least one core value-delivering feature per sprint.');
  }

  // Track LLM fallback fields
  let llmFallbackCount = 0;
  if (!hasValueFeature) llmFallbackCount++;
  if (!parsed.sprintGoal || String(parsed.sprintGoal).length < 10) llmFallbackCount++;
  if (!Array.isArray(parsed.sprintItems) || parsed.sprintItems.length < MIN_SPRINT_ITEMS) llmFallbackCount++;
  for (const item of parsed.sprintItems || []) {
    if (!SD_TYPES.includes(item?.type)) llmFallbackCount++;
    if (!PRIORITY_VALUES.includes(item?.priority)) llmFallbackCount++;
  }
  if (llmFallbackCount > 0) {
    logger.warn('[Stage19] LLM fallback fields detected', { llmFallbackCount });
  }

  // Resolve venture routing from registry (replaces hardcoded 'ehg')
  const routing = resolveTargetApplication(ventureName, { logger });

  // appType resolved earlier (before platformContext, see comment there).
  if (appType !== 'agnostic') {
    logger.log('[Stage19] App type resolved from Stage 15 wireframes', { appType });
  }

  // Transform sprint items to match template schema
  const items = sprintItems.map(item => ({
    title: item.title,
    description: item.description,
    priority: item.priority,
    type: item.type,
    scope: String(item.architectureLayer || 'general').substring(0, 200),
    success_criteria: String(item.acceptanceCriteria || 'Item completed').substring(0, 500),
    dependencies: [],
    risks: [],
    target_application: routing.targetApp,
    story_points: typeof item.estimatedLoc === 'number' ? Math.ceil(item.estimatedLoc / 50) : 3,
    app_type: appType,
    architectureLayer: item.architectureLayer,
    milestoneRef: item.milestoneRef,
  }));

  // Compute derived fields (these live in computeDerived but that path is dead code when analysisStep exists)
  const total_items = items.length;
  const total_story_points = items.reduce((sum, item) => sum + (item.story_points || 0), 0);

  // Generate SD bridge payloads
  const sd_bridge_payloads = items.map(item => ({
    title: item.title,
    description: item.description,
    priority: item.priority,
    type: item.type,
    scope: item.scope,
    success_criteria: item.success_criteria,
    dependencies: item.dependencies,
    risks: item.risks,
    target_application: item.target_application,
    app_type: item.app_type,
  }));

  logger.log('[Stage19] Analysis complete', { duration: Date.now() - startTime });
  return {
    // Tells the eva-orchestrator persistence layer (eva-orchestrator.js:438)
    // which artifact_type to write. Without this, the orchestrator falls
    // through to ARTIFACT_TYPE_BY_STAGE[19] which has no entry and throws.
    // Caught live during S18→S19 chairman approval on 2026-04-28.
    artifactType: 'blueprint_sprint_plan',
    sprint_name: `Sprint ${new Date().toISOString().slice(0, 10)}`,
    sprint_duration_days: 14,
    sprint_goal: sprintGoal,
    items,
    total_items,
    total_story_points,
    sd_bridge_payloads,
    app_type: appType,
    llmFallbackCount,
    hasValueFeature,
    sprintIteration,
    fourBuckets, usage,
  };
}


export { PRIORITY_VALUES, SD_TYPES, APP_TYPE_VALUES, ARCHITECTURE_LAYERS, MIN_SPRINT_ITEMS, resolveAppType };
