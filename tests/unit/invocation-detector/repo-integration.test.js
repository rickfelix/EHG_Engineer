/**
 * SD-LEO-INFRA-INVOCATION-PATH-PROOF-001-A (FR-1) — integration: run the detector against the
 * REAL repo trigger sources to prove the I/O loader wires correctly (the detector must not
 * itself be "reachable but never invoked").
 */
import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadTriggerSources, detectInvocationPath, TRIGGER_TYPES } from '../../../lib/invocation-detector/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..'); // worktree root

describe('invocation-detector against the real repo', () => {
  it('loads real trigger sources (package.json scripts, workflows, settings hooks)', async () => {
    const sources = await loadTriggerSources(ROOT, { includeParentShell: false });
    expect(Object.keys(sources.pkgScripts).length).toBeGreaterThan(0);
    expect(Array.isArray(sources.workflows)).toBe(true);
    expect(sources.settings && typeof sources.settings).toBe('object');
  });

  it('classifies a known .claude hook script as INVOKED (hook trigger present)', async () => {
    const sources = await loadTriggerSources(ROOT, { includeParentShell: false });
    // Find any hook command in the real settings.json and prove the detector flags it invoked.
    const hooks = sources.settings.hooks || {};
    let hookEntry = null;
    for (const groups of Object.values(hooks)) {
      for (const g of (Array.isArray(groups) ? groups : [])) {
        for (const h of (g.hooks || [])) {
          const m = (h.command || '').match(/\/((?:scripts|lib)\/[^\s"';]+\.[cm]?js)\b/);
          if (m) { hookEntry = m[1]; break; }
        }
        if (hookEntry) break;
      }
      if (hookEntry) break;
    }
    expect(hookEntry, 'expected at least one hook command in settings.json').toBeTruthy();
    const r = detectInvocationPath(hookEntry, sources);
    expect(r.invoked).toBe(true);
    expect(r.triggers.some((t) => t.type === TRIGGER_TYPES.CLAUDE_HOOK)).toBe(true);
  });

  it('classifies a non-existent orphan path as NOT invoked', async () => {
    const sources = await loadTriggerSources(ROOT, { includeParentShell: false });
    const r = detectInvocationPath('scripts/__definitely_not_wired_xyz__.cjs', sources);
    expect(r.invoked).toBe(false);
    expect(r.triggers).toEqual([]);
  });

  it('this detector module itself reports excluded=false and is a real lib entry', async () => {
    const sources = await loadTriggerSources(ROOT, { includeParentShell: false });
    const r = detectInvocationPath('lib/invocation-detector/index.js', sources);
    expect(r.excluded).toBe(false); // it's a real SSOT, not a one-off/test
  });
});
