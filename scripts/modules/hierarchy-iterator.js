/**
 * Hierarchy Iterator — Restructures poor SD decompositions
 *
 * SD-LEO-INFRA-STREAM-SPRINT-BRIDGE-001-E (C5)
 *
 * After rubric scoring, if aggregate score < threshold, this module
 * restructures the hierarchy: merges over-scoped children, splits
 * under-scoped ones, re-assigns FRs. Re-scores. Max 3 iterations.
 *
 * @module scripts/modules/hierarchy-iterator
 */

import { scoreDecomposition, THRESHOLD } from './decomposition-rubric.js';

const MAX_ITERATIONS = 3;

/**
 * Run the iteration loop on a decomposed hierarchy.
 *
 * @param {Object[]} children - Child SD records
 * @param {Object} archPlan - Architecture plan
 * @param {Object} [options]
 * @param {Object} [options.logger]
 * @param {Function} [options.onRestructure] - Callback when restructuring occurs
 * @returns {Promise<Object>} Final result with scores, iteration count, and restructured children
 */
export async function iterateHierarchy(children, archPlan, options = {}) {
  const { logger = console, onRestructure } = options;
  let currentChildren = [...children];
  let iteration = 0;
  let lastScore = null;

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    const rubric = await scoreDecomposition(currentChildren, archPlan, { logger });
    lastScore = rubric;

    logger.log(`[HierarchyIterator] Iteration ${iteration}/${MAX_ITERATIONS}: score ${rubric.aggregate.toFixed(1)}/5`);

    if (rubric.passed) {
      logger.log(`[HierarchyIterator] PASSED at iteration ${iteration}`);
      return {
        children: currentChildren,
        score: rubric,
        iterations: iteration,
        converged: true,
      };
    }

    if (iteration === MAX_ITERATIONS) {
      logger.warn(`[HierarchyIterator] Max iterations reached, passing best attempt to chairman`);
      break;
    }

    // Restructure based on rubric feedback
    const restructured = restructureFromFeedback(currentChildren, rubric, archPlan, { logger });
    if (restructured.length === currentChildren.length &&
        JSON.stringify(restructured.map(c => c.title)) === JSON.stringify(currentChildren.map(c => c.title))) {
      logger.warn('[HierarchyIterator] No restructuring changes — breaking iteration');
      break;
    }

    currentChildren = restructured;
    if (onRestructure) onRestructure(currentChildren, iteration);
  }

  return {
    children: currentChildren,
    score: lastScore,
    iterations: iteration,
    converged: false,
  };
}

/**
 * Restructure children based on rubric feedback.
 *
 * @param {Object[]} children - Current child SDs
 * @param {Object} rubric - Rubric scores with recommendations
 * @param {Object} archPlan - Architecture plan
 * @param {Object} [options]
 * @returns {Object[]} Restructured children
 */
function restructureFromFeedback(children, rubric, archPlan, options = {}) {
  const { logger = console } = options;
  let result = [...children];

  // Address boundary issues: merge children with high scope overlap
  if (rubric.scores.boundary?.score <= 2) {
    logger.log('[HierarchyIterator] Addressing boundary issues — checking for merge candidates');
    result = mergeSimilarChildren(result);
  }

  // Address balance issues: split overly large children
  if (rubric.scores.balance?.score <= 2) {
    logger.log('[HierarchyIterator] Addressing balance issues — checking for split candidates');
    result = splitOversizedChildren(result);
  }

  // Address completeness: add missing phase children
  if (rubric.scores.completeness?.score <= 2 && archPlan) {
    logger.log('[HierarchyIterator] Addressing completeness — checking for uncovered phases');
    result = addMissingPhaseChildren(result, archPlan);
  }

  return result;
}

/**
 * Merge children with similar scope (boundary fix).
 */
function mergeSimilarChildren(children) {
  if (children.length <= 2) return children;

  const merged = [];
  const used = new Set();

  for (let i = 0; i < children.length; i++) {
    if (used.has(i)) continue;

    const current = children[i];
    const words = new Set((current.scope || current.title || '').toLowerCase().split(/\s+/).filter(w => w.length > 3));

    // Find a similar sibling to merge with
    let mergeTarget = -1;
    let maxOverlap = 0;
    for (let j = i + 1; j < children.length; j++) {
      if (used.has(j)) continue;
      const otherWords = new Set((children[j].scope || children[j].title || '').toLowerCase().split(/\s+/).filter(w => w.length > 3));
      const overlap = [...words].filter(w => otherWords.has(w)).length / Math.max(words.size, 1);
      if (overlap > 0.5 && overlap > maxOverlap) {
        maxOverlap = overlap;
        mergeTarget = j;
      }
    }

    if (mergeTarget >= 0) {
      // Merge
      merged.push({
        ...current,
        title: `${current.title} + ${children[mergeTarget].title}`,
        scope: `${current.scope || current.description || ''}\n${children[mergeTarget].scope || children[mergeTarget].description || ''}`,
      });
      used.add(i);
      used.add(mergeTarget);
    } else {
      merged.push(current);
      used.add(i);
    }
  }

  return merged;
}

/**
 * Split children that are significantly larger than siblings (balance fix).
 */
function splitOversizedChildren(children) {
  if (children.length === 0) return children;

  const avgLen = children.reduce((s, c) => s + (c.scope || c.description || '').length, 0) / children.length;
  const result = [];

  for (const child of children) {
    const len = (child.scope || child.description || '').length;
    if (len > avgLen * 3 && len > 200) {
      // Split into two
      const midpoint = Math.floor(len / 2);
      const text = child.scope || child.description || '';
      result.push({ ...child, title: `${child.title} (Part 1)`, scope: text.substring(0, midpoint) });
      result.push({ ...child, title: `${child.title} (Part 2)`, scope: text.substring(midpoint) });
    } else {
      result.push(child);
    }
  }

  return result;
}

/**
 * Add children for uncovered architecture plan phases (completeness fix).
 */
function addMissingPhaseChildren(children, archPlan) {
  const phases = archPlan?.sections?.implementation_phases || [];
  if (phases.length === 0) return children;

  const coveredTitles = new Set(children.map(c => (c.title || '').toLowerCase()));
  const result = [...children];

  for (const phase of phases) {
    const phaseTitle = (phase.title || '').toLowerCase();
    const isCovered = [...coveredTitles].some(t => t.includes(phaseTitle) || phaseTitle.includes(t));

    if (!isCovered) {
      result.push({
        title: phase.title,
        scope: phase.description || phase.title,
        description: phase.description || `Implementation of architecture phase: ${phase.title}`,
        dependencies: [],
      });
    }
  }

  return result;
}

export { MAX_ITERATIONS, restructureFromFeedback };
