// fleet-liveness-select-lint.mjs — ban UNBOUNDED claude_sessions / v_active_sessions
// multi-row selects (the PostgREST 1000-row-cap blind spot: an unfiltered .select() returns
// the OLDEST 1000 rows and drops the newest live workers -> liveness/count reads 0/undercount).
// SD-LEO-INFRA-LIVE-FLEET-SESSIONS-ROWCAP-CANONICAL-001 (FR-4). Mirrors the structure of
// scripts/lint/process-env-feature-flag-lint.mjs (pure extractors + reason-required allowlist +
// tree scan). ADVISORY-FIRST: exit 0 by default; pass --enforce for exit 1.
//
// A read is SAFE (not flagged) when ANY of:
//   • it carries a server-side bound: `.gte('heartbeat_at', …)` OR (`.order(` AND `.limit(`)
//     — ordering by heartbeat_at/heartbeat_age_seconds means the cap only drops the STALEST rows;
//   • it is a single-row lookup: `.eq('session_id', …)` / `.single()` / `.maybeSingle()`;
//   • it is an exact-count head query: `count:` + `head:`;
//   • it routes through the canonical helper (lib/fleet/live-fleet-sessions.cjs — which is itself
//     bound, so its own query is safe by the first rule).
// Anything else is a latent cap victim; fix it (use liveFleetSessions/liveActiveSessionsView or add
// a bound) or allowlist it with a reason (e.g. an intentional full-table sweep).
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join, extname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const SCAN_EXTS = new Set(['.js', '.mjs', '.cjs', '.ts']);
const EXCLUDE = new Set(['node_modules', '.git', '.worktrees', 'dist', 'build', 'coverage', 'archive']);
const ALLOWLIST_PATH = resolve(ROOT, 'scripts/lint/fleet-liveness-select-allowlist.json');

const TARGET_TABLES = ['claude_sessions', 'v_active_sessions'];

/**
 * Strip // line and block comments so commented-out queries do not register, PRESERVING line
 * count (block comments become the same newlines they spanned; line comments keep their newline)
 * so reported line numbers match the original source (allowlist keys are "<file>:<line>").
 */
export function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (_m, p1) => p1);
}

/**
 * Is this claude_sessions/v_active_sessions read SAFE from the 1000-row cap? This guard targets the
 * exact pattern the SD names — an UNFILTERED select (like assessFleetActivity's original bare
 * `.from('v_active_sessions').select(cols)`), which PostgREST caps at the OLDEST 1000 rows. A read
 * is SAFE when it carries ANY server-side narrowing/paging: any filter, an `.order()` (ordering by
 * heartbeat desc returns the NEWEST 1000), a `.limit()`, a single-row read, or a count-head query.
 * (Status-filtered-but-unbounded scans, e.g. `.in('status',[active,idle])` with no limit, are a
 * broader latent class the SD scopes OUT — they filter server-side and are safe at today's < 1000
 * active; a follow-up may tighten them. This guard prevents the UNFILTERED regression.)
 */
function isSafeChain(chain) {
  if (/\.limit\(/.test(chain)) return true;
  if (/\.order\(/.test(chain)) return true; // order(heartbeat desc) => newest 1000 in the page
  if (/\.maybeSingle\(\)|\.single\(\)/.test(chain)) return true;
  // ANY server-side narrowing filter means it is not the "unfiltered" pattern.
  if (/\.(eq|in|not|filter|gt|gte|lt|lte|is|like|ilike|neq|contains|match|or|overlaps)\(/.test(chain)) return true;
  // exact-count head query (server computes the count; no rows paged).
  if (/count\s*:/.test(chain) && /head\s*:/.test(chain)) return true;
  return false;
}

/**
 * Find UNBOUNDED multi-row reads on the target tables. Returns [{table, line, snippet}].
 * For each `.from('<table>')` that is part of a `.select(` read, we inspect the query chain from
 * that `.from(` up to the statement end (next ';' or a char cap) and flag it if no bound/exemption
 * is present in that window. Pure + string-only so it is unit-testable.
 * @param {string} src
 * @returns {Array<{table:string, line:number, snippet:string}>}
 */
export function extractUnboundedLivenessSelects(src) {
  const clean = stripComments(src);
  const findings = [];
  const fromRe = /\.from\(\s*['"](claude_sessions|v_active_sessions)['"]\s*\)/g;
  let m;
  while ((m = fromRe.exec(clean)) !== null) {
    const table = m[1];
    const start = m.index;
    // Chain window: from `.from(` to the FIRST of {next ';' (statement end), the next `.from(`
    // (a following query), start+500} — so the window never bleeds into an adjacent statement.
    const semi = clean.indexOf(';', start);
    const nextFrom = clean.indexOf('.from(', start + 6);
    const bounds = [semi, nextFrom, start + 500, clean.length].filter((n) => n !== -1 && n > start);
    const end = Math.min(...bounds);
    const chain = clean.slice(start, end);
    if (!/\.select\(/.test(chain)) continue; // not a read (insert/update/delete/upsert)
    if (isSafeChain(chain)) continue;
    const line = clean.slice(0, start).split('\n').length;
    findings.push({ table, line, snippet: chain.replace(/\s+/g, ' ').slice(0, 120) });
  }
  return findings;
}

export function loadAllowlist(path = ALLOWLIST_PATH) {
  let raw;
  try { raw = readFileSync(path, 'utf8'); } catch { return {}; }
  let json;
  try { json = JSON.parse(raw); } catch (e) { throw new Error(`Invalid allowlist JSON at ${path}: ${e.message}`); }
  const entries = json.allow || json;
  for (const [k, v] of Object.entries(entries)) {
    if (!v || typeof v !== 'string' || !v.trim()) throw new Error(`Allowlist entry '${k}' must have a non-empty reason string`);
  }
  return entries;
}

const relOf = (full) => full.replace(ROOT, '').replace(/\\/g, '/').replace(/^\//, '');

export function scanTree(root = ROOT) {
  const hits = []; // { file, table, line, snippet }
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    for (const e of entries) {
      if (EXCLUDE.has(e)) continue;
      const full = join(dir, e);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) { walk(full); continue; }
      if (!SCAN_EXTS.has(extname(e))) continue;
      let src;
      try { src = readFileSync(full, 'utf8'); } catch { continue; }
      for (const f of extractUnboundedLivenessSelects(src)) {
        hits.push({ file: relOf(full), ...f });
      }
    }
  };
  walk(root);
  return hits;
}

async function main() {
  const enforce = process.argv.includes('--enforce');
  const allow = loadAllowlist();
  const hits = scanTree();
  const ungoverned = hits.filter((h) => !(`${h.file}:${h.line}` in allow) && !(h.file in allow));
  console.log(`[FLEET-LIVENESS-LINT] scanned tree; ${hits.length} unbounded ${TARGET_TABLES.join('/')} select(s); ${ungoverned.length} ungoverned.`);
  if (ungoverned.length) {
    console.log('  Unbounded liveness/count selects (use liveFleetSessions()/liveActiveSessionsView() or add .gte(heartbeat_at)/.order+.limit; or allowlist "<file>:<line>" with a reason):');
    for (const u of ungoverned) console.log(`   • ${u.file}:${u.line} [${u.table}] ${u.snippet}`);
  } else {
    console.log('  All liveness/count selects are server-side bounded or allowlisted. 0 ungoverned.');
  }
  if (enforce && ungoverned.length) process.exitCode = 1;
}

if (process.argv[1] && /fleet-liveness-select-lint\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  main();
}
