#!/usr/bin/env node
/**
 * attribute-tokens.mjs — per-SD token attribution from session transcript JSONL
 * (SD-MAN-INFRA-EFFORT-TIER-EXPERIMENT-001 FR-2).
 *
 * Primary path (LEAD-verified feasible): sum the `message.usage` blocks in
 * ~/.claude/projects/<project>/<session>.jsonl within an SD's claim window —
 * boundaries come from the SD's metadata.claim_history[] (claimed_at) and
 * metadata.completed_stamp_at (both shipped by SD-MAN-INFRA-SAME-TURN-NEXT-001).
 * Fallback proxy when no JSONL is readable: assistant-turn count + wall-clock,
 * marked tokens_source:'proxy' — never silently mixed.
 *
 * Usage:
 *   node scripts/effort-experiment/attribute-tokens.mjs --sd <SD-KEY> [--persist]
 *   node scripts/effort-experiment/attribute-tokens.mjs --sd <SD-KEY> --session <id> [--persist]
 *   node scripts/effort-experiment/attribute-tokens.mjs --file <x.jsonl> --from <ISO> --to <ISO>   (window mode, e.g. tests)
 *
 * --persist merges the totals into the SD's metadata.execution_context.tokens
 * (additive read-merge-write, fail-soft).
 */
import { createReadStream, existsSync } from 'fs';
import { createInterface } from 'readline';
import { execSync } from 'child_process';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';
dotenv.config();

const ZERO = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

/** Claude Code project-dir name: every non-alphanumeric char becomes '-'. */
export function projectDirName(repoPath) {
  return String(repoPath).replace(/[^a-zA-Z0-9]/g, '-');
}

/**
 * Default Claude Code transcript dir for this repo. Resolves the MAIN
 * worktree root via git-common-dir (worktree cwds derive a different —
 * wrong — project dir), falling back to cwd. Override with --dir.
 */
export function defaultTranscriptDir() {
  let repo = process.cwd();
  try {
    const common = execSync('git rev-parse --path-format=absolute --git-common-dir', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (common) repo = path.dirname(common); // <main-repo>/.git -> <main-repo>
  } catch { /* fail-soft: cwd */ }
  return path.join(os.homedir(), '.claude', 'projects', projectDirName(repo));
}

/**
 * Pure: stream a JSONL file and sum assistant usage blocks whose record
 * timestamp falls within [from, to]. Returns { totals, records, skipped, turns }.
 */
export async function sumUsageInWindow(file, fromIso, toIso) {
  const from = fromIso ? Date.parse(fromIso) : -Infinity;
  const to = toIso ? Date.parse(toIso) : Infinity;
  const totals = { ...ZERO };
  let records = 0, skipped = 0, turns = 0;
  const rl = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.includes('"usage"')) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { skipped++; continue; }
    const ts = Date.parse(obj.timestamp || '');
    if (Number.isNaN(ts) || ts < from || ts > to) continue;
    const usage = obj.message && obj.message.usage;
    if (!usage) continue;
    turns++;
    for (const k of Object.keys(ZERO)) totals[k] += Number(usage[k]) || 0;
    records++;
  }
  return { totals, records, skipped, turns };
}

/** Resolve the SD's attribution windows from its boundary stamps. */
export function windowsFromMetadata(metadata) {
  const md = metadata || {};
  const history = Array.isArray(md.claim_history) ? md.claim_history : [];
  const completedAt = md.completed_stamp_at || null;
  return history.map((h, i) => ({
    session_id: h.session_id,
    from: h.claimed_at,
    // window ends at the next claim by a different session, else completion, else now
    to: (history[i + 1] && history[i + 1].claimed_at) || completedAt || new Date().toISOString()
  }));
}

async function main() {
  const args = process.argv.slice(2);
  const get = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
  const sdKey = get('--sd');
  const file = get('--file');
  const persist = args.includes('--persist');

  // Window mode (fixture/tests): --file --from --to
  if (file && !sdKey) {
    const res = await sumUsageInWindow(file, get('--from'), get('--to'));
    console.log(JSON.stringify({ tokens_source: 'jsonl', ...res }, null, 2));
    return;
  }
  if (!sdKey) { console.error('Usage: attribute-tokens.mjs --sd <SD-KEY> [--session <id>] [--persist]'); process.exit(1); }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, metadata, created_at, completion_date')
    .eq('sd_key', sdKey)
    .single();
  if (error || !sd) { console.error(`SD not found: ${sdKey} ${error ? error.message : ''}`); process.exit(1); }

  let windows = windowsFromMetadata(sd.metadata);
  const onlySession = get('--session');
  if (onlySession) windows = windows.filter(w => w.session_id === onlySession);
  if (!windows.length) {
    console.error('No claim_history windows on this SD — boundary stamps absent (pre-instrumentation SD?). Nothing to attribute.');
    process.exit(2);
  }

  const dir = get('--dir') || defaultTranscriptDir();
  const result = { sd_key: sdKey, tokens_source: 'jsonl', sessions: [], totals: { ...ZERO }, turns: 0 };
  for (const w of windows) {
    const f = path.join(dir, `${w.session_id}.jsonl`);
    if (!existsSync(f)) {
      // Proxy fallback for this window: no transcript available
      result.sessions.push({ ...w, tokens_source: 'proxy', proxy: { reason: 'transcript_missing', wall_clock_ms: Date.parse(w.to) - Date.parse(w.from) } });
      result.tokens_source = result.sessions.every(s => s.tokens_source === 'proxy') ? 'proxy' : 'mixed';
      continue;
    }
    const res = await sumUsageInWindow(f, w.from, w.to);
    result.sessions.push({ ...w, tokens_source: 'jsonl', ...res });
    for (const k of Object.keys(ZERO)) result.totals[k] += res.totals[k];
    result.turns += res.turns;
  }

  console.log(JSON.stringify(result, null, 2));

  if (persist) {
    // Additive read-merge-write into metadata.execution_context.tokens (fail-soft)
    try {
      const { data: fresh } = await supabase.from('strategic_directives_v2').select('id, metadata').eq('id', sd.id).single();
      const md = (fresh && fresh.metadata) || {};
      md.execution_context = { ...(md.execution_context || {}), tokens: { ...result.totals, source: result.tokens_source, turns: result.turns, attributed_at: new Date().toISOString() } };
      const { error: werr } = await supabase.from('strategic_directives_v2').update({ metadata: md }).eq('id', sd.id);
      console.error(werr ? `persist failed (non-fatal): ${werr.message}` : 'persisted to metadata.execution_context.tokens');
    } catch (e) {
      console.error(`persist failed (non-fatal): ${e.message}`);
    }
  }
}

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) main().catch(e => { console.error(e.message); process.exit(1); });
