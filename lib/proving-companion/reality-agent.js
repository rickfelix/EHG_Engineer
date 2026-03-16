/**
 * Reality Agent — scans EHG app repo using stage-to-file-pattern config.
 * Returns found_files, found_capabilities, implementation_status.
 * Local fs scanning: zero LLM cost.
 */

import { existsSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { getStageRange } from './stage-config.js';

const EHG_APP_PATH = process.env.EHG_APP_PATH || 'C:/Users/rickf/Projects/_EHG/ehg';

/**
 * Scan EHG repo for stage file patterns
 * @param {number} fromStage
 * @param {number} toStage
 * @returns {object} map of stage number to reality data
 */
export async function getReality(fromStage, toStage) {
  const stageConfigs = getStageRange(fromStage, toStage);
  const results = {};

  for (const [stageNum, config] of Object.entries(stageConfigs)) {
    const foundFiles = [];
    const missingPatterns = [];

    for (const pattern of config.filePatterns.slice(0, 10)) { // max 10 patterns
      const matches = scanPattern(EHG_APP_PATH, pattern);
      if (matches.length > 0) {
        foundFiles.push(...matches);
      } else {
        missingPatterns.push(pattern);
      }
    }

    const total = config.filePatterns.length;
    const found = total - missingPatterns.length;
    const coverage = total > 0 ? Math.round((found / total) * 100) : 0;

    results[stageNum] = {
      stage_number: parseInt(stageNum),
      stage_name: config.name,
      found_files: foundFiles,
      missing_patterns: missingPatterns,
      found_capabilities: foundFiles.map(f => extractCapability(f)),
      implementation_status: coverage >= 80 ? 'complete' : coverage >= 40 ? 'partial' : 'missing',
      coverage_pct: coverage
    };
  }

  return results;
}

/**
 * Scan for files matching a glob-like pattern
 * Only handles simple patterns: path/to/prefix*
 */
function scanPattern(basePath, pattern) {
  const parts = pattern.split('/');
  const lastPart = parts.pop();
  const dirPath = resolve(basePath, ...parts);

  if (!existsSync(dirPath)) return [];

  try {
    const entries = readdirSync(dirPath);
    if (lastPart.endsWith('*')) {
      const prefix = lastPart.slice(0, -1);
      return entries
        .filter(e => e.startsWith(prefix))
        .map(e => join(...parts, e).replace(/\\/g, '/'));
    }
    return entries.includes(lastPart) ? [join(...parts, lastPart).replace(/\\/g, '/')] : [];
  } catch {
    return [];
  }
}

function extractCapability(filePath) {
  const name = filePath.split('/').pop().replace(/\.(tsx?|jsx?)$/, '');
  return name.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
}
