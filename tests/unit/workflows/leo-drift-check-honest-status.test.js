// QF-20260903-055 -- "Check for Filesystem Drift" carried BOTH an exit-zero fallback AND
// continue-on-error, so a red run of that job could never actually mean drift (only
// checkout/setup/install/compile steps could fail it). Pins the fix: the drift-detection
// step's real exit code now propagates.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WORKFLOW_PATH = fileURLToPath(new URL('../../../.github/workflows/leo-drift-check.yml', import.meta.url));

describe('leo-drift-check.yml "Run drift detection" step (QF-20260903-055)', () => {
  it('no longer swallows the drift-checker exit code with an exit-zero fallback', () => {
    const src = readFileSync(WORKFLOW_PATH, 'utf8');
    const match = src.match(/- name: Run drift detection[\s\S]*?\n(?=\s{6}- name:|\S)/);
    expect(match).not.toBeNull();
    const step = match[0];
    expect(step).not.toMatch(/\|\|\s*\{/);
    expect(step).not.toMatch(/exit 0/);
    expect(step).not.toMatch(/continue-on-error:\s*true/);
    expect(step).toMatch(/run:\s*node dist\/tools\/gates\/drift-check\.js/);
  });
});
