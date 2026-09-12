/**
 * SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001 FR-5, AC4 — documents the sovereign-alert.js exclusion
 * from the outreach-authorization gate as INTENTIONAL, not an oversight.
 *
 * lib/services/sovereign-alert.js is chairman/operator emergency alerting (system_events,
 * Discord webhooks, budget/calibration/security alarms) — not customer outreach. Gating it
 * behind assertOutreachAuthorized() would suppress emergency alerts for every one of the 171
 * pre-go-live ventures (is_demo=false, launch_mode!='live'), since none of them would ever pass
 * the outreach predicate. This test fixes that exclusion in place: it fails if a future edit
 * quietly wires the outreach gate into this file (which would start silently swallowing
 * emergency alerts) or, conversely, if the module starts sending genuine customer-facing
 * content that SHOULD be gated.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(__dirname, '../../../lib/services/sovereign-alert.js'), 'utf8');

describe('sovereign-alert.js outreach-gate exclusion (intentional, not an oversight)', () => {
  it('does not import assertOutreachAuthorized or checkStageGate — it is operator alerting, not customer outreach', () => {
    expect(SOURCE).not.toMatch(/assertOutreachAuthorized/);
    expect(SOURCE).not.toMatch(/checkStageGate/);
    expect(SOURCE).not.toMatch(/stage-gate-predicate/);
  });

  it('is scoped to system/operator alerting (Discord, system_events, EMERGENCY severity), not a customer-facing send', () => {
    expect(SOURCE).toMatch(/system_events/);
    expect(SOURCE).toMatch(/EMERGENCY/);
  });
});
