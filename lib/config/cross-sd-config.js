/**
 * cross-sd-config -- Loader for the cross-SD overlap gate configuration.
 * SD-LEO-INFRA-CROSS-FILE-OVERLAP-001 (FR-4).
 *
 * Resolves configuration with this precedence:
 *   1. Env var override (CROSS_SD_WINDOW_HOURS)
 *   2. config/high-risk-files.json (committed)
 *   3. Built-in defaults
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CONFIG_PATH = path.join(REPO_ROOT, 'config', 'high-risk-files.json');

const DEFAULT_WINDOW_HOURS = 48;
const DEFAULT_HIGH_RISK_PATTERNS = Object.freeze([
  'scripts/modules/sd-key-generator.js',
  'scripts/modules/handoff/**',
  'scripts/handoff.js',
  '**/auth/**',
  '**/migrations/**',
  'database/schema/**',
  'CLAUDE.md',
  'CLAUDE_CORE.md',
  'CLAUDE_LEAD.md',
  'CLAUDE_PLAN.md',
  'CLAUDE_EXEC.md',
]);

let cachedPatterns = null;

/**
 * Window in milliseconds for "recently shipped" SDs. Env override wins.
 * Set CROSS_SD_WINDOW_HOURS=0 to disable the gate (useful for emergency).
 */
export function getWindowMs() {
  const raw = process.env.CROSS_SD_WINDOW_HOURS;
  const hours = raw !== undefined && raw !== ''
    ? Number(raw)
    : DEFAULT_WINDOW_HOURS;
  if (!Number.isFinite(hours) || hours < 0) return DEFAULT_WINDOW_HOURS * 3_600_000;
  return Math.floor(hours * 3_600_000);
}

/**
 * High-risk file patterns (minimatch globs). File loaded once and cached.
 * Returns the built-in defaults when the file is missing or malformed.
 */
export function getHighRiskPatterns() {
  if (cachedPatterns) return cachedPatterns;
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      cachedPatterns = [...DEFAULT_HIGH_RISK_PATTERNS];
      return cachedPatterns;
    }
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const patterns = Array.isArray(parsed?.patterns) ? parsed.patterns.filter(p => typeof p === 'string' && p.length > 0) : null;
    cachedPatterns = patterns && patterns.length > 0 ? patterns : [...DEFAULT_HIGH_RISK_PATTERNS];
  } catch {
    cachedPatterns = [...DEFAULT_HIGH_RISK_PATTERNS];
  }
  return cachedPatterns;
}

/** Reset cache — used by tests. */
export function _resetCache() {
  cachedPatterns = null;
}

export const CROSS_SD_DEFAULTS = Object.freeze({
  windowHours: DEFAULT_WINDOW_HOURS,
  highRiskPatterns: DEFAULT_HIGH_RISK_PATTERNS,
});
