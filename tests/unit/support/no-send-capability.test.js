/**
 * TS-7 (SD-LEO-GEN-NEED-WELL-THOUGHT-001, FR-3 hard constraint): asserts zero send-capable code
 * exists in this SD's changed files. Ported from tests/unit/marketing/altifyai-no-send-capability.
 * test.js's own precedent, with 3 fixes per adversarial TESTING sub-agent review
 * (sub_agent_execution_results 070e02d6-48fc-406e-8d65-78c3e287a138):
 *   (a) adds twilio/sendgrid patterns -- FR-3 names both, the precedent's list did not cover them.
 *   (b) scans an EXPLICIT file list, not a name-glob -- this SD MODIFIES intake-pipeline.js (a
 *       pre-existing file); a "new files only" glob would silently skip a modified file.
 *   (c) a ONE-HOP import scan -- also scans each target file's own direct (relative) imports, so a
 *       transitive send path hidden in an imported helper is not invisible to a 2-file scan.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

const SEND_CAPABLE_PATTERNS = [
  /from\s+["'][^"']*resend[^"']*["']/i,
  /require\(\s*["'][^"']*resend[^"']*["']\s*\)/i,
  /from\s+["'][^"']*nodemailer[^"']*["']/i,
  /require\(\s*["'][^"']*nodemailer[^"']*["']\s*\)/i,
  /from\s+["'][^"']*twilio[^"']*["']/i,
  /require\(\s*["'][^"']*twilio[^"']*["']\s*\)/i,
  /from\s+["'][^"']*sendgrid[^"']*["']/i,
  /require\(\s*["'][^"']*sendgrid[^"']*["']\s*\)/i,
  /\bsendMail\s*\(/,
  /api\.resend\.com/i,
  /smtp[:/]/i,
  /createTransport\s*\(/i,
];

const TARGET_FILES = [
  path.join(REPO_ROOT, 'lib', 'support', 'intake-pipeline.js'),
  path.join(REPO_ROOT, 'lib', 'support', 'stripe-support-skill.js'),
];

/** Resolve a relative import specifier (e.g. '../marketing/autonomy-gate.js') from a source file. */
function resolveRelativeImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null; // skip bare package specifiers (node_modules)
  const resolved = path.resolve(path.dirname(fromFile), specifier);
  return fs.existsSync(resolved) ? resolved : null;
}

function directImports(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const specifiers = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
  return specifiers.map((s) => resolveRelativeImport(filePath, s)).filter(Boolean);
}

function scanFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  return SEND_CAPABLE_PATTERNS.filter((re) => re.test(source));
}

describe('TS-7: no send-capable code path in the support-loop diff (target files + one-hop imports)', () => {
  it('finds all expected target files (guards against a silently-empty scan)', () => {
    for (const f of TARGET_FILES) expect(fs.existsSync(f), `expected file missing: ${f}`).toBe(true);
  });

  it.each(TARGET_FILES)('%s contains no send-capable import/call', (filePath) => {
    const matches = scanFile(filePath);
    expect(matches, `${path.relative(REPO_ROOT, filePath)} matched: ${matches.map(String).join(', ')}`).toEqual([]);
  });

  it('ONE-HOP: none of the target files\' own direct relative imports contain a send-capable import/call either', () => {
    const oneHopFiles = new Set();
    for (const f of TARGET_FILES) for (const imp of directImports(f)) oneHopFiles.add(imp);
    expect(oneHopFiles.size, 'expected at least one direct import to scan (guards against a silently-empty one-hop set)').toBeGreaterThan(0);
    for (const f of oneHopFiles) {
      const matches = scanFile(f);
      expect(matches, `${path.relative(REPO_ROOT, f)} (one-hop import) matched: ${matches.map(String).join(', ')}`).toEqual([]);
    }
  });
});
