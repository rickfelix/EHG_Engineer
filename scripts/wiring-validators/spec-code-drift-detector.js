#!/usr/bin/env node
/**
 * Spec-Code Drift Detector — Verifier #2 of 5 in the LEO Wiring Verification Framework.
 *
 * Parses the SD's architecture plan markdown for declared HTTP endpoints,
 * artifact_type literals, RPC names, and security constraints, then greps
 * the codebase to verify each declaration has corresponding implementation.
 * Emits a leo_wiring_validations-shaped JSON to stdout.
 *
 * Vision: VISION-LEO-WIRING-VERIFICATION-L2-001
 * Arch:   ARCH-LEO-WIRING-VERIFICATION-001 (Phase 2)
 * SD:     SD-LEO-WIRING-VERIFICATION-FRAMEWORK-ORCH-001-B
 *
 * Usage:
 *   node scripts/wiring-validators/spec-code-drift-detector.js <SD-KEY> [--root <path>]
 *
 * Output: JSON on stdout. Logs on stderr.
 *   { sd_key, check_type, status, signals_detected, evidence }
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, extname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT_DEFAULT = resolve(__filename, '..', '..', '..');

const SEARCH_EXTENSIONS = new Set(['.js', '.ts', '.tsx', '.jsx', '.mjs', '.sql']);
const ROUTE_ROOTS = ['server/routes', 'server/src/routes'];
const SCHEMA_ROOTS = ['lib/eva', 'database/migrations', 'src/lib'];
const FRONTEND_ROOTS = ['ehg/src', 'src'];

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { sdKey: null, root: REPO_ROOT_DEFAULT, fixture: null };
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a === '--root') opts.root = resolve(args[++i]);
    else if (a === '--fixture-content') opts.fixture = args[++i];
    else if (!a.startsWith('--') && !opts.sdKey) opts.sdKey = a;
    i++;
  }
  if (!opts.sdKey) {
    process.stderr.write('Usage: spec-code-drift-detector.js <SD-KEY> [--root <path>] [--fixture-content <md>]\n');
    process.exit(2);
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Fetch SD arch plan from DB
// ---------------------------------------------------------------------------
async function fetchArchPlan(sdKey) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    process.stderr.write('[spec-code-drift] Missing SUPABASE_URL or SERVICE_ROLE_KEY in env\n');
    return { archKey: null, content: null, reason: 'missing_env' };
  }
  const supabase = createClient(url, key);
  const { data: sd, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', sdKey)
    .single();
  if (sdErr || !sd) {
    process.stderr.write(`[spec-code-drift] SD fetch failed: ${sdErr?.message || 'not found'}\n`);
    return { archKey: null, content: null, reason: 'sd_not_found' };
  }
  const archKey = sd.metadata?.arch_key;
  if (!archKey) return { archKey: null, content: null, reason: 'no_arch_key' };

  const { data: plan, error: planErr } = await supabase
    .from('eva_architecture_plans')
    .select('content, addendums')
    .eq('plan_key', archKey)
    .single();
  if (planErr || !plan) {
    process.stderr.write(`[spec-code-drift] Plan fetch failed: ${planErr?.message || 'not found'}\n`);
    return { archKey, content: null, reason: 'plan_not_found' };
  }
  let fullContent = plan.content || '';
  if (Array.isArray(plan.addendums)) {
    for (const add of plan.addendums) {
      if (typeof add?.section === 'string') fullContent += '\n\n' + add.section;
    }
  }
  return { archKey, content: fullContent, reason: 'ok' };
}

// ---------------------------------------------------------------------------
// Markdown declaration parsers
// ---------------------------------------------------------------------------
export function parseEndpoints(md) {
  const endpoints = [];
  const lines = md.split('\n');
  const re = /\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[\w/:.{}\-]+)/g;
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(re)) {
      endpoints.push({ method: m[1], path: m[2], line: i + 1 });
    }
  }
  return endpoints;
}

export function parseArtifactTypes(md) {
  const types = [];
  const lines = md.split('\n');
  // artifact_type='foo' or artifact_type: 'foo' or artifact_type="foo"
  const re = /artifact_type[\s]*[=:][\s]*['"]([\w_-]+)['"]/g;
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(re)) {
      types.push({ type: m[1], line: i + 1 });
    }
  }
  return types;
}

export function parseRpcNames(md) {
  const rpcs = [];
  const lines = md.split('\n');
  // supabase.rpc('func_name'), .rpc("func_name")
  const re = /\.rpc\(\s*['"]([\w_]+)['"]/g;
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(re)) {
      rpcs.push({ name: m[1], line: i + 1 });
    }
  }
  return rpcs;
}

export function parseSecurityConstraints(md) {
  const constraints = [];
  const lines = md.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/\b(RLS|row[-\s]level security|sandbox|must not)\b/i.test(line)) {
      constraints.push({ constraint: line.trim().slice(0, 200), line: i + 1 });
    }
  }
  return constraints;
}

// ---------------------------------------------------------------------------
// Code grep
// ---------------------------------------------------------------------------
function walkSourceFiles(repoRoot, roots) {
  const files = [];
  const stack = roots.map((r) => resolve(repoRoot, r)).filter((p) => existsSync(p));
  while (stack.length) {
    const cur = stack.pop();
    let st;
    try { st = statSync(cur); } catch { continue; }
    if (st.isDirectory()) {
      if (/[/\\](node_modules|\.git|\.worktrees|dist|build|coverage)([/\\]|$)/.test(cur)) continue;
      for (const entry of readdirSync(cur)) stack.push(join(cur, entry));
    } else if (st.isFile() && SEARCH_EXTENSIONS.has(extname(cur))) {
      files.push(cur);
    }
  }
  return files;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function grepMatches(files, needle, patternFactory) {
  const re = patternFactory(needle);
  for (const f of files) {
    let src;
    try { src = readFileSync(f, 'utf8'); } catch { continue; }
    if (re.test(src)) return { matched: true, file: f };
  }
  return { matched: false };
}

// ---------------------------------------------------------------------------
// Main detector
// ---------------------------------------------------------------------------
export async function runDetector({ sdKey, root, fixtureContent }) {
  const repoRoot = root || REPO_ROOT_DEFAULT;
  let content, archKey, reason;
  if (fixtureContent) {
    content = fixtureContent;
    archKey = 'FIXTURE';
    reason = 'ok';
  } else {
    ({ content, archKey, reason } = await fetchArchPlan(sdKey));
  }

  if (!content) {
    const status = reason === 'no_arch_key' ? 'skip' : 'error';
    return [{
      sd_key: sdKey,
      check_type: 'spec_code_drift',
      status,
      signals_detected: [],
      evidence: { reason, arch_key: archKey || null },
    }];
  }

  const endpoints = parseEndpoints(content);
  const artifactTypes = parseArtifactTypes(content);
  const rpcs = parseRpcNames(content);
  const security = parseSecurityConstraints(content);

  const routeFiles = walkSourceFiles(repoRoot, ROUTE_ROOTS);
  const schemaFiles = walkSourceFiles(repoRoot, SCHEMA_ROOTS);
  const frontendFiles = walkSourceFiles(repoRoot, FRONTEND_ROOTS);

  const signals = [];
  const evidence = { endpoints_checked: endpoints.length, artifact_types_checked: artifactTypes.length, rpcs_checked: rpcs.length };

  // Endpoint drift
  for (const ep of endpoints) {
    const r = grepMatches([...routeFiles, ...frontendFiles], ep.path, (p) => new RegExp(escapeRegex(p)));
    if (!r.matched) {
      signals.push({ declaration: `${ep.method} ${ep.path}`, arch_plan_line: ep.line, expected_location: 'server/routes/ or ehg/src/', severity: 'CRITICAL', type: 'endpoint' });
    }
  }

  // Artifact type drift
  for (const at of artifactTypes) {
    const r = grepMatches(schemaFiles, at.type, (t) => new RegExp(`['"]${escapeRegex(t)}['"]|\\b${escapeRegex(t.toUpperCase())}\\b`));
    if (!r.matched) {
      signals.push({ declaration: `artifact_type="${at.type}"`, arch_plan_line: at.line, expected_location: 'lib/eva/artifact-types.js or CHECK constraint', severity: 'MAJOR', type: 'artifact_type' });
    }
  }

  // RPC drift
  for (const rpc of rpcs) {
    const r = grepMatches(schemaFiles, rpc.name, (n) => new RegExp(`CREATE (?:OR REPLACE )?FUNCTION\\s+${escapeRegex(n)}|\\.rpc\\(['"]${escapeRegex(n)}['"]`));
    if (!r.matched) {
      signals.push({ declaration: `rpc("${rpc.name}")`, arch_plan_line: rpc.line, expected_location: 'database/migrations/', severity: 'MAJOR', type: 'rpc' });
    }
  }

  // Security constraints are informational — surface all that are present in arch
  // but don't auto-fail, since they require human interpretation. Chairman waiver
  // via Child D handles confirmation.
  for (const s of security) {
    signals.push({ declaration: s.constraint, arch_plan_line: s.line, expected_location: 'code review / waiver', severity: 'MINOR', type: 'security' });
  }

  const hasCritical = signals.some((s) => s.severity === 'CRITICAL');
  const hasMajor = signals.some((s) => s.severity === 'MAJOR');
  const status = hasCritical || hasMajor ? 'fail' : 'pass';

  return [{
    sd_key: sdKey,
    check_type: 'spec_code_drift',
    status,
    signals_detected: signals,
    evidence,
  }];
}

export async function persistResults(supabase, result) {
  if (!supabase) {
    process.stderr.write('[spec-code-drift] persistResults: no supabase client, skipping\n');
    return { skipped: true };
  }
  const { error } = await supabase
    .from('leo_wiring_validations')
    .upsert({ ...result, updated_at: new Date().toISOString() }, { onConflict: 'sd_key,check_type' });
  return { skipped: false, error: error ? error.message : null };
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------
if (process.argv[1]?.endsWith('spec-code-drift-detector.js')) {
  (async () => {
    const opts = parseArgs(process.argv);
    const results = await runDetector({ sdKey: opts.sdKey, root: opts.root, fixtureContent: opts.fixture });
    process.stdout.write(JSON.stringify(results, null, 2) + '\n');
    process.exit(results.some((r) => r.status === 'fail') ? 1 : 0);
  })();
}
