// SD-LEO-INFRA-PROGRESS-COLUMN-DEAD-TWIN-001, FR-7/FR-8.
//
// Two test styles, deliberately:
//  - Sections 1-4 exercise scanSource/evaluateFiles on SYNTHETIC in-memory fixtures (no disk,
//    no git) -- matches tests/unit/hygiene/no-connection-string-literals.test.js's precedent.
//  - Section 5 is a genuine exception to that precedent: a ratchet guard's entire point is
//    comparing today's live repo state against a frozen baseline, so it necessarily reads the
//    real tracked tree via loadTrackedFiles(). This is deliberate, not a drift from convention.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  TABLE,
  DEAD_COLUMN,
  SELF_PATHS,
  PATH_EXCLUDE_PREFIXES,
  isExcludedPath,
  scanSource,
  evaluateFiles,
  loadTrackedFiles,
  findNewViolations,
  ratchetKey,
} from '../../../scripts/lint/progress-column-lint.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const BASELINE_PATH = path.join(ROOT, 'tests/unit/hygiene/progress-column-baseline.json');

describe('constants', () => {
  it('PATH_EXCLUDE_PREFIXES is a non-empty array of string prefixes', () => {
    expect(Array.isArray(PATH_EXCLUDE_PREFIXES)).toBe(true);
    expect(PATH_EXCLUDE_PREFIXES.length).toBeGreaterThan(0);
    for (const p of PATH_EXCLUDE_PREFIXES) expect(typeof p).toBe('string');
  });

  it('targets strategic_directives_v2 and the "progress" column', () => {
    expect(TABLE).toBe('strategic_directives_v2');
    expect(DEAD_COLUMN).toBe('progress');
  });
});

describe('RULE A — reader string-literal membership', () => {
  it('flags an exact "progress" token inside a .select() comma list', () => {
    const src = 'supabase.from(\'strategic_directives_v2\').select(\'id, sd_key, progress\').eq(\'id\', x);';
    const findings = scanSource(src, 'f.js');
    expect(findings).toEqual([{ line: 1, rule: 'A', method: 'select', snippet: 'id, sd_key, progress' }]);
  });

  it('does NOT flag progress_percentage (exact-equality, not substring)', () => {
    const src = 'supabase.from(\'strategic_directives_v2\').select(\'id, progress_percentage\');';
    expect(scanSource(src, 'f.js')).toEqual([]);
  });

  it('does NOT flag progress_pct either', () => {
    const src = 'supabase.from(\'strategic_directives_v2\').select(\'id, progress_pct\');';
    expect(scanSource(src, 'f.js')).toEqual([]);
  });

  it('does NOT flag a .select("progress") on an unrelated table', () => {
    const src = 'supabase.from(\'some_other_table\').select(\'id, progress\');';
    expect(scanSource(src, 'f.js')).toEqual([]);
  });

  it.each(['order', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is', 'in', 'filter', 'like', 'ilike', 'contains'])(
    'flags .%s("progress", ...) as a single-column filter/order call',
    (method) => {
      const src = `supabase.from('strategic_directives_v2').select('id').${method}('progress', 100);`;
      const findings = scanSource(src, 'f.js');
      expect(findings.some((f) => f.rule === 'A' && f.method === method)).toBe(true);
    },
  );

  it('does NOT flag .lt("progress_percentage", ...) (this SD\'s own repointed shape)', () => {
    const src = 'supabase.from(\'strategic_directives_v2\').select(\'id\').lt(\'progress_percentage\', 100);';
    expect(scanSource(src, 'f.js')).toEqual([]);
  });

  it('does NOT flag a non-string-literal .select() argument (e.g. a joined constant)', () => {
    // Known blind spot (documented): array-built select clauses like
    // ALLOWED_COLUMNS.join(',') are not resolved back to a literal by this rule.
    const src = 'supabase.from(\'strategic_directives_v2\').select(SELECT_CLAUSE);';
    expect(scanSource(src, 'f.js')).toEqual([]);
  });
});

describe('RULE B — writer object-literal key check', () => {
  it('flags update({ progress: ... }) on strategic_directives_v2', () => {
    const src = 'supabase.from(\'strategic_directives_v2\').update({ status: \'draft\', progress: 0 }).eq(\'id\', x);';
    const findings = scanSource(src, 'f.js');
    expect(findings).toEqual([{ line: 1, rule: 'B', method: 'update', snippet: 'update({ progress: ... })' }]);
  });

  it('flags insert({ progress: ... }) on strategic_directives_v2', () => {
    const src = 'supabase.from(\'strategic_directives_v2\').insert({ progress: 0 });';
    const findings = scanSource(src, 'f.js');
    expect(findings[0].rule).toBe('B');
    expect(findings[0].method).toBe('insert');
  });

  it('does NOT flag update({ progress_percentage: ... }) (already-correct code)', () => {
    const src = 'supabase.from(\'strategic_directives_v2\').update({ progress_percentage: 0 });';
    expect(scanSource(src, 'f.js')).toEqual([]);
  });

  it('does NOT flag update({ progress: ... }) on an unrelated table', () => {
    const src = 'supabase.from(\'other_table\').update({ progress: 5 });';
    expect(scanSource(src, 'f.js')).toEqual([]);
  });

  // WARN-5 from the LEAD-phase prospective TESTING review: a key-name-only (non-AST-scoped)
  // guard would flag DTO construction like `progress: sd.progress_percentage || 0` -- the
  // DESIRED end state, not a bug. RULE B is scoped to .update()/.insert() call arguments only,
  // so a bare object literal built elsewhere (never passed to .update/.insert on this table) is
  // structurally invisible to it, by construction, without needing a value-shape exemption.
  it('does NOT flag a DTO object literal with a "progress" key reading progress_percentage', () => {
    const src = `
      const dto = { progress: sd.progress_percentage || 0, status: sd.status };
      return dto;
    `;
    expect(scanSource(src, 'f.js')).toEqual([]);
  });

  // Adversarial review of PR #7141: .upsert() was entirely uncovered (real precedent:
  // scripts/pocock/weekly-deepening-report.mjs:117), and batch array-of-objects .insert()/
  // .upsert() calls (not just a single object literal) were also uncovered.
  it('flags upsert({ progress: ... }) on strategic_directives_v2', () => {
    const src = 'supabase.from(\'strategic_directives_v2\').upsert({ id: x, progress: 0 }, { onConflict: \'id\' });';
    const findings = scanSource(src, 'f.js');
    expect(findings).toEqual([{ line: 1, rule: 'B', method: 'upsert', snippet: 'upsert({ progress: ... })' }]);
  });

  it('flags a violation inside a batch array-of-objects .insert([...]) call', () => {
    const src = 'supabase.from(\'strategic_directives_v2\').insert([{ sd_key: \'a\' }, { sd_key: \'b\', progress: 10 }]);';
    const findings = scanSource(src, 'f.js');
    expect(findings).toEqual([{ line: 1, rule: 'B', method: 'insert', snippet: 'insert({ progress: ... })' }]);
  });

  it('does NOT flag .upsert(insert) where the payload is a variable reference (documented limitation)', () => {
    const src = `
      const insert = { id: x, progress: 0 };
      supabase.from('strategic_directives_v2').upsert(insert, { onConflict: 'id' });
    `;
    expect(scanSource(src, 'f.js')).toEqual([]);
  });
});

describe('RULE C — same-scope property-read (partial coverage, documented limitation)', () => {
  it('flags sd.progress where sd is destructured directly from a strategic_directives_v2 select', () => {
    const src = `
      async function run(supabase) {
        const { data: sd } = await supabase.from('strategic_directives_v2').select('id, progress_percentage').single();
        return sd.progress;
      }
    `;
    const findings = scanSource(src, 'f.js');
    expect(findings).toEqual([{ line: 4, rule: 'C', method: 'property-read', snippet: 'sd.progress' }]);
  });

  it('flags row.progress for a plain (non-destructured, non-awaited) direct binding', () => {
    const src = `
      function run(supabase) {
        const row = supabase.from('strategic_directives_v2').select('id');
        return row.progress;
      }
    `;
    const findings = scanSource(src, 'f.js');
    expect(findings.some((f) => f.rule === 'C' && f.snippet === 'row.progress')).toBe(true);
  });

  it('never flags .progress_percentage reads (exact property-name match only)', () => {
    const src = `
      async function run(supabase) {
        const { data: sd } = await supabase.from('strategic_directives_v2').select('*').single();
        return sd.progress_percentage;
      }
    `;
    expect(scanSource(src, 'f.js')).toEqual([]);
  });

  // Documented KNOWN LIMITATION (see the lint script's own header comment): RULE C only
  // resolves a single-hop direct declarator-init binding. A function PARAMETER's true origin
  // (the caller's argument) is out of reach for single-file, single-hop static analysis --
  // this mirrors lib/static-analysis/consumer-index.js's own no-deep-taint-tracking precedent.
  it('does NOT flag sd.progress when sd arrives as a function parameter (documented gap)', () => {
    const src = `
      function evaluate(sd, _config) {
        if (sd.status === 'completed' && sd.progress < 100) return true;
        return false;
      }
    `;
    expect(scanSource(src, 'f.js')).toEqual([]);
  });

  // Adversarial review of PR #7141: a binding resolved from a strategic_directives_v2 chain
  // but then REASSIGNED before the .progress read must not be flagged -- the declarator's
  // .init reflects the FIRST assignment only, not the value at the actual read site.
  it('does NOT flag row.progress when row is reassigned to an unrelated value first (false-positive guard)', () => {
    const src = `
      function run(supabase) {
        let row = supabase.from('strategic_directives_v2').select('id');
        row = { progress: 42 };
        return row.progress;
      }
    `;
    expect(scanSource(src, 'f.js')).toEqual([]);
  });

  it('does NOT flag .progress on an object unrelated to strategic_directives_v2', () => {
    const src = `
      async function run() {
        const video = await encoder.getStatus();
        return video.progress;
      }
    `;
    expect(scanSource(src, 'f.js')).toEqual([]);
  });
});

describe('RULE D — raw pg client SQL text (QF-20260816-067)', () => {
  // A raw pg `client.query(sqlText, ...)` call has no .from() chain at all -- RULE A/B/C
  // structurally cannot see it, which is exactly what made lib/sd-park.js:42,60 (the
  // downstream Number(sd.progress) reads) invisible despite gating an SD status transition.
  it('flags a raw SELECT string referencing the table and a bare "progress" column', () => {
    const src = "client.query('SELECT sd_key, progress FROM strategic_directives_v2 WHERE sd_key=$1', [k]);";
    const findings = scanSource(src, 'f.js');
    expect(findings).toEqual([{ line: 1, rule: 'D', method: 'query', snippet: 'raw SQL query text' }]);
  });

  it('flags a raw UPDATE template literal (no interpolation) setting progress', () => {
    const src = `
      async function run(client, k) {
        await client.query(
          \`UPDATE strategic_directives_v2 SET progress = COALESCE($2, progress) WHERE sd_key=$1\`,
          [k, null]
        );
      }
    `;
    const findings = scanSource(src, 'f.js');
    expect(findings.some((f) => f.rule === 'D' && f.method === 'query')).toBe(true);
  });

  it('does NOT flag progress_percentage in raw SQL (exact-token match, not substring)', () => {
    const src = "client.query('SELECT progress_percentage FROM strategic_directives_v2 WHERE sd_key=$1', [k]);";
    expect(scanSource(src, 'f.js')).toEqual([]);
  });

  it('does NOT flag a raw query against an unrelated table', () => {
    const src = "client.query('UPDATE other_table SET progress = 100 WHERE id=$1', [k]);";
    expect(scanSource(src, 'f.js')).toEqual([]);
  });

  it('does NOT flag "progress" appearing without a FROM/UPDATE/INTO/JOIN anchor immediately before the table', () => {
    // The table name must be the direct object of a table-introducing keyword -- an incidental
    // co-occurrence (e.g. a comment-like aside) elsewhere in the string must not match.
    const src = "client.query('SELECT id FROM other_table WHERE note = $1', ['strategic_directives_v2 progress']);";
    expect(scanSource(src, 'f.js')).toEqual([]);
  });

  it('does NOT flag a dynamically-interpolated template literal (documented single-hop limitation)', () => {
    // Same no-deep-taint-tracking precedent as RULE C: a SQL string built with ${} is out of
    // reach for single-file, single-hop static analysis.
    const src = 'client.query(`UPDATE strategic_directives_v2 SET progress = ${p} WHERE sd_key=$1`, [k]);';
    expect(scanSource(src, 'f.js')).toEqual([]);
  });

  it('does NOT flag a same-shaped call whose method is not named "query"', () => {
    const src = "client.execute('UPDATE strategic_directives_v2 SET progress = 100 WHERE sd_key=$1', [k]);";
    expect(scanSource(src, 'f.js')).toEqual([]);
  });

  it('does NOT flag a raw query on the table that never mentions progress', () => {
    const src = "client.query('SELECT sd_key, status FROM strategic_directives_v2 WHERE sd_key=$1', [k]);";
    expect(scanSource(src, 'f.js')).toEqual([]);
  });
});

describe('self-path and exclude-prefix handling', () => {
  it('SELF_PATHS contains exactly this guard file and its own test', () => {
    expect(SELF_PATHS).toEqual(new Set([
      'scripts/lint/progress-column-lint.mjs',
      'tests/unit/hygiene/no-bare-progress-column.test.js',
    ]));
  });

  it('evaluateFiles never reports findings for a self-path, even with a real violation', () => {
    const files = [{
      path: 'scripts/lint/progress-column-lint.mjs',
      content: 'supabase.from(\'strategic_directives_v2\').update({ progress: 0 });',
    }];
    expect(evaluateFiles(files).ok).toBe(true);
  });

  it.each(['tests/unit/example.test.js', '.artifacts/scratch.mjs', 'scripts/one-off/x.mjs', 'scripts/archive/y.js', 'docs/notes.js', '.worktrees/other-sd/z.js'])(
    'isExcludedPath excludes %s',
    (p) => {
      expect(isExcludedPath(p)).toBe(true);
    },
  );

  it('isExcludedPath does not exclude ordinary production paths', () => {
    expect(isExcludedPath('lib/eva-support/sd-reader.js')).toBe(false);
    expect(isExcludedPath('scripts/modules/audit/audit-runner.js')).toBe(false);
  });

  it('evaluateFiles skips excluded-prefix findings', () => {
    const files = [{
      path: 'scripts/one-off/scratch.mjs',
      content: 'supabase.from(\'strategic_directives_v2\').update({ progress: 0 });',
    }];
    expect(evaluateFiles(files).ok).toBe(true);
  });
});

describe('evaluateFiles — mutation/red-green meta-test', () => {
  it('reports ok:true for an all-clean synthetic file set', () => {
    const files = [
      { path: 'a.js', content: 'supabase.from(\'strategic_directives_v2\').select(\'id, progress_percentage\');' },
      { path: 'b.js', content: 'supabase.from(\'strategic_directives_v2\').update({ progress_percentage: 100 });' },
    ];
    expect(evaluateFiles(files)).toEqual({ findings: [], ok: true });
  });

  // Red-green: this is the guard's own proof that it can fail, not just pass -- a scanner that
  // always returns ok:true would trivially satisfy the Section 5 subset check below without
  // actually checking anything (same discipline as tests/unit/sd-revert.test.js's
  // "static-pin meta-test: synthetic two-update body fails the assertion").
  it('reports ok:false with one finding per injected violation across multiple files', () => {
    const files = [
      { path: 'a.js', content: 'supabase.from(\'strategic_directives_v2\').select(\'id, progress\');' },
      { path: 'b.js', content: 'supabase.from(\'strategic_directives_v2\').update({ progress: 5 });' },
      { path: 'c.js', content: 'supabase.from(\'strategic_directives_v2\').select(\'id, progress_percentage\');' }, // clean
    ];
    const result = evaluateFiles(files);
    expect(result.ok).toBe(false);
    expect(result.findings).toHaveLength(2);
    expect(result.findings.map((f) => f.file).sort()).toEqual(['a.js', 'b.js']);
  });
});

describe('findNewViolations / ratchetKey — the ratchet comparison itself, on synthetic data', () => {
  // PLAN-phase VALIDATION review (SD-LEO-INFRA-PROGRESS-COLUMN-DEAD-TWIN-001): the mutation
  // meta-test above proves evaluateFiles() can return ok:false, but never proves the SUBSET
  // COMPARISON that decides pass/fail in Section 5 can actually detect a new violation -- in
  // the normal passing state live findings equal the baseline exactly, so newFindings is
  // trivially empty regardless of whether the comparison logic is even correct. These tests
  // exercise findNewViolations() directly with synthetic data, decoupled from live git state,
  // so a broken key-construction bug (like the file:line:rule collision this same review found
  // and fixed) would fail a committed, deterministic test rather than only an ad-hoc probe.
  const site = (file, line, rule, method) => ({ file, line, rule, method });

  it('returns [] when every live finding matches a baseline entry exactly', () => {
    const baseline = [site('a.js', 10, 'A', 'select'), site('b.js', 20, 'B', 'update')];
    const live = [site('a.js', 10, 'A', 'select'), site('b.js', 20, 'B', 'update')];
    expect(findNewViolations(live, baseline)).toEqual([]);
  });

  it('flags a live finding on a file/line never in the baseline', () => {
    const baseline = [site('a.js', 10, 'A', 'select')];
    const live = [site('a.js', 10, 'A', 'select'), site('c.js', 5, 'B', 'insert')];
    expect(findNewViolations(live, baseline)).toEqual([site('c.js', 5, 'B', 'insert')]);
  });

  // The regression case: two DIFFERENT violations sharing a file+line (a chained call, per the
  // Babel loc-is-chain-start behavior this review found) must both be tracked independently,
  // not collapse onto one baseline slot that a second, genuinely new violation could hide in.
  it('does NOT let a new violation hide behind an existing baseline entry on the same file+line', () => {
    const baseline = [site('handoff-export.cjs', 89, 'A', 'lt'), site('handoff-export.cjs', 89, 'A', 'select')];
    const live = [
      site('handoff-export.cjs', 89, 'A', 'lt'),
      site('handoff-export.cjs', 89, 'A', 'select'),
      site('handoff-export.cjs', 89, 'A', 'gte'), // a third, genuinely new violation on the same line
    ];
    expect(findNewViolations(live, baseline)).toEqual([site('handoff-export.cjs', 89, 'A', 'gte')]);
  });

  it('a shrunk baseline (future cleanup) still passes once the fixed site is removed from live', () => {
    const baseline = [site('a.js', 10, 'A', 'select'), site('b.js', 20, 'B', 'update')];
    const live = [site('a.js', 10, 'A', 'select')]; // b.js was fixed by a later SD
    expect(findNewViolations(live, baseline)).toEqual([]);
  });

  it('ratchetKey composes exactly file:line:rule:method', () => {
    expect(ratchetKey(site('x.js', 7, 'C', 'property-read'))).toBe('x.js:7:C:property-read');
  });
});

describe('live ratchet — ok:true only while every live finding is already in the frozen baseline', () => {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));

  it('baseline file has the expected shape', () => {
    expect(baseline.table).toBe('strategic_directives_v2');
    expect(baseline.dead_column).toBe('progress');
    expect(Array.isArray(baseline.sites)).toBe(true);
    expect(baseline.count).toBe(baseline.sites.length);
  });

  it('the baseline dedup key (file:line:rule:method) has no collisions (regression guard for the PR #7141 review finding)', () => {
    const keys = new Set(baseline.sites.map(ratchetKey));
    expect(keys.size).toBe(baseline.sites.length);
  });

  it('every LIVE finding is already present in the frozen baseline (no NEW site)', () => {
    const { files } = loadTrackedFiles();
    const { findings } = evaluateFiles(files);
    expect(findNewViolations(findings, baseline.sites)).toEqual([]);
  }, 60000);

  // Not a hard requirement (the baseline is allowed to still equal the live count if nothing
  // has shrunk yet), but flags accidental growth going the other direction too, independent of
  // the per-site subset check above.
  it('live finding count does not exceed the frozen baseline count', () => {
    const { files } = loadTrackedFiles();
    const { findings } = evaluateFiles(files);
    expect(findings.length).toBeLessThanOrEqual(baseline.count);
  }, 60000);

  // Direct regression proof for this SD's own FR-1 through FR-6 repoints: none of the files
  // this SD explicitly fixed may reappear in the live scan, under any rule.
  const FIXED_FILES = [
    'lib/eva-support/sd-reader.js',
    'lib/eva-support/sd-blocker-surface.js',
    'scripts/eva-support/_internal/dispatcher.js',
    'lib/sd/revert.js',
    'scripts/gates/integration-verification-gate.js',
    'scripts/batch-operations/complete-children.mjs',
    'scripts/eva/heal-command.mjs',
    'scripts/eva/vision-heal.js',
    'scripts/generate-retrospective.js',
    'scripts/generate-comprehensive-retrospective.js',
    'scripts/get-working-on-sd.js',
    'scripts/leo-resume.js',
    'scripts/modules/audit/audit-runner.js',
    'scripts/examples/efficient-database-queries.js',
  ];

  it.each(FIXED_FILES)('%s produces zero live findings', (relFile) => {
    const absPath = path.join(ROOT, relFile);
    const content = readFileSync(absPath, 'utf8');
    expect(scanSource(content, absPath)).toEqual([]);
  });
});
