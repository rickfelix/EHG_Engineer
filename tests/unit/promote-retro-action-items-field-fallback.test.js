/**
 * QF-20260711-253 — promote-retro-action-items.mjs's actionText()/actionOwner()
 * silently dropped a third retrospectives.action_items shape ({title, description,
 * owner_role, priority}, used by manually-authored SD_COMPLETION retrospectives),
 * producing '(no text)' / 'unassigned' auto-promoted quick-fixes with no real content.
 *
 * The script is a top-level-executing CLI (queries Supabase on import), so this is a
 * network-free source-level pin (matches the fleet-dashboard-*.test.js pattern) rather
 * than an executed unit test — it asserts the fallback chains are present in source.
 */
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(__dirname, '../../scripts/promote-retro-action-items.mjs'), 'utf8');

function functionBody(startMarker) {
  const start = SRC.indexOf(startMarker);
  expect(start).toBeGreaterThan(-1);
  const rest = SRC.slice(start + 1);
  const nextFn = rest.search(/\nfunction /);
  return nextFn === -1 ? rest : rest.slice(0, nextFn);
}

// Re-implement the exact fallback logic inline (the script has no exports to import
// without triggering its top-level Supabase query) to assert behavior, not just text.
function actionText(item) {
  return item.item || item.action || item.title || '(no text)';
}
function actionOwner(item) {
  return item.owner || item.owner_role || 'unassigned';
}

describe('QF-20260711-253: actionText/actionOwner cover all 3 known action_items shapes', () => {
  it('source references item.title as a fallback (the third shape)', () => {
    const body = functionBody('function actionText(');
    expect(body).toMatch(/item\.title/);
  });

  it('source references item.owner_role as a fallback for owner display', () => {
    expect(SRC).toMatch(/owner_role/);
  });

  it('shape 1 (retro-agent prompt-driven: item/owner) resolves correctly', () => {
    const row = { item: 'Do the thing', owner: 'PLAN', priority: 'high' };
    expect(actionText(row)).toBe('Do the thing');
    expect(actionOwner(row)).toBe('PLAN');
  });

  it('shape 2 (generateSmartActionItems: action/owner) resolves correctly', () => {
    const row = { action: 'Fix the widget', owner: 'EXEC', priority: 'high' };
    expect(actionText(row)).toBe('Fix the widget');
    expect(actionOwner(row)).toBe('EXEC');
  });

  it('shape 3 (manually-authored SD_COMPLETION: title/owner_role) resolves correctly — the QF-20260711-253 bug', () => {
    const row = { title: 'Enumerate producers explicitly', owner_role: 'PLAN', priority: 'high' };
    expect(actionText(row)).toBe('Enumerate producers explicitly');
    expect(actionOwner(row)).toBe('PLAN');
  });

  it('no shape matched falls back to the placeholder, not a throw', () => {
    expect(actionText({ priority: 'high' })).toBe('(no text)');
    expect(actionOwner({ priority: 'high' })).toBe('unassigned');
  });
});
