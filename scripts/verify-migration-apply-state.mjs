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
};

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

/** Leading 8+ digit date token (YYYYMMDD…), or null for a non-dated (legacy) file. */
export function migrationDateToken(file) {
  const m = String(file).match(/^(\d{8,})/);
  return m ? m[1] : null;
}

/** True iff the file is dated AND its date token >= cutoff (recent). Non-dated => legacy => false. */
export function isRecent(file, cutoff = RETIRED_BEFORE) {
  const token = migrationDateToken(file);
  // Compare on the leading 8-char YYYYMMDD so a 14-digit YYYYMMDDHHMMSS token and an
  // 8-digit token compare by calendar day (lexical == chronological for fixed-width dates).
  return token !== null && token.slice(0, 8) >= String(cutoff).slice(0, 8);
}

/** Filter a gaps array (objects with a .file) to only the RECENT ones — the strict-gate fail set. */
export function partitionRecentGaps(gaps, cutoff = RETIRED_BEFORE) {
  return (gaps || []).filter((g) => isRecent(g.file, cutoff));
}

// ── Stage 1: list + deterministic order ──────────────────────────────────────

/**
 * Forward migrations only. Excluded artifact suffixes (counted + listed, never expectations):
 *  - *_DOWN.sql / *_rollback.sql — rollback artifacts (their creates would re-create what the
 *    forward path dropped; live run showed them dominating false gaps otherwise)
 *  - *_DEFERRED.sql — explicitly parked migrations (deferral is the recorded decision)
 */
export const ARTIFACT_RE = /(_DOWN|_rollback|_DEFERRED)\.sql$/i;

export function listForwardMigrations(dir = MIGRATIONS_DIR) {
  const all = readdirSync(dir).filter((f) => f.endsWith('.sql'));
  const down = all.filter((f) => ARTIFACT_RE.test(f));
  const forward = all.filter((f) => !ARTIFACT_RE.test(f));
  return { forward: orderMigrations(forward), down };
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
    const m = f.match(/^(\d{8,})/);
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
  return { creates: pull(CREATE_RES), drops: pull(DROP_RES) };
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
  const cutoff = sinceArg ? sinceArg.slice('--since='.length) : RETIRED_BEFORE;

  const { forward, down } = listForwardMigrations();
  const fileFacts = forward.map((file) => ({
    file,
    ...extractDdlFacts(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')),
  }));
  const { expected, droppedLater, perFile } = foldLifecycle(fileFacts);

  let live;
  let client;
  try {
    const { createDatabaseClient } = await import('./lib/supabase-connection.js');
    client = await createDatabaseClient('ehg');
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
  const recentGaps = partitionRecentGaps(gaps, cutoff);
  const legacyGaps = gaps.filter((g) => !isRecent(g.file, cutoff));
  const failSet = recentOnly ? recentGaps : gaps;

  if (asJson) {
    console.log(JSON.stringify({ summary, gaps, recentGaps, legacyGaps, cutoff, recentOnly, droppedLater, files: results }, null, 2));
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
            console.log(`   ${g.status.padEnd(12)} ${g.file}  [RECENT]`);
            for (const m of g.missing) console.log(`     missing ${m.cls}: ${m.name}`);
          }
        }
        if (legacyGaps.length) {
          console.log(`  LEGACY gaps suppressed from the fail set (advisory): ${legacyGaps.map((g) => g.file).join(', ')}`);
        }
      } else {
        console.log(`\n  COMMITTED-NOT-DEPLOYED GAPS (${gaps.length} file(s), newest first):`);
        for (const g of gaps) {
          console.log(`   ${g.status.padEnd(12)} ${g.file}`);
          for (const m of g.missing) console.log(`     missing ${m.cls}: ${m.name}`);
        }
      }
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
    const { createRequire } = await import('node:module');
    const { emitBreakageAlert } = createRequire(import.meta.url)('../lib/breakage/emit-breakage-alert.cjs');
    await emitBreakageAlert('migration-fail', 'migration-apply-state', {
      message: `migration-apply-state: ${failSet.length} ${recentOnly ? 'recent ' : ''}committed-not-deployed migration gap(s)`,
      sourceEntityId: failSet[0] ? failSet[0].file : null,
      metadata: { gap_count: failSet.length, recent_only: recentOnly, gaps: failSet.map((g) => ({ file: g.file, status: g.status })) },
    });
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
