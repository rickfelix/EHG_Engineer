/**
 * SD-LEO-INFRA-HOLD-STATE-CONTRACT-001 (FR-2): negative/pin test for the two
 * DB-level writers that bypass any JS-level hold-state writer. Asserts the
 * structural facts this SD's exemption analysis depends on directly against
 * the LIVE migration source — if either file is edited to add a `deferred`
 * write or a `metadata` write, this test fails loudly instead of the
 * exemption silently going stale.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { HOLD_STATE_DB_LEVEL_EXEMPTIONS } from '../../../lib/governance/hold-state-exemptions.js';

describe('HOLD_STATE_DB_LEVEL_EXEMPTIONS registry', () => {
  it('records exactly the 2 known DB-level bypass writers, each with an owner and reason', () => {
    expect(HOLD_STATE_DB_LEVEL_EXEMPTIONS).toHaveLength(2);
    for (const entry of HOLD_STATE_DB_LEVEL_EXEMPTIONS) {
      expect(entry.owner).toBeTruthy();
      expect(entry.reason).toBeTruthy();
      expect(entry.file).toBeTruthy();
    }
  });
});

describe('auto_transition_status() trigger — negative pin (never writes deferred or metadata)', () => {
  const sql = readFileSync(
    HOLD_STATE_DB_LEVEL_EXEMPTIONS.find((e) => e.name === 'auto_transition_status_trigger').file,
    'utf8'
  );

  it('the function body never assigns a status literal of \'deferred\'', () => {
    const fnBody = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION auto_transition_status'), sql.indexOf('CREATE TRIGGER status_auto_transition'));
    expect(fnBody).not.toMatch(/'deferred'/);
  });

  it('the seeded status_transition_rules never list \'deferred\' as a from_status or to_status', () => {
    const insertBlock = sql.slice(sql.indexOf('INSERT INTO status_transition_rules'), sql.indexOf('7. Rollback function'));
    expect(insertBlock).not.toMatch(/'deferred'/);
  });

  it('the trigger function never references the metadata column', () => {
    const fnBody = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION auto_transition_status'), sql.indexOf('CREATE TRIGGER status_auto_transition'));
    expect(fnBody).not.toMatch(/\bmetadata\b/);
  });
});

describe('complete_orchestrator_sd() RPC — negative pin (never writes deferred or metadata)', () => {
  const sql = readFileSync(
    HOLD_STATE_DB_LEVEL_EXEMPTIONS.find((e) => e.name === 'complete_orchestrator_sd_rpc').file,
    'utf8'
  );
  const fnBody = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.complete_orchestrator_sd'));

  it('the function body never assigns a status literal of \'deferred\'', () => {
    expect(fnBody).not.toMatch(/'deferred'/);
  });

  it('the function body never references the metadata column', () => {
    expect(fnBody).not.toMatch(/\bmetadata\b/);
  });

  it('every UPDATE ... SET status = ... only ever targets pending_approval or completed', () => {
    const statusLiterals = [...fnBody.matchAll(/SET\s+status\s*=\s*'([a-z_]+)'/g)].map((m) => m[1]);
    expect(statusLiterals.length).toBeGreaterThan(0);
    for (const s of statusLiterals) {
      expect(['pending_approval', 'completed']).toContain(s);
    }
  });
});
