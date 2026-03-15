/**
 * Enhancement Sourcer — aggregates from 4 adapters with MoSCoW ranking.
 * Adapters: YouTube, Todoist, Brainstorm, Capability.
 * Uses consistent source_adapter_pattern interface.
 */

import { getYouTubeEnhancements } from './adapters/youtube-adapter.js';
import { getTodoistEnhancements } from './adapters/todoist-adapter.js';
import { getBrainstormEnhancements } from './adapters/brainstorm-adapter.js';
import { getCapabilityEnhancements } from './adapters/capability-adapter.js';

const MOSCOW_ORDER = { must: 0, should: 1, could: 2, wont: 3 };

/**
 * Get enhancements from all 4 adapters for a stage range
 * @param {number} fromStage
 * @param {number} toStage
 * @param {object} gapAnalysis - from Gap Analyst
 * @returns {object[]} MoSCoW-ranked enhancements
 */
export async function getEnhancements(fromStage, toStage, gapAnalysis) {
  const adapters = [
    { name: 'youtube', fn: getYouTubeEnhancements },
    { name: 'todoist', fn: getTodoistEnhancements },
    { name: 'brainstorm', fn: getBrainstormEnhancements },
    { name: 'capability', fn: getCapabilityEnhancements }
  ];

  const allEnhancements = [];

  for (const adapter of adapters) {
    try {
      const results = await adapter.fn(fromStage, toStage, gapAnalysis);
      allEnhancements.push(...results.map(r => ({ ...r, source: adapter.name })));
    } catch (err) {
      console.warn(`  [${adapter.name}] adapter error: ${err.message}`);
    }
  }

  // MoSCoW prioritization based on gap severity alignment
  return rankByMoSCoW(allEnhancements, gapAnalysis);
}

function rankByMoSCoW(enhancements, gapAnalysis) {
  const blockerGaps = (gapAnalysis?.gaps || []).filter(g => g.severity === 'blocker');
  const majorGaps = (gapAnalysis?.gaps || []).filter(g => g.severity === 'major');

  return enhancements
    .map(e => {
      // Assign MoSCoW based on gap alignment
      let moscow = 'could';
      if (blockerGaps.some(g => relatesTo(e, g))) {
        moscow = 'must';
      } else if (majorGaps.some(g => relatesTo(e, g))) {
        moscow = 'should';
      }
      return { ...e, moscow };
    })
    .sort((a, b) => (MOSCOW_ORDER[a.moscow] || 3) - (MOSCOW_ORDER[b.moscow] || 3));
}

function relatesTo(enhancement, gap) {
  const eText = (enhancement.title + ' ' + (enhancement.description || '')).toLowerCase();
  const gText = (gap.expected + ' ' + gap.description).toLowerCase();
  const keywords = gText.split(/\s+/).filter(w => w.length > 4);
  return keywords.some(k => eText.includes(k));
}
