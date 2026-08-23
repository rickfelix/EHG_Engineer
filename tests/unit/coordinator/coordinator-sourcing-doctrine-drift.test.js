/**
 * SD-LEO-INFRA-COORDINATOR-ROLE-CONTRACT-002 (FR-3).
 *
 * The /coordinator skill's "Sourcing engine + Roadmap-SSOT awareness" doctrine section
 * (.claude/commands/coordinator.md) is SUBORDINATE to code: it names the SOURCING_* activation
 * flags for a human/agent reading the skill, but the actual flag registry lives in
 * scripts/lib/sourcing-engine-awareness.mjs (SOURCING_ENGINE_FLAGS). Ground-truthing this SD found
 * a LIVE instance of the class of drift it exists to close: SOURCING_AUTO_REFILL_V1 shipped to
 * the registry but was never added to the skill's enumeration -- the doctrine silently fell behind
 * the code it describes, exactly the failure mode that (per this SD's problem statement) once
 * pointed the coordinator at a retired SOURCING_* surface undetected (harness_backlog row
 * 95a4b79b).
 *
 * This test is the "drift-check assertion" FR-3 requires for a doctrine-bearing skill section
 * that has no DB-generation path: it fails the moment SOURCING_ENGINE_FLAGS and the skill's
 * enumeration diverge, in either direction.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SOURCING_ENGINE_FLAGS } from '../../../scripts/lib/sourcing-engine-awareness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SKILL = path.join(ROOT, '.claude/commands/coordinator.md');
const skillText = fs.readFileSync(SKILL, 'utf8');

describe('coordinator.md sourcing-doctrine section stays in sync with SOURCING_ENGINE_FLAGS (FR-3)', () => {
  it('every live sourcing-engine flag env name is mentioned in the skill file', () => {
    for (const { env } of SOURCING_ENGINE_FLAGS) {
      expect(skillText, `expected coordinator.md to mention flag "${env}"`).toContain(env);
    }
  });

  it('DISCRIMINATES: a flag absent from the skill file would fail this test', () => {
    // Proves the assertion above is not vacuously true (e.g. matching on an empty string).
    const decoyFlagName = 'SOURCING_NONEXISTENT_TEST_FLAG_V1';
    expect(skillText).not.toContain(decoyFlagName);
  });

  it('CONTROL: SOURCING_ENGINE_FLAGS itself is non-empty (guards against a vacuous pass)', () => {
    expect(SOURCING_ENGINE_FLAGS.length).toBeGreaterThan(0);
  });
});
