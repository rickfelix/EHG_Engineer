/**
 * QF-20260719-208 — regression coverage for the pre-send Solomon-consult gate at
 * adam-quiet-tick.mjs's account-switch emit choke. SD-LEO-INFRA-ADAM-PRE-SEND-001
 * shipped the L1 gate in scripts/adam-advisory.cjs, but the quiet-tick's
 * insertCoordinationRow callsite (~line 472) had zero consult references — sends
 * from the tick bypassed the gate entirely. The full bounded-consult machinery
 * isn't unit-testable without extracting the tick's main() into smaller exported
 * functions (out of scope for this fix), so this covers the two things that matter:
 * the gate correctly flags this message class as consequential, and the source
 * actually wires it at the right choke (regression guard against silently dropping
 * the gate again).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { evaluatePreSendConsult } from '../../../lib/adam/should-consult-solomon.js';

describe('adam-quiet-tick.mjs account-switch send — pre-send consult gate (QF-20260719-208)', () => {
  it('a representative ACCOUNT_SWITCH body classifies as consequential (consult required)', () => {
    const subject = '[ACCOUNT_SWITCH] Adam session Claude account changed';
    const body = "Adam's Claude account switched from old@example.com (OldOrg) to new@example.com (NewOrg).";
    const result = evaluatePreSendConsult({ title: subject, body, isChairmanTargeted: false });
    expect(result.action).toBe('consult-then-send');
  });

  it('wires evaluatePreSendConsult ahead of the account-switch insertCoordinationRow choke (static regression guard)', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../../../scripts/adam-quiet-tick.mjs', import.meta.url)),
      'utf8',
    );
    // SD-LEO-INFRA-COORDINATION-LANE-DRAIN-001: this asserted PROXIMITY (a 1500-char lookbehind)
    // while its own name asserts ORDERING ("ahead of"). Those agree only until someone writes a
    // comment: FR-5 added five explanatory lines and pushed the gap to 1594 chars, failing a guard
    // whose subject — the call still sitting ahead of the choke — had not changed at all. A guard
    // that fires on comment volume trains readers to treat it as noise, which is how a real
    // regression eventually gets waved through. Now it compares positions, which is what it always
    // meant and is immune to anything that does not actually reorder the two.
    const chokeIdx = source.indexOf("kind: 'account_switch_notice'");
    const consultIdx = source.indexOf('evaluatePreSendConsult');
    const importIdx = source.indexOf('should-consult-solomon.js');
    expect(chokeIdx).toBeGreaterThan(-1);
    expect(consultIdx).toBeGreaterThan(-1);
    expect(importIdx).toBeGreaterThan(-1);
    expect(consultIdx).toBeLessThan(chokeIdx);
    expect(importIdx).toBeLessThan(chokeIdx);
  });
});
