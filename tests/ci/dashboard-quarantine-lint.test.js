import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const VERDICT_TOKENS = ['UNANIMITY_FAIL', 'CONTRACT_MALFORMED', 'BINDING_VERDICT', 'OVERRIDDEN_VERDICT'];
const SCAN_PATHS = [
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/ISSUE_TEMPLATE',
  'scripts/handoff/templates',
  'docs/retrospectives/templates',
  'templates',
];

function walkFiles(p, acc = []) {
  if (!existsSync(p)) return acc;
  const st = statSync(p);
  if (st.isFile()) { acc.push(p); return acc; }
  if (!st.isDirectory()) return acc;
  for (const e of readdirSync(p)) walkFiles(join(p, e), acc);
  return acc;
}

describe('dashboard-quarantine lint — verdicts NEVER inline in PR/handoff/retro templates', () => {
  it('no verdict tokens found in body templates', () => {
    const files = SCAN_PATHS.flatMap(p => walkFiles(join(REPO_ROOT, p)));
    const violations = [];
    for (const f of files) {
      try {
        const content = readFileSync(f, 'utf8');
        for (const tok of VERDICT_TOKENS) {
          if (content.includes(tok)) violations.push(`${f.replace(REPO_ROOT, '')}: ${tok}`);
        }
      } catch {}
    }
    if (violations.length > 0) {
      throw new Error(`Dashboard quarantine violated:\n${violations.join('\n')}\n\nFix: remove verdict tokens from body templates. Verdicts surface only in dashboards (server/routes/*, src/components/*).`);
    }
    expect(violations).toEqual([]);
  });

  it('Guardrail #6 enforcement constants are stable', () => {
    expect(VERDICT_TOKENS.length).toBeGreaterThanOrEqual(4);
    expect(SCAN_PATHS).toContain('.github/PULL_REQUEST_TEMPLATE.md');
  });
});
