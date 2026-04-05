/**
 * Vision Readiness Rubric - Pre-SD Creation Decision Gate
 *
 * Routes work items to: QUICK_FIX (≤7), DIRECT_SD (8-12), or VISION_FIRST (≥13)
 * based on 4 dimensions scored 1-5 each. Artifact-sourced SDs skip via loop-breaking.
 *
 * @module scripts/modules/vision-readiness-rubric
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { isMainModule } from '../../lib/utils/is-main-module.js';

dotenv.config();

/** Sources that skip the rubric (loop-breaking — upstream governance proven). */
const EXEMPT_SOURCES = new Set(['plan', 'child', 'uat', 'feedback', 'learn']);

/** Risk keywords that force DIRECT_SD minimum (never Quick Fix). */
const RISK_KEYWORDS = [
  'auth', 'authentication', 'authorization', 'rbac', 'rls',
  'migration', 'schema', 'database',
  'security', 'vulnerability', 'cve', 'injection',
  'pipeline', 'ci/cd', 'deployment',
];

/** Vision-first signal keywords — work needing strategic alignment. */
const VISION_SIGNAL_KEYWORDS = [
  'redesign', 'rebuild', 'overhaul', 'rethink', 'rearchitect',
  'new system', 'new pipeline', 'new workflow', 'new platform',
  'vision', 'strategy', 'roadmap', 'initiative',
  'cross-cutting', 'end-to-end', 'holistic',
  'multi-phase', 'orchestrator',
];

function scoreScopeBreadth(title, description, type, estimatedLoc) {
  const combined = `${title} ${description}`.toLowerCase();
  let score = 2;
  const reasons = [];

  const systemKeywords = ['pipeline', 'integration', 'cross-cutting', 'end-to-end',
    'workflow', 'orchestrat', 'multi-', 'across'];
  const systemHits = systemKeywords.filter(k => combined.includes(k));
  if (systemHits.length >= 2) { score = Math.max(score, 4); reasons.push(`multi-system signals: ${systemHits.join(', ')}`); }
  else if (systemHits.length === 1) { score = Math.max(score, 3); reasons.push(`system signal: ${systemHits[0]}`); }

  const componentKeywords = ['component', 'module', 'service', 'table', 'endpoint', 'page', 'route', 'worker', 'agent', 'sub-agent'];
  if (componentKeywords.filter(k => combined.includes(k)).length >= 3) { score = Math.max(score, 4); reasons.push('multiple component types'); }

  if (estimatedLoc > 400) { score = Math.max(score, 4); reasons.push(`high LOC estimate: ${estimatedLoc}`); }
  else if (estimatedLoc > 200) { score = Math.max(score, 3); reasons.push(`moderate LOC estimate: ${estimatedLoc}`); }
  else if (estimatedLoc <= 75) { score = Math.min(score, 2); reasons.push(`small LOC estimate: ${estimatedLoc}`); }

  if (['typo', 'rename', 'config', 'env', 'lint', 'format'].some(k => combined.includes(k))) {
    score = Math.min(score, 2); reasons.push('narrow scope signal');
  }
  if (type === 'fix' || type === 'documentation') { score = Math.min(score, 3); reasons.push(`${type} SDs tend to have narrower scope`); }

  return { score: Math.min(5, Math.max(1, score)), rationale: reasons.join('; ') || 'default moderate scope' };
}

function scoreNovelty(title, description, type) {
  const combined = `${title} ${description}`.toLowerCase();
  let score = 2;
  const reasons = [];

  const novelKeywords = ['new', 'create', 'build', 'introduce', 'design', 'redesign', 'architect', 'rethink', 'overhaul', 'from scratch'];
  const novelHits = novelKeywords.filter(k => combined.includes(k));
  if (novelHits.length >= 2) { score = Math.max(score, 4); reasons.push(`novelty signals: ${novelHits.join(', ')}`); }
  else if (novelHits.length === 1) { score = Math.max(score, 3); reasons.push(`novelty signal: ${novelHits[0]}`); }

  const domainKeywords = ['new venture', 'new platform', 'new system', 'new pipeline', 'new capability', 'new domain'];
  if (domainKeywords.some(k => combined.includes(k))) { score = 5; reasons.push('new domain/capability'); }

  const incrementalKeywords = ['fix', 'patch', 'update', 'tweak', 'adjust', 'bump', 'upgrade', 'cleanup', 'refactor', 'polish'];
  const incrementalHits = incrementalKeywords.filter(k => combined.includes(k));
  if (incrementalHits.length > 0 && novelHits.length === 0) { score = Math.min(score, 2); reasons.push(`incremental signals: ${incrementalHits.join(', ')}`); }

  if (type === 'fix') { score = Math.min(score, 2); reasons.push('fix type = low novelty'); }
  else if (type === 'feature') { score = Math.max(score, 3); reasons.push('feature type = moderate+ novelty'); }

  return { score: Math.min(5, Math.max(1, score)), rationale: reasons.join('; ') || 'default moderate novelty' };
}

/**
 * Score vision coverage (INVERTED: high score = LOW coverage = needs vision).
 * 1=covered, 2=partial, 3=adjacent, 4=no coverage, 5=conflicts with existing
 */
async function scoreVisionCoverage(title, description) {
  let score = 3;
  const reasons = [];
  let relatedVisionKeys = [];

  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return { score: 3, rationale: 'no DB connection', relatedVisionKeys: [] };

    const sb = createClient(url, key);
    const { data: visions, error } = await sb
      .from('eva_vision_documents')
      .select('vision_key, content, level, chairman_approved')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error || !visions || visions.length === 0) {
      return { score: 4, rationale: 'no active vision documents — new territory', relatedVisionKeys: [] };
    }

    const workWords = `${title} ${description}`.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    let bestOverlap = 0;
    let bestVisionKey = null;

    for (const vision of visions) {
      const visionContent = (vision.content || '').toLowerCase();
      const overlap = workWords.filter(w => visionContent.includes(w)).length;
      const overlapRatio = workWords.length > 0 ? overlap / workWords.length : 0;
      if (overlapRatio > bestOverlap) { bestOverlap = overlapRatio; bestVisionKey = vision.vision_key; }
      if (overlapRatio > 0.3) relatedVisionKeys.push(vision.vision_key);
    }

    let hasArchPlan = false;
    if (relatedVisionKeys.length > 0) {
      const { data: anyArchPlans } = await sb.from('eva_architecture_plans').select('plan_key').eq('status', 'active').limit(5);
      hasArchPlan = anyArchPlans && anyArchPlans.length > 0;
    }

    if (bestOverlap >= 0.5) {
      score = hasArchPlan ? 1 : 2;
      reasons.push(`strong overlap (${(bestOverlap * 100).toFixed(0)}%) with ${bestVisionKey}`);
      if (hasArchPlan) reasons.push('architecture plan exists');
    } else if (bestOverlap >= 0.3) { score = 2; reasons.push(`partial overlap (${(bestOverlap * 100).toFixed(0)}%) with ${bestVisionKey}`); }
    else if (bestOverlap >= 0.15) { score = 3; reasons.push(`weak overlap (${(bestOverlap * 100).toFixed(0)}%) with ${bestVisionKey}`); }
    else { score = 4; reasons.push('minimal overlap with existing visions'); }
  } catch (err) { reasons.push(`vision lookup error: ${err.message}`); score = 3; }

  return { score: Math.min(5, Math.max(1, score)), rationale: reasons.join('; ') || 'unknown coverage', relatedVisionKeys };
}

function scoreDecompositionLikelihood(title, description, type, estimatedLoc) {
  const combined = `${title} ${description}`.toLowerCase();
  let score = 2;
  const reasons = [];

  const orchKeywords = ['phase', 'multi-phase', 'orchestrator', 'stages', 'step 1', 'step 2', 'multiple', 'several', 'sequence'];
  const orchHits = orchKeywords.filter(k => combined.includes(k));
  if (orchHits.length >= 2) { score = Math.max(score, 4); reasons.push(`orchestrator signals: ${orchHits.join(', ')}`); }
  else if (orchHits.length === 1) { score = Math.max(score, 3); reasons.push(`decomposition signal: ${orchHits[0]}`); }

  if (estimatedLoc > 800) { score = 5; reasons.push(`very high LOC (${estimatedLoc}) — orchestrator almost certain`); }
  else if (estimatedLoc > 400) { score = Math.max(score, 4); reasons.push(`high LOC (${estimatedLoc}) — likely needs children`); }
  else if (estimatedLoc > 200) { score = Math.max(score, 3); reasons.push(`moderate LOC (${estimatedLoc}) — may need 2-3 children`); }
  else if (estimatedLoc <= 100) { score = Math.min(score, 2); reasons.push(`low LOC (${estimatedLoc}) — single SD likely`); }

  const visionHits = VISION_SIGNAL_KEYWORDS.filter(k => combined.includes(k));
  if (visionHits.length >= 2) { score = Math.max(score, 4); reasons.push(`strategic scope signals: ${visionHits.join(', ')}`); }

  if (type === 'fix' || type === 'documentation') { score = Math.min(score, 2); reasons.push(`${type} SDs rarely need decomposition`); }

  return { score: Math.min(5, Math.max(1, score)), rationale: reasons.join('; ') || 'default low decomposition likelihood' };
}

/**
 * Evaluate whether work should go through Vision→Architecture pipeline before creating an SD.
 * @param {Object} input - { title, description, type, source, estimatedLoc, visionKey, archKey }
 * @returns {Promise<Object>} Rubric result with route, dimensions, and AskUserQuestion payload
 */
export async function evaluateVisionReadiness(input) {
  const { title = '', description = '', type = 'feature', source = 'interactive', estimatedLoc = 0, visionKey = null, archKey = null } = input;

  const lowerSource = (source || '').toLowerCase();
  if (EXEMPT_SOURCES.has(lowerSource)) {
    return { route: 'EXEMPT', exemptReason: `Source "${source}" has upstream governance provenance`, totalScore: 0,
      dimensions: null, summary: `Skipped: ${source} sources are exempt from vision readiness evaluation.`,
      hasExistingVision: false, relatedVisionKeys: [], askUserQuestionPayload: null };
  }
  if (visionKey) {
    return { route: 'EXEMPT', exemptReason: `Explicit --vision-key "${visionKey}" provided`, totalScore: 0,
      dimensions: null, summary: `Skipped: SD is already linked to vision document ${visionKey}.`,
      hasExistingVision: true, relatedVisionKeys: [visionKey], askUserQuestionPayload: null };
  }
  if (archKey) {
    return { route: 'EXEMPT', exemptReason: `Explicit --arch-key "${archKey}" provided`, totalScore: 0,
      dimensions: null, summary: `Skipped: SD is already linked to architecture plan ${archKey}.`,
      hasExistingVision: true, relatedVisionKeys: [], askUserQuestionPayload: null };
  }

  const scopeBreadth = scoreScopeBreadth(title, description, type, estimatedLoc);
  const novelty = scoreNovelty(title, description, type);
  const visionCoverage = await scoreVisionCoverage(title, description);
  const decomposition = scoreDecompositionLikelihood(title, description, type, estimatedLoc);

  const dimensions = { scopeBreadth, novelty, visionCoverage, decompositionLikelihood: decomposition };
  const totalScore = scopeBreadth.score + novelty.score + visionCoverage.score + decomposition.score;

  const combined = `${title} ${description}`.toLowerCase();
  const hasRiskKeywords = RISK_KEYWORDS.some(k => combined.includes(k));

  let route, summary;
  if (totalScore <= 7 && !hasRiskKeywords) {
    route = 'QUICK_FIX';
    summary = `Score ${totalScore}/20 — small, well-scoped work. Quick Fix recommended.`;
  } else if (totalScore >= 13) {
    route = 'VISION_FIRST';
    summary = `Score ${totalScore}/20 — strategic scope, ${visionCoverage.score >= 4 ? 'no existing vision coverage' : 'complex decomposition likely'}. Vision→Architecture pipeline recommended before SD creation.`;
  } else {
    route = 'DIRECT_SD';
    summary = `Score ${totalScore}/20 — moderate scope with ${visionCoverage.score <= 2 ? 'existing vision coverage' : 'clear implementation path'}. Direct SD creation appropriate.`;
  }

  const askUserQuestionPayload = buildRubricConfirmation(route, totalScore, dimensions, hasRiskKeywords, visionCoverage.relatedVisionKeys);

  return { route, exemptReason: null, totalScore, dimensions, summary,
    hasExistingVision: visionCoverage.relatedVisionKeys.length > 0,
    relatedVisionKeys: visionCoverage.relatedVisionKeys, askUserQuestionPayload };
}

function buildRubricConfirmation(route, totalScore, dimensions, hasRiskKeywords, relatedVisionKeys) {
  const scoreSummary = `Scope: ${dimensions.scopeBreadth.score}/5 | Novelty: ${dimensions.novelty.score}/5 | Vision Gap: ${dimensions.visionCoverage.score}/5 | Decomposition: ${dimensions.decompositionLikelihood.score}/5`;
  const visionNote = relatedVisionKeys.length > 0 ? `\nRelated visions: ${relatedVisionKeys.join(', ')}` : '\nNo existing vision documents cover this area.';

  const optionSets = {
    QUICK_FIX: [
      { label: 'Create Quick Fix (Recommended)', description: 'Streamlined workflow. No LEAD review, no PRD.' },
      { label: 'Create Direct SD', description: 'Full LEAD→PLAN→EXEC workflow.' },
      { label: 'Vision-First (Override)', description: 'Start with brainstorm → vision → architecture pipeline.' },
    ],
    VISION_FIRST: [
      { label: 'Start Vision Pipeline (Recommended)', description: 'Begin with /brainstorm → vision → architecture → orchestrator.' },
      { label: 'Create Direct SD (Override)', description: 'Skip vision pipeline, go straight to SD creation.' },
    ],
    DIRECT_SD: [
      { label: 'Create SD (Recommended)', description: 'Full LEAD→PLAN→EXEC workflow.' },
      { label: 'Start Vision Pipeline', description: 'Begin with /brainstorm → vision → architecture first.' },
      { label: 'Create Quick Fix', description: 'Streamlined workflow if scope is smaller than estimated.' },
    ],
  };

  const routeLabels = { QUICK_FIX: 'Quick Fix recommended', VISION_FIRST: 'Vision-First pipeline recommended', DIRECT_SD: 'Direct SD creation appropriate' };
  const riskWarning = hasRiskKeywords ? '\n⚠️ Risk keywords detected — minimum DIRECT_SD' : '';

  return {
    questions: [{
      question: `Vision Readiness: ${totalScore}/20 — ${routeLabels[route]}.\n${scoreSummary}${visionNote}${riskWarning}`,
      header: 'Work Item Routing',
      multiSelect: false,
      options: optionSets[route],
    }],
  };
}

/** Format rubric result for CLI display. */
export function formatRubricResult(result) {
  if (result.route === 'EXEMPT') return `   ⤳ Vision Readiness: EXEMPT (${result.exemptReason})`;

  const d = result.dimensions;
  const lines = [
    '╔══════════════════════════════════════════════════╗',
    '║          VISION READINESS ASSESSMENT             ║',
    '╚══════════════════════════════════════════════════╝',
    `  Total Score:     ${result.totalScore}/20`,
    `  Route:           ${result.route}`,
    '',
    '  Dimensions:',
    `    Scope Breadth:    ${d.scopeBreadth.score}/5  ${d.scopeBreadth.rationale}`,
    `    Novelty:          ${d.novelty.score}/5  ${d.novelty.rationale}`,
    `    Vision Gap:       ${d.visionCoverage.score}/5  ${d.visionCoverage.rationale}`,
    `    Decomposition:    ${d.decompositionLikelihood.score}/5  ${d.decompositionLikelihood.rationale}`,
    '',
    `  ${result.summary}`,
  ];
  if (result.relatedVisionKeys.length > 0) lines.push(`  Related Visions: ${result.relatedVisionKeys.join(', ')}`);
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.length === 0) {
    console.log('Usage: node scripts/modules/vision-readiness-rubric.js --title "<title>" [--type <type>] [--source <source>] [--estimated-loc <n>] [--vision-key <key>] [--arch-key <key>] [--output-json]');
    process.exit(0);
  }

  const getArg = (flag) => { const idx = args.indexOf(flag); return idx !== -1 && args[idx + 1] ? args[idx + 1] : null; };
  const input = {
    title: getArg('--title') || '', description: getArg('--description') || '',
    type: getArg('--type') || 'feature', source: getArg('--source') || 'interactive',
    estimatedLoc: parseInt(getArg('--estimated-loc') || '0', 10),
    visionKey: getArg('--vision-key'), archKey: getArg('--arch-key'),
  };

  const result = await evaluateVisionReadiness(input);
  if (args.includes('--output-json')) console.log(JSON.stringify(result, null, 2));
  else console.log(formatRubricResult(result));
}

if (isMainModule(import.meta.url)) main();
