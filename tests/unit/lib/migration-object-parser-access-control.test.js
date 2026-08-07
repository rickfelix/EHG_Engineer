import { describe, it, expect } from 'vitest';
import { parseDeclaredObjects } from '../../../scripts/lib/migration-object-parser.js';

// SD-FDBK-INFRA-LIVE-PROBE-DDL-001 FR-5a. Without POLICY/CONSTRAINT parsing, a migration that
// changes access-control DDL declares ZERO objects, so the FR-2/FR-3 live probes have nothing to
// probe and the sweep cannot know an object was touched at all.
describe('FR-5a POLICY parsing', () => {
  it('CREATE POLICY ... ON table yields a POLICY carrying its table', () => {
    const objs = parseDeclaredObjects('CREATE POLICY p_read ON public.ventures FOR SELECT USING (true);');
    expect(objs).toContainEqual({ kind: 'POLICY', schema: 'public', name: 'p_read', table: 'ventures' });
  });

  it('ALTER POLICY is captured too — a policy can diverge by being altered, not only created', () => {
    const objs = parseDeclaredObjects('ALTER POLICY p_read ON ventures USING (false);');
    expect(objs).toContainEqual({ kind: 'POLICY', schema: 'public', name: 'p_read', table: 'ventures' });
  });

  // THE DEDUPE FIX, and the reason it matters. Policy names are unique per TABLE. The old key
  // (kind::schema::name) collapsed these two into one and dropped the second — meaning the sweep
  // would probe one table and report the other as verified. That is a silent miss.
  it('two same-named policies on DIFFERENT tables are BOTH retained', () => {
    const objs = parseDeclaredObjects(
      'CREATE POLICY select_own ON public.ventures FOR SELECT USING (true);\n'
      + 'CREATE POLICY select_own ON public.companies FOR SELECT USING (true);'
    );
    const policies = objs.filter((o) => o.kind === 'POLICY');
    expect(policies).toHaveLength(2);
    expect(policies.map((p) => p.table).sort()).toEqual(['companies', 'ventures']);
  });

  it('a genuinely duplicate declaration is still deduped', () => {
    const objs = parseDeclaredObjects(
      'CREATE POLICY p ON public.t USING (true);\nCREATE POLICY p ON public.t USING (true);'
    );
    expect(objs.filter((o) => o.kind === 'POLICY')).toHaveLength(1);
  });
});

describe('FR-5a CONSTRAINT parsing', () => {
  it('ALTER TABLE ... ADD CONSTRAINT yields a CONSTRAINT carrying its table', () => {
    const objs = parseDeclaredObjects("ALTER TABLE public.ventures ADD CONSTRAINT ck_status CHECK (status <> '');");
    expect(objs).toContainEqual({ kind: 'CONSTRAINT', schema: 'public', name: 'ck_status', table: 'ventures' });
  });

  it('handles ALTER TABLE IF EXISTS / ONLY forms', () => {
    const objs = parseDeclaredObjects('ALTER TABLE IF EXISTS ONLY public.t ADD CONSTRAINT c1 UNIQUE (a);');
    expect(objs).toContainEqual({ kind: 'CONSTRAINT', schema: 'public', name: 'c1', table: 't' });
  });

  it('same constraint name on different tables: both retained', () => {
    const objs = parseDeclaredObjects(
      'ALTER TABLE public.a ADD CONSTRAINT ck_x CHECK (1=1);\nALTER TABLE public.b ADD CONSTRAINT ck_x CHECK (1=1);'
    );
    expect(objs.filter((o) => o.kind === 'CONSTRAINT')).toHaveLength(2);
  });
});

describe('FR-5a no regression to existing kinds', () => {
  it('FUNCTION and VIEW (no table) still parse and dedupe by kind::schema::name', () => {
    const objs = parseDeclaredObjects(
      'CREATE OR REPLACE FUNCTION public.f() RETURNS void AS $$ BEGIN END $$ LANGUAGE plpgsql;\n'
      + 'CREATE OR REPLACE VIEW public.v AS SELECT 1;\n'
      + 'CREATE OR REPLACE FUNCTION public.f() RETURNS void AS $$ BEGIN END $$ LANGUAGE plpgsql;'
    );
    expect(objs.filter((o) => o.kind === 'FUNCTION')).toHaveLength(1);
    expect(objs.filter((o) => o.kind === 'VIEW')).toHaveLength(1);
  });

  it('a migration mixing all kinds declares each one', () => {
    const objs = parseDeclaredObjects(
      'CREATE OR REPLACE FUNCTION public.f() RETURNS trigger AS $$ BEGIN RETURN NEW; END $$ LANGUAGE plpgsql;\n'
      + 'CREATE TRIGGER t1 AFTER INSERT ON public.ventures FOR EACH ROW EXECUTE FUNCTION public.f();\n'
      + 'CREATE INDEX ix1 ON public.ventures (id);\n'
      + 'CREATE POLICY p1 ON public.ventures USING (true);\n'
      + 'ALTER TABLE public.ventures ADD CONSTRAINT ck1 CHECK (id IS NOT NULL);'
    );
    expect(objs.map((o) => o.kind).sort()).toEqual(['CONSTRAINT', 'FUNCTION', 'INDEX', 'POLICY', 'TRIGGER']);
  });
});
