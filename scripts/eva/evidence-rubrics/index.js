/**
 * evidence-rubrics/index.js — Rubric Loader
 *
 * Loads all dimension rubric files (V01-V11, A01-A07, T01-T02),
 * validates each against the expected schema, and exports
 * them as a Map<dimId, rubric>.
 */

import { readdirSync } from 'fs';
import { join } from 'path';

const RUBRIC_DIR = import.meta.dirname;
const RUBRIC_FILE_PATTERN = /^(V\d{2}|A\d{2}|T\d{2})-/;

/**
 * Validate a rubric definition has required fields.
 */
function validateRubric(rubric, filename) {
  const errors = [];
  if (!rubric.id) errors.push('missing id');
  if (!rubric.name) errors.push('missing name');
  if (!Array.isArray(rubric.checks) || rubric.checks.length === 0) {
    errors.push('checks must be a non-empty array');
  } else {
    for (const check of rubric.checks) {
      if (!check.id) errors.push('check missing id');
      if (!check.label) errors.push(`check ${check.id || '?'} missing label`);
      if (!check.type) errors.push(`check ${check.id || '?'} missing type`);
      if (typeof check.weight !== 'number') errors.push(`check ${check.id || '?'} missing weight`);
      if (!check.params) errors.push(`check ${check.id || '?'} missing params`);
    }
  }
  if (errors.length > 0) {
    throw new Error(`Invalid rubric ${filename}: ${errors.join(', ')}`);
  }
}

/**
 * Load all rubric files from this directory.
 * @returns {Promise<Map<string, object>>} Map of dimId -> rubric definition
 */
export async function loadAllRubrics() {
  const rubrics = new Map();
  const files = readdirSync(RUBRIC_DIR)
    .filter(f => RUBRIC_FILE_PATTERN.test(f) && f.endsWith('.js'))
    .sort();

  for (const file of files) {
    const mod = await import(/* @vite-ignore */ `file:///${join(RUBRIC_DIR, file).replaceAll('\\', '/')}`);
    const rubric = mod.default;
    validateRubric(rubric, file);
    rubrics.set(rubric.id, rubric);
  }

  return rubrics;
}
