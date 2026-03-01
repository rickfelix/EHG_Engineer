// ============================================================================
// Status Line Context Tracker (Node.js)
// ============================================================================
// Purpose: Reliable cross-platform status line for Claude Code on Windows.
// Replaces the PowerShell version which had stdin reading issues when Claude
// Code spawns the process directly (not via a PowerShell pipeline).
//
// Features:
//   - Activity signal: [YOUR TURN] when idle
//   - Context usage bar (fills to 100% at auto-compaction threshold of 80%)
//   - Threshold alerts: WARNING @ 60%, CRITICAL @ 80%, EMERGENCY @ 95%
//   - Model abbreviation
//   - Git branch + dirty flag
//   - Worktree SD detection
//   - AUTO-PROCEED status from .leo-status.json
//
// Settings command:
//   "node C:/Users/rickf/Projects/_EHG/EHG_Engineer/.claude/statusline.js"
// ============================================================================

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const LOG_DIR = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.claude/logs';
const STATE_FILE = path.join(LOG_DIR, '.context-state.json');
const AUTOCOMPACT_PCT = 80;
const WARNING_THRESHOLD = 60;
const CRITICAL_THRESHOLD = 80;
const EMERGENCY_THRESHOLD = 95;

// ANSI escape codes
const ESC = '\x1b';
const RESET = `${ESC}[0m`;
const GREEN = `${ESC}[0;32m`;
const YELLOW = `${ESC}[0;33m`;
const RED = `${ESC}[0;31m`;
const BOLD_RED = `${ESC}[1;31m`;
const WHITE_ON_RED = `${ESC}[97;41m`;

// Ensure log dir exists
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (_) {}

// Read stdin synchronously via fd 0 — works reliably on Windows when Claude Code
// spawns this process and writes JSON to its stdin (not a PowerShell pipeline).
let inputJson = '';
try {
  inputJson = fs.readFileSync(0, 'utf8');
} catch (_) {}

let data = null;
if (inputJson && inputJson.trim().length > 0) {
  try {
    data = JSON.parse(inputJson.trim());
  } catch (_) {
    process.stdout.write('? parse err\n');
    process.exit(0);
  }
}

if (!data) {
  process.stdout.write('EHG_Engineer (no data)\n');
  process.exit(0);
}

// Extract fields
const model = (data.model && data.model.display_name) || 'Unknown';
const contextSize = (data.context_window && data.context_window.context_window_size) || 200000;
const currentUsage = (data.context_window && data.context_window.current_usage) || {};
const inputTokens = currentUsage.input_tokens || 0;
const outputTokens = currentUsage.output_tokens || 0;
const cacheCreation = currentUsage.cache_creation_input_tokens || 0;
const cacheRead = currentUsage.cache_read_input_tokens || 0;
const totalInputTokens = (data.context_window && data.context_window.total_input_tokens) || 0;
const totalOutputTokens = (data.context_window && data.context_window.total_output_tokens) || 0;
const sessionId = data.session_id || 'unknown';
const cwd = data.cwd || 'unknown';

// Model abbreviation
function abbreviateModel(m) {
  if (/Opus.*4\.6/i.test(m)) return 'O4.6';
  if (/Opus.*4\.5/i.test(m)) return 'O4.5';
  if (/Opus.*4/i.test(m)) return 'O4';
  if (/Sonnet.*4\.6/i.test(m)) return 'S4.6';
  if (/Sonnet.*4/i.test(m)) return 'S4';
  if (/Sonnet.*3\.5/i.test(m)) return 'S3.5';
  if (/Haiku.*4\.5/i.test(m)) return 'H4.5';
  if (/Haiku.*3\.5/i.test(m)) return 'H3.5';
  if (/Haiku/i.test(m)) return 'H';
  return m.substring(0, 4);
}
const modelShort = abbreviateModel(model);

// Context usage
const contextUsed = inputTokens + outputTokens + cacheCreation + cacheRead;
const usableContext = Math.max(1, Math.floor(contextSize * AUTOCOMPACT_PCT / 100));
const percentUsed = Math.min(100, Math.floor(contextUsed * 100 / usableContext));

// Status level (shifted: old-red→yellow, old-yellow→hidden)
let status = 'HEALTHY';
let icon = '';
if (percentUsed >= EMERGENCY_THRESHOLD) { status = 'EMERGENCY'; icon = ' !'; }
else if (percentUsed >= CRITICAL_THRESHOLD) { status = 'CRITICAL'; icon = ' *'; }

// Progress bar
const BAR_WIDTH = 20;
const filled = Math.floor(percentUsed * BAR_WIDTH / 100);
const empty = BAR_WIDTH - filled;
const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
let barColor = GREEN;
if (percentUsed >= EMERGENCY_THRESHOLD) barColor = RED;
else if (percentUsed >= CRITICAL_THRESHOLD) barColor = YELLOW;

// Git info
let gitBranch = '';
let gitDirty = '';
try {
  const gitDir = path.join(cwd, '.git');
  if (fs.existsSync(gitDir)) {
    gitBranch = execSync('git symbolic-ref --short HEAD 2>NUL', {
      cwd, encoding: 'utf8', timeout: 2000, windowsHide: true
    }).trim();
    if (!gitBranch) {
      try {
        gitBranch = execSync('git describe --tags --exact-match 2>NUL', {
          cwd, encoding: 'utf8', timeout: 2000, windowsHide: true
        }).trim() || 'detached';
      } catch (_) { gitBranch = 'detached'; }
    }
    try {
      execSync('git diff --quiet 2>NUL', { cwd, timeout: 2000, windowsHide: true });
    } catch (_) { gitDirty = '*'; }
    if (!gitDirty) {
      try {
        execSync('git diff --cached --quiet 2>NUL', { cwd, timeout: 2000, windowsHide: true });
      } catch (_) { gitDirty = '*'; }
    }
  }
} catch (_) {}

// Worktree SD detection
let activeWorktreeSd = '';
try {
  const worktreesDir = path.join(cwd, '.worktrees');
  if (fs.existsSync(worktreesDir)) {
    const dirs = fs.readdirSync(worktreesDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && fs.existsSync(path.join(worktreesDir, d.name, '.worktree.json')))
      .map(d => d.name);
    if (dirs.length === 1) activeWorktreeSd = dirs[0];
    else if (dirs.length > 1) activeWorktreeSd = `${dirs.length}wt`;
  }
} catch (_) {}

// Activity state
let activityState = 'idle';
try {
  if (fs.existsSync(STATE_FILE)) {
    const prev = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (prev.hook_triggered === true) {
      activityState = prev.activity_state || 'idle';
    } else {
      const prevOutput = prev.last_output_tokens || 0;
      const prevInput = prev.last_input_tokens || 0;
      const nowEpoch = Math.floor(Date.now() / 1000);
      let lastActive = prev.last_active_epoch || nowEpoch;
      if (totalOutputTokens > prevOutput || totalInputTokens > prevInput) {
        lastActive = nowEpoch;
      }
      const timeSinceActive = nowEpoch - lastActive;
      if (timeSinceActive <= 4) activityState = 'running';
    }
  }
} catch (_) {}

// Activity signal
const activitySignal = activityState === 'running'
  ? ''
  : `${WHITE_ON_RED}[ YOUR TURN  ]${RESET} `;

// AUTO-PROCEED status
let autoProceedInfo = '';
try {
  const leoStatusFile = path.join(cwd, '.leo-status.json');
  if (fs.existsSync(leoStatusFile)) {
    const leoStatus = JSON.parse(fs.readFileSync(leoStatusFile, 'utf8'));
    if (leoStatus.autoProceed && leoStatus.autoProceed.isActive) {
      const apPhase = leoStatus.autoProceed.phase || '?';
      const apProgress = leoStatus.autoProceed.progress != null ? leoStatus.autoProceed.progress : '?';
      let childInfo = '';
      if (leoStatus.autoProceed.childProgress) {
        const cc = leoStatus.autoProceed.childProgress.current;
        const ct = leoStatus.autoProceed.childProgress.total;
        if (cc != null) childInfo = ct != null ? ` C${cc}/${ct}` : ` C${cc}/?`;
      }
      autoProceedInfo = ` | AP:ON/${apPhase}/${apProgress}%${childInfo}`;
    }
  }
} catch (_) {}

// Project info
const projectName = path.basename(cwd);
let projectInfo = projectName;
if (gitBranch && activeWorktreeSd) projectInfo = `${projectName}:${gitBranch}${gitDirty} [${activeWorktreeSd}]`;
else if (gitBranch) projectInfo = `${projectName}:${gitBranch}${gitDirty}`;

// Progress section (only show when WARNING or above)
const progressSection = status === 'HEALTHY'
  ? ''
  : ` ${barColor}[${bar}]${RESET} ${percentUsed}%${icon}`;

// Build output
const output = `${activitySignal}${projectInfo}${autoProceedInfo}${progressSection} (${modelShort})`;

// Update state file
try {
  const nowEpoch = Math.floor(Date.now() / 1000);
  const newState = {
    last_context_used: contextUsed,
    last_percent: percentUsed,
    usable_context: usableContext,
    last_status: status,
    last_update: new Date().toISOString(),
    last_update_epoch: nowEpoch,
    last_output_tokens: totalOutputTokens,
    last_input_tokens: totalInputTokens,
    last_active_epoch: nowEpoch,
    session_id: sessionId,
    activity_state: activityState,
    hook_triggered: false
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(newState), 'utf8');
} catch (_) {}

process.stdout.write(output + '\n');
process.exit(0);
