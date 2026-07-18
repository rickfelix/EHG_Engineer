import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NEVER_AUTO_CLASSES } from '../../../lib/switch-automation/reversibility-classifier.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = path.resolve(__dirname, '../../../database/migrations/20260718_chairman_switchon_policy_STAGED.sql');
const sql = readFileSync(MIGRATION_PATH, 'utf8');

describe('chairman_switchon_policy STAGED migration (static file-lint, TS-2a)', () => {
  it('enables RLS in the same file as CREATE TABLE', () => {
    expect(sql).toMatch(/ALTER TABLE chairman_switchon_policy ENABLE ROW LEVEL SECURITY/);
  });

  it('has a chairman-only SELECT policy', () => {
    expect(sql).toMatch(/FOR SELECT USING \(fn_is_chairman\(\)\)/);
  });

  it('has NO insert/update/delete policy defined', () => {
    expect(sql).not.toMatch(/FOR (INSERT|UPDATE|DELETE)/i);
  });

  // AC-2 (a runtime privilege probe against an EPHEMERAL local Postgres, confirming the
  // REVOKE actually denies anon/authenticated/service_role writes) is DEFERRED, not dropped:
  // this migration ships STAGED and is never applied to any DB by this SD, so there is no
  // live table to probe yet. Per the PRD, AC-2 is verified at the chairman-apply ceremony
  // (child B's scope) instead. Tracked explicitly here so the deferral stays durable.
  it.todo('AC-2: ephemeral-DB privilege probe (deferred to chairman-apply ceremony / child B -- migration is STAGED, not applied by this SD)');

  it('REVOKEs INSERT, UPDATE, DELETE from anon, authenticated, AND service_role in the same file', () => {
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE ON chairman_switchon_policy FROM anon, authenticated, service_role/);
  });

  it('is marked STAGED / requires-chairman-apply, not auto-applied', () => {
    expect(sql).toMatch(/STAGED/);
    expect(sql).toMatch(/requires-chairman-apply/);
    expect(sql).toMatch(/NOT YET APPLIED/);
  });

  it('every NEVER_AUTO_CLASSES entry from the classifier is listed in the migration seed comment', () => {
    for (const cls of NEVER_AUTO_CLASSES) {
      expect(sql).toContain(cls);
    }
  });

  it('does not contain a live INSERT statement seeding rows (seed happens at chairman-apply time, not in this file)', () => {
    expect(sql).not.toMatch(/^\s*INSERT INTO chairman_switchon_policy/im);
  });

  // GUARDRAIL-1 (chairman_conditioned_acceptance_criteria, mandatory): "the NEVER-AUTO set
  // MUST explicitly enumerate irreversible production actions — live venture deploy, live
  // payment-account creation, DNS mutation — and ALWAYS route them to the chairman."
  // SECURITY sub-agent found the classifier's original list didn't map cleanly onto these 3
  // named examples; explicit classes were added -- this test guards against silent regression.
  it('GUARDRAIL-1: NEVER_AUTO_CLASSES explicitly enumerates all 3 named irreversible actions', () => {
    expect(NEVER_AUTO_CLASSES).toContain('live-venture-deploy');
    expect(NEVER_AUTO_CLASSES).toContain('live-payment-account-creation');
    expect(NEVER_AUTO_CLASSES).toContain('dns-mutation');
  });
});
