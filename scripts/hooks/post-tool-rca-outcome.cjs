#!/usr/bin/env node
/**
 * post-tool-rca-outcome.cjs — capture tool outcome for next PreToolUse signature mix.
 *
 * SD-LEO-INFRA-RCA-TIERED-SIGNATURE-001
 *
 * Reads tool_response from STDIN payload (per verified 2026-05-04 hook
 * stdin/env contract — env contains only 6 CLAUDE_* vars, NOT tool_response).
 * Writes .claude/last-outcome-<session>.json with {tool_name, exit_code,
 * stderr_sha, captured_at}. PreToolUse reads this file on next call and threads
 * the digest into signatureFor() so iterative TDD (different stderr each retry)
 * naturally tracks attempts=1 instead of tripping the 3-strikes counter.
 *
 * Hook contract:
 *   - Always exits 0 (fail-open). Bookkeeping must NOT block tool execution.
 *   - matcher: "Bash" in .claude/settings.json restricts firing.
 *   - Feature-flag: LEO_RCA_OUTCOME_CAPTURE=off short-circuits the write.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TOOL_NAME = process.env.CLAUDE_TOOL_NAME || '';
const STDIN_TIMEOUT_MS = 1000;

function getStdinJson(timeoutMs) {
  return new Promise((resolve) => {
    let chunks = [];
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    }, timeoutMs);

    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        if (!raw) return resolve(null);
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
    process.stdin.on('error', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(null);
      }
    });
  });
}

function stateFilePath(sessionId) {
  const override = process.env.LEO_RETRY_STATE_DIR;
  const dir = override
    ? path.resolve(override)
    : path.resolve(__dirname, '../../.claude');
  return path.join(dir, `last-outcome-${sessionId}.json`);
}

function digestStderr(stderr) {
  if (typeof stderr !== 'string' || !stderr) return '';
  // First-line canonicalization — captures the failure shape without tying
  // the digest to volatile fields like file paths or timestamps in subsequent lines.
  const firstLine = stderr.split(/\r?\n/, 1)[0] || '';
  return crypto.createHash('sha256').update(firstLine).digest('hex').slice(0, 16);
}

(async () => {
  try {
    // Feature-flag gate.
    const flag = (process.env.LEO_RCA_OUTCOME_CAPTURE || 'on').toLowerCase();
    if (flag === 'off' || flag === '0' || flag === 'false') return;

    // SD-FDBK-REFAC-ADOPT-RESOLVESESSIONID-CASCADE-001: read the stdin payload FIRST,
    // then resolve session_id from it (canonical cascade: stdin session_id → env).
    // PostToolUse does NOT propagate CLAUDE_SESSION_ID, so the prior env-only resolve
    // (run BEFORE the stdin read) always yielded '' and this hook silently no-op'd —
    // the last-outcome file was never written and the RCA tiered-signature feature was
    // effectively dead. stdin is single-consumption, so resolve from the already-parsed
    // payload via the canonical isValidSessionId rather than calling resolveSessionId()
    // (which would re-read drained stdin).
    const payload = await getStdinJson(STDIN_TIMEOUT_MS);
    if (!payload || typeof payload !== 'object') return;

    const { isValidSessionId } = require('../../lib/hooks/session-id.cjs');
    const sessionId =
      (isValidSessionId(payload.session_id) && payload.session_id) ||
      process.env.CLAUDE_SESSION_ID ||
      process.env.SESSION_ID ||
      '';
    if (!sessionId) return;

    // Claude Code hook payload: tool_response is the structured outcome.
    // Accept multiple shapes for robustness across hook protocol versions.
    const resp = payload.tool_response || payload.response || payload || {};
    const toolName = TOOL_NAME || payload.tool_name || resp.tool_name || '';
    if (!toolName) return;

    // Only Bash carries exit code semantics relevant to this signature mix.
    // For other tools, outcome capture is unnecessary (signatures are file_path-keyed).
    if (toolName !== 'Bash') return;

    const numericExit =
      typeof resp.exit_code === 'number'
        ? resp.exit_code
        : typeof resp.code === 'number'
          ? resp.code
          : typeof resp.status === 'number'
            ? resp.status
            : null;
    const stderr =
      typeof resp.stderr === 'string'
        ? resp.stderr
        : typeof resp.error === 'string'
          ? resp.error
          : '';
    const stderrSha = digestStderr(stderr);

    // SD-LEO-INFRA-RCA-AUTOSIGNAL-FALSE-POSITIVE-001 (Control 4 — exit-code capture).
    // Claude Code's Bash tool_response carries NO numeric exit_code, so a SUCCESSFUL
    // command previously hit the `exitCode===null && !stderrSha` skip below and wrote no
    // last-outcome file → the next PreToolUse signature collapsed to command-only (zero
    // entropy) → identical read-only/idempotent ticks accumulated to the 3-strikes
    // hard-block (43 false 'stuck' signals in 26h). FIX: infer success from ABSENCE OF
    // FAILURE and record exit_code 0 so the succeeding-poll exemption in recordAndCount
    // can fire. STRICT (R2/R3): never infer success when a numeric non-zero code is
    // present, when stderr/error is non-empty, or when the call was interrupted/flagged —
    // those keep accumulating (teeth preserved). When numericExit is a number it is used
    // verbatim (0 = success, non-zero = failure).
    const failureFlag =
      resp.is_error === true ||
      resp.isError === true ||
      resp.interrupted === true ||
      (resp.error != null && resp.error !== '');
    let exitCode = numericExit;
    if (exitCode === null && !stderrSha && !failureFlag) {
      exitCode = 0; // no failure signal of any kind → record success
    }

    // Skip only when there is STILL no usable signal (e.g. a bare failure flag with no
    // detail) — accumulation/teeth for genuine failures are preserved by NOT exempting.
    if (exitCode === null && !stderrSha) return;

    // SD-FDBK-FIX-RCA-TIERED-ENFORCEMENT-001: capture command_sha so the next PreToolUse
    // can scope the succeeding-poll exemption to the SAME command (recordAndCount compares
    // it to bashCmdHash(currentCommand) = sha256(cmd).slice(0,16)). Best-effort; left empty
    // when the command is unavailable (an empty value never matches a real hash → no false
    // exemption, preserving fail-open/back-compat).
    const command =
      payload.tool_input && typeof payload.tool_input.command === 'string'
        ? payload.tool_input.command
        : typeof resp.command === 'string'
          ? resp.command
          : '';
    const commandSha = command
      ? crypto.createHash('sha256').update(command).digest('hex').slice(0, 16)
      : '';

    const outcome = {
      tool_name: toolName,
      exit_code: exitCode,
      stderr_sha: stderrSha,
      command_sha: commandSha,
      captured_at: new Date().toISOString(),
    };

    const fp = stateFilePath(sessionId);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    const tmp = `${fp}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(outcome), 'utf8');
    fs.renameSync(tmp, fp);
  } catch (err) {
    // Fail-open: log to stderr but never throw.
    if (process.env.LEO_TELEMETRY_DEBUG === '1') {
      process.stderr.write(`[post-tool-rca-outcome] ${err.message}\n`);
    }
  } finally {
    process.exit(0);
  }
})();
