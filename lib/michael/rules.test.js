// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B / FR-2 — rows for the seat, prose for the chairman.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRulesAndClosures, renderRulesMarkdown, renderClosuresMarkdown } from './rules.mjs';
import { runRulesLoad, renderLoad } from '../../scripts/michael-rules-load.mjs';
import { runRulesRender } from '../../scripts/michael-rules-render.mjs';
import { stubClient } from './db.test.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const NOW = new Date('2026-09-06T09:00:00.000Z');
const MISSING = { data: null, error: { code: '42P01', message: 'relation does not exist' } };

const RULES = [
  { domain: 'gmail', rule_key: 'newsletters-archive', rule_text: 'Archive newsletters', status: 'active', auto_apply: true, auto_apply_verb: 'archive', provenance: { ratification_id: 'r-1', source: 'terminal:abc' } },
  { domain: 'todoist', rule_key: 'never-tuesday', rule_text: 'Never schedule on Tuesday | pipes', status: 'active', auto_apply: false, auto_apply_verb: null, provenance: {} },
];
const CLOSURES = [
  { closure_key: 'gym-membership', topic: 'gym', keywords: ['gym', 'membership'], closure_text: 'Decided: keep', scope: 'personal', expires_at: null },
  { closure_key: 'old', topic: 'old', keywords: [], closure_text: 'expired', scope: null, expires_at: '2026-01-01T00:00:00.000Z' },
];
const seeded = () => stubClient((t) => ({ data: t === 'michael_rules' ? RULES : CLOSURES, error: null }));

describe('loadRulesAndClosures', () => {
  it('returns active rules and only unexpired closures, with the filters applied to the query', async () => {
    let rulesOps;
    const sb = stubClient((t, ops) => { if (t === 'michael_rules') rulesOps = ops; return { data: t === 'michael_rules' ? RULES : CLOSURES, error: null }; });
    const r = await loadRulesAndClosures(sb, { now: NOW, domain: 'gmail' });
    expect(r.tables_absent).toBe(false);
    expect(r.rules).toHaveLength(2);
    expect(r.closures.map((c) => c.closure_key)).toEqual(['gym-membership']);
    const eqs = rulesOps.filter((o) => o.op === 'eq').map((o) => o.args);
    expect(eqs).toEqual([['status', 'active'], ['domain', 'gmail']]);
  });
  it('includeSuperseded drops the status filter', async () => {
    let rulesOps;
    const sb = stubClient((t, ops) => { if (t === 'michael_rules') rulesOps = ops; return { data: [], error: null }; });
    await loadRulesAndClosures(sb, { now: NOW, includeSuperseded: true });
    expect(rulesOps.some((o) => o.op === 'eq' && o.args[0] === 'status')).toBe(false);
  });
  it('tables absent => empty rows, tables_absent=true, no errors', async () => {
    const r = await loadRulesAndClosures(stubClient(() => MISSING), { now: NOW });
    expect(r).toEqual({ tables_absent: true, rules: [], closures: [], errors: [] });
  });
});

describe('renderers (pure)', () => {
  it('RULES.md carries the six-field frontmatter, groups by domain, escapes pipes, shows provenance', () => {
    const md = renderRulesMarkdown(RULES, { now: NOW });
    for (const f of ['Category:', 'Status:', 'Version:', 'Author:', 'Last Updated: 2026-09-06', 'Tags:']) expect(md).toContain(f);
    expect(md).toContain('## gmail');
    expect(md).toContain('## todoist');
    expect(md.indexOf('## gmail')).toBeLessThan(md.indexOf('## todoist'));
    expect(md).toContain('| newsletters-archive | active | yes | archive | Archive newsletters | r-1 | terminal:abc |');
    expect(md).toContain('Never schedule on Tuesday \\| pipes');
    expect(md).toContain('The seat never reads this file');
  });
  it('CLOSURES.md lists closures with keywords joined', () => {
    const md = renderClosuresMarkdown([CLOSURES[0]], { now: NOW });
    expect(md).toContain('| gym-membership | gym | gym, membership | Decided: keep | personal |  |');
  });
  it('tables-absent stubs say so and render no table', () => {
    expect(renderRulesMarkdown([], { now: NOW, tablesAbsent: true })).toContain('not applied yet');
    expect(renderClosuresMarkdown([], { now: NOW, tablesAbsent: true })).not.toContain('| closure_key |');
  });
});

describe('scripts: rules-load and rules-render runners', () => {
  it('rules-load returns rows and renders one line per rule/closure', async () => {
    const r = await runRulesLoad({ sb: seeded(), argv: ['--json'], now: NOW });
    expect(r.ok).toBe(true);
    expect(r.rules).toHaveLength(2);
    const lines = renderLoad(r);
    expect(lines[0]).toMatch(/2 rule\(s\), 1 live closure\(s\)/);
    expect(lines.some((l) => l.includes('gmail/newsletters-archive [active, auto:archive]'))).toBe(true);
  });
  it('rules-load is inert on absent tables (ok, empty, tables_absent=true)', async () => {
    const r = await runRulesLoad({ sb: stubClient(() => MISSING), argv: [], now: NOW });
    expect(r).toMatchObject({ ok: true, tables_absent: true, rules: [], closures: [] });
    expect(renderLoad(r)[0]).toMatch(/not applied yet/);
  });
  it('rules-render writes both files through the injected writer', async () => {
    const written = {};
    const r = await runRulesRender({ sb: seeded(), outDir: '/virtual/generated', now: NOW, writeFile: (p, text) => { written[path.basename(p)] = text; } });
    expect(r.ok).toBe(true);
    expect(r.counts).toEqual({ rules: 2, closures: 1 });
    expect(Object.keys(written).sort()).toEqual(['CLOSURES.md', 'RULES.md']);
    expect(written['RULES.md']).toContain('newsletters-archive');
  });
  it('the generated folder is gitignored (the chairman\'s review copies never enter the tree)', () => {
    const out = execFileSync('git', ['check-ignore', 'docs/michael/generated/RULES.md'], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(out.trim()).toBe('docs/michael/generated/RULES.md');
  });
});
