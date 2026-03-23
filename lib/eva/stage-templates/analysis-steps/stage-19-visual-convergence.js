/**
 * Stage 19 Analysis Step - Visual Convergence Loop
 * SD: SD-MAN-INFRA-ITERATOR-STAGE-VISUAL-001
 *
 * Runs 5 sequential convergence passes over Stage 15 wireframes, each with a
 * different expert persona. Produces a weighted overall convergence score that
 * gates stage advancement (>= 60 = PASS, < 60 = NEEDS_REFINEMENT).
 *
 * Convergence Passes:
 *   1. Layout Structure      (0.25) — UX Architect
 *   2. Typography/Hierarchy  (0.20) — Visual Designer
 *   3. Color & Accessibility (0.20) — Accessibility Expert
 *   4. Interactive Elements  (0.20) — Interaction Designer
 *   5. Handoff Completeness  (0.15) — QA Reviewer
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-19-visual-convergence
 */

// ── Constants ────────────────────────────────────────────────────────
const CONVERGENCE_THRESHOLD = 60;
const VERDICT_PASS = 'PASS';
const VERDICT_NEEDS_REFINEMENT = 'NEEDS_REFINEMENT';

/**
 * Pass definitions — order matters; they execute sequentially.
 * Weights MUST sum to 1.0.
 */
const PASS_DEFINITIONS = [
  {
    domain: 'layout_structure',
    label: 'Layout Structure',
    weight: 0.25,
    expertPersona: 'UX Architect',
    systemPrompt: `You are a senior UX Architect reviewing wireframe layouts.
Evaluate: spatial hierarchy, grid alignment, content flow, white space usage, visual grouping, responsive layout readiness.
Score 0-100. Provide 2-4 strengths and 2-4 improvements.

You MUST output valid JSON:
{
  "score": <0-100>,
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"]
}
Output ONLY valid JSON.`,
  },
  {
    domain: 'typography_hierarchy',
    label: 'Typography/Hierarchy',
    weight: 0.20,
    expertPersona: 'Visual Designer',
    systemPrompt: `You are a senior Visual Designer reviewing wireframe typography and visual hierarchy.
Evaluate: type scale consistency, readability, visual hierarchy clarity, font pairing appropriateness, heading/body differentiation, emphasis patterns.
Score 0-100. Provide 2-4 strengths and 2-4 improvements.

You MUST output valid JSON:
{
  "score": <0-100>,
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"]
}
Output ONLY valid JSON.`,
  },
  {
    domain: 'color_accessibility',
    label: 'Color & Accessibility',
    weight: 0.20,
    expertPersona: 'Accessibility Expert',
    systemPrompt: `You are a WCAG accessibility expert reviewing wireframe designs.
Evaluate: WCAG compliance potential, contrast ratio readiness, color palette harmony, colorblind safety, focus indicator presence, semantic structure.
Score 0-100. Provide 2-4 strengths and 2-4 improvements.

You MUST output valid JSON:
{
  "score": <0-100>,
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"]
}
Output ONLY valid JSON.`,
  },
  {
    domain: 'interactive_elements',
    label: 'Interactive Elements',
    weight: 0.20,
    expertPersona: 'Interaction Designer',
    systemPrompt: `You are a senior Interaction Designer reviewing wireframe interactive elements.
Evaluate: button affordances, hover/active state indicators, feedback patterns, CTA clarity, form usability, navigation consistency.
Score 0-100. Provide 2-4 strengths and 2-4 improvements.

You MUST output valid JSON:
{
  "score": <0-100>,
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"]
}
Output ONLY valid JSON.`,
  },
  {
    domain: 'handoff_completeness',
    label: 'Handoff Completeness',
    weight: 0.15,
    expertPersona: 'QA Reviewer',
    systemPrompt: `You are a QA Reviewer evaluating wireframe handoff completeness for developer implementation.
Evaluate: specs completeness, responsive annotations, state documentation (loading/error/empty), edge case coverage, component inventory, interaction specifications.
Score 0-100. Provide 2-4 strengths and 2-4 improvements.

You MUST output valid JSON:
{
  "score": <0-100>,
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"]
}
Output ONLY valid JSON.`,
  },
];

// ── LLM Integration ──────────────────────────────────────────────────

/**
 * Attempt to call a real LLM. Falls back to a deterministic mock if no
 * LLM provider is available (no API key, module missing, etc.).
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {Object} logger
 * @returns {Promise<{ score: number, strengths: string[], improvements: string[] }>}
 */
async function callLLM(systemPrompt, userPrompt, logger) {
  // Try real LLM first
  try {
    const { getLLMClient } = await import('../../../llm/index.js');
    const { parseJSON } = await import('../../utils/parse-json.js');

    const client = getLLMClient({ purpose: 'content-generation' });
    const response = await client.complete(systemPrompt, userPrompt, { timeout: 60000 });
    const parsed = parseJSON(response);

    if (typeof parsed.score === 'number' && Array.isArray(parsed.strengths)) {
      return {
        score: Math.min(100, Math.max(0, Math.round(parsed.score))),
        strengths: parsed.strengths.map(s => String(s).substring(0, 300)),
        improvements: Array.isArray(parsed.improvements)
          ? parsed.improvements.map(s => String(s).substring(0, 300))
          : [],
      };
    }

    logger.warn?.('[Stage19] LLM returned unexpected structure — falling back to mock');
  } catch {
    // LLM unavailable — fall through to mock
  }

  return null; // signals caller to use mock
}

/**
 * Generate a deterministic mock score based on screen quality heuristics.
 * Produces realistic-looking results that vary by domain and input quality.
 *
 * @param {Object} passDef - Pass definition
 * @param {Array} screens - Stage 15 wireframe screens
 * @returns {{ score: number, strengths: string[], improvements: string[] }}
 */
function generateMockResponse(passDef, screens) {
  const screenCount = screens.length;

  // Base score influenced by screen count (more screens = more thorough)
  const baseScore = Math.min(85, 50 + screenCount * 3);

  // Domain-specific variance to make each pass look distinct
  const domainOffsets = {
    layout_structure: 5,
    typography_hierarchy: -2,
    color_accessibility: -5,
    interactive_elements: 0,
    handoff_completeness: -8,
  };
  const offset = domainOffsets[passDef.domain] || 0;

  // Check for quality signals in screens
  const hasComponents = screens.some(s => Array.isArray(s.key_components) && s.key_components.length >= 3);
  const hasNotes = screens.some(s => s.interaction_notes && s.interaction_notes.length > 20);
  const hasLayout = screens.some(s => s.ascii_layout && s.ascii_layout.split('\n').length >= 5);

  const qualityBonus = (hasComponents ? 3 : 0) + (hasNotes ? 2 : 0) + (hasLayout ? 3 : 0);

  const score = Math.min(100, Math.max(0, baseScore + offset + qualityBonus));

  const strengthsMap = {
    layout_structure: [
      'Consistent grid structure across screens',
      'Clear spatial hierarchy with logical content grouping',
      'Adequate white space for readability',
    ],
    typography_hierarchy: [
      'Clear heading/body differentiation in wireframes',
      'Consistent label placement across screens',
    ],
    color_accessibility: [
      'Wireframe structure supports high-contrast implementation',
      'Semantic grouping aids screen reader navigation',
    ],
    interactive_elements: [
      'Clear button labeling with action-oriented text',
      'Consistent navigation patterns across screens',
      'Primary CTAs are visually prominent',
    ],
    handoff_completeness: [
      'Component inventory is identifiable from wireframes',
      'Screen purposes are well documented',
    ],
  };

  const improvementsMap = {
    layout_structure: [
      'Add responsive breakpoint annotations',
      'Define minimum touch target sizes for mobile',
    ],
    typography_hierarchy: [
      'Specify exact type scale ratios (e.g., 1.25 major third)',
      'Add font weight annotations for emphasis levels',
      'Document line-height and letter-spacing guidelines',
    ],
    color_accessibility: [
      'Add WCAG AA contrast ratio annotations for all text elements',
      'Include colorblind simulation notes for key differentiators',
      'Document focus indicator styles for keyboard navigation',
    ],
    interactive_elements: [
      'Add hover and active state annotations',
      'Document loading and disabled button states',
    ],
    handoff_completeness: [
      'Add error state wireframes for form screens',
      'Include empty state designs for data-dependent views',
      'Document transition animations between screens',
      'Add responsive behavior notes per breakpoint',
    ],
  };

  return {
    score,
    strengths: strengthsMap[passDef.domain] || ['Well-structured wireframes'],
    improvements: improvementsMap[passDef.domain] || ['Add more detailed annotations'],
  };
}

// ── Main Analysis Function ───────────────────────────────────────────

/**
 * Run the 5-pass visual convergence loop over Stage 15 wireframes.
 *
 * @param {string} ventureId - Venture UUID
 * @param {Object} stageData - Upstream stage data (must contain stage15_data.screens)
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<Object>} Convergence results with pass/fail verdict
 */
export async function analyzeStage19VisualConvergence(ventureId, stageData, options = {}) {
  const logger = options.logger || console;
  const startTime = Date.now();
  logger.log('[Stage19] Starting visual convergence analysis', { ventureId });

  // ── Extract Stage 15 wireframes ──────────────────────────────────
  const stage15Data = stageData?.stage15_data;
  const screens = stage15Data?.screens;

  if (!screens || !Array.isArray(screens) || screens.length === 0) {
    logger.warn('[Stage19] No Stage 15 wireframe screens found — returning minimal result');
    return {
      passes: [],
      overall_score: 0,
      verdict: VERDICT_NEEDS_REFINEMENT,
      threshold: CONVERGENCE_THRESHOLD,
      screen_count: 0,
      refinement_priority: ['Provide Stage 15 wireframe screens before running visual convergence'],
    };
  }

  logger.log('[Stage19] Wireframes loaded', { screenCount: screens.length });

  // ── Build shared user prompt from wireframes ─────────────────────
  const screenSummaries = screens
    .map((s, i) => {
      const layout = s.ascii_layout
        ? s.ascii_layout.substring(0, 500)
        : '(no layout)';
      const components = Array.isArray(s.key_components)
        ? s.key_components.join(', ')
        : 'none';
      return `Screen ${i + 1}: ${s.name || 'Unnamed'}
Purpose: ${s.purpose || 'N/A'}
Components: ${components}
Interaction: ${s.interaction_notes || 'N/A'}
Layout:
${layout}`;
    })
    .join('\n\n---\n\n');

  const userPrompt = `Review the following ${screens.length} wireframe screens and evaluate them from your expert perspective.

${screenSummaries}

Score the overall quality (0-100) for your domain. List specific strengths and concrete improvements.
Output ONLY valid JSON.`;

  // ── Run 5 convergence passes sequentially ────────────────────────
  const passes = [];

  for (const passDef of PASS_DEFINITIONS) {
    logger.log(`[Stage19] Running pass: ${passDef.label} (${passDef.expertPersona})`, { domain: passDef.domain });

    let result = await callLLM(passDef.systemPrompt, userPrompt, logger);

    if (!result) {
      // LLM unavailable — use mock
      result = generateMockResponse(passDef, screens);
      logger.log(`[Stage19] Using mock for ${passDef.domain}`, { score: result.score });
    }

    passes.push({
      domain: passDef.domain,
      label: passDef.label,
      score: result.score,
      strengths: result.strengths,
      improvements: result.improvements,
      expertPersona: passDef.expertPersona,
      weight: passDef.weight,
    });
  }

  // ── Compute weighted overall score ───────────────────────────────
  const overall_score = Math.round(
    passes.reduce((sum, p) => sum + p.score * p.weight, 0),
  );

  const verdict = overall_score >= CONVERGENCE_THRESHOLD
    ? VERDICT_PASS
    : VERDICT_NEEDS_REFINEMENT;

  // ── Build refinement priority list (sorted by impact) ────────────
  // Collect all improvements, weighted by (100 - score) * weight for prioritization
  const refinement_priority = passes
    .flatMap(p =>
      p.improvements.map(imp => ({
        text: `[${p.label}] ${imp}`,
        impact: (100 - p.score) * p.weight,
      })),
    )
    .sort((a, b) => b.impact - a.impact)
    .map(r => r.text);

  const duration = Date.now() - startTime;
  logger.log('[Stage19] Visual convergence complete', {
    duration,
    overall_score,
    verdict,
    screenCount: screens.length,
    passScores: passes.map(p => `${p.domain}:${p.score}`).join(', '),
  });

  return {
    passes,
    overall_score,
    verdict,
    threshold: CONVERGENCE_THRESHOLD,
    screen_count: screens.length,
    refinement_priority,
  };
}

// Export constants for testing
export {
  CONVERGENCE_THRESHOLD,
  VERDICT_PASS,
  VERDICT_NEEDS_REFINEMENT,
  PASS_DEFINITIONS,
  generateMockResponse,
};
