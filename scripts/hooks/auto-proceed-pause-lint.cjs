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

// SD-LEO-INFRA-AUTO-ENFORCE-POST-001 (FR-003): post-completion confirmation-fishing.
// Catches "I didn't run /document and /learn — say the word if you want them" style
// asking that the generic FORBIDDEN regex above misses. Tuned to NOT match benign
// reports like "I ran /document and /learn".
const FORBIDDEN_POST_COMPLETION = /(say the word|let me know if you(?:'?d| would)?\s+(?:want|like)|(?:did|do|does|have|has)\s*n['o]?t\s+(?:yet\s+)?run[^.\n]{0,60}(?:document|learn|heal|tail)|want(?:\s+me)?\s+to\s+run\s+(?:them|\/?document|\/?learn|the\s+tail)|if you want(?:\s+me)?(?:\s+to)?(?:\s+run)?\s+(?:them|\/?document|\/?learn))/i;

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
  const mPost = text.match(FORBIDDEN_POST_COMPLETION);
  if (!m && !mPost) { process.exit(0); }
  if (!autoProceedOn()) { process.exit(0); }

  const hit = (m && m[0]) || (mPost && mPost[0]);
  const context = mPost
    ? `Post-completion /document, /heal, and /learn are CONTINUATION steps, NOT pause points — run them now without asking ("say the word if you want them" IS the anti-pattern; /leo complete sequences the full tail). `
    : `Phase boundaries, scope size, and "substantial work" are NOT pause points. `;

  process.stderr.write(
    `[auto-proceed-pause-lint] PROTOCOL VIOLATION DETECTED: assistant suggested pausing/confirmation ("${hit}") while AUTO-PROCEED is ON. ` +
    context +
    `Per CLAUDE.md AUTO-PROCEED Mode, only these stop: orchestrator completion, blocking errors, test failures (2 retries), merge conflicts, all children blocked. ` +
    `Continue working without asking.\n`
  );
  process.exit(0);
}

main();
