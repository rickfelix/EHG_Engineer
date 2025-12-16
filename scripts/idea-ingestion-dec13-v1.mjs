#!/usr/bin/env node
/**
 * Idea Ingestion (Dec 13, 2025) — v1
 *
 * Implements the "EHG Idea Integration Playbook" workflow for Dec 13 idea files:
 * - Treat each input .txt as already-structured (no re-summarize)
 * - Extract + validate + normalize:
 *   - persona perspectives
 *   - atomic recommendations (per "Item N" + optional "Top Next Steps")
 *   - spec impacts (affected docs/specs)
 *   - acceptance criteria
 *   - NOT SPECIFIED / spec debt items
 * - Classify each atomic recommendation into lanes:
 *   A) venture_candidate
 *   B) os_platform_improvement
 *   C) needs_review
 * - Dedupe only within the Dec 13 folder (file-to-file similarity)
 * - Output:
 *   - Master Recommendations CSV
 *   - Mirrored JSON artifact (same schema)
 *
 * Optional (read-only): best-match mapping to Strategic Directives (strategic_directives_v2).
 *
 * Location:
 * - Script: C:\_EHG\EHG_Engineer\scripts\idea-ingestion-dec13-v1.mjs
 * - Default input: C:\Users\rickf\Dropbox\_EHG\ehg ideas\Ideas 2025-12-13\
 * - Default outputs: C:\Users\rickf\Dropbox\_EHG\ehg ideas\Ideas 2025-12-13\_outputs\
 */
import fs from 'fs/promises';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { existsSync } from 'fs';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -----------------------------
// CLI
// -----------------------------

function parseArgs(argv) {
  const args = {
    inputDir: '/mnt/c/Users/rickf/Dropbox/_EHG/ehg ideas/Ideas 2025-12-13',
    outputDir: null,
    envFile: null,
    configPath: path.join(__dirname, '..', 'config', 'idea-ingestion-dec13-v1.json'),
    dryRun: true,
    write: false,
    includeNextSteps: true,
    includeConcreteArtifacts: false, // v1 default off to avoid noise; still extracted in json fields
    skipSdMatch: false,
    onlyFiles: null, // comma-separated list like 01,02,78 (for golden tests)
    goldenTest: false,
    limitFiles: null,
    verbose: false
  };

  for (const raw of argv.slice(2)) {
    if (raw === '--write') {
      args.write = true;
      args.dryRun = false;
      continue;
    }
    if (raw === '--dry-run') {
      args.dryRun = true;
      args.write = false;
      continue;
    }
    if (raw === '--verbose') {
      args.verbose = true;
      continue;
    }
    if (raw === '--skip-sd-match') {
      args.skipSdMatch = true;
      continue;
    }
    if (raw === '--no-next-steps') {
      args.includeNextSteps = false;
      continue;
    }
    if (raw === '--include-concrete-artifacts') {
      args.includeConcreteArtifacts = true;
      continue;
    }
    if (raw.startsWith('--input-dir=')) {
      args.inputDir = raw.split('=').slice(1).join('=');
      continue;
    }
    if (raw.startsWith('--output-dir=')) {
      args.outputDir = raw.split('=').slice(1).join('=');
      continue;
    }
    if (raw.startsWith('--env-file=')) {
      args.envFile = raw.split('=').slice(1).join('=');
      continue;
    }
    if (raw.startsWith('--config=')) {
      args.configPath = raw.split('=').slice(1).join('=');
      continue;
    }
    if (raw.startsWith('--only-files=')) {
      args.onlyFiles = raw.split('=').slice(1).join('=');
      continue;
    }
    if (raw === '--golden-test') {
      args.goldenTest = true;
      args.dryRun = true;
      args.write = false;
      continue;
    }
    if (raw.startsWith('--limit-files=')) {
      const n = Number(raw.split('=').slice(1).join('='));
      args.limitFiles = Number.isFinite(n) && n > 0 ? n : null;
      continue;
    }
    if (raw === '--help' || raw === '-h') {
      printHelpAndExit(0);
    }
    console.warn(`⚠️  Unknown arg ignored: ${raw}`);
  }

  args.outputDir = args.outputDir || path.join(args.inputDir, '_outputs');
  return args;
}

function printHelpAndExit(code = 0) {
  console.log(`
Idea Ingestion (Dec 13, 2025) — v1

Usage:
  node scripts/idea-ingestion-dec13-v1.mjs [--dry-run|--write] [options]

Options:
  --input-dir=<path>           Input folder containing 01.txt..78.txt
  --output-dir=<path>          Output folder (default: <input>/_outputs)
  --env-file=<path>            Load env vars from a specific .env file (optional)
  --config=<path>              Load ingestion config JSON (optional)
  --dry-run                    Do not write outputs (default)
  --write                      Write outputs to output-dir
  --skip-sd-match              Skip read-only SD best-match mapping
  --only-files=01,02,78        Only process specified file numbers (for tests)
  --golden-test                Run golden tests (forces dry-run, exits nonzero on failure)
  --no-next-steps              Do not emit recommendations from "Top 3 Prioritized Next Steps"
  --include-concrete-artifacts Also emit recommendations from "Concrete Build Artifacts" bullets (noisy)
  --limit-files=<N>            Only process first N files (sorted numerically)
  --verbose                    Extra logging
`);
  process.exit(code);
}

async function loadIngestionConfig(configPath) {
  try {
    const raw = await fs.readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    return { configPath, config: parsed };
  } catch (err) {
    return { configPath, config: null, error: err?.message || String(err) };
  }
}

// -----------------------------
// Helpers: text, tokens, csv
// -----------------------------

function normalizeNewlines(s) {
  return (s || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function safeTrim(s) {
  return (s || '').trim();
}

function toSlugSafe(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

function stripMarkdownCodeFences(s) {
  // Keep the content but remove triple backticks markers to avoid confusing parsing.
  return (s || '').replace(/```[a-zA-Z0-9_-]*\n/g, '').replace(/```/g, '');
}

function tokenize(s) {
  const text = (s || '')
    .toLowerCase()
    .replace(/[`"'’”“().,;:!?/\\[\]{}<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return [];
  return text
    .split(' ')
    .map(t => t.trim())
    .filter(t => t.length >= 3 && !STOPWORDS.has(t));
}

function jaccard(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const v of setA) if (setB.has(v)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows, columns) {
  const header = columns.map(csvEscape).join(',');
  const lines = rows.map(r => columns.map(c => csvEscape(r[c])).join(','));
  return [header, ...lines].join('\n') + '\n';
}

function sha1(s) {
  return crypto.createHash('sha1').update(String(s || ''), 'utf8').digest('hex');
}

function parseLikert(s) {
  // for "Relevance: **High**" style
  const m = (s || '').match(/\*\*(High|Medium|Low)\*\*/i);
  return m ? m[1].toLowerCase() : null;
}

function extractUrl(s) {
  const text = safeTrim(String(s || ''));
  if (!text) return null;

  const normalizeYoutube = u => {
    const cleaned = safeTrim(String(u || '')).replace(/[`"'<>]/g, '');
    if (!cleaned) return null;
    const short = cleaned.match(/youtu\.be\/([A-Za-z0-9_-]{11})/i);
    if (short) return `https://www.youtube.com/watch?v=${short[1]}`;
    const watch = cleaned.match(/[?&]v=([A-Za-z0-9_-]{11})/i);
    if (watch) return `https://www.youtube.com/watch?v=${watch[1]}`;
    const idOnly = cleaned.match(/^([A-Za-z0-9_-]{11})$/);
    if (idOnly) return `https://www.youtube.com/watch?v=${idOnly[1]}`;
    return null;
  };

  // 1) Explicit URL (backticked or bare)
  const urlMatch = text.match(/(https?:\/\/[^\s)]+|www\.[^\s)]+)/i);
  if (urlMatch) {
    let u = urlMatch[1].replace(/[`"'<>]/g, '').replace(/[),.]+$/g, '');
    if (/^www\./i.test(u)) u = `https://${u}`;
    return normalizeYoutube(u) || u;
  }

  // 2) Labeled YouTube ID / Video ID
  const labeled = text.match(/\b(?:youtube\s*id|video\s*id)\s*[:#-]?\s*([A-Za-z0-9_-]{11})\b/i);
  if (labeled) return `https://www.youtube.com/watch?v=${labeled[1]}`;

  // 3) If context suggests YouTube, accept a bare 11-char token
  const lower = text.toLowerCase();
  if (lower.includes('youtube') || lower.includes('youtu')) {
    const id = text.match(/\b([A-Za-z0-9_-]{11})\b/);
    if (id) return `https://www.youtube.com/watch?v=${id[1]}`;
  }

  return null;
}

const STOPWORDS = new Set([
  'the','and','for','with','that','this','from','into','will','then','than','but','are','not','its','it','you',
  'your','our','can','must','should','could','would','also','use','using','via','per','each','one','two','three',
  'stage','stages','spec','specs','affected','change','proposed','rationale','risk','acceptance','criteria'
]);

const ALLOWED_LANE_VALUES = new Set(['venture_candidate', 'os_improvement', 'needs_review']);
const ALLOWED_DISPOSITION_VALUES = new Set(['advance_to_blueprint', 'advance_to_sd_pipeline', 'park_for_later', 'reject']);
const ALLOWED_CONFIDENCE_VALUES = new Set(['high', 'medium', 'low']);
const ALLOWED_DEDUPE_STATUS_VALUES = new Set(['primary', 'duplicate']);
const ALLOWED_SD_MATCH_METHODS = new Set(['db', 'seed_sql', 'none']);

const ALLOWED_REASON_CODES = new Set([
  // lane ambiguity
  'lane_ambiguous',
  'lane_signals_mixed',
  'lane_signals_weak',

  // sacred violations
  'violates_sacred_stage_count',
  'violates_sacred_stage_order',
  'violates_sacred_gate_authority',
  'violates_sacred_gate_bypassability',

  // redundancy
  'redundant_with_existing_sds_high',
  'redundant_with_existing_sds_medium',

  // quality/evidence
  'insufficient_impact_relative_to_complexity',
  'speculative_without_evidence',
  'missing_or_weak_acceptance_criteria',
  'misalignment_with_vision_v2_principles',
  'spec_reference_missing_or_invalid',

  // extraction
  'extraction_failed'
]);

function normalizeReasonCodes(codes) {
  const arr = (codes || [])
    .flatMap(c => String(c || '').split(';').map(x => x.trim()))
    .filter(Boolean);
  const filtered = arr.filter(c => ALLOWED_REASON_CODES.has(c));
  return [...new Set(filtered)];
}

// -----------------------------
// Load Vision rubric (optional)
// -----------------------------

async function loadVisionRubric() {
  const rubricPath = path.join(__dirname, '..', 'docs', 'vision', 'rubric.yaml');
  try {
    const raw = await fs.readFile(rubricPath, 'utf8');
    const parsed = yaml.load(raw);
    const pillars = parsed?.pillars ? Object.keys(parsed.pillars) : [];
    return { rubricPath, pillars, raw: parsed };
  } catch {
    return { rubricPath, pillars: [], raw: null };
  }
}

function tagPillars(text, pillars) {
  if (!pillars?.length) return [];
  const lower = (text || '').toLowerCase();
  const tags = [];
  for (const p of pillars) {
    if (lower.includes(p.toLowerCase())) tags.push(p);
  }
  return [...new Set(tags)];
}

// -----------------------------
// SD mapping (read-only, optional)
// -----------------------------

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url, key };
}

async function loadStrategicDirectives(envFileOverride = null) {
  // Try a small cascade of env files so SD matching is reliable.
  // We intentionally allow override=true between attempts to switch projects safely.
  const repoRoot = path.join(__dirname, '..');
  const candidates = envFileOverride
    ? [envFileOverride]
    : [
        path.join(repoRoot, '.env.uat'),
        path.join(repoRoot, '.env.staging'),
        path.join(repoRoot, '.env.test.local'),
        path.join(repoRoot, '.env.test'),
        path.join(repoRoot, '.env')
      ];

  let lastErr = null;
  for (const p of candidates) {
    if (!p || !existsSync(p)) continue;
    dotenv.config({ path: p, override: true });
    const cfg = getSupabaseConfig();
    if (!cfg) continue;

    const supabase = createClient(cfg.url, cfg.key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('id,title,description,scope,strategic_intent,rationale,sd_type,priority,status')
      .in('status', ['active', 'approved', 'in_progress']);

    if (error) {
      lastErr = error;
      continue;
    }
    const sds = data || [];
    if (sds.length > 0 || envFileOverride) {
      return { enabled: true, reason: null, sds, envUsed: p };
    }
    // If this env yields 0 rows, try next env file (unless override explicitly set).
  }

  // Fallback: parse local seed migration (read-only, no DB access required).
  const seed = await loadStrategicDirectivesFromSeedSql();
  if (seed.sds.length > 0) {
    return {
      enabled: true,
      reason: null,
      sds: seed.sds,
      envUsed: `local_seed_sql:${seed.seedPath}`
    };
  }

  if (lastErr) {
    return { enabled: false, reason: `Supabase query failed (after env attempts): ${lastErr.message}`, sds: [], envUsed: null };
  }
  return { enabled: false, reason: 'Missing/invalid Supabase env (tried .env.uat/.env.staging/.env.test.local/.env.test/.env)', sds: [], envUsed: null };
}

async function loadStrategicDirectivesFromSeedSql() {
  const seedPath = path.join(__dirname, '..', 'database', 'migrations', '20251213_vision_v2_reset_and_seed.sql');
  try {
    const raw = await fs.readFile(seedPath, 'utf8');
    const text = normalizeNewlines(raw);

    const sds = [];
    const insertRe = /INSERT INTO public\.strategic_directives_v2\s*\([\s\S]*?\)\s*VALUES\s*\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,/g;
    let m;
    while ((m = insertRe.exec(text)) !== null) {
      const id = m[1];
      const sd_key = m[2];
      const title = m[3];
      sds.push({
        id,
        title,
        description: '',
        scope: '',
        strategic_intent: '',
        rationale: '',
        sd_type: '',
        priority: '',
        status: ''
      });
      // Safety: cap in case of accidental runaway regex
      if (sds.length > 5000) break;
    }
    return { seedPath, sds };
  } catch {
    return { seedPath, sds: [] };
  }
}

function matchSd(recText, sds) {
  if (!sds?.length) return null;
  const recTokens = new Set(tokenize(recText));
  if (recTokens.size === 0) return null;

  let best = null;
  for (const sd of sds) {
    const blob = [sd.title, sd.description, sd.scope, sd.strategic_intent, sd.rationale].filter(Boolean).join(' ');
    const sdTokens = new Set(tokenize(blob));
    const score = jaccard(recTokens, sdTokens);
    if (!best || score > best.score) {
      best = { id: sd.id, title: sd.title, score, sd_type: sd.sd_type, priority: sd.priority, status: sd.status };
    }
  }
  if (!best) return null;
  return {
    sd_best_match_id: best.id,
    sd_best_match_title: best.title,
    sd_best_match_score: Number(best.score.toFixed(4)),
    sd_best_match_reason: best.score >= 0.25 ? 'token_overlap_high' : best.score >= 0.15 ? 'token_overlap_medium' : 'token_overlap_low'
  };
}

// -----------------------------
// Parsing: segments, personas, items, debt
// -----------------------------

function splitIntoSegments(rawText) {
  const text = normalizeNewlines(rawText);
  const cleaned = stripMarkdownCodeFences(text);
  const marker = 'SPEC-ALIGNED STRATEGIC SYNTHESIS & NEXT STEPS';
  const idxs = [];
  let i = 0;
  while (true) {
    const idx = cleaned.indexOf(marker, i);
    if (idx === -1) break;
    idxs.push(idx);
    i = idx + marker.length;
  }
  if (idxs.length === 0) return [{ segmentIndex: 0, text: cleaned }];

  const segments = [];
  for (let s = 0; s < idxs.length; s++) {
    const start = idxs[s];
    const end = s + 1 < idxs.length ? idxs[s + 1] : cleaned.length;
    segments.push({ segmentIndex: s, text: cleaned.slice(start, end) });
  }
  return segments;
}

function sectionText(segment, heading) {
  // heading like "### 2) Professional Persona Lenses Applied"
  const text = segment;
  const idx = text.indexOf(heading);
  if (idx === -1) return null;
  const rest = text.slice(idx + heading.length);
  // next heading "### " or end
  const next = rest.search(/\n###\s+\d+\)\s+/);
  return safeTrim(next === -1 ? rest : rest.slice(0, next));
}

function parseInputClassification(segText) {
  const sec = sectionText(segText, '### 0) Input Classification');
  if (!sec) return {};
  const lines = sec.split('\n').map(l => l.trim());
  const detectedLine = lines.find(l => l.toLowerCase().includes('detected input type'));
  const sourceLine = lines.find(l => l.toLowerCase().startsWith('- **source:**'.toLowerCase()));
  const domainLine = lines.find(l => l.toLowerCase().startsWith('- **domain focus:**'.toLowerCase()));
  const detectedInputType = detectedLine ? safeTrim(detectedLine.split(':').slice(1).join(':')).replace(/\*\*/g, '').trim() : null;
  const source = sourceLine ? safeTrim(sourceLine.split(':').slice(1).join(':')).replace(/\*\*/g, '').trim() : null;
  const domainFocus = domainLine ? safeTrim(domainLine.split(':').slice(1).join(':')).replace(/\*\*/g, '').trim() : null;
  const url = extractUrl(source);
  return { detected_input_type: detectedInputType, source: source, source_url: url, domain_focus: domainFocus };
}

function parseRelevanceConfidence(segText) {
  const sec = sectionText(segText, '### 1) EHG Relevance & Confidence');
  if (!sec) return {};
  const lines = sec.split('\n').map(l => l.trim()).filter(Boolean);
  const relLine = lines.find(l => l.toLowerCase().startsWith('- **relevance:**'));
  const confLine = lines.find(l => l.toLowerCase().startsWith('- **confidence:**'));
  return {
    relevance: relLine ? parseLikert(relLine) : null,
    confidence: confLine ? parseLikert(confLine) : null
  };
}

function parsePersonas(segText) {
  const sec = sectionText(segText, '### 2) Professional Persona Lenses Applied');
  if (!sec) return [];
  const lines = sec.split('\n');

  const personas = [];
  let current = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const personaMatch = line.match(/^\*\*Persona:\s*(.+?)\*\*$/);
    if (personaMatch) {
      if (current) personas.push(current);
      current = { persona: safeTrim(personaMatch[1]), notes: {} };
      continue;
    }

    if (!current) continue;
    const bulletMatch = line.match(/^-+\s*\*\*([^*]+)\*\*:\s*(.+)$/);
    if (bulletMatch) {
      const k = safeTrim(bulletMatch[1]).toLowerCase();
      const v = safeTrim(bulletMatch[2]);
      if (k.includes('key observations')) current.notes.key_observations = v;
      else if (k.includes('risks')) current.notes.risks = v;
      else if (k.includes('risks / failure')) current.notes.risks = v;
      else if (k.includes('strategic opportunities')) current.notes.opportunities = v;
      else current.notes[toSlugSafe(k)] = v;
      continue;
    }

    // continuation lines (rare)
    if (current) {
      current.notes._freeform = (current.notes._freeform ? `${current.notes._freeform}\n` : '') + line;
    }
  }
  if (current) personas.push(current);
  return personas;
}

function parseSpecDebt(segText) {
  const sec = sectionText(segText, '### 7) NOT SPECIFIED — Spec Debt Register');
  if (!sec) return [];
  const lines = sec.split('\n').map(l => l.trim()).filter(Boolean);
  const debts = [];
  let cur = null;
  for (const line of lines) {
    const m1 = line.match(/^-+\s*\*\*Missing Definition:\*\*\s*(.+)$/i);
    const m2 = line.match(/^-+\s*\*\*Where to Define It:\*\*\s*(.+)$/i);
    const m3 = line.match(/^-+\s*\*\*Why It Matters:\*\*\s*(.+)$/i);
    if (m1) {
      if (cur) debts.push(cur);
      cur = { missing_definition: safeTrim(m1[1]), where_to_define: null, why_it_matters: null };
      continue;
    }
    if (!cur) {
      // fallback: treat bullet as standalone missing def
      const fallback = line.replace(/^-+\s*/g, '');
      debts.push({ missing_definition: fallback, where_to_define: null, why_it_matters: null });
      continue;
    }
    if (m2) {
      cur.where_to_define = safeTrim(m2[1]);
      continue;
    }
    if (m3) {
      cur.why_it_matters = safeTrim(m3[1]);
      continue;
    }
    // continuation
    cur.why_it_matters = cur.why_it_matters ? `${cur.why_it_matters} ${line}` : line;
  }
  if (cur) debts.push(cur);
  return debts;
}

function parseItemsBlock(segText) {
  const sec = sectionText(segText, '### 3) Spec-Level Impact Analysis');
  if (!sec) return [];
  const lines = sec.split('\n');

  const BULLET_RE = /^[\s]*[-*\u2013\u2014]+\s*/; // -, *, – (en dash), — (em dash)
  const ITEM_RE = /^\*\*Item\s+(\d+)\s+—\s+(.+?)\*\*$/;
  const FIELD_RE = /^[\s]*[-*\u2013\u2014]+\s*(?:\*\*)?([^:*]+?)(?:\*\*)?\s*:\s*(.+)\s*$/;

  const labelNorm = s =>
    safeTrim(String(s || ''))
      .replace(/[`*_]/g, '')
      .toLowerCase()
      .replace(/\(s\)/g, 's')
      .replace(/\s+/g, ' ')
      .trim();

  const labelToKey = label => {
    const k = labelNorm(label);
    if (!k) return null;
    if (k.startsWith('affected spec') || k === 'affected specs' || k === 'affected spec') return 'affected_specs';
    if (k.startsWith('proposed change') || k === 'proposed change' || k === 'change proposed') return 'proposed_change';
    if (k === 'rationale' || k.startsWith('rationale')) return 'rationale';
    if (k.startsWith('risk mitigated') || k.startsWith('risk addressed') || k.startsWith('risk reduced')) return 'risk_mitigated';
    if (k.startsWith('acceptance criteria') || k.startsWith('acceptance criterion')) return 'acceptance_criteria';
    return null;
  };

  const splitSpecs = value => {
    const cleaned = safeTrim(String(value || '')).replace(/`/g, '');
    if (!cleaned) return [];
    return cleaned
      .split(/[;,]/g)
      .map(s => s.trim())
      .filter(Boolean);
  };

  const items = [];
  let cur = null;
  let lastKey = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const itemHeader = line.match(ITEM_RE);
    if (itemHeader) {
      if (cur) items.push(cur);
      cur = {
        item_number: Number(itemHeader[1]),
        title: safeTrim(itemHeader[2]),
        affected_specs: [],
        proposed_change: null,
        rationale: null,
        risk_mitigated: null,
        acceptance_criteria: null,
        raw_lines: []
      };
      lastKey = null;
      continue;
    }
    if (!cur) continue;

    cur.raw_lines.push(line);

    // Field line: tolerate bullet markers, bold/no-bold, spacing variants
    const field = raw.match(FIELD_RE);
    if (field) {
      const label = safeTrim(field[1]);
      const value = safeTrim(field[2]);
      const key = labelToKey(label);
      if (!key) {
        lastKey = null;
        continue;
      }
      lastKey = key;
      if (key === 'affected_specs') cur.affected_specs.push(...splitSpecs(value));
      else if (key === 'proposed_change') cur.proposed_change = value;
      else if (key === 'rationale') cur.rationale = value;
      else if (key === 'risk_mitigated') cur.risk_mitigated = value;
      else if (key === 'acceptance_criteria') cur.acceptance_criteria = value;
      continue;
    }

    // Continuation line: append to previous captured field when appropriate.
    if (lastKey && !BULLET_RE.test(raw) && !ITEM_RE.test(line)) {
      const add = safeTrim(line);
      if (!add) continue;
      if (lastKey === 'affected_specs') cur.affected_specs.push(...splitSpecs(add));
      else if (lastKey === 'proposed_change') cur.proposed_change = cur.proposed_change ? `${cur.proposed_change} ${add}` : add;
      else if (lastKey === 'rationale') cur.rationale = cur.rationale ? `${cur.rationale} ${add}` : add;
      else if (lastKey === 'risk_mitigated') cur.risk_mitigated = cur.risk_mitigated ? `${cur.risk_mitigated} ${add}` : add;
      else if (lastKey === 'acceptance_criteria') cur.acceptance_criteria = cur.acceptance_criteria ? `${cur.acceptance_criteria} ${add}` : add;
    }
  }
  if (cur) items.push(cur);

  // Normalize affected_specs (dedupe, trim, drop empties)
  for (const it of items) {
    const cleaned = (it.affected_specs || [])
      .map(s => safeTrim(String(s || '')).replace(/`/g, ''))
      .filter(Boolean);
    it.affected_specs = [...new Set(cleaned)];
  }

  return items;
}

function parseTopNextSteps(segText) {
  const sec = sectionText(segText, '### 6) Top 3 Prioritized Next Steps');
  if (!sec) return [];
  const lines = sec.split('\n').map(l => l.trim());
  const steps = [];
  for (const line of lines) {
    const m = line.match(/^\d+\.\s+(.*)$/);
    if (m) steps.push(safeTrim(m[1]));
  }
  return steps;
}

function parseConcreteBuildArtifacts(segText) {
  const sec = sectionText(segText, '### 5) Concrete Build Artifacts');
  if (!sec) return [];
  const lines = sec.split('\n').map(l => l.trim()).filter(Boolean);
  const bullets = [];
  for (const line of lines) {
    const m = line.match(/^-+\s*(.+)$/);
    if (m) bullets.push(safeTrim(m[1]));
  }
  return bullets;
}

function kindCode(kind) {
  if (kind === 'spec_impact') return 'SI';
  if (kind === 'next_step') return 'NS';
  if (kind === 'concrete_artifact') return 'CA';
  if (kind === 'extraction_error') return 'XE';
  return 'UN';
}

function buildRecId({ fileNumber, segmentIndex1, recKind, withinKindIndex2 }) {
  const FF = String(fileNumber).padStart(2, '0');
  const SS = String(segmentIndex1).padStart(2, '0');
  const KK = kindCode(recKind);
  const II = String(withinKindIndex2).padStart(2, '0');
  return `REC-20251213-${FF}-${SS}-${KK}-${II}`;
}

function extractReferencedStages(text) {
  const stages = new Set();
  const re = /\bStage\s+(\d+)\b/g;
  let m;
  while ((m = re.exec(text || '')) !== null) {
    stages.add(Number(m[1]));
  }
  return [...stages].sort((a, b) => a - b);
}

// -----------------------------
// Lane classification
// -----------------------------

function classifyLane(rec) {
  const affectedSpecsText = Array.isArray(rec.affected_specs) ? rec.affected_specs.join(' ') : String(rec.affected_specs || '');
  const blob = [
    rec.recommendation_title,
    rec.recommendation_description,
    rec.rationale,
    rec.acceptance_criteria,
    affectedSpecsText,
    rec.raw_excerpt
  ].filter(Boolean).join(' ');
  const lower = blob.toLowerCase();

  // Deterministic v1 keyword scoring. Only use needs_review when neither keyword set triggers.
  const osKeywords = [
    'eva',
    'leo',
    'governance',
    'stage',
    'crew',
    'rubric',
    'specs',
    'spec',
    'schema',
    'prd',
    'backlog',
    'ui components',
    'ui component',
    'component',
    'agent runtime',
    'runtime',
    'policy',
    'orchestration'
  ];
  const ventureKeywords = [
    'customer',
    'market',
    'niche',
    'pricing',
    'offer',
    'distribution',
    'gtm',
    'venture',
    'blueprint',
    'signal',
    'opportunity',
    'growth',
    'sales'
  ];

  const countHits = keywords => {
    let hits = 0;
    for (const k of keywords) {
      const needle = String(k || '').toLowerCase();
      if (!needle) continue;
      if (needle.includes(' ')) {
        if (lower.includes(needle)) hits++;
      } else {
        const re = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i');
        if (re.test(lower)) hits++;
      }
    }
    return hits;
  };

  const osHits = countHits(osKeywords);
  const ventureHits = countHits(ventureKeywords);

  if (osHits === 0 && ventureHits === 0) {
    return {
      lane: 'needs_review',
      lane_confidence: 'low',
      lane_rationale: 'no_clear_signals',
      reason_codes: ['lane_ambiguous', 'lane_signals_weak']
    };
  }

  // Tie-breaker (avoid needs_review when both trigger)
  if (osHits === ventureHits) {
    const hasStrongOs = /\b(eva|leo|governance|schema|specs?)\b/i.test(lower) || /docs\/vision\/specs\/\d{2}-/i.test(lower);
    const lane = hasStrongOs ? 'os_improvement' : 'venture_candidate';
    return {
      lane,
      lane_confidence: 'low',
      lane_rationale: `tie_break(os=${osHits},venture=${ventureHits})`,
      reason_codes: ['lane_signals_mixed']
    };
  }

  if (osHits > ventureHits) {
    return {
      lane: 'os_improvement',
      lane_confidence: osHits >= 3 ? 'high' : 'medium',
      lane_rationale: `os_keywords(${osHits})>venture_keywords(${ventureHits})`,
      reason_codes: []
    };
  }

  return {
    lane: 'venture_candidate',
    lane_confidence: ventureHits >= 3 ? 'high' : 'medium',
    lane_rationale: `venture_keywords(${ventureHits})>os_keywords(${osHits})`,
    reason_codes: []
  };
}

// -----------------------------
// Disposition evaluation (advance/park/reject)
// -----------------------------

function hasSacredConstraintViolation(text) {
  const t = (text || '').toLowerCase();
  // If the text explicitly affirms immutability, don't treat it as a violation.
  if (t.includes('25-stage workflow') && (t.includes('immutable') || t.includes('sacred') || t.includes('fixed'))) {
    return false;
  }

  // Sacred constraints (per user clarification):
  // - Allowed: improving tools/artifacts/agents/rubrics/automation WITHIN a stage
  // - Forbidden: changing the NUMBER, ORDER, gating authority, or bypassability of the 25 stages
  //
  // We only flag when the text suggests changing those sacred properties.
  const violationPatterns = [
    // Stage count / adding/removing stages
    /\b(add|adding|introduce|introducing|create|creating)\b[^.\n]{0,80}\b(new|extra|additional)\b[^.\n]{0,40}\bstage\b/,
    /\b(remove|removing|delete|deleting|drop|dropping)\b[^.\n]{0,80}\bstage\b/,
    /\b(stages?\s+)(26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43|44|45|46|47|48|49|50|51|52)\b/,
    /\bchange\b[^.\n]{0,80}\b(25[-\s]?stage|number of stages)\b/,

    // Stage order / sequencing
    /\b(reorder|re-order|reordering|change\s+order|change\s+ordering|alter\s+sequence|sequence\s+change)\b[^.\n]{0,80}\bstage\b/,

    // Gating authority changes (who decides / gate type changes)
    /\b(change|alter|modify)\b[^.\n]{0,80}\b(gate|gating)\b[^.\n]{0,80}\b(type|authority|ownership|decision)\b/,
    /\b(auto[-\s]?advance|advisory_checkpoint|hard_gate)\b[^.\n]{0,120}\b(change|alter|replace|remove|add)\b/,
    /\b(make|making)\b[^.\n]{0,80}\b(stage)\b[^.\n]{0,80}\b(hard\s*gate|advisory\s*checkpoint|auto[-\s]?advance)\b/,

    // Bypassability changes (skipping gates, bypassing Chairman decisions)
    /\b(bypass|bypassing|skip|skipping)\b[^.\n]{0,80}\b(gate|gating|checkpoint|chairman\s+approval|chairman\s+decision)\b/,
    /\b(no\s+longer\s+require)\b[^.\n]{0,120}\b(chairman\s+approval|chairman\s+decision)\b/,
    /\b(eva)\b[^.\n]{0,60}\b(can|may|should|will)\b[^.\n]{0,80}\b(advance|promote)\b[^.\n]{0,80}\b(without)\b[^.\n]{0,80}\b(chairman)\b/
  ];

  return violationPatterns.some(re => re.test(t));
}

function estimateImpactScore(rec) {
  // 1..5
  const rel = (rec.relevance || '').toLowerCase();
  let score = rel === 'high' ? 4 : rel === 'medium' ? 3 : rel === 'low' ? 2 : 2;

  const hasAC = Boolean((rec.acceptance_criteria || '').trim());
  const hasRisk = Boolean((rec.risk_mitigated || '').trim());
  const hasRationale = Boolean((rec.rationale || '').trim());
  if (hasAC) score += 1;
  if (hasRisk) score += 1;
  if (!hasRationale) score -= 1;
  if (score < 1) score = 1;
  if (score > 5) score = 5;
  return score;
}

function estimateComplexityScore(rec) {
  // 1..5 (heuristic)
  const blob = [
    rec.recommendation_title,
    rec.recommendation_description,
    rec.rationale,
    rec.affected_specs
  ].filter(Boolean).join(' ').toLowerCase();

  let score = 1;

  // number of affected docs hints breadth
  const affected = String(rec.affected_specs || '')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);
  if (affected.length >= 2) score += 1;
  if (affected.length >= 4) score += 1;

  const highComplexitySignals = [
    'database', 'migration', 'rls', 'security definer', 'agent runtime', 'lease', 'idempot',
    'model_registry', 'routing', 'multi-instance', 'failover', 'circuit breaker', 'schema',
    'orchestration', 'distributed tracing', 'correlation_id', 'policy engine', 'supabase'
  ];
  const signalHits = highComplexitySignals.filter(k => blob.includes(k)).length;
  if (signalHits >= 2) score += 1;
  if (signalHits >= 5) score += 1;

  if (score < 1) score = 1;
  if (score > 5) score = 5;
  return score;
}

function evaluateDisposition(rec, cfg) {
  const blob = [
    rec.recommendation_title,
    rec.recommendation_description,
    rec.rationale,
    rec.acceptance_criteria,
    rec.affected_specs,
    rec.raw_excerpt
  ].filter(Boolean).join(' ');

  const constraintFlags = [];
  // Expand to explicit sacred violation flags (best effort from regex buckets).
  if (hasSacredConstraintViolation(blob)) {
    // If we can detect specific class, emit granular flags; else use gate_bypassability as safest bucket.
    const t = blob.toLowerCase();
    if (/\b(stages?\s+)(26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43|44|45|46|47|48|49|50|51|52)\b/.test(t) || /\b(new|additional)\b[^.\n]{0,40}\bstage\b/.test(t)) {
      constraintFlags.push('sacred_violation_stage_count');
    } else if (/\b(reorder|re-order|reordering|change\s+order|change\s+ordering|alter\s+sequence|sequence\s+change)\b/.test(t)) {
      constraintFlags.push('sacred_violation_stage_order');
    } else if (/\b(change|alter|modify)\b[^.\n]{0,80}\b(gate|gating)\b[^.\n]{0,80}\b(type|authority|ownership|decision)\b/.test(t)) {
      constraintFlags.push('sacred_violation_gate_authority');
    } else {
      constraintFlags.push('sacred_violation_gate_bypassability');
    }
  }

  const impact = estimateImpactScore(rec);
  const complexity = estimateComplexityScore(rec);

  const sdScore = Number(rec.sd_best_match_score || 0);
  const redundancyHigh = sdScore >= (cfg?.redundancy_thresholds?.high ?? 0.32);
  const redundancyMedium = sdScore >= (cfg?.redundancy_thresholds?.medium ?? 0.22) && !redundancyHigh;
  const redundancyDecisive = rec.sd_best_match_method === 'db' && rec.sd_best_match_confidence !== 'low';

  const reasonCodes = [];
  const rationaleParts = [];

  if (constraintFlags.length) {
    for (const f of constraintFlags) {
      if (f === 'sacred_violation_stage_count') reasonCodes.push('violates_sacred_stage_count');
      if (f === 'sacred_violation_stage_order') reasonCodes.push('violates_sacred_stage_order');
      if (f === 'sacred_violation_gate_authority') reasonCodes.push('violates_sacred_gate_authority');
      if (f === 'sacred_violation_gate_bypassability') reasonCodes.push('violates_sacred_gate_bypassability');
    }
    rationaleParts.push('Rejected: alters sacred 25-stage lifecycle properties (count/order/gating/bypassability).');
    return {
      disposition: 'reject',
      disposition_confidence: 'high',
      disposition_rationale: rationaleParts.join(' '),
      reason_codes: reasonCodes,
      rejection_reason_codes: reasonCodes,
      constraint_flags: constraintFlags.join('; '),
      impact_score: impact,
      complexity_score: complexity
    };
  }

  // Redundancy: treat as "park" by default (not auto-reject), unless it’s low-value.
  if (redundancyHigh) {
    reasonCodes.push('redundant_with_existing_sds_high');
    rationaleParts.push(`High overlap with SD (${rec.sd_best_match_id || 'unknown'}) via ${rec.sd_best_match_method}.`);
  } else if (redundancyMedium) {
    reasonCodes.push('redundant_with_existing_sds_medium');
    rationaleParts.push(`Medium overlap with SD (${rec.sd_best_match_id || 'unknown'}) via ${rec.sd_best_match_method}.`);
  }

  const hasAC = Boolean((rec.acceptance_criteria || '').trim());
  const conf = (rec.confidence || '').toLowerCase();
  if (!hasAC && (conf === 'low' || conf === 'medium')) {
    reasonCodes.push('missing_or_weak_acceptance_criteria');
    rationaleParts.push('Missing/weak acceptance criteria (harder to implement safely).');
  }

  // Primary decision logic by lane.
  if (rec.lane === 'venture_candidate') {
    if (impact >= 4 && complexity <= 3 && !(redundancyHigh && redundancyDecisive)) {
      return {
        disposition: 'advance_to_blueprint',
        disposition_confidence: 'medium',
        disposition_rationale: (rationaleParts.length ? rationaleParts.join(' ') + ' ' : '') + 'High relevance with manageable complexity for blueprint lane.',
        reason_codes: reasonCodes,
        rejection_reason_codes: [],
        constraint_flags: '',
        impact_score: impact,
        complexity_score: complexity
      };
    }
    if (impact <= 2 && complexity >= 4) {
      reasonCodes.push('insufficient_impact_relative_to_complexity');
      return {
        disposition: 'reject',
        disposition_confidence: 'medium',
        disposition_rationale: (rationaleParts.length ? rationaleParts.join(' ') + ' ' : '') + 'Low impact relative to complexity.',
        reason_codes: reasonCodes,
        rejection_reason_codes: reasonCodes,
        constraint_flags: '',
        impact_score: impact,
        complexity_score: complexity
      };
    }
    return {
      disposition: 'park_for_later',
      disposition_confidence: redundancyHigh && !redundancyDecisive ? 'low' : 'low',
      disposition_rationale: (rationaleParts.length ? rationaleParts.join(' ') + ' ' : '') + 'Park pending stronger evidence/clearer blueprint framing.',
      reason_codes: reasonCodes,
      rejection_reason_codes: [],
      constraint_flags: '',
      impact_score: impact,
      complexity_score: complexity
    };
  }

  if (rec.lane === 'os_improvement') {
    // IMPORTANT safeguard: only treat redundancy_high as decisive if db-based and confidence!=low.
    if (redundancyHigh && redundancyDecisive) {
      return {
        disposition: 'park_for_later',
        disposition_confidence: 'medium',
        disposition_rationale: (rationaleParts.length ? rationaleParts.join(' ') + ' ' : '') + 'Already covered by an existing SD; park to avoid duplicate pipeline work.',
        reason_codes: reasonCodes,
        rejection_reason_codes: [],
        constraint_flags: '',
        impact_score: impact,
        complexity_score: complexity
      };
    }
    if (impact >= 4 && complexity <= 4) {
      return {
        disposition: 'advance_to_sd_pipeline',
        disposition_confidence: redundancyHigh && !redundancyDecisive ? 'low' : 'medium',
        disposition_rationale: (rationaleParts.length ? rationaleParts.join(' ') + ' ' : '') + 'Actionable OS improvement with sufficient impact.',
        reason_codes: reasonCodes,
        rejection_reason_codes: [],
        constraint_flags: '',
        impact_score: impact,
        complexity_score: complexity
      };
    }
    if (impact <= 2 && complexity >= 4) {
      reasonCodes.push('insufficient_impact_relative_to_complexity');
      return {
        disposition: 'reject',
        disposition_confidence: 'medium',
        disposition_rationale: (rationaleParts.length ? rationaleParts.join(' ') + ' ' : '') + 'Low impact relative to complexity.',
        reason_codes: reasonCodes,
        rejection_reason_codes: reasonCodes,
        constraint_flags: '',
        impact_score: impact,
        complexity_score: complexity
      };
    }
    return {
      disposition: 'park_for_later',
      disposition_confidence: 'low',
      disposition_rationale: (rationaleParts.length ? rationaleParts.join(' ') + ' ' : '') + 'Park pending clearer impact and implementation scope.',
      reason_codes: reasonCodes,
      rejection_reason_codes: [],
      constraint_flags: '',
      impact_score: impact,
      complexity_score: complexity
    };
  }

  // needs_review lane: force a real outcome (park or reject).
  if (impact <= 2 && complexity >= 4) {
    reasonCodes.push('insufficient_impact_relative_to_complexity');
    return {
      disposition: 'reject',
      disposition_confidence: 'low',
      disposition_rationale: (rationaleParts.length ? rationaleParts.join(' ') + ' ' : '') + 'Unclear fit plus low impact vs high complexity.',
      reason_codes: reasonCodes,
      rejection_reason_codes: reasonCodes,
      constraint_flags: '',
      impact_score: impact,
      complexity_score: complexity
    };
  }

  return {
    disposition: 'park_for_later',
    disposition_confidence: 'low',
    disposition_rationale: (rationaleParts.length ? rationaleParts.join(' ') + ' ' : '') + 'Unclear lane fit; park pending clarification.',
    reason_codes: reasonCodes,
    rejection_reason_codes: [],
    constraint_flags: '',
    impact_score: impact,
    complexity_score: complexity
  };
}

function linkPersonasToRec(personas, text) {
  const all = (personas || []).map(p => p.persona).filter(Boolean);
  if (all.length === 0) return { persona_refs: '', persona_link_confidence: 'low' };

  const t = (text || '').toLowerCase();
  const matched = [];

  for (const name of all) {
    const n = name.toLowerCase();
    const core = n.replace(/\(.*?\)/g, '').trim();
    if (core && t.includes(core)) matched.push(name);
  }

  // VP/role heuristic (deterministic)
  const roleHints = [
    { hint: 'vp_tech', matches: ['vp_tech', 'vp tech', 'system architect', 'platform architect', 'agent runtime', 'database'] },
    { hint: 'vp_growth', matches: ['vp_growth', 'vp growth', 'gtm', 'marketing', 'launch', 'distribution', 'seo', 'aeo'] },
    { hint: 'vp_product', matches: ['vp_product', 'vp product', 'brand', 'naming', 'ux', 'ui', 'storytelling'] },
    { hint: 'vp_strategy', matches: ['vp_strategy', 'vp strategy', 'market validation', 'strategy', 'competitive'] }
  ];
  for (const rh of roleHints) {
    if (rh.matches.some(m => t.includes(m))) {
      for (const name of all) {
        if (name.toLowerCase().includes(rh.hint) && !matched.includes(name)) matched.push(name);
      }
    }
  }

  if (matched.length > 0) {
    return { persona_refs: [...new Set(matched)].join('; '), persona_link_confidence: 'medium' };
  }
  return { persona_refs: all.join('; '), persona_link_confidence: 'low' };
}

// -----------------------------
// Dedupe (within folder only)
// -----------------------------

function recSimilarity(a, b) {
  const affectedA = Array.isArray(a.affected_specs) ? a.affected_specs.join(' ') : String(a.affected_specs || '');
  const affectedB = Array.isArray(b.affected_specs) ? b.affected_specs.join(' ') : String(b.affected_specs || '');
  const blobA = [
    a.recommendation_title,
    a.recommendation_description,
    a.acceptance_criteria,
    affectedA
  ].filter(Boolean).join(' ');
  const blobB = [
    b.recommendation_title,
    b.recommendation_description,
    b.acceptance_criteria,
    affectedB
  ].filter(Boolean).join(' ');
  const setA = new Set(tokenize(blobA));
  const setB = new Set(tokenize(blobB));
  return jaccard(setA, setB);
}

function buildDedupeKey(rec) {
  const affected = Array.isArray(rec.affected_specs)
    ? rec.affected_specs
    : String(rec.affected_specs || '')
        .split(';')
        .map(s => s.trim())
        .filter(Boolean);
  const s = [
    affected.map(x => x.toLowerCase()).sort().join('|'),
    (rec.recommendation_title || '').toLowerCase(),
    (rec.recommendation_description || '').toLowerCase()
  ].join('||');
  return sha1(s);
}

function dedupeRecs(recs, threshold = 0.86) {
  // Bucket by cheap hash first; then similarity within bucket and adjacent buckets by title tokens
  const buckets = new Map();
  for (const r of recs) {
    const key = buildDedupeKey(r).slice(0, 10);
    const arr = buckets.get(key) || [];
    arr.push(r);
    buckets.set(key, arr);
  }

  // Also add a secondary bucket by first 2 tokens of title to catch near-matches.
  const titleBuckets = new Map();
  for (const r of recs) {
    const toks = tokenize(r.recommendation_title || '').slice(0, 2).join('_') || 'none';
    const arr = titleBuckets.get(toks) || [];
    arr.push(r);
    titleBuckets.set(toks, arr);
  }

  // Union-find-ish via primary map
  const primaryById = new Map();
  const groups = [];

  // Deterministic order: by rec_id
  const sorted = [...recs].sort((a, b) => a.rec_id.localeCompare(b.rec_id));

  const visited = new Set();
  for (const r of sorted) {
    if (visited.has(r.rec_id)) continue;
    const group = [r];
    visited.add(r.rec_id);

    const candidates = new Map();
    const b1 = buckets.get(buildDedupeKey(r).slice(0, 10)) || [];
    for (const c of b1) candidates.set(c.rec_id, c);
    const tkey = tokenize(r.recommendation_title || '').slice(0, 2).join('_') || 'none';
    const b2 = titleBuckets.get(tkey) || [];
    for (const c of b2) candidates.set(c.rec_id, c);

    for (const c of candidates.values()) {
      if (visited.has(c.rec_id) || c.rec_id === r.rec_id) continue;
      const sim = recSimilarity(r, c);
      if (sim >= threshold) {
        visited.add(c.rec_id);
        // Store similarity deterministically without leaking internal fields into output schema.
        c.similarity_to_primary = sim.toFixed(4);
        group.push(c);
      }
    }
    groups.push(group.sort((a, b) => a.rec_id.localeCompare(b.rec_id)));
  }

  // Assign dedupe metadata
  let gnum = 0;
  for (const group of groups.sort((a, b) => a[0].rec_id.localeCompare(b[0].rec_id))) {
    gnum++;
    const primary = group[0];
    const groupId = `DEDUP-20251213-${String(gnum).padStart(4, '0')}`;
    for (const member of group) {
      member.dedupe_group_id = groupId;
      if (member.rec_id === primary.rec_id) {
        member.dedupe_status = 'primary';
        member.duplicates_of = '';
        member.similarity_to_primary = '';
      } else {
        member.dedupe_status = 'duplicate';
        member.duplicates_of = primary.rec_id;
        // similarity_to_primary already set during grouping; keep empty if somehow missing
        member.similarity_to_primary = member.similarity_to_primary || '';
      }
    }
    primaryById.set(primary.rec_id, primary);
  }

  return recs;
}

// -----------------------------
// File discovery
// -----------------------------

async function listTxtFiles(inputDir) {
  const entries = await fs.readdir(inputDir, { withFileTypes: true });
  const files = entries
    .filter(e => e.isFile() && /^\d+\.txt$/i.test(e.name))
    .map(e => e.name)
    .sort((a, b) => {
      const na = Number(a.replace(/\.txt$/i, ''));
      const nb = Number(b.replace(/\.txt$/i, ''));
      return na - nb;
    });
  return files.map(name => ({ name, num: Number(name.replace(/\.txt$/i, '')) }));
}

// -----------------------------
// Spec/vision doc existence validation
// -----------------------------

function normalizeSpecRef(ref) {
  // Accept things like `01-database-schema.md` or `docs/vision/specs/01-database-schema.md`
  const r = (ref || '').replace(/`/g, '').trim();
  if (!r) return null;
  if (r.includes('docs/vision/specs/')) return r.slice(r.indexOf('docs/vision/specs/'));
  if (r.includes('docs/vision/')) return r.slice(r.indexOf('docs/vision/'));
  if (r.endsWith('.md')) {
    // Heuristic: if it looks like a spec file (NN-...) treat as specs; else treat as vision root
    if (/^\d{2}-/.test(r) || r.includes('specs')) return `docs/vision/specs/${r.replace(/^specs\//, '')}`;
    if (r.toLowerCase().includes('vision_v2') || r.toLowerCase().includes('chairman')) return `docs/vision/${r}`;
  }
  return r;
}

function validateSpecRefs(specRefs) {
  const exists = [];
  const missing = [];
  for (const ref of specRefs || []) {
    const norm = normalizeSpecRef(ref);
    if (!norm) continue;
    const abs = path.join(__dirname, '..', norm);
    if (existsSync(abs)) exists.push(norm);
    else missing.push(norm);
  }
  return { exists: [...new Set(exists)], missing: [...new Set(missing)] };
}

// -----------------------------
// Main extraction
// -----------------------------

async function extractRecommendationsFromFile({ inputDir, fileName, pillars, includeNextSteps, includeConcreteArtifacts }) {
  const sourcePath = path.join(inputDir, fileName);
  const raw = await fs.readFile(sourcePath, 'utf8');
  const text = normalizeNewlines(raw);
  const segments = splitIntoSegments(text);

  const fileNumber = Number(fileName.replace(/\.txt$/i, ''));
  const recs = [];

  for (const seg of segments) {
    const segText = seg.text;
    const segmentIndex1 = seg.segmentIndex + 1; // STANDARD: 1-based everywhere
    const input = parseInputClassification(segText);
    const rel = parseRelevanceConfidence(segText);
    const personas = parsePersonas(segText);
    const items = parseItemsBlock(segText);
    const nextSteps = includeNextSteps ? parseTopNextSteps(segText) : [];
    const concrete = includeConcreteArtifacts ? parseConcreteBuildArtifacts(segText) : [];
    const specDebt = parseSpecDebt(segText);

    // spec_impact uses item_number directly as index; next_step/concrete use list index.

    for (const it of items) {
      const recId = buildRecId({
        fileNumber,
        segmentIndex1,
        recKind: 'spec_impact',
        withinKindIndex2: it.item_number || 0
      });
      const affected = validateSpecRefs(it.affected_specs);
      const stageNums = extractReferencedStages([it.title, it.proposed_change, it.rationale, it.risk_mitigated, it.acceptance_criteria].filter(Boolean).join(' '));
      const personaLink = linkPersonasToRec(personas, [it.title, it.proposed_change, it.rationale, it.acceptance_criteria].filter(Boolean).join(' '));

      const base = {
        schema_version: 'ehg_master_recommendations_v1.0',
        rec_id: recId,
        rec_date: '2025-12-13',
        source_file: fileName,
        source_file_path: sourcePath,
        source_file_number: fileNumber,
        segment_index: segmentIndex1,
        detected_input_type: input.detected_input_type || '',
        source_title: input.source || '',
        source_url: input.source_url || '',
        domain_focus: input.domain_focus || '',
        relevance: rel.relevance || '',
        confidence: rel.confidence || '',
        personas: personas.map(p => p.persona).join('; '),
        persona_notes_json: JSON.stringify(personas),
        persona_refs: personaLink.persona_refs,
        persona_link_confidence: personaLink.persona_link_confidence,
        recommendation_kind: 'spec_impact',
        recommendation_title: it.title || '',
        recommendation_description: it.proposed_change || '',
        rationale: it.rationale || '',
        risk_mitigated: it.risk_mitigated || '',
        acceptance_criteria: it.acceptance_criteria || '',
        affected_specs: (it.affected_specs || []).join('; '),
        affected_docs_exist: affected.exists.join('; '),
        affected_docs_missing: affected.missing.join('; '),
        referenced_stages: stageNums.join('; '),
        vision_pillar_tags: tagPillars([it.title, it.proposed_change, it.rationale].join(' '), pillars).join('; '),
        lane: '',
        lane_confidence: '',
        lane_rationale: '',
        reason_codes: '',
        disposition: '',
        disposition_confidence: '',
        disposition_rationale: '',
        rejection_reason_codes: '',
        constraint_flags: '',
        impact_score: '',
        complexity_score: '',
        dedupe_group_id: '',
        dedupe_status: '',
        duplicates_of: '',
        similarity_to_primary: '',
        sd_best_match_id: '',
        sd_best_match_title: '',
        sd_best_match_score: '',
        sd_best_match_reason: '',
        sd_best_match_method: 'none',
        sd_best_match_confidence: 'low',
        spec_debt_json: JSON.stringify(specDebt),
        raw_excerpt: it.raw_lines.slice(0, 20).join(' | ').slice(0, 800),
        generated_at_iso: new Date().toISOString()
      };
      const lane = classifyLane(base);
      base.lane = lane.lane;
      base.lane_confidence = lane.lane_confidence;
      base.lane_rationale = lane.lane_rationale;
      base.reason_codes = normalizeReasonCodes(lane.reason_codes).join('; ');
      recs.push(base);
    }

    for (let i = 0; i < nextSteps.length; i++) {
      const step = nextSteps[i];
      const recId = buildRecId({
        fileNumber,
        segmentIndex1,
        recKind: 'next_step',
        withinKindIndex2: i + 1
      });
      const stageNums = extractReferencedStages(step);
      const personaLink = linkPersonasToRec(personas, step);
      const base = {
        schema_version: 'ehg_master_recommendations_v1.0',
        rec_id: recId,
        rec_date: '2025-12-13',
        source_file: fileName,
        source_file_path: sourcePath,
        source_file_number: fileNumber,
        segment_index: segmentIndex1,
        detected_input_type: input.detected_input_type || '',
        source_title: input.source || '',
        source_url: input.source_url || '',
        domain_focus: input.domain_focus || '',
        relevance: rel.relevance || '',
        confidence: rel.confidence || '',
        personas: personas.map(p => p.persona).join('; '),
        persona_notes_json: JSON.stringify(personas),
        persona_refs: personaLink.persona_refs,
        persona_link_confidence: personaLink.persona_link_confidence,
        recommendation_kind: 'next_step',
        recommendation_title: step.replace(/^\*\*|\*\*$/g, ''),
        recommendation_description: step,
        rationale: '',
        risk_mitigated: '',
        acceptance_criteria: '',
        affected_specs: '',
        affected_docs_exist: '',
        affected_docs_missing: '',
        referenced_stages: stageNums.join('; '),
        vision_pillar_tags: tagPillars(step, pillars).join('; '),
        lane: '',
        lane_confidence: '',
        lane_rationale: '',
        reason_codes: '',
        disposition: '',
        disposition_confidence: '',
        disposition_rationale: '',
        rejection_reason_codes: '',
        constraint_flags: '',
        impact_score: '',
        complexity_score: '',
        dedupe_group_id: '',
        dedupe_status: '',
        duplicates_of: '',
        similarity_to_primary: '',
        sd_best_match_id: '',
        sd_best_match_title: '',
        sd_best_match_score: '',
        sd_best_match_reason: '',
        sd_best_match_method: 'none',
        sd_best_match_confidence: 'low',
        spec_debt_json: JSON.stringify(specDebt),
        raw_excerpt: step.slice(0, 800),
        generated_at_iso: new Date().toISOString()
      };
      const lane = classifyLane(base);
      base.lane = lane.lane;
      base.lane_confidence = lane.lane_confidence;
      base.lane_rationale = lane.lane_rationale;
      base.reason_codes = normalizeReasonCodes(lane.reason_codes).join('; ');
      recs.push(base);
    }

    for (let i = 0; i < concrete.length; i++) {
      const bullet = concrete[i];
      const recId = buildRecId({
        fileNumber,
        segmentIndex1,
        recKind: 'concrete_artifact',
        withinKindIndex2: i + 1
      });
      const personaLink = linkPersonasToRec(personas, bullet);
      const base = {
        schema_version: 'ehg_master_recommendations_v1.0',
        rec_id: recId,
        rec_date: '2025-12-13',
        source_file: fileName,
        source_file_path: sourcePath,
        source_file_number: fileNumber,
        segment_index: segmentIndex1,
        detected_input_type: input.detected_input_type || '',
        source_title: input.source || '',
        source_url: input.source_url || '',
        domain_focus: input.domain_focus || '',
        relevance: rel.relevance || '',
        confidence: rel.confidence || '',
        personas: personas.map(p => p.persona).join('; '),
        persona_notes_json: JSON.stringify(personas),
        persona_refs: personaLink.persona_refs,
        persona_link_confidence: personaLink.persona_link_confidence,
        recommendation_kind: 'concrete_artifact',
        recommendation_title: bullet.split(':')[0] || bullet,
        recommendation_description: bullet,
        rationale: '',
        risk_mitigated: '',
        acceptance_criteria: '',
        affected_specs: '',
        affected_docs_exist: '',
        affected_docs_missing: '',
        referenced_stages: extractReferencedStages(bullet).join('; '),
        vision_pillar_tags: tagPillars(bullet, pillars).join('; '),
        lane: '',
        lane_confidence: '',
        lane_rationale: '',
        reason_codes: '',
        disposition: '',
        disposition_confidence: '',
        disposition_rationale: '',
        rejection_reason_codes: '',
        constraint_flags: '',
        impact_score: '',
        complexity_score: '',
        dedupe_group_id: '',
        dedupe_status: '',
        duplicates_of: '',
        similarity_to_primary: '',
        sd_best_match_id: '',
        sd_best_match_title: '',
        sd_best_match_score: '',
        sd_best_match_reason: '',
        sd_best_match_method: 'none',
        sd_best_match_confidence: 'low',
        spec_debt_json: JSON.stringify(specDebt),
        raw_excerpt: bullet.slice(0, 800),
        generated_at_iso: new Date().toISOString()
      };
      const lane = classifyLane(base);
      base.lane = lane.lane;
      base.lane_confidence = lane.lane_confidence;
      base.lane_rationale = lane.lane_rationale;
      base.reason_codes = normalizeReasonCodes(lane.reason_codes).join('; ');
      recs.push(base);
    }

    // If this segment had the expected framing but no items/next steps at all, emit a single extraction_error row.
    if (items.length === 0 && nextSteps.length === 0) {
      const recId = buildRecId({ fileNumber, segmentIndex1, recKind: 'extraction_error', withinKindIndex2: 0 });
      const base = {
        schema_version: 'ehg_master_recommendations_v1.0',
        rec_id: recId,
        rec_date: '2025-12-13',
        source_file: fileName,
        source_file_path: sourcePath,
        source_file_number: fileNumber,
        segment_index: segmentIndex1,
        detected_input_type: input.detected_input_type || '',
        source_title: input.source || '',
        source_url: input.source_url || '',
        domain_focus: input.domain_focus || '',
        relevance: rel.relevance || '',
        confidence: rel.confidence || '',
        personas: personas.map(p => p.persona).join('; '),
        persona_notes_json: JSON.stringify(personas),
        persona_refs: (personas || []).map(p => p.persona).filter(Boolean).join('; '),
        persona_link_confidence: (personas || []).length ? 'low' : 'low',
        recommendation_kind: 'extraction_error',
        recommendation_title: 'Extraction failed: no atomic recommendations detected',
        recommendation_description: 'No Spec-Level Impact items or Next Steps detected for this segment.',
        rationale: '',
        risk_mitigated: '',
        acceptance_criteria: '',
        affected_specs: '',
        affected_docs_exist: '',
        affected_docs_missing: '',
        referenced_stages: '',
        vision_pillar_tags: '',
        lane: 'needs_review',
        lane_confidence: 'low',
        lane_rationale: 'extraction_error',
        reason_codes: 'extraction_failed; lane_ambiguous',
        disposition: 'park_for_later',
        disposition_confidence: 'low',
        disposition_rationale: 'Park: extraction failed to identify atomic recommendations.',
        rejection_reason_codes: '',
        constraint_flags: '',
        impact_score: 2,
        complexity_score: 1,
        dedupe_group_id: '',
        dedupe_status: '',
        duplicates_of: '',
        similarity_to_primary: '',
        sd_best_match_id: '',
        sd_best_match_title: '',
        sd_best_match_score: '',
        sd_best_match_reason: '',
        sd_best_match_method: 'none',
        sd_best_match_confidence: 'low',
        spec_debt_json: JSON.stringify(specDebt),
        raw_excerpt: '',
        generated_at_iso: new Date().toISOString()
      };
      recs.push(base);
    }
  }

  return recs;
}

// -----------------------------
// Output writers
// -----------------------------

function masterColumns() {
  return [
    'schema_version',
    'rec_id',
    'rec_date',
    'source_file',
    'source_file_path',
    'source_file_number',
    'segment_index',
    'detected_input_type',
    'source_title',
    'source_url',
    'domain_focus',
    'relevance',
    'confidence',
    'personas',
    'persona_notes_json',
    'persona_refs',
    'persona_link_confidence',
    'recommendation_kind',
    'recommendation_title',
    'recommendation_description',
    'rationale',
    'risk_mitigated',
    'acceptance_criteria',
    'affected_specs',
    'affected_docs_exist',
    'affected_docs_missing',
    'referenced_stages',
    'vision_pillar_tags',
    'lane',
    'lane_confidence',
    'lane_rationale',
    'reason_codes',
    'disposition',
    'disposition_confidence',
    'disposition_rationale',
    'rejection_reason_codes',
    'constraint_flags',
    'impact_score',
    'complexity_score',
    'dedupe_group_id',
    'dedupe_status',
    'duplicates_of',
    'similarity_to_primary',
    'sd_best_match_id',
    'sd_best_match_title',
    'sd_best_match_score',
    'sd_best_match_reason',
    'sd_best_match_method',
    'sd_best_match_confidence',
    'spec_debt_json',
    'raw_excerpt',
    'generated_at_iso'
  ];
}

async function writeOutputs({ outputDir, rows, dryRun }) {
  const ts = '20251213';
  const jsonPath = path.join(outputDir, `master_recommendations_${ts}.json`);
  const csvPath = path.join(outputDir, `master_recommendations_${ts}.csv`);
  const mdPath = path.join(outputDir, `executive_summary_${ts}.md`);

  if (dryRun) return { jsonPath, csvPath, mdPath, wrote: false };

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify(rows, null, 2) + '\n', 'utf8');
  await fs.writeFile(csvPath, toCsv(rows, masterColumns()), 'utf8');

  const summary = buildExecutiveSummary(rows);
  await fs.writeFile(mdPath, summary, 'utf8');

  return { jsonPath, csvPath, mdPath, wrote: true };
}

function buildExecutiveSummary(rows) {
  const total = rows.length;
  const byLane = rows.reduce((acc, r) => {
    acc[r.lane] = (acc[r.lane] || 0) + 1;
    return acc;
  }, {});

  const byKind = rows.reduce((acc, r) => {
    acc[r.recommendation_kind] = (acc[r.recommendation_kind] || 0) + 1;
    return acc;
  }, {});

  const primaries = rows.filter(r => r.dedupe_status === 'primary');
  const byDisposition = rows.reduce((acc, r) => {
    const k = r.disposition || 'unset';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const byDispositionPrimary = primaries.reduce((acc, r) => {
    const k = r.disposition || 'unset';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const byLanePrimary = primaries.reduce((acc, r) => {
    acc[r.lane] = (acc[r.lane] || 0) + 1;
    return acc;
  }, {});

  const top = primaries
    .filter(r => r.recommendation_kind === 'spec_impact')
    .slice()
    .sort((a, b) => {
      // Heuristic: prioritize 'high' relevance then confidence then SD score
      const relRank = x => (x === 'high' ? 3 : x === 'medium' ? 2 : x === 'low' ? 1 : 0);
      const confRank = x => (x === 'high' ? 3 : x === 'medium' ? 2 : x === 'low' ? 1 : 0);
      const ar = relRank(a.relevance), br = relRank(b.relevance);
      if (br !== ar) return br - ar;
      const ac = confRank(a.confidence), bc = confRank(b.confidence);
      if (bc !== ac) return bc - ac;
      const as = Number(a.sd_best_match_score || 0), bs = Number(b.sd_best_match_score || 0);
      return bs - as;
    })
    .slice(0, 25);

  const lines = [];
  lines.push('## Executive Summary — Dec 13, 2025 Ideas (v1)');
  lines.push('');
  lines.push(`- Total extracted atomic recommendations: **${total}**`);
  lines.push(`- Dedupe primaries (unique recs): **${primaries.length}**`);
  lines.push('');
  lines.push('### By lane (all)');
  for (const k of Object.keys(byLane).sort()) lines.push(`- **${k}**: ${byLane[k]}`);
  lines.push('');
  lines.push('### By lane (primaries only)');
  for (const k of Object.keys(byLanePrimary).sort()) lines.push(`- **${k}**: ${byLanePrimary[k]}`);
  lines.push('');
  lines.push('### By disposition (all)');
  for (const k of Object.keys(byDisposition).sort()) lines.push(`- **${k}**: ${byDisposition[k]}`);
  lines.push('');
  lines.push('### By disposition (primaries only)');
  for (const k of Object.keys(byDispositionPrimary).sort()) lines.push(`- **${k}**: ${byDispositionPrimary[k]}`);
  lines.push('');
  lines.push('### By recommendation kind');
  for (const k of Object.keys(byKind).sort()) lines.push(`- **${k}**: ${byKind[k]}`);
  lines.push('');
  lines.push('### Top 25 unique spec-impact recommendations (heuristic ordering)');
  for (const r of top) {
    lines.push(`- **${r.rec_id}** [${r.lane}] ${r.recommendation_title}`);
    if (r.affected_specs) lines.push(`  - Affected: ${r.affected_specs}`);
    if (r.sd_best_match_id) lines.push(`  - SD match: ${r.sd_best_match_id} (${r.sd_best_match_score})`);
  }
  lines.push('');
  return lines.join('\n') + '\n';
}

// -----------------------------
// Orchestration
// -----------------------------

async function main() {
  const args = parseArgs(process.argv);
  if (args.verbose) {
    console.log('Args:', args);
  }

  const cfgLoaded = await loadIngestionConfig(args.configPath);
  const ingestionConfig = cfgLoaded.config || {
    schema_version: 'ehg_master_recommendations_v1.0',
    defaults: { include_next_steps: args.includeNextSteps, include_concrete_artifacts: args.includeConcreteArtifacts, dedupe_similarity_threshold: 0.86 },
    redundancy_thresholds: { medium: 0.22, high: 0.32 }
  };

  // Apply config defaults unless user explicitly set flags
  if (args.includeNextSteps === true && ingestionConfig?.defaults?.include_next_steps === false) {
    // keep CLI default; explicit --no-next-steps already handled
  }
  if (args.includeConcreteArtifacts === false && ingestionConfig?.defaults?.include_concrete_artifacts === true) {
    // keep CLI default off unless explicitly enabled
  }

  const { pillars } = await loadVisionRubric();

  // Discover files
  const files = await listTxtFiles(args.inputDir);
  let selected = args.limitFiles ? files.slice(0, args.limitFiles) : files;
  if (args.onlyFiles) {
    const want = new Set(
      args.onlyFiles
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .map(s => Number(s))
    );
    selected = selected.filter(f => want.has(f.num));
  }
  if (selected.length === 0) {
    console.error(`❌ No numbered .txt files found in: ${args.inputDir}`);
    process.exit(1);
  }

  console.log(`📥 Input: ${args.inputDir}`);
  console.log(`📤 Output: ${args.outputDir}`);
  console.log(`Mode: ${args.dryRun ? 'DRY-RUN' : 'WRITE'}`);
  console.log(`Files: ${selected.length}${args.limitFiles ? ` (limited)` : ''}`);

  // Extract
  let all = [];
  for (const f of selected) {
    const recs = await extractRecommendationsFromFile({
      inputDir: args.inputDir,
      fileName: f.name,
      pillars,
      includeNextSteps: args.includeNextSteps,
      includeConcreteArtifacts: args.includeConcreteArtifacts
    });
    all = all.concat(recs);
  }

  // Deterministic ordering by file + rec_id
  all.sort((a, b) => a.rec_id.localeCompare(b.rec_id));

  // Dedupe (threshold from config)
  dedupeRecs(all, ingestionConfig?.defaults?.dedupe_similarity_threshold ?? 0.86);

  // SD match (optional)
  if (!args.skipSdMatch) {
    const { enabled, reason, sds, envUsed } = await loadStrategicDirectives(args.envFile);
    if (!enabled) {
      console.log(`ℹ️  SD match skipped: ${reason}`);
    } else {
      console.log(`🔎 SD match enabled: ${sds.length} SDs loaded (read-only)${envUsed ? ` (env: ${envUsed})` : ''}`);
      const matchMethod = envUsed && String(envUsed).startsWith('local_seed_sql:') ? 'seed_sql' : 'db';
      const matchConfidence = matchMethod === 'db' ? 'high' : 'low';
      const MIN_SD_MATCH_SCORE = 0.10; // guardrail: avoid “always matched” bias
      for (const r of all) {
        const text = [r.recommendation_title, r.recommendation_description, r.rationale, r.acceptance_criteria].filter(Boolean).join(' ');
        const match = matchSd(text, sds);
        if (match && Number(match.sd_best_match_score || 0) >= MIN_SD_MATCH_SCORE) {
          r.sd_best_match_id = match.sd_best_match_id;
          r.sd_best_match_title = match.sd_best_match_title;
          r.sd_best_match_score = match.sd_best_match_score;
          r.sd_best_match_reason = match.sd_best_match_reason;
          r.sd_best_match_method = matchMethod;
          r.sd_best_match_confidence = matchConfidence;
        } else {
          // Meaningfulness guardrail: treat as no match
          r.sd_best_match_id = '';
          r.sd_best_match_title = '';
          r.sd_best_match_score = '';
          r.sd_best_match_reason = '';
          r.sd_best_match_method = 'none';
          r.sd_best_match_confidence = 'low';
        }
      }
    }
  } else {
    console.log('ℹ️  SD match skipped by flag (--skip-sd-match)');
    for (const r of all) {
      r.sd_best_match_method = 'none';
      r.sd_best_match_confidence = 'low';
    }
  }

  // Disposition evaluation (must happen after SD match attempt so redundancy can be scored).
  for (const r of all) {
    const evald = evaluateDisposition(r, ingestionConfig);
    r.disposition = evald.disposition;
    r.disposition_confidence = evald.disposition_confidence;
    r.disposition_rationale = evald.disposition_rationale;
    const reasonsMerged = normalizeReasonCodes([
      ...String(r.reason_codes || '').split(';').map(x => x.trim()).filter(Boolean),
      ...(evald.reason_codes || [])
    ]);
    r.reason_codes = reasonsMerged.join('; ');
    r.rejection_reason_codes = normalizeReasonCodes(evald.rejection_reason_codes || []).join('; ');
    r.constraint_flags = evald.constraint_flags;
    r.impact_score = evald.impact_score;
    r.complexity_score = evald.complexity_score;
  }

  // Golden tests (deterministic assertions)
  if (args.goldenTest) {
    const failures = [];
    // 1) segment_index must be >=1
    for (const r of all) {
      if (!(Number(r.segment_index) >= 1)) failures.push(`segment_index not 1-based for ${r.rec_id}`);
      if (!/^REC-20251213-\d{2}-\d{2}-(SI|NS|CA|XE)-\d{2}$/.test(r.rec_id)) failures.push(`rec_id format invalid: ${r.rec_id}`);
      if (!ALLOWED_LANE_VALUES.has(r.lane)) failures.push(`lane invalid: ${r.rec_id} => ${r.lane}`);
      if (!ALLOWED_DISPOSITION_VALUES.has(r.disposition)) failures.push(`disposition invalid: ${r.rec_id} => ${r.disposition}`);
      if (!ALLOWED_CONFIDENCE_VALUES.has(r.disposition_confidence)) failures.push(`disp_conf invalid: ${r.rec_id} => ${r.disposition_confidence}`);
      if (!ALLOWED_CONFIDENCE_VALUES.has(r.lane_confidence)) failures.push(`lane_conf invalid: ${r.rec_id} => ${r.lane_confidence}`);
    }

    // 2) If we ran the canonical golden set (01,02,78), assert counts are plausible.
    const byFile = all.reduce((acc, r) => {
      acc[r.source_file] = (acc[r.source_file] || 0) + 1;
      return acc;
    }, {});
    if (args.onlyFiles && args.onlyFiles.replace(/\s/g, '') === '1,2,78') {
      if (byFile['01.txt'] !== 5) failures.push(`Expected 01.txt rows=5, got ${byFile['01.txt'] || 0}`);
      if (byFile['02.txt'] !== 6) failures.push(`Expected 02.txt rows=6, got ${byFile['02.txt'] || 0}`);
      if (!byFile['78.txt'] || byFile['78.txt'] < 1) failures.push(`Expected 78.txt rows>=1, got ${byFile['78.txt'] || 0}`);
    }

    if (failures.length) {
      console.error('\n❌ GOLDEN TEST FAILURES:');
      failures.slice(0, 50).forEach(f => console.error(`- ${f}`));
      process.exit(1);
    }
    console.log('\n✅ GOLDEN TESTS PASSED');
    process.exit(0);
  }

  // Summary to console
  const primaries = all.filter(r => r.dedupe_status === 'primary');
  const laneCounts = all.reduce((acc, r) => {
    acc[r.lane] = (acc[r.lane] || 0) + 1;
    return acc;
  }, {});
  const laneCountsPrimary = primaries.reduce((acc, r) => {
    acc[r.lane] = (acc[r.lane] || 0) + 1;
    return acc;
  }, {});

  console.log('\n========================================================');
  console.log('📊 EXTRACTION SUMMARY');
  console.log('========================================================');
  console.log(`Atomic recs extracted: ${all.length}`);
  console.log(`Dedupe primaries:      ${primaries.length}`);
  console.log('\nBy lane (all):');
  for (const k of Object.keys(laneCounts).sort()) console.log(`  - ${k}: ${laneCounts[k]}`);
  console.log('\nBy lane (primaries):');
  for (const k of Object.keys(laneCountsPrimary).sort()) console.log(`  - ${k}: ${laneCountsPrimary[k]}`);

  // Write outputs (or show paths)
  const out = await writeOutputs({ outputDir: args.outputDir, rows: all, dryRun: args.dryRun });

  console.log('\n========================================================');
  console.log(args.dryRun ? '✅ DRY-RUN COMPLETE (no files written)' : '✅ WRITE COMPLETE');
  console.log('========================================================');
  console.log(`JSON: ${out.jsonPath}`);
  console.log(`CSV:  ${out.csvPath}`);
  console.log(`MD:   ${out.mdPath}`);
}

main().catch(err => {
  console.error('❌ Fatal error:', err?.stack || err?.message || String(err));
  process.exit(1);
});


