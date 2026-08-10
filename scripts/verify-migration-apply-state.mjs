#!/usr/bin/env node
/**
 * Migration apply-state verifier — reconcile committed SQL files against live schema objects.
 * SD-LEO-INFRA-MIGRATION-APPLY-STATE-001.
 *
 * The committed-not-deployed gap: a migration file can merge to main yet never be applied to
 * prod (live examples found 2026-06-10: 20260510_v_sd_completion_integrity.sql and
 * 20260516130001_add_bypass_ledger.sql — both committed, both objects absent live, with code
 * paths writing bypass_ledger failing silently). The pre-merge probe
 * (check-migration-readiness.mjs) is PR-scoped and FUNCTION+TRIGGER-only; this is the
 * complementary REPO-WIDE RETROSPECTIVE sweep with TABLE/VIEW/INDEX/CONSTRAINT coverage.
 *
 * READ-ONLY and ADVISORY: reports per-file APPLIED / PARTIAL / NOT_APPLIED / NO_DDL, exits 0
 * by default ([MIGRATION_APPLY_STATE_PASS|GAPS_FOUND]); --strict exits 1 on gaps; DB
 * unreachable always exits 1 ([MIGRATION_APPLY_STATE_INFRA_ERROR]). Never applies anything —
 * some committed files are intentionally retired; backfill is a human decision.
 *
 * Usage:
 *   npm run migration:apply-state            # advisory report
 *   node scripts/verify-migration-apply-state.mjs --strict   # CI-gateable
 *   node scripts/verify-migration-apply-state.mjs --json     # machine-readable
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { armCliTeardown } from '../lib/cli-graceful-exit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'database', 'migrations');

export const OUTCOME = {
  PASS: 'MIGRATION_APPLY_STATE_PASS',
  GAPS: 'MIGRATION_APPLY_STATE_GAPS_FOUND',
  INFRA: 'MIGRATION_APPLY_STATE_INFRA_ERROR',
  // MISCONFIG (FR-2 adversarial review): no DB credential present at all — an operator
  // misconfiguration distinct from a transient outage. The CI gate treats INFRA as a
  // non-blocking warning but MISCONFIG as a HARD failure, so a permanently-credential-less
  // gate can never sit silently green while never actually checking the live DB.
  MISCONFIG: 'MIGRATION_APPLY_STATE_MISCONFIG',
};

/** The DB credentials createDatabaseClient/connectionString can use. At least one must be present. */
export function hasAnyDbCredential(env = process.env) {
  return Boolean(env.SUPABASE_DB_PASSWORD || env.EHG_DB_PASSWORD || env.SUPABASE_POOLER_URL || env.DATABASE_URL);
}

// ── Recent-vs-legacy classifier (SD-LEO-INFRA-MIGRATION-DEPLOY-DRIFT-001 FR-2) ──
//
// The deploy-drift CI gate (--recent-only / --strict) must FAIL LOUD only on RECENT
// committed-but-unapplied migrations and stay advisory for the deliberately-retired
// legacy backlog (~106 files). A migration is RECENT iff it carries a leading date
// token (YYYYMMDD…) that is >= RETIRED_BEFORE; everything older (and every non-dated
// legacy file) is LEGACY and excluded from the strict fail set.
//
// RETIRED_BEFORE is the SD's corrective ship boundary: this SD applied every genuine
// gap and retired the rest THROUGH 2026-06-14, so the entire pre-existing corpus is the
// settled baseline and only a migration dated 2026-06-15+ that is unapplied is real new
// drift. Pure + offline (filename only) — no DB and no per-file manifest to drift.
// NOTE: this is noise-suppression for the gate ONLY; it does NOT weaken the 3-factor
// @approved-by prod-deploy guard (scripts/lib/migration-guards.js), which is untouched.
export const RETIRED_BEFORE = '20260615';

/**
 * Leading date token normalized to YYYYMMDD, or null for a non-dated (legacy) file.
 * Recognizes BOTH the compact convention (20260701_…) AND the older hyphenated/
 * underscored form (2026-07-01-…, 2026_07_01_…) that has precedent in this repo —
 * so a future author reverting to the hyphenated style cannot create a recent
 * migration that silently classifies as legacy and escapes the strict gate
 * (FR-2 adversarial review, med-severity fail-open class).
 */
export function migrationDateToken(file) {
  // SD-LEO-INFRA-MIGRATION-APPLY-STATE-002 (FR-A): basename-first. New-root files carry
  // repo-relative ids ('supabase/migrations/20260625_x.sql'); anchoring on the raw string
  // would classify every one of them LEGACY (null token) — a silent fail-open that keeps
  // recent new-root drift out of the strict gate. Basename of a bare basename is itself,
  // so every pre-existing caller (and the 42-test contract suite) is byte-compatible.
  const s = String(file).replace(/^.*[\\/]/, '');
  const compact = s.match(/^(\d{8,})/);
  if (compact) return compact[1];
  const sep = s.match(/^(\d{4})[-_](\d{2})[-_](\d{2})/);
  if (sep) return `${sep[1]}${sep[2]}${sep[3]}`; // 2026-07-01 -> 20260701
  return null;
}

/** True iff the file is dated AND its date token >= cutoff (recent). Non-dated => legacy => false. */
export function isRecent(file, cutoff = RETIRED_BEFORE) {
  const token = migrationDateToken(file);
  // Compare on the leading 8-char YYYYMMDD so a 14-digit YYYYMMDDHHMMSS token and an
  // 8-digit token compare by calendar day (lexical == chronological for fixed-width dates).
  return token !== null && token.slice(0, 8) >= String(cutoff).slice(0, 8);
}

/**
 * Basename of a gap's file, tolerating both path separators.
 *
 * Deliberately a local 1-liner rather than an import of gapBasename() from
 * scripts/lib/migration-disposition-ledger.mjs: partitionRecentGaps is a PURE exported
 * predicate that tests import directly, and the verifier must not carry a static
 * dependency on the ledger module (see the dynamic-import rationale in main()).
 */
const gapFileBasename = (g) => String((g && g.file) || '').replace(/^.*[\\/]/, '');

/**
 * Collapse newlines before echoing any FILENAME to stdout.
 *
 * migration-deploy-drift-guard.yml decides the gate verdict by matching bracketed markers in
 * this output. Anchoring those greps with -Fx closed the substring attack, but a filename
 * containing an embedded newline could still contribute a line that IS exactly a marker, and
 * the INFRA marker is converted to exit 0. Git refuses such paths under core.protectNTFS
 * (default-on since 2.25), so this is defence in depth — but relying on another tool's input
 * validation to keep a safety gate honest is not a property worth depending on.
 */
const printableFile = (f) => String(f).replace(/[\r\n]+/g, ' ');

/**
 * Filter a gaps array (objects with a .file) to only the RECENT ones — the strict-gate fail set.
 *
 * SD-LEO-INFRA-MIGRATION-APPLY-STATE-TRIAGE-001 FR-6: `suppressed` is an OPTIONAL THIRD
 * parameter carrying basenames the disposition ledger has legitimately retired or deferred.
 * It defaults to an empty Set, so every existing 1-arg and 2-arg call site — and the whole
 * no-ledger path — behaves byte-identically to before this SD.
 *
 * isRecent is RETAINED as the fallback rather than replaced: RETIRED_BEFORE still governs
 * which gaps can turn the gate red while the ledger fills. Suppression only ever REMOVES
 * from the fail set; it can never admit a legacy gap into it.
 *
 * @param {Array<{file:string}>} gaps
 * @param {string} [cutoff]
 * @param {Set<string>} [suppressed] basenames with a valid RETIRED/DEFERRED disposition
 */
export function partitionRecentGaps(gaps, cutoff = RETIRED_BEFORE, suppressed = new Set()) {
  const skip = suppressed instanceof Set ? suppressed : new Set();
  return (gaps || []).filter((g) => isRecent(g.file, cutoff) && !skip.has(gapFileBasename(g)));
}

// ── Stage 1: list + deterministic order ──────────────────────────────────────

/**
 * Forward migrations only. Excluded artifact suffixes (counted + listed, never expectations):
 *  - *_DOWN.sql / *_rollback.sql — rollback artifacts (their creates would re-create what the
 *    forward path dropped; live run showed them dominating false gaps otherwise)
 *  - *_DEFERRED.sql — explicitly parked migrations (deferral is the recorded decision)
 */
export const ARTIFACT_RE = /(_DOWN|_rollback|_DEFERRED)\.sql$/i;

/**
 * SD-LEO-INFRA-MIGRATION-APPLY-STATE-002 (FR-A): every migration location, one scan.
 *
 * The primary root keeps BARE BASENAME ids — the disposition ledger keys on basenames by
 * documented design (migration-disposition-ledger.mjs gapBasename), and those keys must stay
 * byte-stable. New roots emit REPO-RELATIVE ids ('supabase/migrations/x.sql'), which is also
 * the declaration contract for the LEAD-FINAL chairman-apply-state gate (exact-string match).
 *
 * COLLISION EXCLUSION, deliberately, instead of dual-keying: 5 basenames exist in BOTH
 * database/migrations and supabase/migrations (measured 2026-08-10), and every ledger consumer
 * strips ids to basenames — admitting a colliding id would let ONE disposition silently
 * suppress TWO different files and make buildLedger() order-dependent. A new-root file whose
 * basename already exists in the primary root is excluded from the scan and reported loudly
 * with a content verdict (byte-identical copy vs DIVERGENT content — the divergent class is
 * the dangerous one and is named explicitly; live specimen: 20251129_musk_algorithm_pareto.sql).
 *
 * ENOENT on a configured extra root warns and continues — a root deleted from git has nothing
 * left to verify. Any other readdir error stays fail-closed (MISCONFIG upstream), matching the
 * unreadable-entry posture in main().
 */
export const DEFAULT_EXTRA_ROOTS = ['database/functions', 'database/manual-updates', 'supabase/migrations'];
const REPO_ROOT = path.resolve(__dirname, '..');

export function listForwardMigrations({ primary = MIGRATIONS_DIR, extraRoots = DEFAULT_EXTRA_ROOTS, repoRoot = REPO_ROOT } = {}) {
  const primaryAll = readdirSync(primary).filter((f) => f.endsWith('.sql'));
  const primarySet = new Set(primaryAll);
  const all = [...primaryAll];
  const excluded = [];
  for (const root of extraRoots) {
    let entries;
    try {
      entries = readdirSync(path.resolve(repoRoot, root)).filter((f) => f.endsWith('.sql'));
    } catch (e) {
      if (e && e.code === 'ENOENT') {
        console.error(`Scan root ${root}/ not found — skipping (nothing committed there to verify).`);
        continue;
      }
      throw e; // non-ENOENT stays fail-closed: surfaces as MISCONFIG via main()'s guard
    }
    for (const f of entries) {
      if (primarySet.has(f)) {
        let verdict = 'content-unreadable';
        try {
          const a = readFileSync(path.join(primary, f), 'utf8');
          const b = readFileSync(path.resolve(repoRoot, root, f), 'utf8');
          verdict = a === b ? 'byte-identical copy' : 'DIVERGENT CONTENT';
        } catch { /* verdict stays content-unreadable */ }
        excluded.push({ id: `${root}/${f}`, twin: f, verdict });
        continue;
      }
      all.push(`${root}/${f}`);
    }
  }
  const down = all.filter((f) => ARTIFACT_RE.test(f.replace(/^.*[\\/]/, '')));
  const forward = all.filter((f) => !ARTIFACT_RE.test(f.replace(/^.*[\\/]/, '')));
  return { forward: orderMigrations(forward), down, excluded };
}

/**
 * Resolve a scan id to its on-disk path: repo-relative ids (contain '/') resolve from the
 * repo root; bare basenames resolve from the primary root — the same duality the id format
 * encodes. Exported as the single resolution seam (FR-A).
 */
export function resolveMigrationPath(id, { primary = MIGRATIONS_DIR, repoRoot = REPO_ROOT } = {}) {
  return /[\\/]/.test(id) ? path.resolve(repoRoot, id) : path.join(primary, id);
}

/**
 * Deterministic chronology for the DROP-tracking fold: files with a leading date token
 * (8+ digits) sort by that token then name; legacy non-dated files (~138 in the corpus)
 * sort lexically BEFORE all dated files — they predate the dated convention. Mis-ordering
 * only affects cross-file create-then-drop pairs and the tool is advisory; the dropped-later
 * ledger keeps any oddity visible.
 */
export function orderMigrations(files) {
  const dated = [];
  const legacy = [];
  for (const f of files) {
    // FR-A: basename-first, matching migrationDateToken — a repo-relative id must sort by
    // its date token, not fall into the legacy bucket (which sorts FIRST and would reorder
    // the cross-file DROP-tracking fold).
    const m = f.replace(/^.*[\\/]/, '').match(/^(\d{8,})/);
    if (m) dated.push({ f, key: m[1] });
    else legacy.push(f);
  }
  legacy.sort();
  dated.sort((a, b) => (a.key === b.key ? (a.f < b.f ? -1 : 1) : a.key < b.key ? -1 : 1));
  return [...legacy, ...dated.map((d) => d.f)];
}

// ── Stage 2: preprocess + extract ────────────────────────────────────────────

/**
 * Neutralize content that must never yield DDL facts: -- line comments, block comments,
 * and dollar-quoted bodies — BOTH bare $$ and named $tag$ (the splitPostgreSQLStatements
 * named-tag gap, wf_5071dc05, is the cautionary tale: function bodies routinely contain
 * DDL-looking text like RAISE 'CREATE TABLE …' or EXECUTE strings).
 */
export function stripNonDdl(sql) {
  let s = sql.replace(/\r\n/g, '\n');
  // Dollar-quoted blocks first (they may contain comment-looking text and vice versa is rare).
  s = s.replace(/(\$[A-Za-z_]\w*\$|\$\$)[\s\S]*?\1/g, ' ');
  s = s.replace(/--[^\n]*/g, ' ');
  s = s.replace(/\/\*[\s\S]*?\*\//g, ' ');
  return s;
}

/** lowercase, unquote, strip schema prefix (public assumed), strip trailing punctuation. */
export function normalizeName(raw) {
  if (!raw) return null;
  let n = raw.trim().replace(/"/g, '').toLowerCase();
  const dot = n.lastIndexOf('.');
  if (dot !== -1) n = n.slice(dot + 1);
  return n.replace(/[(;,\s].*$/, '') || null;
}

const ID = String.raw`(?:"[^"]+"|[A-Za-z_][\w$]*)(?:\s*\.\s*(?:"[^"]+"|[A-Za-z_][\w$]*))?`;

const CREATE_RES = [
  { cls: 'table',      re: new RegExp(String.raw`\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(${ID})`, 'gi') },
  { cls: 'matview',    re: new RegExp(String.raw`\bCREATE\s+MATERIALIZED\s+VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?(${ID})`, 'gi') },
  { cls: 'view',       re: new RegExp(String.raw`\bCREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(${ID})`, 'gi') },
  { cls: 'function',   re: new RegExp(String.raw`\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(${ID})`, 'gi') },
  { cls: 'trigger',    re: new RegExp(String.raw`\bCREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+(${ID})`, 'gi') },
  { cls: 'index',      re: new RegExp(String.raw`\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(${ID})`, 'gi') },
  { cls: 'constraint', re: new RegExp(String.raw`\bADD\s+CONSTRAINT\s+(${ID})`, 'gi') },
];

/**
 * QF-20260725-470: ADD/DROP COLUMN class. The other classes are single-name statements, but one
 * ALTER TABLE carries the table once and any number of comma-separated ADD/DROP COLUMN items (the
 * SMS spend-envelope migration does exactly this), so columns cannot be pulled by a one-capture
 * regex like the rest — the table must be paired with each item. Names are stored TABLE-QUALIFIED
 * ('table.column') because a bare column name is not unique across the schema.
 *
 * DROP COLUMN is handled too, deliberately: foldLifecycle is drop-aware, and without the drop side
 * a column added by one migration and dropped by a later one would be reported missing forever —
 * turning this fix into a new false-alarm source instead of a gap detector.
 */
const ALTER_TABLE_STMT_RE = new RegExp(String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(${ID})([\s\S]*?)(?=;|$)`, 'gi');
const ADD_COLUMN_ITEM_RE = new RegExp(String.raw`\bADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(${ID})`, 'gi');
const DROP_COLUMN_ITEM_RE = new RegExp(String.raw`\bDROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?(${ID})`, 'gi');

export function extractColumnFacts(s) {
  const creates = [];
  const drops = [];
  ALTER_TABLE_STMT_RE.lastIndex = 0;
  let stmt;
  while ((stmt = ALTER_TABLE_STMT_RE.exec(s)) !== null) {
    const table = normalizeName(stmt[1]);
    const body = stmt[2] || '';
    if (!table) continue;
    for (const [, raw] of body.matchAll(ADD_COLUMN_ITEM_RE)) {
      const col = normalizeName(raw);
      if (col) creates.push({ cls: 'column', name: `${table}.${col}` });
    }
    for (const [, raw] of body.matchAll(DROP_COLUMN_ITEM_RE)) {
      const col = normalizeName(raw);
      if (col) drops.push({ cls: 'column', name: `${table}.${col}` });
    }
  }
  return { creates, drops };
}

const DROP_RES = [
  { cls: 'table',      re: new RegExp(String.raw`\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(${ID})`, 'gi') },
  { cls: 'matview',    re: new RegExp(String.raw`\bDROP\s+MATERIALIZED\s+VIEW\s+(?:IF\s+EXISTS\s+)?(${ID})`, 'gi') },
  { cls: 'view',       re: new RegExp(String.raw`\bDROP\s+VIEW\s+(?:IF\s+EXISTS\s+)?(${ID})`, 'gi') },
  { cls: 'function',   re: new RegExp(String.raw`\bDROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?(${ID})`, 'gi') },
  { cls: 'trigger',    re: new RegExp(String.raw`\bDROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?(${ID})`, 'gi') },
  { cls: 'index',      re: new RegExp(String.raw`\bDROP\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?(${ID})`, 'gi') },
  { cls: 'constraint', re: new RegExp(String.raw`\bDROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?(${ID})`, 'gi') },
];

/** Extract { creates: [{cls,name}], drops: [{cls,name}] } from one migration's SQL. */
export function extractDdlFacts(sql) {
  const s = stripNonDdl(sql);
  const pull = (specs) => {
    const out = [];
    for (const { cls, re } of specs) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(s)) !== null) {
        const name = normalizeName(m[1]);
        if (name) out.push({ cls, name });
      }
    }
    return out;
  };
  // QF-20260725-470: merge the column facts (extracted from the SAME stripped SQL) into both sides.
  const cols = extractColumnFacts(s);
  return {
    creates: [...pull(CREATE_RES), ...cols.creates],
    drops: [...pull(DROP_RES), ...cols.drops],
  };
}

// ── Stage 3: chronological fold ──────────────────────────────────────────────

/**
 * Fold per-file facts (in order) into the expected-live set. Returns:
 *   expected: Map<'cls:name', { cls, name, file }>      — created, not subsequently dropped
 *   droppedLater: [{ cls, name, createdIn, droppedIn }] — legitimate retirements (transparency)
 *   perFile: Map<file, { creates, drops }>
 */
export function foldLifecycle(fileFacts) {
  const expected = new Map();
  const droppedLater = [];
  const perFile = new Map();
  for (const { file, creates, drops } of fileFacts) {
    perFile.set(file, { creates, drops });
    for (const d of drops) {
      const key = `${d.cls}:${d.name}`;
      const prior = expected.get(key);
      if (prior) {
        droppedLater.push({ ...d, createdIn: prior.file, droppedIn: file });
        expected.delete(key);
      }
    }
    for (const c of creates) {
      expected.set(`${c.cls}:${c.name}`, { ...c, file });
    }
  }
  return { expected, droppedLater, perFile };
}

// ── Stage 4: bulk live resolution + classification ───────────────────────────

/** One bulk query per object class — no N+1 over the ~1100-file corpus. */
async function resolveLive(client, expected) {
  const byClass = new Map();
  for (const { cls, name } of expected.values()) {
    if (!byClass.has(cls)) byClass.set(cls, new Set());
    byClass.get(cls).add(name);
  }
  const live = new Set(); // 'cls:name' present live
  const mark = (cls, rows, col) => rows.forEach((r) => live.add(`${cls}:${r[col]}`));

  const regclassClasses = ['table', 'view', 'matview', 'index'];
  for (const cls of regclassClasses) {
    const names = [...(byClass.get(cls) || [])];
    if (!names.length) continue;
    const { rows } = await client.query(
      `SELECT n AS name FROM unnest($1::text[]) AS n WHERE to_regclass('public.' || n) IS NOT NULL`,
      [names]
    );
    mark(cls, rows, 'name');
  }
  if (byClass.get('function')?.size) {
    const { rows } = await client.query(
      `SELECT DISTINCT p.proname AS name FROM pg_proc p
         JOIN pg_namespace ns ON ns.oid = p.pronamespace
        WHERE ns.nspname = 'public' AND p.proname = ANY($1::text[])`,
      [[...byClass.get('function')]]
    );
    mark('function', rows, 'name');
  }
  if (byClass.get('trigger')?.size) {
    const { rows } = await client.query(
      `SELECT DISTINCT t.tgname AS name FROM pg_trigger t
        WHERE NOT t.tgisinternal AND t.tgname = ANY($1::text[])`,
      [[...byClass.get('trigger')]]
    );
    mark('trigger', rows, 'name');
  }
  // QF-20260725-470: resolve 'table.column' pairs against information_schema.columns. Without this
  // branch a declared column is structurally invisible and its migration can still contribute to a
  // MIGRATION_APPLY_STATE_PASS — the exact ghost that let chairman-gated QF-20260719-281 close with
  // ship_review_findings.metadata / .repo and quick_fixes.factory_lane still absent from prod.
  if (byClass.get('column')?.size) {
    const { rows } = await client.query(
      `SELECT c.table_name || '.' || c.column_name AS name
         FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND (c.table_name || '.' || c.column_name) = ANY($1::text[])`,
      [[...byClass.get('column')]]
    );
    mark('column', rows, 'name');
  }
  if (byClass.get('constraint')?.size) {
    const { rows } = await client.query(
      `SELECT DISTINCT c.conname AS name FROM pg_constraint c
         JOIN pg_namespace ns ON ns.oid = c.connamespace
        WHERE ns.nspname = 'public' AND c.conname = ANY($1::text[])`,
      [[...byClass.get('constraint')]]
    );
    mark('constraint', rows, 'name');
  }
  return live;
}

/** Per-file classification from its SURVIVING expected objects (drop-aware). */
export function classifyFiles(orderedFiles, expected, perFile, live) {
  const survivingByFile = new Map();
  for (const { cls, name, file } of expected.values()) {
    if (!survivingByFile.has(file)) survivingByFile.set(file, []);
    survivingByFile.get(file).push({ cls, name });
  }
  return orderedFiles.map((file) => {
    const facts = perFile.get(file) || { creates: [], drops: [] };
    const surviving = survivingByFile.get(file) || [];
    if (!facts.creates.length) return { file, status: 'NO_DDL', missing: [], objects: 0 };
    if (!surviving.length) return { file, status: 'APPLIED', missing: [], objects: 0, note: 'all objects superseded by later migrations' };
    const missing = surviving.filter((o) => !live.has(`${o.cls}:${o.name}`));
    const status = missing.length === 0 ? 'APPLIED' : missing.length === surviving.length ? 'NOT_APPLIED' : 'PARTIAL';
    return { file, status, missing, objects: surviving.length };
  });
}

// ── CLI ───────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
  const asJson = args.includes('--json');
  // FR-2: --recent-only restricts the strict fail set (and the GAPS marker / alert) to
  // RECENT gaps (date token >= cutoff). Legacy gaps still print as advisory. --since=YYYYMMDD
  // overrides the RETIRED_BEFORE cutoff. The DEFAULT (no --recent-only) is unchanged.
  const recentOnly = args.includes('--recent-only');
  const sinceArg = args.find((a) => a.startsWith('--since='));
  const sinceVal = sinceArg ? sinceArg.slice('--since='.length) : null;
  // FR-2 adversarial review (low): reject a malformed --since rather than silently
  // producing an empty (fail-open) recent set. Must be an 8-digit YYYYMMDD.
  if (sinceVal !== null && !/^\d{8}$/.test(sinceVal)) {
    console.error(`Invalid --since='${sinceVal}': expected an 8-digit YYYYMMDD date.`);
    console.log(`[${OUTCOME.MISCONFIG}]`);
    return 2;
  }
  const cutoff = sinceVal || RETIRED_BEFORE;

  // FR-A: a non-ENOENT enumeration failure must be MISCONFIG (fail-closed, exit 2), never
  // allowed to escape into the entry catch — that prints INFRA_ERROR, which the drift-guard
  // workflow converts to exit 0: a one-throw permanent gate silencer (the documented
  // false-pass class this file guards against everywhere else).
  let scan;
  try {
    scan = listForwardMigrations();
  } catch (e) {
    console.error(`Scan-root enumeration failed: ${e.code || e.message}`);
    console.log(`[${OUTCOME.MISCONFIG}]`);
    return 2;
  }
  const { forward, down, excluded } = scan;
  // FR-A collision exclusion is LOUD: an excluded file is invisible to the whole audit, and
  // silence here would be exactly the coverage hole this SD closes. DIVERGENT twins are the
  // dangerous class — same basename, different DDL — and stay a human problem (feedback
  // channel), never a ledger entry.
  for (const ex of excluded) {
    console.error(`Excluded from scan (basename collides with database/migrations/${printableFile(ex.twin)}): ${printableFile(ex.id)} — ${ex.verdict}`);
  }
  // An unreadable entry is an operator error, not a transient outage, and it must FAIL CLOSED.
  // Left unguarded, a committed DIRECTORY named `x.sql/` (git stores `x.sql/keep`) passes the
  // .sql filter and makes readFileSync throw EISDIR, which escapes main() into the entry catch
  // and prints INFRA_ERROR — which the drift-guard workflow converts to exit 0. That is a
  // one-commit permanent gate silencer. MISCONFIG matches how this file already treats a
  // missing credential: a gate that cannot verify must say so loudly, never pass quietly.
  const unreadable = [];
  const fileFacts = [];
  for (const file of forward) {
    try {
      fileFacts.push({ file, ...extractDdlFacts(readFileSync(resolveMigrationPath(file), 'utf8')) });
    } catch (e) {
      unreadable.push(`${file} (${e.code || e.message})`);
    }
  }
  if (unreadable.length) {
    console.error(`Unreadable migration entr(ies): ${unreadable.join(', ')}`);
    console.log(`[${OUTCOME.MISCONFIG}]`);
    return 2;
  }
  const { expected, droppedLater, perFile } = foldLifecycle(fileFacts);

  // ── Disposition ledger (FR-6) — loaded BEFORE the DB try, deliberately ──────
  //
  // CI FALSE-PASS GUARD. Inside the try below, ANY throw prints
  // MIGRATION_APPLY_STATE_INFRA_ERROR, which migration-deploy-drift-guard.yml greps and
  // converts to exit 0. A corrupt ledger reaching that path would turn the gate
  // permanently and SILENTLY GREEN — the precise inversion of fail-open. So the ledger is
  // read here, in its own guarded block that emits NO outcome marker: a failure degrades to
  // zero suppression (all drift still reported) and the run continues to the real DB check.
  //
  // The import is DYNAMIC for the same reason. A static import that failed to resolve would
  // reject before main() ever ran and be caught by the entry .catch, which also prints
  // INFRA_ERROR — reintroducing the false-pass one layer up.
  let ledger = new Map();
  let ledgerApi = null;
  let ledgerLoadError = null;
  let ledgerStatus = 'unavailable';
  try {
    ledgerApi = await import('./lib/migration-disposition-ledger.mjs');
    const seen = ledgerApi.inspectLedger(path.resolve(__dirname, '..', ledgerApi.DEFAULT_LEDGER_PATH));
    ledger = seen.ledger;
    ledgerStatus = seen.status;
  } catch (e) {
    ledgerLoadError = e.message; // stderr only, below — never an OUTCOME marker.
    ledgerApi = null;
    ledger = new Map();
    ledgerStatus = 'unavailable';
  }
  // A corrupt ledger suppresses nothing (fail-open), but must not LOOK like an empty one.
  if (ledgerLoadError) console.error(`Disposition ledger module unavailable (suppressing nothing): ${ledgerLoadError}`);
  else if (ledgerStatus !== 'ok' && ledgerStatus !== 'absent') console.error(`Disposition ledger is ${ledgerStatus} (suppressing nothing) — fix ${ledgerApi.DEFAULT_LEDGER_PATH}`);

  let live;
  let client;
  try {
    // Import FIRST: supabase-connection.js loads .env (dotenv) at module init, which
    // populates the DB credential env vars the MISCONFIG check below reads. (The verifier
    // itself does not load dotenv, so checking before this import would false-positive.)
    const { createDatabaseClient } = await import('./lib/supabase-connection.js');
    // FR-2 adversarial review (HIGH): a missing DB credential is an operator MISCONFIG,
    // not a transient outage. Fail LOUD (distinct marker, exit 2) so the CI gate can
    // hard-fail on it instead of silently INFRA-skipping green forever. Only a genuine
    // connect failure AFTER a credential is present demotes to the non-blocking INFRA path.
    if (!hasAnyDbCredential()) {
      console.error('No DB credential present (set one of SUPABASE_DB_PASSWORD / EHG_DB_PASSWORD / SUPABASE_POOLER_URL / DATABASE_URL).');
      console.log(`[${OUTCOME.MISCONFIG}]`);
      return 2;
    }
    // Honor the wired connection-string secrets (SUPABASE_POOLER_URL / DATABASE_URL) the CI
    // provides — createDatabaseClient prefers options.connectionString, else builds from the
    // password. Passing it here closes the dead-wiring gap the review flagged.
    const connectionString = process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL || undefined;
    client = await createDatabaseClient('ehg', connectionString ? { connectionString } : {});
    live = await resolveLive(client, expected);
  } catch (e) {
    console.error(`DB unreachable: ${e.message}`);
    console.log(`[${OUTCOME.INFRA}]`);
    return 1;
  } finally {
    try { await client?.end(); } catch { /* already closed */ }
  }

  const results = classifyFiles(forward, expected, perFile, live);
  const summary = {
    scanned: forward.length,
    excluded_down: down.length,
    applied: results.filter((r) => r.status === 'APPLIED').length,
    partial: results.filter((r) => r.status === 'PARTIAL').length,
    not_applied: results.filter((r) => r.status === 'NOT_APPLIED').length,
    no_ddl: results.filter((r) => r.status === 'NO_DDL').length,
    dropped_later: droppedLater.length,
  };
  const gaps = results.filter((r) => r.status === 'PARTIAL' || r.status === 'NOT_APPLIED').reverse(); // newest first

  // FR-2 recent-vs-legacy partition. failSet drives the --strict exit + GAPS marker + alert.
  // FR-6 layers ledger suppression on top: with no (or a broken) ledger every set below is
  // byte-identical to the pre-SD behaviour, because suppressedSet is empty.
  const suppressedSet = ledgerApi ? ledgerApi.suppressedBasenames(ledger) : new Set();
  const suppressedGaps = gaps.filter((g) => suppressedSet.has(gapFileBasename(g)));
  const activeGaps = gaps.filter((g) => !suppressedSet.has(gapFileBasename(g)));
  const recentGaps = partitionRecentGaps(gaps, cutoff, suppressedSet);
  const legacyGaps = activeGaps.filter((g) => !isRecent(g.file, cutoff));
  const failSet = recentOnly ? recentGaps : activeGaps;

  // FR-3: the machine-checkable definition of done. 117 of the 126 gap files sit behind
  // RETIRED_BEFORE and can NEVER turn the gate red, so "every file has a decision" is
  // invisible to a PASS/GAPS exit for 93% of the corpus. This count is computed over ALL
  // gaps — recent and legacy alike — so completion is provable independently of the marker.
  // The no-module fallback must report the SAME shape as the real path — deduplicated, sorted,
  // and free of empty basenames — or the headline count silently changes meaning depending on
  // whether the import resolved.
  const undispositioned = ledgerApi
    ? ledgerApi.undispositionedBasenames(gaps, ledger)
    : [...new Set(gaps.map(gapFileBasename).filter(Boolean))].sort();
  // Marked APPLIED yet still missing objects live — the ledger contradicts the schema.
  const contradictory = ledgerApi ? ledgerApi.contradictoryBasenames(gaps, ledger) : [];
  const dispositions = {
    ledger_entries: ledger.size,
    ledger_status: ledgerStatus,
    ledger_available: Boolean(ledgerApi) && !ledgerLoadError && ledgerStatus === 'ok',
    suppressed: suppressedGaps.length,
    suppressed_files: suppressedGaps.map(gapFileBasename),
    undispositioned: undispositioned.length,
    undispositioned_files: undispositioned,
    contradictory: contradictory.length,
    contradictory_files: contradictory,
  };

  if (asJson) {
    console.log(JSON.stringify({ summary, gaps, recentGaps, legacyGaps, dispositions, cutoff, recentOnly, droppedLater, files: results }, null, 2));
  } else {
    console.log('MIGRATION APPLY-STATE REPORT (advisory, read-only)');
    console.log(`  ordering: legacy non-dated files first (lexical), then date-prefixed (chronological)`);
    console.log(`  scanned ${summary.scanned} forward migrations (${summary.excluded_down} *_DOWN.sql excluded)`);
    console.log(`  APPLIED=${summary.applied}  PARTIAL=${summary.partial}  NOT_APPLIED=${summary.not_applied}  NO_DDL=${summary.no_ddl}  dropped-later pairs=${summary.dropped_later}`);
    if (gaps.length) {
      if (recentOnly) {
        console.log(`\n  RECENT gaps (date >= ${cutoff}, BLOCKING under --strict): ${recentGaps.length}; LEGACY gaps (advisory only): ${legacyGaps.length}`);
        if (recentGaps.length) {
          console.log(`  RECENT COMMITTED-NOT-DEPLOYED GAPS (newest first):`);
          for (const g of recentGaps) {
            console.log(`   ${g.status.padEnd(12)} ${printableFile(g.file)}  [RECENT]`);
            for (const m of g.missing) console.log(`     missing ${m.cls}: ${m.name}`);
          }
        }
        if (legacyGaps.length) {
          console.log(`  LEGACY gaps suppressed from the fail set (advisory): ${legacyGaps.map((g) => printableFile(g.file)).join(', ')}`);
        }
      } else {
        console.log(`\n  COMMITTED-NOT-DEPLOYED GAPS (${activeGaps.length} file(s), newest first):`);
        for (const g of activeGaps) {
          console.log(`   ${g.status.padEnd(12)} ${printableFile(g.file)}`);
          for (const m of g.missing) console.log(`     missing ${m.cls}: ${m.name}`);
        }
      }
      // FR-6: suppressed files are dropped from BOTH recentGaps and legacyGaps, so without
      // this line they would vanish from the report entirely — silent suppression is the
      // failure mode this SD exists to prevent. BASENAMES ONLY: the ledger's `reason` is
      // author-controlled text, and echoing it here could emit either OUTCOME literal, which
      // migration-deploy-drift-guard.yml greps for — letting a reason string steer the gate.
      if (suppressedGaps.length) {
        console.log(`\n  SUPPRESSED BY LEDGER (${suppressedGaps.length}): ${suppressedGaps.map((g) => printableFile(gapFileBasename(g))).join(', ')}`);
        console.log(`  (reasons are recorded in the ledger and in audit_log; run --json for the machine-readable set)`);
      }
    }
    // FR-3: printed unconditionally — "0 undispositioned" is the completion signal, and a
    // line that only appears when non-zero cannot be used to prove the zero.
    console.log(`\n  DISPOSITIONS: ${dispositions.undispositioned} of ${gaps.length} gap file(s) undispositioned; ${dispositions.suppressed} suppressed; ledger entries=${dispositions.ledger_entries} (status=${ledgerStatus})`);
    // A contradiction means the ledger claims APPLIED for a migration whose objects are
    // verifiably absent live — either the ledger is lying or an apply failed silently.
    // Both deserve an operator's eyes, so this prints even though it suppresses nothing.
    if (dispositions.contradictory) {
      console.log(`  ⚠ LEDGER CONTRADICTS SCHEMA (${dispositions.contradictory}): marked APPLIED but still missing live objects: ${dispositions.contradictory_files.map(printableFile).join(', ')}`);
    }
  }

  // SD-LEO-INFRA-BREAKAGE-DETECTOR-SURFACE-001-C (FR-C2): surface a committed-not-deployed migration gap
  // as a migration-fail system_alerts row. Fail-soft (never changes the advisory exit/marker below); the
  // writer dedups on (source_service, break_class) so a recurring gap does not flood the table.
  // OPT-IN (mirrors schema-lint's --alert discipline, adversarial-review finding): the DEFAULT advisory
  // run (`npm run migration:apply-state`, no flags) is read-only and writes NO alert — a parked-but-not-
  // _DOWN migration is an expected gap, not a CRITICAL incident. Emit only when the operator has declared
  // the gaps actionable via --alert or --strict (strict already treats gaps as a failure exit).
  if (failSet.length > 0 && (args.includes('--alert') || strict)) {
    // emitBreakageAlert's BODY is fail-soft, but its MODULE LOAD is not: the require sits
    // outside that boundary, and emit-breakage-alert.cjs top-level-requires alert-writer.cjs.
    // A broken file there would throw past main() into the entry catch, print INFRA_ERROR, and
    // the drift-guard workflow converts INFRA_ERROR to exit 0 — so the alerting path could fail
    // the gate OPEN at precisely the moment it detected gaps. Contain load and call together.
    try {
      const { createRequire } = await import('node:module');
      const { emitBreakageAlert } = createRequire(import.meta.url)('../lib/breakage/emit-breakage-alert.cjs');
      await emitBreakageAlert('migration-fail', 'migration-apply-state', {
        message: `migration-apply-state: ${failSet.length} ${recentOnly ? 'recent ' : ''}committed-not-deployed migration gap(s)`,
        sourceEntityId: failSet[0] ? failSet[0].file : null,
        metadata: { gap_count: failSet.length, recent_only: recentOnly, gaps: failSet.map((g) => ({ file: g.file, status: g.status })) },
      });
    } catch (e) {
      console.error(`Breakage alert failed (non-fatal, gate verdict unaffected): ${e.message}`);
    }
  }

  // failSet drives the marker + strict exit: with --recent-only, legacy gaps print
  // (advisory) but never flip the marker or fail the gate.
  const marker = failSet.length ? OUTCOME.GAPS : OUTCOME.PASS;
  // --json keeps stdout pure JSON for piping; the marker goes to stderr there.
  if (asJson) console.error(`[${marker}]`);
  else console.log(`\n[${marker}]`);
  return failSet.length && strict ? 1 : 0;
}

// Entry — graceful teardown armed only after the work settles (exit-hang class,
// SD-FDBK-INFRA-SWEEP-CLI-EXIT-001 primitive).
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main()
    .then((code) => armCliTeardown(code))
    .catch((err) => {
      console.error('❌ Error:', err.message);
      console.log(`[${OUTCOME.INFRA}]`);
      return armCliTeardown(1);
    });
}
