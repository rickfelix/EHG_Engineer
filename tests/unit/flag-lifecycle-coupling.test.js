/**
 * SD-FDBK-INFRA-RECONCILE-LEO-FEATURE-001 — is_enabled <-> lifecycle_state coupling.
 *
 * The chk_flag_lifecycle_enabled_consistency CHECK enforces the biconditional
 * is_enabled = (lifecycle_state='enabled'). These tests lock the JS-side coupling so no
 * legitimate writer can produce a row the constraint rejects:
 *   - computeCoupledLifecycleState (registry.js updateFlag's mapping, mirrors
 *     transitionLifecycleState semantics)
 *   - the activate-rubric-v2 setFlagEnabled coupling (static source pin — the script is a
 *     top-level-await CLI, not importable without side effects)
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeCoupledLifecycleState } from '../../lib/feature-flags/registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** The CHECK predicate, mirrored exactly. */
const satisfiesCheck = (isEnabled, lifecycleState) => isEnabled === (lifecycleState === 'enabled');

describe('computeCoupledLifecycleState (registry.js updateFlag coupling)', () => {
  it('enabling from ANY state lands on lifecycle enabled', () => {
    for (const from of ['draft', 'disabled', 'enabled', 'expired', 'archived', null, undefined]) {
      expect(computeCoupledLifecycleState(true, from)).toBe('enabled');
    }
  });

  it('disabling an enabled flag moves it to disabled', () => {
    expect(computeCoupledLifecycleState(false, 'enabled')).toBe('disabled');
    // null/undefined defaults to 'enabled' (matching the registry's `|| 'enabled'` reads)
    expect(computeCoupledLifecycleState(false, null)).toBe('disabled');
    expect(computeCoupledLifecycleState(false, undefined)).toBe('disabled');
  });

  it('disabling preserves an already-non-enabled state (draft/disabled/expired/archived)', () => {
    for (const from of ['draft', 'disabled', 'expired', 'archived']) {
      expect(computeCoupledLifecycleState(false, from)).toBe(from);
    }
  });

  it('EVERY (isEnabled, fromState) combination satisfies the CHECK biconditional', () => {
    for (const isEnabled of [true, false]) {
      for (const from of ['draft', 'disabled', 'enabled', 'expired', 'archived', null]) {
        const out = computeCoupledLifecycleState(isEnabled, from);
        expect(satisfiesCheck(isEnabled, out)).toBe(true);
      }
    }
  });
});

describe('source pins — uncoupled is_enabled writes are gone', () => {
  it('registry.js updateFlag co-sets lifecycle_state with isEnabled', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'lib', 'feature-flags', 'registry.js'), 'utf8');
    expect(src).toMatch(/updateData\.lifecycle_state\s*=\s*computeCoupledLifecycleState\(/);
  });

  it('activate-rubric-v2 setFlagEnabled co-sets lifecycle_state', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'eva', 'activate-rubric-v2.mjs'), 'utf8');
    // the update payload must carry BOTH fields
    expect(src).toMatch(/update\(\{\s*is_enabled:\s*isEnabled,\s*lifecycle_state\s*\}\)/);
  });

  it('migration excludes row_version from the review-aware delta (firing-order independence)', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'database', 'migrations', '20260610_flag_registry_lifecycle_consistency.sql'), 'utf8');
    expect(src).toMatch(/ARRAY\['updated_at',\s*'last_reviewed_at',\s*'row_version'\]/);
    // biconditional CHECK form
    expect(src).toMatch(/CHECK \(is_enabled = \(lifecycle_state = 'enabled'\)\)/);
    // shared generic fn must not be redefined here
    expect(src).not.toMatch(/CREATE OR REPLACE FUNCTION trigger_set_updated_at\(\)/);
  });
});
