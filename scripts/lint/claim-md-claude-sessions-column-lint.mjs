// claim-md-claude-sessions-column-lint.mjs — QF-20260912-810.
//
// .claude/commands/*.md embeds live node -e "..." scripts that query claude_sessions /
// v_active_sessions directly. These are markdown, so they never run through eslint/tsc, and a
// column rename on the base table (sd_id -> sd_key, 2026-02-18 consolidation) can silently
// break them: a Postgrest select/update on an unknown column returns {data: null, error}, and a
// caller that destructures only `data` (never checking `error`) reads the failure as "no row" --
// the exact shell-masks-vacancy shape .claude/commands/claim.md's release/status subcommands hit.
//
// This lint extracts every column name referenced in a .select('...')/.update({...})/.eq('...')
// chained directly off a .from('claude_sessions'|'v_active_sessions') call inside .claude/commands/
// *.md, and checks it against a checked-in live-column snapshot (mirrors the pattern in
// tests/unit/eva-phantom-column-alignment.test.js -- a static list, not a live DB RPC, so this
// lint has no DB dependency and runs the same in CI as locally). ADVISORY-FIRST: exit 0 by
// default; pass --enforce for exit 1 on an unknown column.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const COMMANDS_DIR = resolve(ROOT, '.claude/commands');
const ALLOWLIST_PATH = resolve(ROOT, 'scripts/lint/claim-md-claude-sessions-column-allowlist.json');

// Live columns, verified against the EHG_Engineer DB 2026-09-12 (QF-20260912-810). v_active_sessions
// is a superset view over claude_sessions plus SD/QF join columns -- it legitimately carries BOTH
// sd_id and sd_key (an intentional compat alias for view consumers; the base table does not).
const LIVE_COLUMNS = {
  claude_sessions: ['id', 'session_id', 'sd_key', 'track', 'tty', 'pid', 'hostname', 'codebase',
    'claimed_at', 'heartbeat_at', 'status', 'metadata', 'created_at', 'updated_at',
    'is_continuous_mode', 'continuous_started_at', 'continuous_sds_completed', 'machine_id',
    'terminal_id', 'released_reason', 'released_at', 'stale_at', 'stale_reason',
    'pid_validated_at', 'terminal_identity', 'current_branch', 'worktree_path', 'is_alive',
    'has_uncommitted_changes', 'handoff_fail_count', 'current_phase', 'worktree_branch',
    'is_virtual', 'parent_session_id', 'agent_slot', 'last_progress_at', 'current_tool',
    'current_tool_args_hash', 'current_tool_expected_end_at', 'last_activity_kind',
    'commits_since_claim', 'files_modified_since_claim', 'process_alive_at',
    'expected_silence_until', 'loop_state', 'cleanup_pending', 'last_tool_at'],
  v_active_sessions: ['id', 'session_id', 'sd_id', 'sd_key', 'sd_title', 'qf_id', 'qf_title',
    'qf_status', 'track', 'tty', 'pid', 'hostname', 'codebase', 'current_branch', 'machine_id',
    'terminal_id', 'terminal_identity', 'claimed_at', 'heartbeat_at', 'status',
    'released_reason', 'released_at', 'stale_reason', 'stale_at', 'metadata', 'created_at',
    'heartbeat_age_seconds', 'heartbeat_age_minutes', 'seconds_until_stale', 'computed_status',
    'claim_duration_minutes', 'heartbeat_age_human', 'is_virtual', 'parent_session_id',
    'loop_state', 'is_alive', 'has_uncommitted_changes', 'process_alive_at', 'updated_at',
    'expected_silence_until', 'pid_validated_at'],
};
const TARGET_TABLES = Object.keys(LIVE_COLUMNS);

/** Column names inside a `.select('a, b, c')` string argument. */
function selectColumns(argSrc) {
  const m = argSrc.match(/^['"`]([^'"`]+)['"`]/);
  if (!m) return [];
  return m[1].split(',').map((c) => c.trim()).filter(Boolean);
}

/**
 * Column names used as TOP-LEVEL keys in a `.update({a: ..., b: {nested: ...}})` object-literal
 * argument -- depth-tracked so a key nested inside a jsonb VALUE (e.g. .update({ metadata: {
 * proving_venture_id: ... } }), a legitimate write to the real `metadata` column) is never
 * mistaken for a column name of its own. Only keys at brace-depth 1 (directly inside the single
 * outer object passed to .update()) are collected.
 */
function updateColumns(argSrc) {
  const cols = [];
  let depth = 0;
  const re = /[{}]|['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?\s*:/g;
  let m;
  while ((m = re.exec(argSrc)) !== null) {
    if (m[0] === '{') { depth++; continue; }
    if (m[0] === '}') { depth--; continue; }
    if (depth === 1) cols.push(m[1]);
  }
  return cols;
}

/** The single quoted column name in a `.eq('col', value)` argument. */
function eqColumn(argSrc) {
  const m = argSrc.match(/^['"]([A-Za-z_][A-Za-z0-9_]*)['"]/);
  return m ? [m[1]] : [];
}

/**
 * Find unknown-column references chained off .from('claude_sessions'|'v_active_sessions') inside
 * one source string. Pure + exported for unit testing.
 * @param {string} src
 * @returns {Array<{table:string, method:string, column:string, line:number}>}
 */
export function extractUnknownColumns(src) {
  const findings = [];
  const fromRe = /\.from\(\s*['"](claude_sessions|v_active_sessions)['"]\s*\)/g;
  let fm;
  while ((fm = fromRe.exec(src)) !== null) {
    const table = fm[1];
    const windowEnd = Math.min(src.length, fm.index + 600);
    const nextFrom = src.indexOf('.from(', fm.index + 6);
    const end = nextFrom !== -1 && nextFrom < windowEnd ? nextFrom : windowEnd;
    const chain = src.slice(fm.index, end);
    const callRe = /\.(select|update|eq)\(\s*([\s\S]*?)\)(?=\s*[.;\n])/g;
    let cm;
    while ((cm = callRe.exec(chain)) !== null) {
      const method = cm[1];
      const cols = method === 'select' ? selectColumns(cm[2])
        : method === 'eq' ? eqColumn(cm[2])
        : updateColumns(cm[2]);
      for (const col of cols) {
        if (!LIVE_COLUMNS[table].includes(col)) {
          const line = src.slice(0, fm.index + cm.index).split('\n').length;
          findings.push({ table, method, column: col, line });
        }
      }
    }
  }
  return findings;
}

function loadAllowlist(path = ALLOWLIST_PATH) {
  let raw;
  try { raw = readFileSync(path, 'utf8'); } catch { return {}; }
  const json = JSON.parse(raw);
  return json.allow || {};
}

function scanCommandsDir(dir = COMMANDS_DIR) {
  const hits = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return hits; }
  for (const e of entries) {
    if (!e.endsWith('.md')) continue;
    const full = join(dir, e);
    const src = readFileSync(full, 'utf8');
    for (const f of extractUnknownColumns(src)) hits.push({ file: `.claude/commands/${e}`, ...f });
  }
  return hits;
}

function main() {
  const enforce = process.argv.includes('--enforce');
  const allow = loadAllowlist();
  const hits = scanCommandsDir();
  const ungoverned = hits.filter((h) => !(`${h.file}:${h.line}` in allow) && !(h.file in allow));
  console.log(`[CLAIM-MD-COLUMN-LINT] scanned ${TARGET_TABLES.join('/')} refs in .claude/commands/*.md; ${hits.length} unknown-column hit(s); ${ungoverned.length} ungoverned.`);
  if (ungoverned.length) {
    for (const u of ungoverned) {
      console.log(`   • ${u.file}:${u.line} [${u.table}.${u.column}] via .${u.method}(...) -- not a live column`);
    }
  } else {
    console.log('  All claude_sessions/v_active_sessions column references resolve to live columns.');
  }
  if (enforce && ungoverned.length) process.exitCode = 1;
}

if (process.argv[1] && /claim-md-claude-sessions-column-lint\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  main();
}
