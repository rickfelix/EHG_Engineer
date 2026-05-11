/**
 * SD-LEO-INFRA-CANONICAL-SCRIPTS-APPLY-001 — TS-7 (Genesis regression, unit-level)
 *
 * The genesis cascade-trigger ship-gap was PR #3703: a migration whose
 * declared objects included BOTH a FUNCTION and a TRIGGER. A pg_proc-only
 * verification would capture the function but silently miss the trigger.
 *
 * This test fixes a fixture in the cascade-trigger shape and asserts:
 *  (a) parseDeclaredObjects extracts the FUNCTION AND the TRIGGER (not just one)
 *  (b) captureObjectDefinitions dispatches both kinds to the correct pg
 *      introspection API (pg_get_functiondef for FUNCTION, pg_get_triggerdef
 *      for TRIGGER)
 *
 * Integration variants (TS-7 with real pg sandbox + sha persistence) are in
 * the PLAN-phase integration suite — those require pooler TLS + a sandbox
 * schema and are out of scope for unit tests.
 */
import { describe, it, expect, vi } from 'vitest';
import { parseDeclaredObjects } from '../../scripts/lib/migration-object-parser.js';
import { captureObjectDefinitions } from '../../scripts/lib/migration-verification.js';

const CASCADE_FIXTURE = `
-- Genesis fixture (cascade-trigger shape from PR #3703).
CREATE OR REPLACE FUNCTION public.feedback_cascade_status_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'resolved' THEN
    NEW.resolved_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER feedback_cascade_status_trigger
  BEFORE UPDATE ON public.feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.feedback_cascade_status_fn();
`;

describe('TS-7 genesis cascade-trigger regression (unit-level)', () => {
  it('parseDeclaredObjects extracts the FUNCTION AND the TRIGGER', () => {
    const objs = parseDeclaredObjects(CASCADE_FIXTURE);
    const kinds = objs.map(o => o.kind).sort();
    expect(kinds).toEqual(['FUNCTION', 'TRIGGER']);
    expect(objs.some(o => o.kind === 'TRIGGER' && o.name === 'feedback_cascade_status_trigger')).toBe(true);
    expect(objs.some(o => o.kind === 'FUNCTION' && o.name === 'feedback_cascade_status_fn')).toBe(true);
  });

  it('captureObjectDefinitions dispatches FUNCTION → pg_get_functiondef AND TRIGGER → pg_get_triggerdef', async () => {
    const seenSQL = [];
    const client = {
      query: vi.fn(async (sql) => {
        seenSQL.push(sql);
        if (/pg_get_functiondef/.test(sql)) return { rows: [{ def: 'CREATE FUNCTION ...' }] };
        if (/pg_get_triggerdef/.test(sql)) return { rows: [{ def: 'CREATE TRIGGER ...' }] };
        return { rows: [] };
      }),
    };
    const declared = parseDeclaredObjects(CASCADE_FIXTURE);
    const defs = await captureObjectDefinitions(client, declared);

    expect(seenSQL.some(s => /pg_get_functiondef/.test(s))).toBe(true);
    expect(seenSQL.some(s => /pg_get_triggerdef/.test(s))).toBe(true);
    expect(defs.find(d => d.kind === 'FUNCTION').definition).toBe('CREATE FUNCTION ...');
    expect(defs.find(d => d.kind === 'TRIGGER').definition).toBe('CREATE TRIGGER ...');
  });

  it('a pg_proc-only verifier would have missed the TRIGGER (regression assertion)', () => {
    const objs = parseDeclaredObjects(CASCADE_FIXTURE);
    const proc_only = objs.filter(o => o.kind === 'FUNCTION');
    const full = objs.filter(o => ['FUNCTION', 'TRIGGER', 'VIEW', 'INDEX'].includes(o.kind));
    expect(full.length - proc_only.length).toBeGreaterThanOrEqual(1);
  });
});
