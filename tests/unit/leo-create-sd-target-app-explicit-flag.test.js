/**
 * Static guard for QF-20260509-986 (closes feedback ccc82ea6).
 *
 * Pins both halves of the explicit-target_application contract:
 *
 *   1. scripts/leo-create-sd.js writes metadata.target_application_explicit
 *      based on whether explicitTargetApp or VENTURE env var supplied the value.
 *
 *   2. The LEAD-TO-PLAN gate at
 *      scripts/modules/handoff/executors/lead-to-plan/gates/target-application.js
 *      reads sd.metadata?.target_application_explicit === true and short-circuits
 *      its high-confidence auto-correction branch.
 *
 * If a future refactor renames either side without updating the other, the
 * source-text assertion here breaks and surfaces the writer/consumer drift
 * before the next harness backlog row gets filed.
 *
 * Pattern: source-text guard (cheap, deterministic) — preferred over a full
 * INSERT mock for a 1-line metadata write whose runtime behavior is already
 * covered end-to-end by target-application.test.js.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');

describe('QF-20260509-986: target_application_explicit writer/consumer parity', () => {
  it('leo-create-sd.js writes metadata.target_application_explicit based on explicitTargetApp || VENTURE env', () => {
    const src = readFileSync(resolve(repoRoot, 'scripts', 'leo-create-sd.js'), 'utf8');
    expect(src).toContain('target_application_explicit');
    // The flag must be truthy when explicitTargetApp OR VENTURE env supplied the value;
    // detectFromKeyChanges (path inference) MUST NOT count as explicit.
    expect(src).toMatch(/target_application_explicit:\s*Boolean\(explicitTargetApp\s*\|\|\s*process\.env\.VENTURE\)/);
  });

  it('LEAD-TO-PLAN target-application gate skips auto-correction when metadata.target_application_explicit === true', () => {
    const src = readFileSync(
      resolve(repoRoot, 'scripts', 'modules', 'handoff', 'executors', 'lead-to-plan', 'gates', 'target-application.js'),
      'utf8'
    );
    expect(src).toMatch(/sd\?\.metadata\?\.target_application_explicit\s*===\s*true/);
    // The skip path must return pass:true with score 100 — not a partial-credit
    // 80 (which is the auto-corrected branch). Pinning both keys catches an
    // accidental fall-through into the corrective UPDATE.
    expect(src).toMatch(/skipping auto-correction/);
  });
});
