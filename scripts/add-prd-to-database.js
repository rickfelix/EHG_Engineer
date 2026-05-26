#!/usr/bin/env node

/**
 * Add PRD to database
 * Creates a PRD entry for a given Strategic Directive
 *
 * Enhanced with:
 * - Auto-trigger for Product Requirements Expert (STORIES sub-agent)
 * - Semantic component recommendations with explainable AI
 *
 * Part of Phase 3.2: User story validation enforcement
 * Part of Semantic Component Selector: PRD enhancement
 *
 * NOTE: This file has been refactored into modular components.
 * See scripts/prd/ for the modular implementation.
 * SD-LEO-REFACTOR-PRD-DB-002
 */

// Re-export everything from modular structure
export { addPRDToDatabase } from './prd/index.js';
export { generatePRDContentWithLLM, buildPRDGenerationContext } from './prd/llm-generator.js';
export {
  formatArrayField,
  formatRisks,
  formatMetadata,
  formatVisionSpecs,
  formatGovernance,
  formatObjectives,
  formatPRDContent
} from './prd/formatters.js';
export { LLM_PRD_CONFIG, PRD_QUALITY_RUBRIC_CRITERIA, buildSystemPrompt } from './prd/config.js';
export {
  executeDesignAnalysis,
  executeDatabaseAnalysis,
  executeSecurityAnalysis,
  executeRiskAnalysis
} from './prd/sub-agent-orchestrator.js';
export {
  createPRDEntry,
  updatePRDWithAnalyses,
  updatePRDWithLLMContent,
  updatePRDWithComponentRecommendations,
  checkPRDTableExists,
  printTableCreationSQL,
  fetchExistingUserStories
} from './prd/prd-creator.js';

// CLI entry point - delegate to modular index
import fs from 'node:fs';
import { addPRDToDatabase } from './prd/index.js';
import { isMainModule } from '../lib/utils/is-main-module.js';
import { startHeartbeat, stopHeartbeat } from '../lib/heartbeat-manager.mjs';

// SD-FDBK-INFRA-ADD-PRD-DATABASE-001: --content flag closes the INLINE-mode Catch-22.
// 2MB cap prevents parse-bomb / memory-exhaustion on file or stdin input (R4 mitigation).
const CONTENT_PAYLOAD_MAX_BYTES = 2 * 1024 * 1024;

function readStdinSync() {
  return fs.readFileSync(0, { encoding: 'utf8' });
}

export function loadContentPayload(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    throw new Error('--content requires a value (file path with @ prefix, "-" for stdin, or literal JSON)');
  }
  let raw;
  if (rawValue === '-') {
    raw = readStdinSync();
  } else if (rawValue.startsWith('@')) {
    const filePath = rawValue.slice(1);
    if (!filePath) throw new Error('--content @<path>: empty file path');
    if (!fs.existsSync(filePath)) {
      const err = new Error(`--content @${filePath}: file not found`);
      err.code = 'CONTENT_FILE_NOT_FOUND';
      throw err;
    }
    const stat = fs.statSync(filePath);
    if (stat.size > CONTENT_PAYLOAD_MAX_BYTES) {
      throw new Error(`--content @${filePath}: PAYLOAD_TOO_LARGE (${stat.size} bytes > ${CONTENT_PAYLOAD_MAX_BYTES} cap)`);
    }
    raw = fs.readFileSync(filePath, 'utf8');
  } else {
    raw = rawValue;
  }
  if (Buffer.byteLength(raw, 'utf8') > CONTENT_PAYLOAD_MAX_BYTES) {
    throw new Error(`--content: PAYLOAD_TOO_LARGE (${Buffer.byteLength(raw, 'utf8')} bytes > ${CONTENT_PAYLOAD_MAX_BYTES} cap)`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    const err = new Error(`--content: INVALID_JSON (${e.message})`);
    err.code = 'CONTENT_INVALID_JSON';
    throw err;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('--content: payload must be a JSON object (got ' + (Array.isArray(parsed) ? 'array' : typeof parsed) + ')');
  }
  return parsed;
}

/**
 * QF-20260526-436: shape pre-check for --content payloads.
 *
 * loadContentPayload() catches JSON syntax errors (bracket-typos, trailing
 * commas) and asserts the top-level is an object. Beyond that, payloads with
 * the WRONG SHAPE — e.g. `integration_operationalization: []` (array instead
 * of object), `functional_requirements: ['string']` (strings instead of
 * objects), `risks: {}` (object instead of array) — pass loadContentPayload
 * silently and burn full sub-agent orchestration before failing at the
 * quality gate or quietly producing a malformed PRD row.
 *
 * This pure check enforces the PRD content contract used by scripts/prd/
 * downstream code. Only validates the SHAPE / TYPE of keys when PRESENT —
 * required-key enforcement and minimum-array-size enforcement remain in
 * scripts/prd/quality-validator.js (which the orchestrator runs after sub-agent
 * work).
 *
 * Throws Error with `code = 'CONTENT_SHAPE_VIOLATION'` and a multi-line
 * message naming every offending key, so the user can fix them all in one
 * edit instead of one-at-a-time discovery.
 *
 * @param {object} payload — already parsed JSON object (post loadContentPayload)
 * @throws {Error} with code 'CONTENT_SHAPE_VIOLATION' if any key has the wrong type
 */
export function validateContentPayloadShape(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const e = new Error(`--content: SHAPE_VIOLATION (top-level): expected object, got ${Array.isArray(payload) ? 'array' : payload === null ? 'null' : typeof payload}`);
    e.code = 'CONTENT_SHAPE_VIOLATION';
    throw e;
  }
  const errors = [];
  const typeOf = (v) => Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
  const expectArray = (key) => {
    if (!(key in payload)) return;
    if (!Array.isArray(payload[key])) {
      errors.push(`.${key}: expected array, got ${typeOf(payload[key])}`);
    }
  };
  const expectObject = (key) => {
    if (!(key in payload)) return;
    const v = payload[key];
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      errors.push(`.${key}: expected object, got ${typeOf(v)}`);
    }
  };
  const expectArrayOfObjects = (key) => {
    if (!(key in payload)) return;
    if (!Array.isArray(payload[key])) {
      errors.push(`.${key}: expected array, got ${typeOf(payload[key])}`);
      return;
    }
    payload[key].forEach((item, idx) => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) {
        errors.push(`.${key}[${idx}]: expected object, got ${typeOf(item)}`);
      }
    });
  };
  // Array-of-object PRD fields (rubric requires per-item structure)
  expectArrayOfObjects('functional_requirements');
  expectArrayOfObjects('technical_requirements');
  expectArrayOfObjects('test_scenarios');
  expectArrayOfObjects('risks');
  expectArrayOfObjects('smoke_test_steps');
  // Loose-array fields (item shape varies; just enforce top-level type)
  expectArray('acceptance_criteria');
  expectArray('strategic_objectives');
  expectArray('key_changes');
  // Object fields (the integration_operationalization typo bit me directly here)
  expectObject('integration_operationalization');
  expectObject('metadata');
  expectObject('system_architecture');
  expectObject('implementation_approach');

  if (errors.length > 0) {
    const e = new Error(`--content: SHAPE_VIOLATIONS (${errors.length}):\n  - ${errors.join('\n  - ')}`);
    e.code = 'CONTENT_SHAPE_VIOLATION';
    throw e;
  }
}

export function extractContentArg(args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--content') {
      const value = args[i + 1];
      const remaining = [...args.slice(0, i), ...args.slice(i + 2)];
      return { value, remaining };
    }
    if (a.startsWith('--content=')) {
      const value = a.slice('--content='.length);
      const remaining = [...args.slice(0, i), ...args.slice(i + 1)];
      return { value, remaining };
    }
  }
  return { value: undefined, remaining: args };
}

export { CONTENT_PAYLOAD_MAX_BYTES };

if (isMainModule(import.meta.url)) {
  // SD-LEO-FIX-SESSION-LIFECYCLE-HYGIENE-001 (FR1 call-site migration):
  // PRD creation is sub-agent-heavy and regularly exceeds the 15-min claim
  // TTL (validation-agent + LLM generation + STORIES sub-agent). Start an
  // in-process heartbeat in cooperative mode so the parent session's
  // claim is preserved throughout. No-op when CLAUDE_SESSION_ID is absent.
  const heartbeatActive = Boolean(process.env.CLAUDE_SESSION_ID);
  if (heartbeatActive) {
    startHeartbeat(process.env.CLAUDE_SESSION_ID, { ownershipMode: 'cooperative' });
  }

  const argv = process.argv.slice(2);
  if (argv.length < 1) {
    console.log('Usage: node scripts/add-prd-to-database.js <SD-ID> [PRD-Title] [--content @path | --content - | --content \'<json>\']');
    console.log('Example: node scripts/add-prd-to-database.js SD-DASHBOARD-AUDIT-2025-08-31-A "Dashboard Audit PRD"');
    console.log('Example: node scripts/add-prd-to-database.js SD-XXX-001 --content @./my-prd.json');
    console.log('Example: cat prd.json | node scripts/add-prd-to-database.js SD-XXX-001 --content -');
    process.exit(1);
  }

  // SD-FDBK-INFRA-ADD-PRD-DATABASE-001: parse --content BEFORE addPRDToDatabase()
  // so the INLINE-branch process.exit(0) at scripts/prd/index.js:540 is never reached
  // (IR2 critical: gate-route at CLI argv-parse).
  const { value: contentValue, remaining: args } = extractContentArg(argv);

  let contentOverride = null;
  if (contentValue !== undefined) {
    try {
      contentOverride = loadContentPayload(contentValue);
      // QF-20260526-436: fail-fast shape pre-check BEFORE addPRDToDatabase()
      // spends ~5 min on sub-agent orchestration on a malformed payload.
      validateContentPayloadShape(contentOverride);
    } catch (e) {
      console.error(`\n❌ ${e.message}`);
      if (heartbeatActive) stopHeartbeat();
      process.exit(1);
    }
  }

  const sdId = args[0];
  const prdTitle = args.slice(1).filter(a => !a.startsWith('--')).join(' ');
  // QF-20260424-805: Stop the heartbeat interval after addPRDToDatabase resolves
  // so Node can exit naturally. Without this, setInterval keeps the event loop
  // alive forever and Bash SIGTERMs the process at its 10-min default timeout
  // (exit 143) — even though the PRD + user-story rows already landed in the DB.
  // Cooperative mode means stopHeartbeat does NOT release the parent session's
  // claim; only the in-process timer is cleared.
  addPRDToDatabase(sdId, prdTitle, contentOverride).finally(() => {
    if (heartbeatActive) stopHeartbeat();
  });
}
