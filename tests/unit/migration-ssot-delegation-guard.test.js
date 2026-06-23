/**
 * SD-REFILL-00VDVRYM — guard against repo<->live drift on the enforce_is_working_on_for_handoffs()
 * claim-enforcement trigger. The LIVE function delegates the trusted-actor skip to the
 * handoff_actor_policy() SSOT; an older repo migration hardcoded an inline `created_by IN (...)`
 * list. This test asserts the CANONICAL (latest) repo migration that (re)defines the function
 * delegates to the SSOT and does NOT reintroduce the inline actor-bypass — so a future inline
 * regeneration that would clobber the live SSOT is caught in CI before it merges.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

const FUNC = 'enforce_is_working_on_for_handoffs';
const MIGRATIONS_DIR = path.resolve(__dirname, '../../database/migrations');

/** All migration files that CREATE OR REPLACE the target function, sorted by filename (date prefix). */
function migrationsDefiningFunc() {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  const defs = [];
  for (const f of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    if (new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+${FUNC}\\b`, 'i').test(sql)) {
      defs.push({ file: f, sql });
    }
  }
  defs.sort((a, b) => a.file.localeCompare(b.file));
  return defs;
}

/** The function-body slice of a migration (so trigger/comment text doesn't skew the inline-list check). */
function funcBody(sql) {
  const start = sql.search(new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+${FUNC}\\b`, 'i'));
  if (start < 0) return '';
  // up to LANGUAGE plpgsql (end of the function definition)
  const rest = sql.slice(start);
  const end = rest.search(/LANGUAGE\s+plpgsql/i);
  return end < 0 ? rest : rest.slice(0, end);
}

describe('SD-REFILL-00VDVRYM: enforce_is_working_on_for_handoffs SSOT delegation guard', () => {
  it('at least one migration defines the function', () => {
    expect(migrationsDefiningFunc().length).toBeGreaterThan(0);
  });

  it('the CANONICAL (latest) migration delegates the actor-skip to handoff_actor_policy()', () => {
    const defs = migrationsDefiningFunc();
    const canonical = defs[defs.length - 1];
    expect(canonical.sql).toMatch(/handoff_actor_policy\s*\(/i);
  });

  it('the CANONICAL migration body does NOT reintroduce the inline created_by IN (...) actor-bypass', () => {
    const defs = migrationsDefiningFunc();
    const body = funcBody(defs[defs.length - 1].sql);
    // The drift landmine: a hardcoded actor list standing in for the SSOT skip.
    expect(body).not.toMatch(/NEW\.created_by\s+IN\s*\(/i);
  });

  it('the CANONICAL migration preserves the session-var bypass and is_working_on enforcement', () => {
    const body = funcBody(migrationsDefiningFunc().slice(-1)[0].sql);
    expect(body).toMatch(/leo\.bypass_working_on_check/);
    expect(body).toMatch(/is_working_on/i);
  });
});
