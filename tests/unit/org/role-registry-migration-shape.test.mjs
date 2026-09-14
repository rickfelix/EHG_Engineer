/**
 * SD-LEO-INFRA-VERSIONED-ROLE-REGISTRY-001: migration SHAPE tests for the 4 new tables (base,
 * overlay, pin, change_log) -- static SQL-text assertions only, mirroring
 * tests/unit/chairman/ratification-verification-migration-shape.test.js. No DDL is executed
 * against any database (R1: the ceremony has not happened; these files must not be applied).
 *
 * TS-2 (refusal), TS-3 (repoint-only rollback), TS-4 (append-only change log), TS-5 (ceremony
 * marker present, not applied), TS-6 (no norms column on overlay) are all asserted at the SQL-text
 * level here -- a behavioral (DDL-executing) proof would require a live Postgres instance the
 * ceremony has not yet authorized.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyMigration } from '../../../scripts/lib/migration-tier-classifier.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const GATED_DIR = path.join(REPO_ROOT, 'database', 'chairman-gated');

const FILES = {
  base: 'base',
  overlayPin: 'overlay_pin',
  changeLog: 'change_log',
};
const SLUG = (name) => `20260914_org_role_registry_${name}`;

const stripComments = (sql) => (sql === null ? null : sql.replace(/^\s*--.*$/gm, ''));

function load(name) {
  const fwd = path.join(GATED_DIR, `${SLUG(name)}.sql`);
  const down = path.join(GATED_DIR, `${SLUG(name)}_DOWN.sql`);
  const fwdRaw = existsSync(fwd) ? readFileSync(fwd, 'utf8') : null;
  const downRaw = existsSync(down) ? readFileSync(down, 'utf8') : null;
  return {
    fwdPath: fwd,
    downPath: down,
    fwd: fwdRaw,
    down: downRaw,
    fwdStmts: stripComments(fwdRaw),
    downStmts: stripComments(downRaw),
  };
}

const base = load(FILES.base);
const overlayPin = load(FILES.overlayPin);
const changeLog = load(FILES.changeLog);

describe('placement and ceremony marker (TS-5)', () => {
  for (const [label, mig] of [['base', base], ['overlay_pin', overlayPin], ['change_log', changeLog]]) {
    it(`${label}: forward migration exists at the chairman-gated path`, () => {
      expect(mig.fwd, `expected migration at ${mig.fwdPath}`).not.toBeNull();
    });

    it(`${label}: rollback sibling exists`, () => {
      expect(mig.down, `expected rollback at ${mig.downPath}`).not.toBeNull();
    });

    it(`${label}: is NOT in database/migrations/, the auto-applied directory`, () => {
      const filename = path.basename(mig.fwdPath);
      const autoApplied = path.join(REPO_ROOT, 'database', 'migrations', filename);
      expect(existsSync(autoApplied)).toBe(false);
    });

    it(`${label}: carries the @chairman-gated marker the ceremony reads`, () => {
      expect(mig.fwd).toMatch(/@chairman-gated/);
    });

    it(`${label}: carries @approved-by: <PENDING> -- not yet ratified, not applied`, () => {
      expect(mig.fwd).toMatch(/@approved-by:\s*<PENDING/);
    });

    it(`${label}: classifies TIER-2 (cannot auto-apply)`, () => {
      expect(classifyMigration(mig.fwd).tier).toBe(2);
    });

    it(`${label}: rollback also classifies TIER-2`, () => {
      expect(classifyMigration(mig.down).tier).toBe(2);
    });
  }
});

describe('org_role_base_versions shape (FR-1, E1a)', () => {
  it('creates the table with structure/function/norms as separate NOT NULL JSONB columns', () => {
    expect(base.fwd).toMatch(/CREATE TABLE IF NOT EXISTS public\.org_role_base_versions/i);
    expect(base.fwd).toMatch(/structure\s+JSONB NOT NULL/i);
    expect(base.fwd).toMatch(/function\s+JSONB NOT NULL/i);
    expect(base.fwd).toMatch(/norms\s+JSONB NOT NULL/i);
  });

  it('E1a: has NO venture-identifying column at all -- a venture-scoped write is structurally impossible', () => {
    const createBlock = base.fwdStmts.match(/CREATE TABLE IF NOT EXISTS public\.org_role_base_versions[\s\S]*?\);/i)?.[0];
    expect(createBlock, 'org_role_base_versions CREATE TABLE block not found').toBeTruthy();
    expect(createBlock).not.toMatch(/\bventure_id\b/i);
  });

  it('enforces one active version per role_key via a partial unique index, not a trigger', () => {
    expect(base.fwd).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS org_role_base_versions_one_active_idx/i);
    expect(base.fwd).toMatch(/WHERE status = 'active'/);
  });

  it('provides supersede_org_role() mirroring leo_protocols\' two-UPDATE supersede pattern', () => {
    expect(base.fwd).toMatch(/CREATE OR REPLACE FUNCTION public\.supersede_org_role/i);
  });

  it('revokes anon/authenticated/PUBLIC and grants only service_role', () => {
    expect(base.fwd).toMatch(/REVOKE ALL ON public\.org_role_base_versions FROM anon, authenticated, PUBLIC/i);
    expect(base.fwd).toMatch(/GRANT ALL ON public\.org_role_base_versions TO service_role/i);
  });
});

describe('org_role_venture_overlays / org_role_venture_pins shape (FR-2, FR-3, TS-6)', () => {
  it('TS-6: org_role_venture_overlays has NO norms column -- structural clobber-impossibility', () => {
    // Extract just the overlays CREATE TABLE block to avoid false-negative from the pins table
    // (which legitimately has no norms either, but we want to test the RIGHT block).
    const overlaysBlock = overlayPin.fwdStmts.match(/CREATE TABLE IF NOT EXISTS public\.org_role_venture_overlays[\s\S]*?\);/i)?.[0];
    expect(overlaysBlock, 'org_role_venture_overlays CREATE TABLE block not found').toBeTruthy();
    expect(overlaysBlock).not.toMatch(/\bnorms\b/i);
  });

  it('overlays table has structure/function columns, both nullable (partial overlays allowed)', () => {
    const overlaysBlock = overlayPin.fwdStmts.match(/CREATE TABLE IF NOT EXISTS public\.org_role_venture_overlays[\s\S]*?\);/i)?.[0];
    expect(overlaysBlock).toMatch(/structure\s+JSONB/i);
    expect(overlaysBlock).toMatch(/function\s+JSONB/i);
  });

  it('overlays table is scoped by venture_id, FK to ventures(id)', () => {
    const overlaysBlock = overlayPin.fwdStmts.match(/CREATE TABLE IF NOT EXISTS public\.org_role_venture_overlays[\s\S]*?\);/i)?.[0];
    expect(overlaysBlock).toMatch(/venture_id\s+UUID NOT NULL REFERENCES public\.ventures\(id\)/i);
  });

  it('FR-3: pins table names base_version and overlay_version, FK\'d into base and overlay tables', () => {
    const pinsBlock = overlayPin.fwdStmts.match(/CREATE TABLE IF NOT EXISTS public\.org_role_venture_pins[\s\S]*?\);/i)?.[0];
    expect(pinsBlock).toMatch(/base_version\s+INTEGER NOT NULL/i);
    expect(pinsBlock).toMatch(/overlay_version\s+INTEGER/i);
    expect(pinsBlock).toMatch(/FOREIGN KEY \(role_key, base_version\)\s*\n?\s*REFERENCES public\.org_role_base_versions/i);
    expect(pinsBlock).toMatch(/FOREIGN KEY \(role_key, venture_id, overlay_version\)\s*\n?\s*REFERENCES public\.org_role_venture_overlays/i);
  });

  it('FR-3: one pin per (role_key, venture_id) -- repointing UPDATEs, never inserts a second row', () => {
    const pinsBlock = overlayPin.fwdStmts.match(/CREATE TABLE IF NOT EXISTS public\.org_role_venture_pins[\s\S]*?\);/i)?.[0];
    expect(pinsBlock).toMatch(/UNIQUE \(role_key, venture_id\)/i);
  });

  it('revokes anon/authenticated/PUBLIC and grants only service_role on both tables', () => {
    expect(overlayPin.fwd).toMatch(/REVOKE ALL ON public\.org_role_venture_overlays FROM anon, authenticated, PUBLIC/i);
    expect(overlayPin.fwd).toMatch(/REVOKE ALL ON public\.org_role_venture_pins FROM anon, authenticated, PUBLIC/i);
  });

  it('rollback drops pins before overlays (pins FK into overlays)', () => {
    const pinsDropAt = overlayPin.down.search(/DROP TABLE IF EXISTS public\.org_role_venture_pins/i);
    const overlaysDropAt = overlayPin.down.search(/DROP TABLE IF EXISTS public\.org_role_venture_overlays/i);
    expect(pinsDropAt).toBeGreaterThan(-1);
    expect(overlaysDropAt).toBeGreaterThan(-1);
    expect(pinsDropAt).toBeLessThan(overlaysDropAt);
  });
});

describe('org_role_change_log shape (FR-4, TS-4)', () => {
  it('carries layer/operation CHECK constraints scoped to the three registry layers', () => {
    expect(changeLog.fwd).toMatch(/layer\s+TEXT NOT NULL CHECK \(layer IN \('base', 'overlay', 'pin'\)\)/i);
    expect(changeLog.fwd).toMatch(/operation\s+TEXT NOT NULL CHECK \(operation IN \('INSERT', 'UPDATE', 'DELETE'\)\)/i);
  });

  // Adversarial review finding (deep-tier /ship review, CRITICAL): a DELETE-blind first draft let
  // a service_role session erase a role version with zero audit trace -- fixed by adding AFTER
  // DELETE handling here, and the ENABLE ALWAYS test below.
  it('is populated by AFTER INSERT/UPDATE/DELETE triggers on all three source tables', () => {
    expect(changeLog.fwd).toMatch(/AFTER INSERT OR UPDATE OR DELETE ON public\.org_role_base_versions/i);
    expect(changeLog.fwd).toMatch(/AFTER INSERT OR UPDATE OR DELETE ON public\.org_role_venture_overlays/i);
    expect(changeLog.fwd).toMatch(/AFTER INSERT OR UPDATE OR DELETE ON public\.org_role_venture_pins/i);
  });

  it('the three source-table writer triggers are ENABLE ALWAYS -- a replica-mode session cannot silently skip logging a DELETE (or INSERT/UPDATE)', () => {
    for (const trg of [
      'trg_org_role_base_versions_log',
      'trg_org_role_venture_overlays_log',
      'trg_org_role_venture_pins_log',
    ]) {
      expect(changeLog.fwd, `${trg} must be ENABLE ALWAYS`).toMatch(new RegExp(`ENABLE ALWAYS TRIGGER\\s+${trg}`));
    }
  });

  it('TS-4: carries all three append-only guard triggers on itself, all ENABLE ALWAYS', () => {
    for (const trg of [
      'org_role_change_log_no_update_trg',
      'org_role_change_log_no_delete_trg',
      'org_role_change_log_no_truncate_trg',
    ]) {
      expect(changeLog.fwd, `missing trigger ${trg}`).toMatch(new RegExp(`CREATE TRIGGER\\s+${trg}`));
      expect(changeLog.fwd, `${trg} must be ENABLE ALWAYS (SECURITY finding M1 precedent)`).toMatch(
        new RegExp(`ENABLE ALWAYS TRIGGER\\s+${trg}`)
      );
    }
  });

  it('TS-4: contains no top-level UPDATE or DELETE statement against itself (insert-only, by construction)', () => {
    const stripComments = changeLog.fwd.replace(/^\s*--.*$/gm, '');
    expect(stripComments).not.toMatch(/^\s*UPDATE\s+public\.org_role_change_log\b/im);
    expect(stripComments).not.toMatch(/^\s*DELETE FROM\s+public\.org_role_change_log\b/im);
  });

  it('revokes anon/authenticated/PUBLIC and grants only service_role', () => {
    expect(changeLog.fwd).toMatch(/REVOKE ALL ON public\.org_role_change_log FROM anon, authenticated, PUBLIC/i);
    expect(changeLog.fwd).toMatch(/GRANT ALL ON public\.org_role_change_log TO service_role/i);
  });

  it('rollback drops triggers before functions, functions before the table', () => {
    const triggerAt = changeLog.down.search(/DROP TRIGGER/i);
    const functionAt = changeLog.down.search(/DROP FUNCTION/i);
    const tableAt = changeLog.down.search(/DROP TABLE/i);
    expect(triggerAt).toBeGreaterThan(-1);
    expect(functionAt).toBeGreaterThan(-1);
    expect(tableAt).toBeGreaterThan(-1);
    expect(triggerAt).toBeLessThan(functionAt);
    expect(functionAt).toBeLessThan(tableAt);
  });
});

describe('TR-2: venture-ceo-factory.js is untouched by this SD', () => {
  it('instantiateVenture and _getTemplate are unchanged -- 0 diff expected against the dependency-SD-era file', () => {
    const factoryPath = path.join(REPO_ROOT, 'lib', 'agents', 'venture-ceo-factory.js');
    const content = readFileSync(factoryPath, 'utf8');
    // Assert the splice point this SD deliberately does NOT touch is still exactly the
    // hardcoded-constant form -- if a future edit switches it to a registry read, this test
    // should be updated deliberately, not silently pass either way.
    expect(content).toMatch(/_getTemplate\(templateId\)\s*\{\s*\n\s*if\s*\(templateId === 'standard'\)\s*\{\s*\n\s*return STANDARD_VENTURE_TEMPLATE;/);
  });
});
