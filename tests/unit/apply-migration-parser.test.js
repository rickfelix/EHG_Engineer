/**
 * SD-LEO-INFRA-CANONICAL-SCRIPTS-APPLY-001 — FR-5 / TS-1
 * Unit tests for scripts/lib/migration-object-parser.js (no DB).
 *
 * Covers: parseDeclaredObjects extracts FUNCTION+TRIGGER+VIEW+INDEX with
 * $$/$tag$/IF NOT EXISTS variants. detectDestructiveDDL flags DROP keywords
 * without IF EXISTS. (TS-1 + TS-14.)
 */
import { describe, it, expect } from 'vitest';
import {
  parseDeclaredObjects,
  detectDestructiveDDL,
} from '../../scripts/lib/migration-object-parser.js';

describe('parseDeclaredObjects', () => {
  it('extracts CREATE FUNCTION (qualified, $$-bodied)', () => {
    const sql = `CREATE OR REPLACE FUNCTION public.my_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$;`;
    const o = parseDeclaredObjects(sql);
    expect(o).toEqual([{ kind: 'FUNCTION', schema: 'public', name: 'my_fn' }]);
  });

  it('extracts CREATE TRIGGER ON table', () => {
    const sql = `CREATE TRIGGER trg_x BEFORE UPDATE ON public.foo FOR EACH ROW EXECUTE FUNCTION public.f();`;
    const o = parseDeclaredObjects(sql);
    expect(o.some(x => x.kind === 'TRIGGER' && x.name === 'trg_x' && x.table === 'foo')).toBe(true);
  });

  it('extracts CREATE VIEW (IF NOT EXISTS, materialized)', () => {
    const sql = `CREATE OR REPLACE VIEW public.v1 AS SELECT 1; CREATE MATERIALIZED VIEW IF NOT EXISTS public.v2 AS SELECT 2;`;
    const o = parseDeclaredObjects(sql);
    expect(o.some(x => x.kind === 'VIEW' && x.name === 'v1')).toBe(true);
    expect(o.some(x => x.kind === 'VIEW' && x.name === 'v2')).toBe(true);
  });

  it('extracts CREATE INDEX (UNIQUE / CONCURRENTLY / IF NOT EXISTS)', () => {
    const sql = `
      CREATE INDEX i_a ON public.t (a);
      CREATE UNIQUE INDEX i_b ON public.t (b);
      CREATE INDEX CONCURRENTLY IF NOT EXISTS i_c ON public.t (c);
    `;
    const o = parseDeclaredObjects(sql);
    const names = o.filter(x => x.kind === 'INDEX').map(x => x.name).sort();
    expect(names).toEqual(['i_a', 'i_b', 'i_c']);
  });

  it('ignores objects declared inside $tag$ bodies', () => {
    const sql = `
      CREATE OR REPLACE FUNCTION public.outer() RETURNS void LANGUAGE plpgsql AS $function$
        BEGIN
          CREATE TABLE inner_t(); -- inside body, should NOT be picked
          CREATE TRIGGER inner_trg BEFORE UPDATE ON inner_t FOR EACH ROW EXECUTE FUNCTION f();
        END;
      $function$;
    `;
    const o = parseDeclaredObjects(sql);
    expect(o.length).toBe(1);
    expect(o[0]).toMatchObject({ kind: 'FUNCTION', name: 'outer' });
  });

  it('dedupes identical declarations', () => {
    const sql = `CREATE OR REPLACE FUNCTION public.dup() RETURNS void AS $$ BEGIN END; $$; CREATE OR REPLACE FUNCTION public.dup() RETURNS void AS $$ BEGIN END; $$;`;
    const o = parseDeclaredObjects(sql);
    expect(o.length).toBe(1);
  });

  it('returns empty for unparseable DDL (ALTER TABLE etc) — MVP scope', () => {
    const sql = `ALTER TABLE public.t ADD COLUMN x int;`;
    expect(parseDeclaredObjects(sql)).toEqual([]);
  });

  it('returns empty for empty input', () => {
    expect(parseDeclaredObjects('')).toEqual([]);
    expect(parseDeclaredObjects(null)).toEqual([]);
  });
});

describe('detectDestructiveDDL (FR-7 / TS-14)', () => {
  it.each([
    ['DROP TABLE public.t;', 'DROP TABLE'],
    ['TRUNCATE public.t;', 'TRUNCATE'],
    ['DROP SCHEMA s CASCADE;', 'DROP SCHEMA'],
    ['DROP DATABASE x;', 'DROP DATABASE'],
    ['ALTER TABLE t DROP COLUMN x;', 'DROP COLUMN'],
  ])('detects %s', (sql, kw) => {
    expect(detectDestructiveDDL(sql)).toContain(kw);
  });

  it('does NOT flag DROP TABLE IF EXISTS', () => {
    expect(detectDestructiveDDL('DROP TABLE IF EXISTS public.t;')).not.toContain('DROP TABLE');
  });

  it('returns empty for non-destructive SQL', () => {
    expect(detectDestructiveDDL('CREATE TABLE t(x int);')).toEqual([]);
  });

  it('does not panic on empty/null input', () => {
    expect(detectDestructiveDDL('')).toEqual([]);
    expect(detectDestructiveDDL(null)).toEqual([]);
  });
});
