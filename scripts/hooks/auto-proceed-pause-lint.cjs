#!/usr/bin/env node
/**
 * auto-proceed-pause-lint
 *
 * Stop hook: scans the most recent assistant message for protocol-violating
 * pause/confirm phrases. If found AND AUTO-PROCEED is ON, emits a system
 * reminder telling the model to keep working.
 *
 * Non-blocking: never exits non-zero. Output goes to stderr → surfaced as
 * system reminder by Claude Code.
 *
 * Wired in .claude/settings.json under "Stop".
 *
 * Background: see CAPA from RCA on 2026-04-06 — model invented "substantial
 * work warrants confirmation" pause not present in any protocol doc.
 */

const fs = require('fs');

const FORBIDDEN = /(want me to (continue|proceed)|pause here|warrants confirmation|good stopping point|substantial[^.]{0,80}(confirm|pause|proceed)|continue.*or pause)/i;

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function getLastAssistantText(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return '';
  try {
    const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const obj = JSON.parse(lines[i]);
        if (obj.type === 'assistant' && obj.message?.content) {
          const c = obj.message.content;
          if (Array.isArray(c)) {
            return c.filter(b => b.type === 'text').map(b => b.text).join('\n');
          }
          if (typeof c === 'string') return c;
        }
      } catch {}
    }
  } catch {}
  return '';
}

function autoProceedOn() {
  // Cheap check: state file written by other hooks. If absent, assume ON (default).
  try {
    const p = '.claude/auto-proceed-state.json';
    if (!fs.existsSync(p)) return true;
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return j.auto_proceed !== false;
  } catch {
    return true;
  }
}

function main() {
  let payload = {};
  try { payload = JSON.parse(readStdin() || '{}'); } catch {}
  const text = getLastAssistantText(payload.transcript_path);
  if (!text) { process.exit(0); }
  const m = text.match(FORBIDDEN);
  if (!m) { process.exit(0); }
  if (!autoProceedOn()) { process.exit(0); }

  process.stderr.write(
    `[auto-proceed-pause-lint] PROTOCOL VIOLATION DETECTED: assistant suggested pausing/confirmation ("${m[0]}") while AUTO-PROCEED is ON. ` +
    `Phase boundaries, scope size, and "substantial work" are NOT pause points. ` +
    `Per CLAUDE.md AUTO-PROCEED Mode, only these stop: orchestrator completion, blocking errors, test failures (2 retries), merge conflicts, all children blocked. ` +
    `Continue working without asking.\n`
  );
  process.exit(0);
}

main();
