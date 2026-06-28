/**
 * walk-mode.cjs — single source of truth for the leo-stack daemon-down "controlled walk"
 * (SD-LEO-INFRA-RESTART-RESPECTS-DAEMON-DOWN-WALK-001).
 *
 * Incident: `leo-stack restart` unconditionally re-enabled the EVA stage-execution workers via
 * Start-Workers (config/workers.json), silently reviving a deliberately-down daemon — which then
 * auto-advanced a venture past a chairman review (S8) and a HARD gate (S10).
 *
 * Fix: an operator-set sentinel file (.leo-stack-walk-mode) marks an active controlled walk. When it
 * is present, leo-stack restart must leave the EVA stage workers STOPPED (web servers still come up).
 * This module owns both the sentinel check and the EVA-worker classification so leo-stack.ps1 and
 * leo-stack.sh stay consistent and the daemon set is unit-tested.
 *
 * @module lib/leo-stack/walk-mode
 */
const fs = require('node:fs');
const path = require('node:path');

const WALK_SENTINEL_FILE = '.leo-stack-walk-mode';

// The EVA stage-execution daemon set. Patterns mirror the orphan/stale regex already in
// leo-stack.ps1 so the daemon is identified consistently everywhere. Matched against worker.command.
const EVA_STAGE_WORKER_PATTERNS = [
  /stage-zero-queue-processor/,
  /start-stage-worker/,
  /stage-execution-worker/,
  /eva-master-scheduler/,
  /subagent-worker/,
  /lib[\\/]eva[\\/]workers/,
];

/** Is a daemon-down controlled walk active? (sentinel file present in repoRoot) */
function isWalkModeActive(repoRoot = process.cwd()) {
  try {
    return fs.existsSync(path.join(repoRoot, WALK_SENTINEL_FILE));
  } catch {
    return false;
  }
}

/** Is this registry worker part of the EVA stage-execution daemon set? */
function isEvaStageWorker(worker) {
  const cmd = String((worker && (worker.command || worker.cmd)) || '');
  const id = String((worker && (worker.id || worker.name || worker.display_name)) || '');
  return EVA_STAGE_WORKER_PATTERNS.some((re) => re.test(cmd) || re.test(id));
}

/**
 * Should leo-stack start this worker given the current walk state? An EVA stage worker is held
 * stopped only while a walk is active; everything else (e.g. web servers, were they ever in the
 * registry) starts normally.
 */
function shouldStartWorker(worker, walkActive) {
  return !(walkActive && isEvaStageWorker(worker));
}

/** Read the worker registry (config/workers.json) from repoRoot; [] on any error. */
function readWorkerRegistry(repoRoot = process.cwd()) {
  try {
    const raw = fs.readFileSync(path.join(repoRoot, 'config', 'workers.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : (parsed.workers || []);
  } catch {
    return [];
  }
}

/**
 * The worker IDs leo-stack must SKIP for the current state: empty when no walk is active, otherwise
 * every EVA stage worker in the registry. Used by the shell scripts via the `skip-ids` CLI.
 */
function skipWorkerIds(repoRoot = process.cwd()) {
  if (!isWalkModeActive(repoRoot)) return [];
  return readWorkerRegistry(repoRoot)
    .filter((w) => isEvaStageWorker(w))
    .map((w) => String(w.id || w.name || w.display_name || '').trim())
    .filter(Boolean);
}

module.exports = {
  WALK_SENTINEL_FILE,
  EVA_STAGE_WORKER_PATTERNS,
  isWalkModeActive,
  isEvaStageWorker,
  shouldStartWorker,
  readWorkerRegistry,
  skipWorkerIds,
};

// CLI: `node lib/leo-stack/walk-mode.cjs skip-ids` → newline-separated worker IDs to skip (cwd repo).
//      `node lib/leo-stack/walk-mode.cjs active` → exit 0 if a walk is active, 1 otherwise.
if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === 'skip-ids') {
    process.stdout.write(skipWorkerIds(process.cwd()).join('\n'));
    process.exit(0);
  } else if (cmd === 'active') {
    process.exit(isWalkModeActive(process.cwd()) ? 0 : 1);
  } else {
    process.stderr.write('usage: walk-mode.cjs <skip-ids|active>\n');
    process.exit(2);
  }
}
