#!/usr/bin/env node
// no-self-approval-chairman-decisions.mjs — SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-F FR-2.
//
// Asserts no analysis module under lib/eva/stage-templates/analysis-steps/ self-approves
// its own chairman_decisions row: a .from('chairman_decisions').update({...}) call whose
// payload sets status:'approved' or decision:'approve'. C4.1 removed exactly this shape
// from stage-17-blueprint-review.js after live-verifying it always silently failed
// (chairman_decisions has no resolved_at column, PostgREST 42703).
//
// Scoped narrowly to the self-approval SHAPE, not a blanket "no chairman_decisions write"
// rule — stage-22-distribution-setup.js legitimately SELECTs and creates PENDING rows
// against the same table and must not false-positive.
//
// Text-based, not per-line grep: the real call chain spans multiple source lines
// (.from(...) and .update({...}) on separate lines), so a single-line grep pattern would
// never match. This scans whole-file text with a window-based regex instead.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const TARGET_DIR = path.join(REPO_ROOT, 'lib/eva/stage-templates/analysis-steps');

/**
 * Pure: scan a single file's source text for the chairman_decisions self-approval shape.
 * Window-based (not per-line) so a multi-line .from(...).update({...}) chain is still
 * detected. Returns an array of { line, snippet } matches (empty if none).
 *
 * @param {string} sourceText
 * @returns {Array<{ line: number, snippet: string }>}
 */
export function findSelfApprovalWrites(sourceText) {
  const matches = [];
  const fromRe = /\.from\(\s*(['"])chairman_decisions\1\s*\)/g;
  let m;
  while ((m = fromRe.exec(sourceText)) !== null) {
    const startIdx = m.index;
    const windowEnd = Math.min(sourceText.length, startIdx + 500);
    const window = sourceText.slice(startIdx, windowEnd);

    // The next chained call after .from('chairman_decisions') must be .update({...})
    // for this to be a candidate self-approval write at all (a .select(...) or a chain
    // that never calls .update within the window is not this anti-pattern).
    const updateMatch = window.match(/\.update\(\s*\{([\s\S]*?)\}\s*\)/);
    if (!updateMatch) continue;

    const payload = updateMatch[1];
    const setsApprovedStatus = /status\s*:\s*(['"])approved\1/.test(payload);
    const setsApproveDecision = /decision\s*:\s*(['"])approve\1/.test(payload);
    if (setsApprovedStatus || setsApproveDecision) {
      const line = sourceText.slice(0, startIdx).split('\n').length;
      matches.push({ line, snippet: window.slice(0, updateMatch.index + updateMatch[0].length) });
    }
  }
  return matches;
}

/**
 * Pure: scan every .js file directly under dirPath for the self-approval shape.
 * @param {string} dirPath
 * @param {{ readdirSync?: Function, readFileSync?: Function }} [io] - injectable for tests
 * @returns {Array<{ file: string, matches: Array<{ line: number, snippet: string }> }>}
 */
export function scanDirectoryForSelfApproval(dirPath, io = {}) {
  const readdirSync = io.readdirSync || fs.readdirSync;
  const readFileSync = io.readFileSync || fs.readFileSync;

  const files = readdirSync(dirPath).filter((f) => f.endsWith('.js'));
  const offenders = [];
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const text = readFileSync(filePath, 'utf8');
    const matches = findSelfApprovalWrites(text);
    if (matches.length > 0) {
      offenders.push({ file: filePath, matches });
    }
  }
  return offenders;
}

function main() {
  const offenders = scanDirectoryForSelfApproval(TARGET_DIR);
  if (offenders.length > 0) {
    console.error(JSON.stringify({ status: 'FAIL', scanned_dir: TARGET_DIR, offenders }, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify({ status: 'PASS', scanned_dir: TARGET_DIR, files_scanned_with_chairman_decisions_touch: 'see offenders (none)' }, null, 2));
}

if (isMainModule(import.meta.url)) {
  main();
}
