#!/usr/bin/env node
/**
 * dry-run.mjs — INERT-BUT-REACHABLE Fable-suitability entrypoint.
 * SD-LEO-INFRA-FABLE-SUITABILITY-MAP-001-C (FR-4).
 *
 * Proves the whole path is REACHABLE (RISK R3 anti dark-ship): it ACTUALLY scans a real slice of the
 * live codebase, derives regions, runs child B's scorers, attempts to persist via child A's writer,
 * and writes a REAL ranked artifact. It is NOT a mock. With child A still STAGED the persist returns
 * CEREMONY_PENDING per region (inert) — the ranked artifact is still produced, so the chairman can
 * validate ranking quality BEFORE the apply ceremony.
 *
 * --no-model (default in CI): use a deterministic reasoning-depth stub so the run needs no live
 * model. --live (QF-20260720-171): wire a genuine Sonnet-floor client (NEVER Fable) via constrained
 * tool-use decoding (never a free-text parse + regex repair). Requires ANTHROPIC_API_KEY.
 *
 * Usage:
 *   node scripts/fable-suitability/dry-run.mjs [--dir lib/fable-suitability] [--duty harness-depth] [--no-model|--live] [--max 10]
 * Exits 0 on a successful reachable run (even when every persist is CEREMONY_PENDING).
 */
import 'dotenv/config';
import { readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { deriveRegion } from '../../lib/fable-suitability/region-cluster.mjs';
import { upsertRegionScore } from '../../lib/fable-suitability/map-writer.mjs';
import { runFanout } from '../../lib/fable-suitability/fanout.mjs';
import { AnthropicAdapter } from '../../lib/sub-agents/vetting/provider-adapters.js';
import { getClaudeModel } from '../../lib/config/model-config.js';

/** Genuine Sonnet-floor client (NEVER Fable) via forced tool-use — constrained decoding,
 * not free-text parse + repair. Requires ANTHROPIC_API_KEY. */
export function createSonnetFloorClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('--live requires ANTHROPIC_API_KEY to be set in this environment.');
  }
  const adapter = new AnthropicAdapter({ model: getClaudeModel('validation') });
  return {
    async scoreStructured({ prompt, schema }) {
      const resp = await adapter.client.messages.create({
        model: adapter.model,
        max_tokens: 512,
        tools: [{ name: 'submit_score', input_schema: schema }],
        tool_choice: { type: 'tool', name: 'submit_score' },
        messages: [{ role: 'user', content: prompt }],
      });
      const toolUse = resp.content.find((b) => b.type === 'tool_use');
      if (!toolUse) throw new Error('live scoreStructured: no tool_use block in response');
      return toolUse.input;
    },
  };
}

/** Deterministic reasoning-depth stub for --no-model runs (mid band, no live call). */
export const deterministicClient = {
  async scoreStructured() {
    return { score: 3, rationale: 'deterministic --no-model stub (neutral judgment)' };
  },
};

/** Walk a directory (bounded) and collect source files. */
function collectFiles(root, dir, out = [], cap = 200) {
  for (const entry of readdirSync(dir)) {
    if (out.length >= cap) break;
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) collectFiles(root, full, out, cap);
    else if (/\.(m?js|ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Build a batch of {region, signals, dutyCluster} from a codebase slice. Coarse, real, cheap. */
export function buildRegionBatch(files, root, repo, dutyCluster) {
  const byRegion = new Map();
  for (const f of files) {
    const rel = relative(root, f);
    let region;
    try { region = deriveRegion(rel, { repo }); } catch { continue; }
    if (!byRegion.has(region)) byRegion.set(region, { files: 0 });
    byRegion.get(region).files += 1;
  }
  return [...byRegion.entries()].map(([region_key, agg]) => ({
    region: { region_key, repo, summary: `${agg.files} source file(s)` },
    dutyCluster,
    signals: {
      impact: { centrality: Math.min(20, agg.files), fanOut: Math.min(15, agg.files), crossRepoCount: 1 },
      opportunity: { issuePatterns: [], bypassCount: 0, failurePatternCount: 0, consumerCount: agg.files, churn: 1, complexityProxy: agg.files },
      reasoning: { blastRadius: agg.files, lookAhead: agg.files },
    },
  }));
}

async function main() {
  const args = process.argv.slice(2);
  const dir = argVal(args, '--dir') || 'lib/fable-suitability';
  const duty = argVal(args, '--duty') || 'harness-depth';
  const max = Number(argVal(args, '--max')) || 10;
  const noModel = args.includes('--no-model');
  const live = args.includes('--live');

  const root = process.cwd();
  const files = collectFiles(root, join(root, dir), [], 200);
  const regions = buildRegionBatch(files, root, 'EHG_Engineer', duty).slice(0, max);

  // Disable the auth auto-refresh timer + session persistence: this is a one-shot CLI, and the
  // lingering setInterval handle is what trips the Windows libuv teardown assertion on exit
  // (fable-suitability dry-run must honor its documented exit-0 contract, FR-4).
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const client = noModel ? deterministicClient : live ? createSonnetFloorClient() : requireInjectedClient();

  const result = await runFanout({
    regions,
    client,
    persist: (row) => upsertRegionScore(supabase, row),
    maxBatch: max,
  });

  const ranked = result.scored
    .map((r) => ({ region_key: r.region_key, duty_cluster: r.duty_cluster, composite_score: r.composite_score, axes: [r.axis_impact, r.axis_opportunity, r.axis_reasoning_depth] }))
    .sort((a, b) => b.composite_score - a.composite_score);

  const outDir = join(tmpdir(), 'fable-suitability');
  mkdirSync(outDir, { recursive: true });
  const artifact = join(outDir, `dry-run-ranked-${duty}-${regions.length}.json`);
  writeFileSync(artifact, JSON.stringify({ duty, generated_from: dir, ranked, persistedSummary: { persisted: result.persisted, ceremonyPending: result.ceremonyPending, skipped: result.skipped.length } }, null, 2));

  console.log(`\n── Fable-suitability DRY-RUN (inert-but-reachable) ──`);
  console.log(`   scanned ${files.length} file(s) in ${dir} -> ${regions.length} region(s), duty=${duty}${noModel ? ' (--no-model stub)' : live ? ' (--live Sonnet-floor)' : ''}`);
  console.log(`   scored ${result.scored.length}; persisted ${result.persisted}; CEREMONY_PENDING ${result.ceremonyPending} (child A staged => inert)`);
  console.log(`   ranked artifact: ${artifact}`);
  for (const r of ranked.slice(0, 5)) console.log(`     ${r.composite_score}  ${r.region_key}  [${r.axes.join('x')}]`);
  console.log(`   ✅ path reachable end-to-end (produce -> score -> persist); exit 0`);
}

function argVal(args, flag) { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; }
function requireInjectedClient() {
  throw new Error('dry-run: a Sonnet-floor model client must be injected for a live-model run; use --no-model for CI. (NEVER Fable — parked/expensive tier.)');
}

const invokedDirectly = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  // Set exitCode and let the event loop drain naturally (auth timer disabled above) rather than a
  // hard process.exit that trips the Windows libuv teardown assertion mid-handle-close.
  main().then(() => { process.exitCode = 0; }).catch((err) => { console.error('dry-run failed:', err.message); process.exitCode = 1; });
}
