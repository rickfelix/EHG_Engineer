// SD-LEO-INFRA-MICHAEL-TIER2-CHECKPOINT-SEND-001 — shape of the checkpoint-send two-table
// migration. Static text assertions (no DB). The behavioural proof is
// tests/ddl/michael-checkpoint-send-ddl.db.test.js.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIG_DIR = path.resolve(here, '../../../database/migrations');
const up = fs.readFileSync(path.join(MIG_DIR, '20260914_michael_checkpoint_send.sql'), 'utf8');
const down = fs.readFileSync(path.join(MIG_DIR, '20260914_michael_checkpoint_send_DOWN.sql'), 'utf8');
const upCode = up.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

export const CHECKPOINT_SEND_TABLES = ['michael_checkpoint_send_ledger', 'michael_checkpoint_send_enabled'];

const CHAIRMAN_GATED_RE = /^\s*--\s*(@chairman-gated|requires[-_]chairman[-_]apply)\b\s*[:=]?.*$/im;
const APPROVED_BY_RE = /^\s*--\s*@approved-by:\s*([^\s<>"]+@[^\s<>"]+)\s*$/m;

describe('michael checkpoint-send migration shape', () => {
  it('names exactly two tables and creates each with IF NOT EXISTS', () => {
    expect(CHECKPOINT_SEND_TABLES).toHaveLength(2);
    const creates = up.match(/CREATE TABLE IF NOT EXISTS public\.michael_\w+/g) || [];
    expect(creates).toHaveLength(2);
    for (const t of CHECKPOINT_SEND_TABLES) expect(up).toContain(`CREATE TABLE IF NOT EXISTS public.${t} (`);
  });

  it.each(CHECKPOINT_SEND_TABLES)('%s carries the full service-role-only posture and surrogate id PK', (t) => {
    expect(up).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t} \\(\\s*id UUID PRIMARY KEY DEFAULT gen_random_uuid\\(\\),`));
    expect(up).toMatch(new RegExp(`COMMENT ON TABLE public\\.${t} IS '`));
    expect(up).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`);
    expect(up).toContain(`DROP POLICY IF EXISTS ${t}_service_role ON public.${t};`);
    expect(up).toContain(`CREATE POLICY ${t}_service_role ON public.${t} FOR ALL TO service_role USING (true) WITH CHECK (true);`);
    expect(up).toContain(`REVOKE ALL ON public.${t} FROM anon, authenticated, PUBLIC;`);
    expect(up).toContain(`GRANT ALL ON public.${t} TO service_role;`);
    expect(up).toContain(`CREATE TRIGGER ${t}_set_updated_at BEFORE UPDATE ON public.${t} FOR EACH ROW EXECUTE FUNCTION public.michael_set_updated_at();`);
  });

  it('the ledger table has a PARTIAL unique index on (et_date, window_slot) WHERE outcome=\'sent\' (FR-7)', () => {
    expect(up).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS michael_checkpoint_send_ledger_sent_slot_uniq\s*\n?\s*ON public\.michael_checkpoint_send_ledger \(et_date, window_slot\) WHERE outcome = 'sent';/);
  });

  it('the enabled table has a plain unique index on config_key (singleton natural key, FR-5)', () => {
    expect(up).toContain('CREATE UNIQUE INDEX IF NOT EXISTS michael_checkpoint_send_enabled_config_key_uniq ON public.michael_checkpoint_send_enabled (config_key);');
  });

  it('the ledger table\'s outcome column is CHECK-constrained inline to sent|held|refused', () => {
    expect(up).toMatch(/outcome TEXT NOT NULL CHECK \(outcome IN \('sent', 'held', 'refused'\)\)/);
  });

  it('seeds exactly one enabled=true row for config_key=\'checkpoint_send\', idempotently (ON CONFLICT DO NOTHING)', () => {
    expect(up).toMatch(/INSERT INTO public\.michael_checkpoint_send_enabled \(config_key, enabled, reason\)\s*\nVALUES \('checkpoint_send', true,/);
    expect(up).toContain('ON CONFLICT (config_key) DO NOTHING;');
  });

  it('never a natural-key-as-PRIMARY-KEY — every PK is the surrogate id', () => {
    const idPkMatches = upCode.match(/id UUID PRIMARY KEY DEFAULT gen_random_uuid\(\)/g) || [];
    expect(idPkMatches).toHaveLength(2);
    expect(upCode).not.toMatch(/PRIMARY KEY \(et_date/);
    expect(upCode).not.toMatch(/config_key TEXT( NOT NULL)? PRIMARY KEY/);
  });

  it('never CREATEs or REPLACEs the shared trigger function (base michael migration owns it)', () => {
    expect(up).not.toMatch(/CREATE (OR REPLACE )?FUNCTION public\.michael_set_updated_at/);
    expect(up).toContain('public.michael_set_updated_at()');
  });

  it('every CHECK is inline in CREATE TABLE (the DDL tier applies the file twice)', () => {
    expect(up).not.toMatch(/ALTER TABLE[^;]*ADD CONSTRAINT/i);
  });

  it('carries @chairman-gated and the chairman @approved-by marker (signed off 2026-09-14, ratification 92b44597); the DOWN stays unsigned', () => {
    expect(up).toMatch(CHAIRMAN_GATED_RE);
    expect(up).toMatch(/^--\s*@approved-by: codestreetlabs@gmail\.com\s*$/m);
    expect(down).toMatch(CHAIRMAN_GATED_RE);
    expect(down).not.toMatch(APPROVED_BY_RE);
  });

  it('has no BEGIN/COMMIT wrapper', () => {
    expect(up).not.toMatch(/^\s*BEGIN;\s*$/m);
    expect(up).not.toMatch(/^\s*COMMIT;\s*$/m);
  });

  it('DOWN drops exactly the two checkpoint-send tables, no CASCADE, and never drops the shared function', () => {
    const downCode = down.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    const drops = downCode.match(/DROP TABLE IF EXISTS public\.\w+;/g) || [];
    expect(drops).toHaveLength(2);
    expect(downCode).not.toMatch(/CASCADE/i);
    expect(downCode).not.toMatch(/DROP FUNCTION/i);
    for (const t of CHECKPOINT_SEND_TABLES) expect(down).toContain(`DROP TABLE IF EXISTS public.${t};`);
  });

  it('the DO $verify$ block pins both tables, both key indexes, the seed row, and asserts the shared function is untouched', () => {
    expect(up).toContain('DO $verify$');
    for (const t of CHECKPOINT_SEND_TABLES) expect(up).toContain(`'${t}'`);
    expect(up).toContain('michael_checkpoint_send_ledger_sent_slot_uniq');
    expect(up).toContain('michael_checkpoint_send_enabled_config_key_uniq');
    expect(up).toContain("config_key = 'checkpoint_send'");
    expect(up).toContain('michael_set_updated_at');
    expect(up).toContain('plpgsql.check_asserts');
  });
});
