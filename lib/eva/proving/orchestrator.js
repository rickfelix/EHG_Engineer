/**
 * Proving Run Orchestrator — Coordinates assess-fix-reassess loop across stages.
 *
 * Rewires /prove skill Steps 5-9 with automated stage-by-stage loop.
 * Coordinates Assessment Agent and Fix Agent with escalation queue.
 * Produces run journal with regression detection.
 *
 * @module lib/eva/proving/orchestrator
 */

import { evaluateStage } from './assessment-agent.js';
import { applyFix } from './fix-agent.js';

const DEFAULT_FIX_THRESHOLD = 70;
const TOTAL_STAGES = 17;

/**
 * Create a journal entry for a stage assessment.
 *
 * @param {Object} params
 * @param {string} params.ventureId
 * @param {number} params.stageNumber
 * @param {number} params.runNumber
 * @param {Object} params.assessment - Result from evaluateStage
 * @param {Object} [params.previousEntry] - Previous journal entry for regression detection
 * @returns {Object} Journal entry
 */
export function createJournalEntry({ ventureId, stageNumber, runNumber, assessment, previousEntry }) {
  const regression = previousEntry ? assessment.composite < previousEntry.composite : false;
  const improvement = previousEntry ? assessment.composite - previousEntry.composite : null;

  return {
    ventureId,
    stageNumber,
    runNumber,
    composite: assessment.composite,
    decision: assessment.decision,
    dimensions: assessment.dimensions,
    gateType: assessment.gateType,
    regression,
    improvement,
    previousComposite: previousEntry?.composite ?? null,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Process a single stage: assess, fix if needed, reassess.
 *
 * @param {Object} params
 * @param {number} params.stageNumber - Stage to process (1-17)
 * @param {Object} params.stageData - Stage content
 * @param {string} params.ventureId - Venture identifier
 * @param {number} params.runNumber - Run number
 * @param {Object} [params.previousEntry] - Previous journal entry
 * @param {Object} [params.fixPattern] - Pattern template for fixes
 * @param {Object} [params.options] - Options for assessment and fix
 * @returns {Promise<{ journal: Object, escalated: boolean, fixAttempted: boolean }>}
 */
export async function processStage(params) {
  const { stageNumber, stageData, ventureId, runNumber, previousEntry, fixPattern, options = {} } = params;
  const { fixThreshold = DEFAULT_FIX_THRESHOLD, gateType = 'default' } = options;

  // Step 1: Assess
  const assessment = await evaluateStage(stageData, { gateType });

  // Step 2: Check if fix needed
  if (assessment.composite >= fixThreshold) {
    const journal = createJournalEntry({ ventureId, stageNumber, runNumber, assessment, previousEntry });
    return { journal, escalated: false, fixAttempted: false };
  }

  // Step 3: Attempt fix if pattern available
  if (!fixPattern) {
    const journal = createJournalEntry({ ventureId, stageNumber, runNumber, assessment, previousEntry });
    return { journal, escalated: true, fixAttempted: false, reason: 'No fix pattern available' };
  }

  const fixId = `${ventureId}-stage${stageNumber}-run${runNumber}`;
  const fixResult = await applyFix({ fixId, pattern: fixPattern, preScore: assessment, ...options });

  if (!fixResult.success) {
    const journal = createJournalEntry({ ventureId, stageNumber, runNumber, assessment, previousEntry });
    return { journal, escalated: true, fixAttempted: true, fixError: fixResult.error };
  }

  // Step 4: Reassess after fix
  const reassessment = await evaluateStage(stageData, { gateType });
  const journal = createJournalEntry({ ventureId, stageNumber, runNumber, assessment: reassessment, previousEntry });
  const stillBelow = reassessment.composite < fixThreshold;

  return { journal, escalated: stillBelow, fixAttempted: true, fixResult, reassessment };
}

/**
 * Run the full proving loop across all stages.
 *
 * @param {Object} params
 * @param {string} params.ventureId - Venture identifier
 * @param {number} [params.runNumber=1] - Run number
 * @param {Function} params.getStageData - (stageNumber) => Promise<Object>
 * @param {Function} [params.getFixPattern] - (stageNumber) => Promise<Object|null>
 * @param {Function} [params.getPreviousEntry] - (ventureId, stageNumber) => Promise<Object|null>
 * @param {Object} [params.options] - Assessment/fix options
 * @param {number} [params.startStage=1] - Stage to start from (for resume)
 * @param {number} [params.endStage=17] - Stage to end at
 * @returns {Promise<{ journal: Object[], escalationQueue: Object[], summary: Object }>}
 */
export async function runProvingLoop(params) {
  const {
    ventureId, runNumber = 1, getStageData, getFixPattern, getPreviousEntry,
    options = {}, startStage = 1, endStage = TOTAL_STAGES,
  } = params;

  const journal = [];
  const escalationQueue = [];
  let passed = 0;
  let fixed = 0;
  let escalated = 0;

  for (let stage = startStage; stage <= endStage; stage++) {
    let stageData;
    try {
      stageData = await getStageData(stage);
    } catch {
      escalationQueue.push({ stageNumber: stage, reason: 'Failed to load stage data' });
      escalated++;
      continue;
    }

    if (!stageData) {
      escalationQueue.push({ stageNumber: stage, reason: 'No stage data available' });
      escalated++;
      continue;
    }

    const previousEntry = getPreviousEntry ? await getPreviousEntry(ventureId, stage) : null;
    const fixPattern = getFixPattern ? await getFixPattern(stage) : null;

    const result = await processStage({
      stageNumber: stage, stageData, ventureId, runNumber,
      previousEntry, fixPattern, options,
    });

    journal.push(result.journal);

    if (result.escalated) {
      escalationQueue.push({
        stageNumber: stage,
        composite: result.journal.composite,
        reason: result.fixError || result.reason || 'Below threshold after fix',
        fixAttempted: result.fixAttempted,
      });
      escalated++;
    } else if (result.fixAttempted) {
      fixed++;
    } else {
      passed++;
    }
  }

  return {
    journal,
    escalationQueue,
    summary: {
      ventureId, runNumber, totalStages: endStage - startStage + 1,
      passed, fixed, escalated,
      overallScore: journal.length > 0
        ? Math.round(journal.reduce((s, j) => s + j.composite, 0) / journal.length * 100) / 100
        : 0,
    },
  };
}
