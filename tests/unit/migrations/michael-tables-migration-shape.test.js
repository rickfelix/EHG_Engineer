// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B / FR-1, FR-7, TS-1 — shape of the eleven-table migration.
// Static text assertions (no DB). The behavioural proof is tests/ddl/michael-tables-ddl.db.test.js,
// which applies the file to a PostgreSQL 16 container and RUNS its DO $verify$ block.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIG_DIR = path.resolve(here, '../../../database/migrations');
const up = fs.readFileSync(path.join(MIG_DIR, '20260906_michael_tables.sql'), 'utf8');
const down = fs.readFileSync(path.join(MIG_DIR, '20260906_michael_tables_DOWN.sql'), 'utf8');

export const MICHAEL_TABLES = [
  'michael_rules', 'michael_gmail_labels', 'michael_closures', 'michael_feedback_ledger',
  'michael_feeder_runs', 'michael_calendar_day', 'michael_gmail_triage_items',
  'michael_todoist_snapshot', 'michael_brief_runs', 'michael_credentials', 'michael_staged_items',
];

/** Natural keys of spec §2 (feeder_runs reordered et_date-first per DATABASE 1533367f D11). */
const NATURAL_KEYS = {
  michael_rules: '(domain, rule_key) WHERE status = \'active\'',
  michael_gmail_labels: '(label_id)',
  michael_closures: '(closure_key)',
  michael_feedback_ledger: '(et_date)',
  michael_feeder_runs: '(et_date, feeder, attempt)',
  michael_calendar_day: '(et_date, event_id)',
  michael_gmail_triage_items: '(et_date, thread_id)',
  michael_todoist_snapshot: '(et_date, task_id)',
  michael_brief_runs: '(et_date)',
  michael_credentials: '(identifier)',
  michael_staged_items: null, // uuid id is the key; partial (kind) index only
};

// Copies of the disposition seeder's own regexes (scripts/seed-migration-dispositions.mjs:46,49);
// they are module-private there, so the copies are pinned here and must be kept in step.
const CHAIRMAN_GATED_RE = /^\s*--\s*(@chairman-gated|requires[-_]chairman[-_]apply)\b\s*[:=]?.*$/im;
const APPROVED_BY_RE = /^\s*--\s*@approved-by:\s*([^\s<>"]+@[^\s<>"]+)\s*$/m;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('michael_* migration shape (FR-1)', () => {
  it('names exactly eleven tables and creates each with IF NOT EXISTS', () => {
    expect(MICHAEL_TABLES).toHaveLength(11);
    const creates = up.match(/CREATE TABLE IF NOT EXISTS public\.michael_\w+/g) || [];
    expect(creates).toHaveLength(11);
    for (const t of MICHAEL_TABLES) expect(up).toContain(`CREATE TABLE IF NOT EXISTS public.${t} (`);
  });

  it.each(MICHAEL_TABLES)('%s carries the full service-role-only posture', (t) => {
    expect(up).toMatch(new RegExp(`COMMENT ON TABLE public\\.${t} IS '`));
    expect(up).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`);
    expect(up).toContain(`DROP POLICY IF EXISTS ${t}_service_role ON public.${t};`);
    expect(up).toContain(`CREATE POLICY ${t}_service_role ON public.${t} FOR ALL TO service_role USING (true) WITH CHECK (true);`);
    expect(up).toContain(`REVOKE ALL ON public.${t} FROM anon, authenticated, PUBLIC;`);
    expect(up).toContain(`GRANT ALL ON public.${t} TO service_role;`);
    expect(up).toContain(`CREATE TRIGGER ${t}_set_updated_at BEFORE UPDATE ON public.${t} FOR EACH ROW EXECUTE FUNCTION public.michael_set_updated_at();`);
    if (NATURAL_KEYS[t]) {
      expect(up).toMatch(new RegExp(`CREATE UNIQUE INDEX IF NOT EXISTS ${t}_\\w+ ON public\\.${t} ${esc(NATURAL_KEYS[t])};`));
    }
  });

  it('michael_rules: partial unique on active rows, self-FK, value CHECKs and the autonomy invariant inline', () => {
    expect(up).toContain("CREATE UNIQUE INDEX IF NOT EXISTS michael_rules_active_domain_key_uniq ON public.michael_rules (domain, rule_key) WHERE status = 'active';");
    expect(up).toContain('supersedes UUID NULL REFERENCES public.michael_rules(id)');
    expect(up).toMatch(/domain TEXT NOT NULL CHECK \(domain IN \('gmail', 'todoist', 'calendar', 'tasks', 'body', 'brief', 'capture', 'youtube'\)\)/);
    expect(up).toMatch(/status TEXT NOT NULL DEFAULT 'active' CHECK \(status IN \('active', 'superseded'\)\)/);
    expect(up).toMatch(/auto_apply_verb TEXT NULL CHECK \(auto_apply_verb IN \('label', 'archive', 'reschedule'\)\)/);
    expect(up).toContain('CHECK (auto_apply = false OR (auto_apply_verb IS NOT NULL AND auto_apply_since IS NOT NULL))');
    expect(up).toContain('CREATE INDEX IF NOT EXISTS michael_rules_supersedes_idx ON public.michael_rules (supersedes);');
  });

  it('feeder_runs venue/status CHECKs, jsonb_typeof CHECKs, and the four extra indexes', () => {
    expect(up).toMatch(/venue TEXT NOT NULL CHECK \(venue IN \('task_scheduler', 'gha', 'seat'\)\)/);
    expect(up).toMatch(/status TEXT NOT NULL CHECK \(status IN \('ok', 'degraded', 'failed', 'skipped', 'imported'\)\)/);
    expect(up).toContain("dispositions JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(dispositions) = 'array')");
    expect(up).toContain("mutations_applied JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(mutations_applied) = 'array')");
    expect(up).toContain("counts JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(counts) = 'object')");
    expect(up).toContain("provenance JSONB NOT NULL CHECK (jsonb_typeof(provenance) = 'object')");
    expect(up).toContain('CREATE INDEX IF NOT EXISTS michael_staged_items_kind_open_idx ON public.michael_staged_items (kind) WHERE dispositioned_at IS NULL;');
    expect(up).toContain('CREATE INDEX IF NOT EXISTS michael_gmail_triage_items_rule_reopened_idx ON public.michael_gmail_triage_items (rule_key) WHERE reopened_at IS NOT NULL;');
    expect(up).toContain('CREATE INDEX IF NOT EXISTS michael_todoist_snapshot_rule_moved_back_idx ON public.michael_todoist_snapshot (rule_key) WHERE moved_back_at IS NOT NULL;');
  });

  it('every CHECK is inline in CREATE TABLE (the DDL tier applies the file twice)', () => {
    expect(up).not.toMatch(/ALTER TABLE[^;]*ADD CONSTRAINT/i);
  });

  it('has no streak columns anywhere', () => {
    expect(up).not.toMatch(/\b(streak|approve_count|consecutive_approvals|streak_count)\b\s+(INTEGER|INT|BIGINT|NUMERIC)/i);
  });

  it('pins the consumer columns scripts/michael-quiet-tick.mjs already reads, plus the verb columns', () => {
    const pins = [
      ['michael_gmail_triage_items', 'class TEXT NULL'],
      ['michael_todoist_snapshot', 'effort_grade TEXT NULL'],
      ['michael_todoist_snapshot', 'rule_key TEXT NULL'],
      ['michael_brief_runs', 'verified BOOLEAN NOT NULL DEFAULT false'],
      ['michael_brief_runs', 'enriched_at TIMESTAMPTZ NULL'],
      ['michael_gmail_triage_items', 'reopened_at TIMESTAMPTZ NULL'],
      ['michael_todoist_snapshot', 'moved_back_at TIMESTAMPTZ NULL'],
      ['michael_staged_items', 'dispositioned_at TIMESTAMPTZ NULL'],
      ['michael_calendar_day', 'calendar_id TEXT NOT NULL'],
      ['michael_credentials', 'encrypted_blob TEXT NULL'],
      ['michael_credentials', 'key_fingerprint TEXT NULL'],
    ];
    for (const [t, col] of pins) {
      const start = up.indexOf(`CREATE TABLE IF NOT EXISTS public.${t} (`);
      const end = up.indexOf(');', start);
      expect(up.slice(start, end), `${t} lacks ${col}`).toContain(col);
    }
    // Prose columns stay nullable with no default so retention can null them (FR-6).
    for (const col of ['rendered_html TEXT NULL', 'brief_md TEXT NULL', 'summary TEXT NULL', 'needs_you_reason TEXT NULL']) expect(up).toContain(col);
  });

  it('owns its updated_at trigger function with EXECUTE revoked from PUBLIC, anon, authenticated', () => {
    expect(up).toContain('CREATE OR REPLACE FUNCTION public.michael_set_updated_at()');
    expect(up).toContain('REVOKE EXECUTE ON FUNCTION public.michael_set_updated_at() FROM PUBLIC, anon, authenticated;');
    expect(up).toContain('GRANT EXECUTE ON FUNCTION public.michael_set_updated_at() TO service_role;');
    expect(up).not.toMatch(/set_updated_at\(\)\s*RETURNS trigger[\s\S]*?public\.set_updated_at\(\)/);
  });

  it('self-verifies every table, index, pinned column and the function ACL inside one DO $verify$', () => {
    const start = up.indexOf('DO $verify$');
    expect(start).toBeGreaterThan(0);
    const block = up.slice(start);
    for (const t of MICHAEL_TABLES) expect(block).toContain(`'${t}'`);
    expect(block).toContain("p.polroles = ARRAY['service_role'::regrole::oid]");
    expect(block).toContain("p.polcmd = '*'");
    expect(block).toContain("has_table_privilege('anon', v_rel, 'SELECT')");
    expect(block).toContain("has_table_privilege('authenticated', v_rel, 'DELETE')");
    expect(block).toContain('aclexplode(at.attacl)');
    expect(block).toContain('information_schema.columns');
    expect(block).toContain("has_function_privilege('anon', 'public.michael_set_updated_at()', 'EXECUTE')");
    expect((block.match(/ASSERT /g) || []).length).toBeGreaterThanOrEqual(20);
  });

  it('has no transaction wrapper and never depends on --split-statements', () => {
    expect(up).not.toMatch(/^\s*BEGIN;\s*$/m);
    expect(up).not.toMatch(/^\s*COMMIT;\s*$/m);
  });

  it('ships chairman-gated with NO @approved-by marker (the seeder\'s RULE A defers it)', () => {
    expect(CHAIRMAN_GATED_RE.test(up)).toBe(true);
    expect(APPROVED_BY_RE.test(up)).toBe(false);
    expect(CHAIRMAN_GATED_RE.test(down)).toBe(true);
    expect(APPROVED_BY_RE.test(down)).toBe(false);
  });

  it('the DOWN drops exactly the eleven tables then the function, without CASCADE', () => {
    const drops = down.match(/DROP TABLE IF EXISTS public\.michael_\w+;/g) || [];
    expect(drops).toHaveLength(11);
    for (const t of MICHAEL_TABLES) expect(down).toContain(`DROP TABLE IF EXISTS public.${t};`);
    expect(down.trim().endsWith('DROP FUNCTION IF EXISTS public.michael_set_updated_at();')).toBe(true);
    const downSql = down.replace(/^\s*--.*$/gm, '');
    expect(downSql).not.toMatch(/CASCADE/i);
    expect(down).not.toMatch(/DROP COLUMN/i);
    expect(downSql).not.toContain('public.set_updated_at()');
  });
});
