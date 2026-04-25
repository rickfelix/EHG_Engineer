/**
 * Stage Templates - Phases 1-6 (Stages 1-26)
 *
 * Registry of all stage templates for the 26-stage venture lifecycle.
 *
 * As of SD-LEO-INFRA-STAGE-TEMPLATE-BARREL-001 (2026-04-25), this barrel
 * uses glob-based auto-discovery instead of hand-curated re-exports.
 * Deletions and renames in `stage-NN.js` files now propagate without
 * requiring manual barrel maintenance.
 *
 * @module lib/eva/stage-templates
 */

import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { stageRegistry } from '../stage-registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STAGE_FILE_RE = /^stage-(\d{2})\.js$/;

// Discover all stage-NN.js files on disk
const stageFiles = readdirSync(__dirname)
  .filter((f) => STAGE_FILE_RE.test(f))
  .sort();

if (stageFiles.length === 0) {
  throw new Error(
    `[stage-templates] No stage-NN.js files discovered in ${__dirname}. ` +
      `Expected at least one file matching ${STAGE_FILE_RE}.`,
  );
}

// Dynamic load — top-level await ensures consumers see fully-populated maps
const BUILTIN_TEMPLATES = {};
const STAGE_MODULES = {};

for (const file of stageFiles) {
  const numStr = file.match(STAGE_FILE_RE)[1];
  const stageNum = parseInt(numStr, 10);
  // Statically-analyzable dynamic import (Vite-compatible) — the
  // stage-NN.js prefix/suffix are literal so bundlers can resolve.
  const mod = await import(`./stage-${numStr}.js`);
  if (!mod.default) {
    throw new Error(
      `[stage-templates] ${file} has no default export. Every stage-NN.js file must export a TEMPLATE object as default.`,
    );
  }
  BUILTIN_TEMPLATES[stageNum] = mod.default;
  STAGE_MODULES[stageNum] = mod;
  if (!stageRegistry.has(stageNum)) {
    stageRegistry.register(stageNum, mod.default, {
      source: 'file',
      version: mod.default.version || '1.0.0',
    });
  }
}

export const STAGE_COUNT = Object.keys(BUILTIN_TEMPLATES).length;

/**
 * Get a stage template by stage number (1-26).
 * Delegates to StageRegistry for unified lookup.
 * @param {number} stageNumber
 * @returns {Object|null}
 */
export function getTemplate(stageNumber) {
  return stageRegistry.get(stageNumber) || BUILTIN_TEMPLATES[stageNumber] || null;
}

/**
 * Get all stage templates as an array, sorted by stage number.
 * @returns {Object[]}
 */
export function getAllTemplates() {
  return Object.keys(BUILTIN_TEMPLATES)
    .map(Number)
    .sort((a, b) => a - b)
    .map((n) => BUILTIN_TEMPLATES[n]);
}

/**
 * Get a named export (non-default) from a specific stage module.
 * Returns null if the stage or export is missing — never throws on lookup.
 * Use this instead of `import { evaluateXyz } from './stage-templates/index.js'`
 * to get a barrel-rot-resistant accessor.
 *
 * @param {number} stageNumber
 * @param {string} exportName
 * @returns {*|null}
 */
export function getNamedExport(stageNumber, exportName) {
  const mod = STAGE_MODULES[stageNumber];
  if (!mod) return null;
  return mod[exportName] ?? null;
}

/**
 * Build a snapshot of all named (non-default) exports across all stage modules.
 * Shape: { exportName: { stageNumber: value } }.
 * Useful for diagnostics and contract tests.
 * @returns {Object}
 */
export function getAllNamedExports() {
  const result = {};
  for (const [num, mod] of Object.entries(STAGE_MODULES)) {
    for (const [name, value] of Object.entries(mod)) {
      if (name === 'default') continue;
      if (!result[name]) result[name] = {};
      result[name][Number(num)] = value;
    }
  }
  return result;
}

// Backward-compatible named-function re-exports — synthesized from
// discovered modules so deletions resolve to undefined (clear runtime
// signal) rather than ESM static-link crash.
// New consumers should use getNamedExport(stageNumber, exportName).
// Symbols deleted by SD-REDESIGN-S18S26-E+F (PR #3211) intentionally
// resolve to undefined here; a removed export no longer corrupts the
// barrel's static-link contract.
export const ARCHETYPES = STAGE_MODULES[1]?.ARCHETYPES;
export const STAGE02_METRIC_NAMES = STAGE_MODULES[2]?.METRIC_NAMES;
export const PRICING_MODELS = STAGE_MODULES[4]?.PRICING_MODELS;
export const evaluateStage03KillGate = STAGE_MODULES[3]?.evaluateKillGate;
export const evaluateStage05KillGate = STAGE_MODULES[5]?.evaluateKillGate;
export const evaluateStage13KillGate = STAGE_MODULES[13]?.evaluateKillGate;
export const evaluatePhase2RealityGate = STAGE_MODULES[9]?.evaluateRealityGate;
export const evaluatePhase3RealityGate = STAGE_MODULES[12]?.evaluateRealityGate;
export const evaluatePhase4PromotionGate = STAGE_MODULES[17]?.evaluatePromotionGate;

// Backward-compatible default re-exports (stage01..stage26)
// — synthesized from the discovered map so deletions propagate.
export const stage01 = BUILTIN_TEMPLATES[1];
export const stage02 = BUILTIN_TEMPLATES[2];
export const stage03 = BUILTIN_TEMPLATES[3];
export const stage04 = BUILTIN_TEMPLATES[4];
export const stage05 = BUILTIN_TEMPLATES[5];
export const stage06 = BUILTIN_TEMPLATES[6];
export const stage07 = BUILTIN_TEMPLATES[7];
export const stage08 = BUILTIN_TEMPLATES[8];
export const stage09 = BUILTIN_TEMPLATES[9];
export const stage10 = BUILTIN_TEMPLATES[10];
export const stage11 = BUILTIN_TEMPLATES[11];
export const stage12 = BUILTIN_TEMPLATES[12];
export const stage13 = BUILTIN_TEMPLATES[13];
export const stage14 = BUILTIN_TEMPLATES[14];
export const stage15 = BUILTIN_TEMPLATES[15];
export const stage16 = BUILTIN_TEMPLATES[16];
export const stage17 = BUILTIN_TEMPLATES[17];
export const stage18 = BUILTIN_TEMPLATES[18];
export const stage19 = BUILTIN_TEMPLATES[19];
export const stage20 = BUILTIN_TEMPLATES[20];
export const stage21 = BUILTIN_TEMPLATES[21];
export const stage22 = BUILTIN_TEMPLATES[22];
export const stage23 = BUILTIN_TEMPLATES[23];
export const stage24 = BUILTIN_TEMPLATES[24];
export const stage25 = BUILTIN_TEMPLATES[25];
export const stage26 = BUILTIN_TEMPLATES[26];
