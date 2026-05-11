/**
 * Tests for scripts/check-migration-readiness.mjs.
 * SD-LEO-INFRA-PRE-MERGE-MIGRATION-001 FR-3.
 */
import { describe, it, expect } from 'vitest';
import {
  parseFunctions,
  parseTriggers,
  parseDeclaredObjects,
  normalizeBody,
  compareBodies,
  evaluateMigration,
  OUTCOME,
  listMigrationFiles
} from '../../scripts/check-migration-readiness.mjs';

const FIXTURE_FUNCTION = `
CREATE OR REPLACE FUNCTION public.sync_is_working_on_with_session()
RETURNS trigger AS $function$
BEGIN
  -- preserve recoverable stale claims
  IF NEW.claim_status = 'absent' AND OLD.claim_status = 'present' THEN
    NEW.claim_status := 'recoverable_stale';
  END IF;
  RETURN NEW;
END;
$function$ LANGUAGE plpgsql;
`;

const FIXTURE_FUNCTION_BARE_QUOTE = `
CREATE OR REPLACE FUNCTION foo() RETURNS void AS $$
BEGIN
  PERFORM 1;
END;
$$ LANGUAGE plpgsql;
`;

const FIXTURE_FUNCTION_NO_OR_REPLACE = `
CREATE FUNCTION public.brand_new_fn() RETURNS void AS $$
BEGIN
  PERFORM 1;
END;
$$ LANGUAGE plpgsql;
`;

const FIXTURE_TRIGGER = `
CREATE OR REPLACE TRIGGER validate_handoff_trigger
BEFORE INSERT ON sd_phase_handoffs
FOR EACH ROW EXECUTE FUNCTION public.auto_validate_handoff();
`;

function makeMockClient(state) {
  return {
    async query(sql, params) {
      if (/pg_proc/.test(sql)) {
        const [schema, name] = params;
        const key = `${schema}.${name}`;
        const body = state.functions[key];
        return { rows: body === undefined ? [] : [{ body }], rowCount: body === undefined ? 0 : 1 };
      }
      if (/pg_trigger/.test(sql)) {
        const [name] = params;
        const exists = state.triggers.has(name);
        return { rowCount: exists ? 1 : 0, rows: exists ? [{ tgname: name }] : [] };
      }
      throw new Error('unexpected query: ' + sql);
    },
    async end() {}
  };
}

describe('parseFunctions', () => {
  it('extracts schema-qualified name with $function$ delimiter', () => {
    const fns = parseFunctions(FIXTURE_FUNCTION);
    expect(fns).toHaveLength(1);
    expect(fns[0]).toMatchObject({ schema: 'public', name: 'sync_is_working_on_with_session', hasOrReplace: true });
    expect(fns[0].body).toContain('preserve recoverable stale claims');
  });

  it('handles $$ delimiter and bare names (defaults to public)', () => {
    const fns = parseFunctions(FIXTURE_FUNCTION_BARE_QUOTE);
    expect(fns).toHaveLength(1);
    expect(fns[0]).toMatchObject({ schema: 'public', name: 'foo', hasOrReplace: true });
  });

  it('detects CREATE FUNCTION without OR REPLACE', () => {
    const fns = parseFunctions(FIXTURE_FUNCTION_NO_OR_REPLACE);
    expect(fns[0].hasOrReplace).toBe(false);
  });
});

describe('parseTriggers', () => {
  it('extracts trigger name', () => {
    const trs = parseTriggers(FIXTURE_TRIGGER);
    expect(trs).toHaveLength(1);
    expect(trs[0]).toMatchObject({ name: 'validate_handoff_trigger', hasOrReplace: true, kind: 'trigger' });
  });
});

describe('parseDeclaredObjects', () => {
  it('combines functions + triggers', () => {
    const all = parseDeclaredObjects(FIXTURE_FUNCTION + FIXTURE_TRIGGER);
    expect(all.map(o => o.kind)).toEqual(['function', 'trigger']);
  });
});

describe('normalizeBody / compareBodies', () => {
  it('collapses whitespace consistently', () => {
    expect(normalizeBody('  a    b\n\t c  ')).toBe('a b\nc');
  });

  it('reports equal bodies as matching after normalization', () => {
    expect(compareBodies('SELECT  1;', 'SELECT 1;')).toBe(true);
  });

  it('reports unequal bodies as different', () => {
    expect(compareBodies('SELECT 1;', 'SELECT 2;')).toBe(false);
  });
});

describe('evaluateMigration (mocked live DB)', () => {
  it('PASS-new: function absent from live state → NEW', async () => {
    const client = makeMockClient({ functions: {}, triggers: new Set() });
    const r = await evaluateMigration({ filePath: 'database/migrations/x.sql', sql: FIXTURE_FUNCTION, client });
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].status).toBe('NEW');
  });

  it('PASS-idempotent: live body normalizes-equals migration body → MATCHES', async () => {
    const live = `\nBEGIN\n  -- preserve recoverable stale claims\n  IF NEW.claim_status = 'absent' AND OLD.claim_status = 'present' THEN\n    NEW.claim_status := 'recoverable_stale';\n  END IF;\n  RETURN NEW;\nEND;\n`;
    const client = makeMockClient({ functions: { 'public.sync_is_working_on_with_session': live }, triggers: new Set() });
    const r = await evaluateMigration({ filePath: 'database/migrations/x.sql', sql: FIXTURE_FUNCTION, client });
    expect(r.findings[0].status).toBe('MATCHES');
  });

  it('FAIL-drift: live body differs → DIVERGED', async () => {
    const live = `BEGIN RETURN NEW; END;`;
    const client = makeMockClient({ functions: { 'public.sync_is_working_on_with_session': live }, triggers: new Set() });
    const r = await evaluateMigration({ filePath: 'database/migrations/x.sql', sql: FIXTURE_FUNCTION, client });
    expect(r.findings[0].status).toBe('DIVERGED');
  });

  it('FAIL-conflicting: CREATE without OR REPLACE on existing function → CONFLICTING', async () => {
    const client = makeMockClient({ functions: { 'public.brand_new_fn': 'BEGIN RETURN; END;' }, triggers: new Set() });
    const r = await evaluateMigration({ filePath: 'database/migrations/x.sql', sql: FIXTURE_FUNCTION_NO_OR_REPLACE, client });
    expect(r.findings[0].status).toBe('CONFLICTING');
  });
});

describe('listMigrationFiles', () => {
  it('filters to database/migrations/*.sql when --files passed', () => {
    const files = listMigrationFiles({ files: 'database/migrations/a.sql,scripts/x.js,database/migrations/b.sql' });
    expect(files).toEqual(['database/migrations/a.sql', 'database/migrations/b.sql']);
  });

  it('returns empty when no migration files match', () => {
    const files = listMigrationFiles({ files: 'src/x.ts,docs/y.md' });
    expect(files).toEqual([]);
  });
});

describe('OUTCOME enum', () => {
  it('exposes all expected markers', () => {
    expect(OUTCOME.PASS).toBe('MIGRATION_READINESS_PASS');
    expect(OUTCOME.PASS_NO_MIGRATIONS).toBe('MIGRATION_READINESS_PASS_NO_MIGRATIONS');
    expect(OUTCOME.FAIL_DRIFT).toBe('MIGRATION_READINESS_FAIL_DRIFT_DETECTED');
    expect(OUTCOME.FAIL_CONFLICTING).toBe('MIGRATION_READINESS_FAIL_CONFLICTING_DECLARATION');
    expect(OUTCOME.INFRA_ERROR).toBe('MIGRATION_READINESS_INFRA_ERROR');
  });
});
