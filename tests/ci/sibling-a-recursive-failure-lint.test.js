import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const SCRIPTS_DIR = join(REPO_ROOT, 'scripts');
const WINDOW_LINES = 50;

const EXEMPT_PATHS = [
  'scripts/handoff.js',
  'scripts/ci/sibling-a-recursive-failure-lint.test.js',
  'scripts/lib/emit-validation-audit-log.mjs',
  'scripts/modules/handoff/bypass-rubric.js',
];

const EXEMPT_DIR_PREFIXES = [
  'scripts/one-off/',
  'tests/',
  '__tests__/',
  'scripts/_archive/',
];

function listJsFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === '.git' || entry === '.worktrees') continue;
      listJsFiles(full, acc);
    } else if (/\.(m|c)?js$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

function isExempt(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/');
  if (EXEMPT_PATHS.includes(normalized)) return true;
  return EXEMPT_DIR_PREFIXES.some(prefix => normalized.startsWith(prefix));
}

function findViolations(filePath, content) {
  const violations = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!/bypass_validation/.test(lines[i])) continue;
    const windowEnd = Math.min(lines.length, i + WINDOW_LINES + 1);
    const windowStart = Math.max(0, i - WINDOW_LINES);
    const surrounding = lines.slice(windowStart, windowEnd).join('\n');
    if (/emitValidationAuditLog|validation_audit_log/.test(surrounding)) continue;
    violations.push({ file: filePath, line: i + 1, snippet: lines[i].trim().slice(0, 120) });
  }
  return violations;
}

describe('Sibling A recursive-failure-mode lint', () => {
  it('every bypass_validation reference has companion emitValidationAuditLog within 50 lines (or is exempted)', () => {
    const files = listJsFiles(SCRIPTS_DIR);
    const allViolations = [];
    for (const f of files) {
      const rel = relative(REPO_ROOT, f).replace(/\\/g, '/');
      if (isExempt(rel)) continue;
      const content = readFileSync(f, 'utf8');
      const v = findViolations(rel, content);
      allViolations.push(...v);
    }
    if (allViolations.length > 0) {
      const msg = allViolations.map(v => `  ${v.file}:${v.line} — ${v.snippet}`).join('\n');
      throw new Error(`Recursive writer-consumer asymmetry detected — ${allViolations.length} bypass_validation site(s) without emitValidationAuditLog within ${WINDOW_LINES} lines:\n${msg}\n\nFix: add emitValidationAuditLog companion within ${WINDOW_LINES} lines OR add path to EXEMPT_PATHS in this test.`);
    }
    expect(allViolations).toEqual([]);
  });

  it('exemption list itself does not contain new bypass_validation drift', () => {
    expect(EXEMPT_PATHS.length).toBeLessThanOrEqual(10);
    expect(EXEMPT_DIR_PREFIXES.length).toBeLessThanOrEqual(5);
  });
});
