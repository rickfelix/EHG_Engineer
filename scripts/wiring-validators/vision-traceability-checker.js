#!/usr/bin/env node
/**
 * Vision Traceability Checker — Verifier #3 of 5 in the LEO Wiring Verification Framework.
 *
 * For an SD with an associated vision_key, extracts the structured UX-element list
 * from the vision document (via LLM, cached per version), then greps the codebase
 * for each element. Emits a leo_wiring_validations-shaped JSON to stdout.
 *
 * Vision: VISION-LEO-WIRING-VERIFICATION-L2-001
 * Arch:   ARCH-LEO-WIRING-VERIFICATION-001 (Phase 3)
 * SD:     SD-LEO-WIRING-VERIFICATION-FRAMEWORK-ORCH-001-C
 *
 * Usage:
 *   node scripts/wiring-validators/vision-traceability-checker.js <SD-KEY> \
 *     [--vision-key <key>] [--root <path>] [--no-persist]
 *
 * Output: JSON array on stdout (matches sibling A shape).
 *   [{ sd_key, check_type: 'vision_traceability', status, signals_detected, evidence }]
 *
 * Exit codes:
 *   0 — pass or skip
 *   1 — fail (at least one UX element unfound)
 *   2 — invalid args / unrecoverable setup error
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, extname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT_DEFAULT = resolve(__filename, '..', '..', '..');

const SOURCE_FILE_EXTENSIONS = new Set(['.js', '.ts', '.tsx', '.jsx', '.mjs']);
const DEFAULT_SEARCH_ROOTS = ['ehg/src', 'scripts', 'lib', 'server', 'src'];
const SKIP_DIR_RE = /[/\\](node_modules|\.git|\.worktrees|dist|build|coverage)([/\\]|$)/;
const TEST_FILE_RE = /[/\\](__tests__|tests?|\.test\.|\.spec\.)/i;

const CHECK_TYPE = 'vision_traceability';
const SAFE_REF_RE = /^[\w./-]+$/;

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { sdKey: null, root: REPO_ROOT_DEFAULT, visionKey: null, persist: true };
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a === '--root') opts.root = resolve(args[++i]);
    else if (a === '--vision-key') {
      const raw = args[++i];
      if (raw != null && !SAFE_REF_RE.test(raw)) {
        process.stderr.write(`[vision-traceability-checker] invalid vision-key rejected: ${raw}\n`);
        process.exit(2);
      }
      opts.visionKey = raw;
    } else if (a === '--no-persist') opts.persist = false;
    else if (!a.startsWith('--') && !opts.sdKey) opts.sdKey = a;
    i++;
  }
  if (!opts.sdKey) {
    process.stderr.write('Usage: vision-traceability-checker.js <SD-KEY> [--vision-key <key>] [--root <path>] [--no-persist]\n');
    process.exit(2);
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Supabase (lazy, optional)
// ---------------------------------------------------------------------------
async function loadSupabase() {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  } catch (err) {
    process.stderr.write(`[vision-traceability-checker] supabase import failed: ${err.message}\n`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Vision resolution
// ---------------------------------------------------------------------------
async function resolveVisionKey(supabase, sdKey, cliVisionKey) {
  if (cliVisionKey) return cliVisionKey;
  if (!supabase) return null;
  const { data } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', sdKey)
    .maybeSingle();
  return data?.metadata?.vision_key || null;
}

async function loadVisionDocument(supabase, visionKey) {
  if (!supabase || !visionKey) return null;
  const { data } = await supabase
    .from('eva_vision_documents')
    .select('id, vision_key, version, content, sections, addendums')
    .eq('vision_key', visionKey)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

// ---------------------------------------------------------------------------
// Matrix extraction (LLM + file cache)
// ---------------------------------------------------------------------------
function cachePath(repoRoot, visionKey, version) {
  return join(repoRoot, '.cache', 'vision-matrices', `${visionKey}-v${version}.json`);
}

function readCache(repoRoot, visionKey, version) {
  const p = cachePath(repoRoot, visionKey, version);
  if (!existsSync(p)) return null;
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8'));
    if (parsed.vision_key !== visionKey || parsed.version !== version) return null;
    if (!Array.isArray(parsed.ux_elements)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(repoRoot, visionKey, version, matrix) {
  const p = cachePath(repoRoot, visionKey, version);
  mkdirSync(resolve(p, '..'), { recursive: true });
  writeFileSync(p, JSON.stringify({ vision_key: visionKey, version, ux_elements: matrix, extracted_at: new Date().toISOString() }, null, 2));
}

function buildExtractionPrompt(vision) {
  const systemPrompt = [
    'You are extracting a structured UX-element list from a Vision document.',
    'Output MUST be valid JSON and ONLY JSON (no prose, no code fences).',
    'Schema:',
    '{ "ux_elements": [{ "name": string, "type": "component"|"function"|"page"|"workflow", "grep_patterns": [string, ...], "source_quote": string }] }',
    'Rules:',
    '- Each ux_element represents a concrete user-observable capability promised by the vision (not an abstract principle).',
    '- grep_patterns should be regex-escaped literal strings or simple identifier patterns that would plausibly appear in code (component names, function names, CSS classes, route paths).',
    '- Provide 1-3 grep_patterns per element, ordered from most-specific to least-specific.',
    '- source_quote must be a verbatim sentence (<= 200 chars) from the vision prose.',
    '- Skip infrastructure/governance concepts that have no user-observable surface.',
    '- Limit output to 20 elements max.',
  ].join('\n');

  const sections = vision.sections && typeof vision.sections === 'object'
    ? Object.entries(vision.sections).map(([k, v]) => `### ${k}\n${v}`).join('\n\n')
    : '';
  const addendums = Array.isArray(vision.addendums) && vision.addendums.length > 0
    ? vision.addendums.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join('\n---\n')
    : '';

  const userPrompt = [
    `Vision key: ${vision.vision_key} (version ${vision.version})`,
    '',
    '## Vision Content',
    vision.content || '',
    sections ? '\n## Sections\n' + sections : '',
    addendums ? '\n## Addendums\n' + addendums : '',
    '',
    'Return the JSON object described in the system prompt.',
  ].join('\n');

  return { systemPrompt, userPrompt };
}

function parseLlmMatrix(raw) {
  if (typeof raw !== 'string') throw new Error('LLM returned non-string response');
  let text = raw.trim();
  // Strip fenced code blocks if the model ignored our instruction
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const parsed = JSON.parse(text);
  if (!parsed || !Array.isArray(parsed.ux_elements)) {
    throw new Error('missing ux_elements array');
  }
  for (const el of parsed.ux_elements) {
    if (!el || typeof el.name !== 'string' || !Array.isArray(el.grep_patterns)) {
      throw new Error('malformed ux_element entry');
    }
  }
  return parsed.ux_elements;
}

async function extractMatrix({ vision, repoRoot, llmClientOverride, fixtureMatrix }) {
  if (fixtureMatrix) {
    return { ux_elements: fixtureMatrix, source: 'fixture', llm_called: false };
  }
  const cached = readCache(repoRoot, vision.vision_key, vision.version);
  if (cached) {
    return { ux_elements: cached.ux_elements, source: 'cache', llm_called: false };
  }
  let client = llmClientOverride;
  if (!client) {
    const mod = await import('../../lib/llm/client-factory.js');
    client = mod.getValidationClient();
  }
  const { systemPrompt, userPrompt } = buildExtractionPrompt(vision);
  const result = await client.complete(systemPrompt, userPrompt, { maxTokens: 4000, timeout: 180000 });
  const elements = parseLlmMatrix(result.content);
  writeCache(repoRoot, vision.vision_key, vision.version, elements);
  return { ux_elements: elements, source: 'llm', llm_called: true };
}

// ---------------------------------------------------------------------------
// Codebase grep
// ---------------------------------------------------------------------------
function walkSourceFiles(repoRoot, roots) {
  const files = [];
  const stack = roots.map((r) => resolve(repoRoot, r)).filter((p) => existsSync(p));
  while (stack.length) {
    const cur = stack.pop();
    let st;
    try { st = statSync(cur); } catch { continue; }
    // Test skip patterns against the path relative to repoRoot so we don't
    // falsely skip when the repo itself lives inside .worktrees/ during fleet runs.
    const rel = cur.startsWith(repoRoot) ? cur.slice(repoRoot.length) : cur;
    if (st.isDirectory()) {
      if (SKIP_DIR_RE.test(rel)) continue;
      for (const entry of readdirSync(cur)) stack.push(join(cur, entry));
    } else if (st.isFile() && SOURCE_FILE_EXTENSIONS.has(extname(cur))) {
      files.push(cur);
    }
  }
  return files;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPatternRegex(pattern) {
  // Treat grep_patterns as literal unless they look like intentional regex (contain \b or \\).
  // Keep it simple: always escape, relying on substring semantics. Callers wanting regex
  // can still produce literal tokens that match.
  return new RegExp(escapeRegex(pattern));
}

function classifyElement(element, sourceFiles, repoRoot) {
  const patterns = (element.grep_patterns || []).filter((p) => typeof p === 'string' && p.length >= 3);
  const regexes = patterns.map(buildPatternRegex);
  let matchCount = 0;
  const sampleFiles = [];
  for (const f of sourceFiles) {
    if (TEST_FILE_RE.test(f)) continue;
    let src;
    try { src = readFileSync(f, 'utf8'); } catch { continue; }
    const hit = regexes.some((re) => re.test(src));
    if (hit) {
      matchCount += 1;
      if (sampleFiles.length < 3) {
        const rel = f.startsWith(repoRoot) ? f.slice(repoRoot.length + 1).replace(/\\/g, '/') : f;
        sampleFiles.push(rel);
      }
    }
  }
  return {
    name: element.name,
    type: element.type || 'unknown',
    found: matchCount > 0,
    match_count: matchCount,
    sample_files: sampleFiles,
  };
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------
export async function runChecker({ sdKey, supabase, root, visionKey, fixtureMatrix, visionOverride, llmClientOverride } = {}) {
  if (!sdKey) throw new Error('runChecker: sdKey required');
  const repoRoot = root || REPO_ROOT_DEFAULT;

  let vision = visionOverride || null;
  if (!vision) {
    const resolvedKey = visionKey || (await resolveVisionKey(supabase, sdKey, null));
    if (!resolvedKey) {
      process.stderr.write(`[vision-traceability-checker] ${sdKey}: no vision_key — skipping\n`);
      return [{
        sd_key: sdKey,
        check_type: CHECK_TYPE,
        status: 'skip',
        signals_detected: [],
        evidence: { reason: 'no_vision_key' },
      }];
    }
    vision = await loadVisionDocument(supabase, resolvedKey);
    if (!vision) {
      process.stderr.write(`[vision-traceability-checker] ${sdKey}: vision document ${resolvedKey} not found — skipping\n`);
      return [{
        sd_key: sdKey,
        check_type: CHECK_TYPE,
        status: 'skip',
        signals_detected: [],
        evidence: { reason: 'vision_document_not_found', vision_key: resolvedKey },
      }];
    }
  }

  let matrix;
  try {
    matrix = await extractMatrix({ vision, repoRoot, llmClientOverride, fixtureMatrix });
  } catch (err) {
    process.stderr.write(`[vision-traceability-checker] matrix extraction failed: ${err.message}\n`);
    return [{
      sd_key: sdKey,
      check_type: CHECK_TYPE,
      status: 'fail',
      signals_detected: [],
      evidence: { llm_error: err.message, vision_key: vision.vision_key, vision_version: vision.version },
    }];
  }

  const sourceFiles = walkSourceFiles(repoRoot, DEFAULT_SEARCH_ROOTS);
  const signals = matrix.ux_elements.map((el) => classifyElement(el, sourceFiles, repoRoot));
  const anyUnfound = signals.some((s) => !s.found);

  return [{
    sd_key: sdKey,
    check_type: CHECK_TYPE,
    status: anyUnfound ? 'fail' : 'pass',
    signals_detected: signals,
    evidence: {
      source: matrix.source,
      llm_called: matrix.llm_called,
      vision_key: vision.vision_key,
      vision_version: vision.version,
      elements_total: signals.length,
      elements_missing: signals.filter((s) => !s.found).length,
    },
  }];
}

/**
 * Persist a single result row to leo_wiring_validations. No-ops gracefully when:
 *   - supabase client is null/undefined
 *   - the table does not yet exist (Child D creates it)
 *
 * Mirrors scripts/wiring-validators/orphan-detector.js persistResults.
 */
export async function persistResults(supabase, result) {
  if (!supabase) {
    process.stderr.write('[vision-traceability-checker] persistResults: no supabase client, skipping\n');
    return { skipped: true, reason: 'no_client' };
  }
  const { error } = await supabase
    .from('leo_wiring_validations')
    .upsert({ ...result, updated_at: new Date().toISOString() }, { onConflict: 'sd_key,check_type' });
  if (error) {
    const msg = error.message || '';
    if (error.code === 'PGRST205' || /Could not find the table/i.test(msg)) {
      process.stderr.write('[vision-traceability-checker] persistResults: table leo_wiring_validations absent, skipping\n');
      return { skipped: true, reason: 'table_absent' };
    }
    return { skipped: false, error: msg };
  }
  return { skipped: false, error: null };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
async function main() {
  const opts = parseArgs(process.argv);
  const supabase = await loadSupabase();
  const results = await runChecker({ sdKey: opts.sdKey, supabase, root: opts.root, visionKey: opts.visionKey });
  if (opts.persist && supabase) {
    for (const row of results) await persistResults(supabase, row);
  }
  process.stdout.write(JSON.stringify(results, null, 2) + '\n');
  const anyFail = results.some((r) => r.status === 'fail');
  process.exit(anyFail ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('vision-traceability-checker.js')) {
  main().catch((err) => {
    process.stderr.write(`[vision-traceability-checker] fatal: ${err.message}\n`);
    process.exit(2);
  });
}
