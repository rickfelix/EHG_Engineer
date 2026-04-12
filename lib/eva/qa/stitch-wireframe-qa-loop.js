/**
 * Stitch Wireframe QA Iterative Loop — Re-generate failing screens
 *
 * SD: SD-WIREFRAME-FIDELITY-QA-WITH-ORCH-001-B
 *
 * Evaluates wireframe fidelity scores from Child A's scoring engine.
 * Screens below threshold get re-generated with improved prompts
 * incorporating QA feedback (missing elements, low-scoring dimensions).
 * Repeats up to MAX_ITERATIONS times per screen.
 *
 * Never throws — all errors result in graceful termination of the loop.
 *
 * @module lib/eva/qa/stitch-wireframe-qa-loop
 */

import { scoreWireframeFidelity } from './stitch-wireframe-qa.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_THRESHOLD = 70;
const MAX_ITERATIONS = 3;
const MIN_IMPROVEMENT = 5; // Log diminishing returns below this

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(level, event, details = {}) {
  const entry = JSON.stringify({ event, level, timestamp: new Date().toISOString(), ...details });
  (level === 'warn' ? console.warn : console.info)(`[wireframe-qa-loop] ${entry}`);
}

// ---------------------------------------------------------------------------
// Prompt improvement
// ---------------------------------------------------------------------------

/**
 * Build an improved generation prompt incorporating QA feedback.
 *
 * @param {string} originalPrompt - Original Stitch generation prompt
 * @param {Object} screenResult - Result from scoreWireframeFidelity for this screen
 * @returns {string} Improved prompt with QA feedback injected
 */
export function buildImprovedPrompt(originalPrompt, screenResult) {
  const feedbackParts = [];

  // Add missing elements
  if (screenResult.missing_elements?.length > 0) {
    feedbackParts.push(
      `CRITICAL: The following UI elements are MISSING and MUST be included: ${screenResult.missing_elements.join(', ')}.`
    );
  }

  // Add low-scoring dimension feedback
  if (screenResult.dimensions) {
    const lowDimensions = Object.entries(screenResult.dimensions)
      .filter(([, score]) => typeof score === 'number' && score < DEFAULT_THRESHOLD)
      .map(([dim, score]) => {
        const labels = {
          component_presence: 'UI components (buttons, forms, navigation)',
          layout_fidelity: 'spatial layout and zone arrangement',
          navigation_accuracy: 'navigation links and menu structure',
          screen_purpose_match: 'core screen purpose and function',
        };
        return `${labels[dim] || dim} (scored ${score}%)`;
      });

    if (lowDimensions.length > 0) {
      feedbackParts.push(
        `IMPROVE these areas: ${lowDimensions.join('; ')}.`
      );
    }
  }

  if (feedbackParts.length === 0) {
    return originalPrompt;
  }

  return `${originalPrompt}\n\n--- QA FEEDBACK (must address) ---\n${feedbackParts.join('\n')}`;
}

// ---------------------------------------------------------------------------
// Main iterative loop
// ---------------------------------------------------------------------------

/**
 * Run iterative quality loop on screens below threshold.
 *
 * @param {string} ventureId
 * @param {string} projectId
 * @param {Object} initialResult - Result from scoreWireframeFidelity
 * @param {Object} [options]
 * @param {number} [options.threshold] - Fidelity threshold (default 70)
 * @param {Function} [options.regenerate] - Screen regeneration function (for testing)
 * @param {Function} [options.reExport] - Screen re-export function (for testing)
 * @param {Function} [options.reScore] - Re-scoring function (for testing)
 * @param {Array} [options.wireframes] - Wireframe specs for re-scoring
 * @returns {Promise<Object>} Updated fidelity result with iteration history
 */
export async function runIterativeLoop(ventureId, projectId, initialResult, options = {}) {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;

  try {
    if (!initialResult?.screens || initialResult.screens.length === 0) {
      log('info', 'no_screens_to_iterate', { venture_id: ventureId });
      return initialResult;
    }

    const updatedScreens = [];
    let totalIterationsUsed = 0;

    for (const screen of initialResult.screens) {
      // Skip screens that already meet threshold or weren't scored
      if (typeof screen.score !== 'number' || screen.score >= threshold) {
        updatedScreens.push({ ...screen, iteration_count: 0, iteration_history: [] });
        continue;
      }

      log('info', 'iterating_screen', {
        screen: screen.screen_name,
        initial_score: screen.score,
        threshold,
      });

      let currentScreen = { ...screen };
      const iterationHistory = [{ iteration: 0, score: screen.score }];
      let iterationCount = 0;

      for (let i = 0; i < MAX_ITERATIONS; i++) {
        iterationCount = i + 1;

        // Build improved prompt
        const originalPrompt = `Generate the "${currentScreen.screen_name}" screen matching the wireframe specification.`;
        const improvedPrompt = buildImprovedPrompt(originalPrompt, currentScreen);

        // Re-generate screen
        try {
          if (options.regenerate) {
            await options.regenerate(projectId, [improvedPrompt], ventureId);
          } else {
            // Dynamic import to avoid circular deps
            const { generateScreens } = await import('../bridge/stitch-client.js');
            await generateScreens(projectId, [improvedPrompt], ventureId);
          }
        } catch (err) {
          log('warn', 'regeneration_failed', { screen: currentScreen.screen_name, error: err.message });
          iterationHistory.push({ iteration: iterationCount, score: null, error: 'regeneration_failed' });
          break;
        }

        // Re-export (if function provided) — in production, export happens via stitch-exporter
        if (options.reExport) {
          try {
            await options.reExport(ventureId, projectId, currentScreen.screen_name);
          } catch (err) {
            log('warn', 'reexport_failed', { screen: currentScreen.screen_name, error: err.message });
            iterationHistory.push({ iteration: iterationCount, score: null, error: 'reexport_failed' });
            break;
          }
        }

        // Re-score
        let newScore;
        try {
          if (options.reScore) {
            newScore = await options.reScore(ventureId, projectId, currentScreen.screen_name);
          } else {
            const reResult = await scoreWireframeFidelity(ventureId, projectId, {
              wireframes: options.wireframes,
            });
            const matchingScreen = reResult.screens?.find(s => s.screen_name === currentScreen.screen_name);
            newScore = matchingScreen || { score: null, status: 'rescore_no_match' };
          }
        } catch (err) {
          log('warn', 'rescore_failed', { screen: currentScreen.screen_name, error: err.message });
          iterationHistory.push({ iteration: iterationCount, score: null, error: 'rescore_failed' });
          break;
        }

        const newScoreValue = newScore?.score ?? null;
        iterationHistory.push({ iteration: iterationCount, score: newScoreValue });

        // Check improvement
        if (typeof newScoreValue === 'number' && typeof currentScreen.score === 'number') {
          const delta = newScoreValue - currentScreen.score;
          if (delta < MIN_IMPROVEMENT) {
            log('info', 'diminishing_returns', {
              screen: currentScreen.screen_name,
              delta,
              iteration: iterationCount,
            });
          }
        }

        // Update current screen with new result
        if (newScore && typeof newScore.score === 'number') {
          currentScreen = { ...currentScreen, ...newScore };
        }

        // Check if threshold met
        if (typeof newScoreValue === 'number' && newScoreValue >= threshold) {
          log('info', 'threshold_met', {
            screen: currentScreen.screen_name,
            score: newScoreValue,
            iteration: iterationCount,
          });
          break;
        }
      }

      totalIterationsUsed += iterationCount;
      updatedScreens.push({
        ...currentScreen,
        iteration_count: iterationCount,
        iteration_history: iterationHistory,
      });
    }

    // Update overall score
    const scoredScreens = updatedScreens.filter(s => typeof s.score === 'number');
    const overall_score = scoredScreens.length > 0
      ? Math.round(scoredScreens.reduce((sum, s) => sum + s.score, 0) / scoredScreens.length)
      : initialResult.overall_score;

    return {
      ...initialResult,
      overall_score,
      screens: updatedScreens,
      iterations_used: totalIterationsUsed,
      threshold,
      loop_status: 'completed',
    };
  } catch (err) {
    log('warn', 'loop_failed', { venture_id: ventureId, error: err.message });
    return {
      ...initialResult,
      loop_status: 'error',
      loop_error: err.message,
    };
  }
}
