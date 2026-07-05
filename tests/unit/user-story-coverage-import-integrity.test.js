/**
 * QF-20260705-077: the USER_STORY_COVERAGE in-gate self-heal silently no-oped because
 * its dynamic import specifier was one directory level short ('../../../../' lands in
 * scripts/modules/, where auto-validate-user-stories-on-exec-complete.js does not
 * exist) — the ERR_MODULE_NOT_FOUND was swallowed by the gate's defensive catch, so the
 * gate false-blocked in the same pass while the manual CLI promoted instantly.
 *
 * NOTE: this lives in tests/unit (not beside the gate) because the gate's sibling
 * test file is quarantined in the vitest unit-tier exclude list and never runs —
 * which is precisely how the broken import survived. These tests pin every relative
 * import specifier in the gate (static AND dynamic) to a file that actually exists,
 * so a broken relative path fails the suite instead of degrading to a silent no-op.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GATE_DIR = resolve(__dirname, '../../scripts/modules/handoff/executors/exec-to-plan/gates');
const GATE_FILE = resolve(GATE_DIR, 'user-story-coverage.js');

function extractImportSpecifiers(source) {
  const specifiers = [];
  const staticRe = /import\s+[^'"]*?from\s+['"]([^'"]+)['"]/g;
  const dynamicRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = staticRe.exec(source)) !== null) specifiers.push({ spec: m[1], kind: 'static' });
  while ((m = dynamicRe.exec(source)) !== null) specifiers.push({ spec: m[1], kind: 'dynamic' });
  return specifiers;
}

describe('USER_STORY_COVERAGE gate import integrity (QF-20260705-077)', () => {
  const source = readFileSync(GATE_FILE, 'utf8');
  const relative = extractImportSpecifiers(source).filter(s => s.spec.startsWith('.'));

  it('extracts the self-heal dynamic import (guard against regex rot)', () => {
    expect(relative.length).toBeGreaterThanOrEqual(2);
    expect(relative.some(s => s.kind === 'dynamic' && s.spec.includes('auto-validate-user-stories-on-exec-complete'))).toBe(true);
  });

  it.each(relative.map(s => [s.kind, s.spec]))('%s import %s resolves to an existing file', (kind, spec) => {
    // The exact defect: the 4-level specifier resolved to scripts/modules/<file>,
    // which does not exist; the defensive catch made it a silent same-pass no-op.
    expect(existsSync(resolve(GATE_DIR, spec)), `unresolvable ${kind} import: ${spec}`).toBe(true);
  });

  it('the self-heal module actually exports autoValidateUserStories (safe: CLI entry is argv-guarded)', async () => {
    const spec = relative.find(s => s.spec.includes('auto-validate-user-stories-on-exec-complete')).spec;
    const mod = await import(pathToFileURL(resolve(GATE_DIR, spec)).href);
    expect(typeof mod.autoValidateUserStories).toBe('function');
  });
});
