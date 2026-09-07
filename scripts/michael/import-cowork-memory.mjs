#!/usr/bin/env node
// scripts/michael/import-cowork-memory.mjs — migrate the legacy Dropbox _Cowork folder into
// michael_rules / michael_gmail_labels / michael_closures / michael_feedback_ledger, verify the
// import, and let the chairman ratify it once. SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-F.
// Spec docs/michael/02-SPEC.md section 8. RUNS ON THE HOST (reads a local folder outside repo/CI
// reach). --root is a REQUIRED flag with NO default anywhere in this script — the literal strings
// "Dropbox" and "_Cowork" never appear as a hardcoded path, since child I's retirement acceptance
// test greps lib/scripts/.github/docs for exactly those strings.
//
// No real Cowork file example exists anywhere in this repo or its git history (confirmed at LEAD
// by an Explore pass) -- the input format lib/michael/cowork-parse.mjs recognizes is DEFINED by
// this child, not reverse-engineered. DRY-RUN BY DEFAULT: without --apply, prints a preview naming
// both what parsed and what did not, so the chairman can validate the assumed format against the
// real files before any row lands.
//
// Step 0 (always runs, dry-run included): manifests --root (lib/michael/cowork-manifest.mjs,
// modeled on lib/evidence/manifest-generator.js), compared against the manifest this script itself
// persisted on a prior run (.artifacts/michael-cowork-manifest.json) -- a later run against a
// changed folder reports drift instead of silently re-importing.
//
// michael_rules writes never bypass the Opus-verifier gate: a first-time import is a plain insert;
// a re-import whose content differs from an existing active row REFUSES (lib/michael/
// cowork-write.mjs, which reuses scripts/michael/rule-encode.mjs's exported needsVerifier
// predicate). michael_gmail_labels/michael_closures/michael_feedback_ledger imports are idempotent
// upserts on their real unique keys.
//
// --verify re-parses the source and diffs against what --apply wrote, per source file.
// --ratify calls the canonical lib/chairman/ratification-writer.mjs writer once the chairman has
// read docs/michael/generated/RULES.md end to end.
//
// Usage: node scripts/michael/import-cowork-memory.mjs --root "<path>" [--apply] [--verify] [--ratify] [--json]
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { createMichaelClient, parseArgs, readRows, refusal, emit } from '../../lib/michael/db.mjs';
import { buildManifest, diffManifest } from '../../lib/michael/cowork-manifest.mjs';
import { parseRuleFile, parseLabelTable, parseClosures, parseFeedbackLedger } from '../../lib/michael/cowork-parse.mjs';
import { writeRule, writeLabel, writeClosure, writeFeedbackEntry } from '../../lib/michael/cowork-write.mjs';
import { recordChairmanRatification } from '../../lib/chairman/ratification-writer.mjs';

export const DEFAULT_MANIFEST_PATH = path.join('.artifacts', 'michael-cowork-manifest.json');

/** Which source files this script recognizes, relative to --root, and how each is parsed. */
export const SOURCE_FILES = Object.freeze({
  'gmail.md': 'rules',
  'todoist.md': 'rules',
  'body-section.md': 'rules',
  'morning-brief-distillation.md': 'rules',
  'CLAUDE.md': 'rules',
  // Child J (v1.1, FR-5): youtube rules use the SAME "json: {...}" directive as every other rule
  // file (lib/michael/cowork-parse.mjs's parseRuleFile is generic); the youtube-digest feeder
  // (scripts/michael/youtube-digest.mjs) requires rule_json.channel_id, so a rule imported without
  // a json: line is staged as an unusable prose row — channelOfRule() there counts it as
  // malformed_rule (degraded, never crashed) rather than silently doing nothing.
  'youtube.md': 'rules',
  'gmail-labels.md': 'labels',
  'memory/closures.md': 'closures',
  'memory/brief-feedback.md': 'feedback',
});

/** Read and parse every present source file. Returns { parsed: {relPath: {...}}, missing: [relPath] }. */
export function parseSourceFiles(root, { fsImpl = fs } = {}) {
  const parsed = {};
  const missing = [];
  for (const [relPath, kind] of Object.entries(SOURCE_FILES)) {
    const full = path.join(root, relPath);
    if (!fsImpl.existsSync(full)) { missing.push(relPath); continue; }
    const text = fsImpl.readFileSync(full, 'utf8');
    if (kind === 'rules') parsed[relPath] = { kind, ...parseRuleFile(text) };
    else if (kind === 'labels') parsed[relPath] = { kind, ...parseLabelTable(text) };
    else if (kind === 'closures') parsed[relPath] = { kind, ...parseClosures(text) };
    else if (kind === 'feedback') parsed[relPath] = { kind, ...parseFeedbackLedger(text) };
  }
  return { parsed, missing };
}

function loadPriorManifest(manifestPath, fsImpl) {
  try { return JSON.parse(fsImpl.readFileSync(manifestPath, 'utf8')); } catch { return null; }
}

function saveManifest(manifestPath, manifest, fsImpl) {
  fsImpl.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fsImpl.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

/** deps: { sb, argv, now, fsImpl, manifestPath, ratifyWriter }. Never throws. */
export async function runImportCoworkMemory({ sb, argv = [], now = new Date(), fsImpl = fs, manifestPath = DEFAULT_MANIFEST_PATH, ratifyWriter = recordChairmanRatification } = {}) {
  const a = parseArgs(argv);
  const apply = a.apply === true;
  const verify = a.verify === true;
  const ratify = a.ratify === true;
  const root = typeof a.root === 'string' ? a.root : null;

  if (ratify) {
    if (!a.quote || !a.source) return refusal('RATIFY_ARGS_REQUIRED', '--ratify requires --quote and --source');
    try {
      const payload = await ratifyWriter(sb, { quote: a.quote, source: a.source, targetContracts: ['michael'], scribeSeat: 'michael', utteredAt: now.toISOString() });
      return { ok: true, action: 'ratify', ratification: payload };
    } catch (e) {
      return refusal('RATIFY_FAILED', (e && e.message) || 'recordChairmanRatification failed');
    }
  }

  if (!root) return refusal('ROOT_REQUIRED', '--root is required (no default)');

  // Step 0: freeze/manifest, always.
  let current;
  try { current = buildManifest(root, { now, fsImpl }); } catch (e) { return refusal('ROOT_UNREADABLE', (e && e.message) || String(e)); }
  const prior = loadPriorManifest(manifestPath, fsImpl);
  const diff = prior ? diffManifest(prior, current) : { drifted: false, added: [], removed: [], changed: [] };
  if (diff.drifted) return refusal('ROOT_DRIFTED', 'the folder changed since the last manifest was taken', { diff });
  saveManifest(manifestPath, current, fsImpl);

  const { parsed, missing } = parseSourceFiles(root, { fsImpl });

  if (verify) {
    const report = {};
    for (const [relPath, result] of Object.entries(parsed)) {
      if (result.kind === 'rules') {
        const rows = [];
        for (const rule of result.rules) {
          const r = await readRows(sb, 'michael_rules', (q) => q.eq('domain', rule.domain).eq('rule_key', rule.rule_key).eq('status', 'active'), { select: 'rule_text,rule_json' });
          const found = r.rows[0];
          rows.push({ rule_key: rule.rule_key, ok: Boolean(found) && found.rule_text === rule.rule_text, present: Boolean(found) });
        }
        report[relPath] = { ok: rows.every((x) => x.ok), rows };
      } else if (result.kind === 'labels') {
        const rows = [];
        for (const label of result.labels) {
          const r = await readRows(sb, 'michael_gmail_labels', (q) => q.eq('label_id', label.label_id), { select: 'label_id' });
          rows.push({ label_id: label.label_id, ok: r.rows.length === 1 });
        }
        report[relPath] = { ok: rows.every((x) => x.ok), rows };
      } else if (result.kind === 'closures') {
        const rows = [];
        for (const c of result.closures) {
          const r = await readRows(sb, 'michael_closures', (q) => q.eq('closure_key', c.closure_key), { select: 'closure_key' });
          rows.push({ closure_key: c.closure_key, ok: r.rows.length === 1 });
        }
        report[relPath] = { ok: rows.every((x) => x.ok), rows };
      } else if (result.kind === 'feedback') {
        const rows = [];
        for (const entry of result.entries) {
          const r = await readRows(sb, 'michael_feedback_ledger', (q) => q.eq('et_date', entry.et_date), { select: 'et_date' });
          rows.push({ et_date: entry.et_date, ok: r.rows.length === 1 });
        }
        report[relPath] = { ok: rows.every((x) => x.ok), rows };
      }
    }
    return { ok: true, action: 'verify', report, missing };
  }

  if (!apply) {
    const preview = Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, { kind: v.kind, parsed_count: (v.rules || v.labels || v.closures || v.entries || []).length, unparsed: v.unparsed || [] }]));
    return { ok: true, action: 'dry_run', root, missing, preview };
  }

  const results = { rules: [], labels: [], closures: [], feedback: [] };
  for (const [relPath, result] of Object.entries(parsed)) {
    if (result.kind === 'rules') {
      for (const rule of result.rules) results.rules.push(await writeRule({ sb, ...rule }, { sourceFile: relPath, now }));
    } else if (result.kind === 'labels') {
      for (const label of result.labels) results.labels.push(await writeLabel({ sb, label }));
    } else if (result.kind === 'closures') {
      for (const closure of result.closures) results.closures.push(await writeClosure({ sb, closure }));
    } else if (result.kind === 'feedback') {
      for (const entry of result.entries) results.feedback.push(await writeFeedbackEntry({ sb, entry }));
    }
  }
  const refused = [...results.rules, ...results.labels, ...results.closures, ...results.feedback].filter((r) => r.ok === false);
  return { ok: refused.length === 0, action: 'apply', root, missing, results, refused };
}

async function main() {
  const argv = process.argv.slice(2);
  const r = await runImportCoworkMemory({ sb: createMichaelClient(), argv });
  emit(r, { json: argv.includes('--json') });
  process.exitCode = r && r.ok === false ? 2 : 0;
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(`[michael:import-cowork-memory] fatal ${e && e.code ? e.code : ''}`); process.exitCode = 2; });
}
