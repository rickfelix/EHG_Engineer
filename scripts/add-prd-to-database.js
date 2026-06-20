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
// SD-LEO-INFRA-ARTIFACT-CONTRACT-SINGLE-001: shape checks derive from the PRD
// artifact contract (single spec source shared with contract:scaffold/check).
import { validateArtifact, formatViolations } from '../lib/artifact-contracts/index.js';

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
  // SD-LEO-INFRA-ARTIFACT-CONTRACT-SINGLE-001 (gate-source inversion): the field
  // list and shapes now come from the PRD artifact contract — the same spec that
  // powers `npm run contract:scaffold/check` — so spec and enforcement cannot
  // drift. mode:'shape' is BEHAVIOR-IDENTICAL to the previous hand-rolled checks
  // (type/shape of keys WHEN PRESENT; required-key and minimum-count enforcement
  // remain downstream in scripts/prd/quality-validator.js). Parity pinned by
  // tests/unit/artifact-contracts/. Historical trap notes (grounding field-name
  // trap e8008b14, integration_operationalization-as-array, the
  // system_architecture.components formatter crash) now live as `hint` strings
  // in lib/artifact-contracts/prd-contract.js and are rendered in the error.
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const e = new Error(`--content: SHAPE_VIOLATION (top-level): expected object, got ${Array.isArray(payload) ? 'array' : payload === null ? 'null' : typeof payload}`);
    e.code = 'CONTENT_SHAPE_VIOLATION';
    throw e;
  }
  const { violations } = validateArtifact('prd', payload, { mode: 'shape' });
  if (violations.length > 0) {
    const e = new Error(`--content: SHAPE_VIOLATIONS (${violations.length}):\n${formatViolations(violations)}\n\n  Pre-check payloads with: npm run contract:check -- prd <file> (scaffold: npm run contract:scaffold -- prd)`);
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

/**
 * SD-LEO-INFRA-ADD-PRD-EXIT-CODE-SUCCESS-001: make the process exit code reflect the
 * real outcome. addPRDToDatabase resolves once the PRD + user-story rows have landed, but
 * lingering undici/supabase keep-alive sockets can keep the event loop alive until Bash
 * SIGTERMs the process at its timeout (exit 143) — so callers and automation mis-read a
 * successful write as a failure. Mapping the outcome to an explicit exit code (0 success,
 * 1 failure) and forcing a prompt, flushed exit makes the signal deterministic.
 */
export function resolveExitCode(outcome) {
  return outcome === 'success' ? 0 : 1;
}

/**
 * Drain stdout/stderr, then call exitFn(code) exactly once. Draining first avoids
 * truncating buffered output on piped runs; the unref'd safety timer guarantees we never
 * hang waiting on a 'drain' that may never fire (e.g. a closed/destroyed pipe under the
 * EPIPE-tolerant handlers above). exitFn is injectable for unit testing.
 */
export function flushAndExit(code, exitFn = process.exit, { timeoutMs = 250 } = {}) {
  let exited = false;
  const done = () => { if (!exited) { exited = true; exitFn(code); } };
  let pending = 0;
  for (const stream of [process.stdout, process.stderr]) {
    if (stream && !stream.destroyed && typeof stream.writableLength === 'number' && stream.writableLength > 0) {
      pending++;
      stream.once('drain', () => { if (--pending === 0) done(); });
    }
  }
  if (pending === 0) { done(); return; }
  const t = setTimeout(done, timeoutMs);
  if (t && typeof t.unref === 'function') t.unref();
}

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

  // SD-LEO-INFRA-HARDEN-ADD-PRD-001: EPIPE-tolerant stdout/stderr. This CLI emits ~180KB before the
  // async DB insert; piping it through `head`/`grep` closes the read end, and the next console.log
  // would raise an unhandled 'error' (EPIPE) that crashes the process BEFORE persistence on POSIX/CI
  // (Windows git-bash masks it). Swallow EPIPE on both streams so a closed pipe never aborts the run.
  const ignoreEpipe = (err) => { if (!err || err.code === 'EPIPE') return; throw err; };
  process.stdout.on('error', ignoreEpipe);
  process.stderr.on('error', ignoreEpipe);

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
  // QF-20260424-805: Stop the heartbeat interval after addPRDToDatabase resolves so the
  // setInterval no longer keeps the event loop alive. SD-LEO-INFRA-ADD-PRD-EXIT-CODE-SUCCESS-001:
  // stopping the heartbeat alone is not enough — lingering undici/supabase keep-alive sockets can
  // still hold the loop open until Bash SIGTERMs the process (exit 143) AFTER the PRD + user-story
  // rows already landed, so callers mis-read the success as a failure. Map the outcome to an
  // explicit, flushed exit code instead: 0 on a resolved write (incl. inline-mode null), 1 on a
  // rejection. Cooperative mode means stopHeartbeat does NOT release the parent session's claim.
  addPRDToDatabase(sdId, prdTitle, contentOverride)
    .then(() => {
      if (heartbeatActive) stopHeartbeat();
      flushAndExit(resolveExitCode('success'));
    })
    .catch((err) => {
      console.error(`\n❌ add-prd-to-database failed: ${err?.message || err}`);
      if (heartbeatActive) stopHeartbeat();
      flushAndExit(resolveExitCode('failure'));
    });
}
