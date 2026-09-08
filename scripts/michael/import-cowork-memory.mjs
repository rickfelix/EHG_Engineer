#!/usr/bin/env node
// scripts/michael/import-cowork-memory.mjs — migrate the legacy Dropbox _Cowork folder into
// michael_rules / michael_closures / michael_feedback_ledger, verify the import, and let the
// chairman ratify it once. SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-F. Gmail label rules
// (gmail-labels.md) and doctrine.md principle-to-domain assignment are NOT wired to a writer here
// -- see SD-LEO-FIX-COWORK-IMPORTER-CANNOT-001 and cowork-parse.mjs's module doc comment.
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
// predicate). michael_closures/michael_feedback_ledger imports are idempotent upserts on their
// real unique keys.
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
import { parseRuleFile, parseClosures, parseFeedbackLedger, parseDoctrine } from '../../lib/michael/cowork-parse.mjs';
import { writeRule, writeClosure, writeFeedbackEntry } from '../../lib/michael/cowork-write.mjs';
import { recordChairmanRatification } from '../../lib/chairman/ratification-writer.mjs';

export const DEFAULT_MANIFEST_PATH = path.join('.artifacts', 'michael-cowork-manifest.json');

/**
 * Which source files this script recognizes, relative to --root, and how each is parsed.
 * REWRITTEN by SD-LEO-FIX-COWORK-IMPORTER-CANNOT-001: paths corrected to match the real corpus
 * layout (4 files live under memory/preferences/, not root), gmail-labels.md removed (no such
 * file exists anywhere in the corpus -- the label rules are prose inside gmail.md, out of scope
 * here), memory/doctrine.md added.
 * QF-20260907-610: todoist.md and morning-brief-distillation.md ARE heading-structured (measured
 * live against the real corpus, 2026-09-07) and now carry a sectionHeadingRe too -- the prior
 * comment here overgeneralised from one hand-encoded rule living in a sub-bullet to "no file but
 * gmail.md has headings", which was true for body-section.md (genuinely mixed prose) and CLAUDE.md
 * (a heading convention it does not use at all -- domain stays null, deliberately untouched: its
 * calendar-code decoder needs a content-column decision first) but false for these two. See
 * cowork-parse.mjs's parseRuleFile doc for why morning-brief-distillation.md's entry is an ARRAY.
 */
export const SOURCE_FILES = Object.freeze({
  'memory/preferences/gmail.md': { kind: 'rules', domain: 'gmail', sectionHeadingRe: /^##\s+Triage rules/i },
  'memory/preferences/todoist.md': { kind: 'rules', domain: 'todoist', sectionHeadingRe: /^##\s+Effort \+ energy budget model/i },
  'memory/preferences/body-section.md': { kind: 'rules', domain: 'body' },
  'memory/preferences/morning-brief-distillation.md': { kind: 'rules', domain: 'brief', sectionHeadingRe: [/^##\s+Structural decisions/i, /^##\s+Section-by-section decisions/i, /^##\s+Todoist intelligence/i] },
  'CLAUDE.md': { kind: 'rules', domain: null },
  'memory/closures.md': { kind: 'closures' },
  'memory/brief-feedback.md': { kind: 'feedback' },
  'memory/doctrine.md': { kind: 'doctrine' },
});

/** Read and parse every present source file. Returns { parsed: {relPath: {...}}, missing: [relPath] }. */
export function parseSourceFiles(root, { fsImpl = fs } = {}) {
  const parsed = {};
  const missing = [];
  for (const [relPath, spec] of Object.entries(SOURCE_FILES)) {
    const full = path.join(root, relPath);
    if (!fsImpl.existsSync(full)) { missing.push(relPath); continue; }
    const text = fsImpl.readFileSync(full, 'utf8');
    if (spec.kind === 'rules') parsed[relPath] = { kind: 'rules', ...parseRuleFile(text, { domain: spec.domain, sectionHeadingRe: spec.sectionHeadingRe }) };
    else if (spec.kind === 'closures') parsed[relPath] = { kind: 'closures', ...parseClosures(text) };
    else if (spec.kind === 'feedback') parsed[relPath] = { kind: 'feedback', ...parseFeedbackLedger(text) };
    else if (spec.kind === 'doctrine') parsed[relPath] = { kind: 'doctrine', ...parseDoctrine(text) };
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
    const preview = Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, { kind: v.kind, parsed_count: (v.rules || v.closures || v.entries || v.principles || []).length, unparsed: v.unparsed || [] }]));
    return { ok: true, action: 'dry_run', root, missing, preview };
  }

  // doctrine.md principles are previewed (dry-run above) but never written here: RULE_DOMAINS has
  // no cross-cutting/personal bucket, and assigning a domain per principle is an editorial call
  // (see cowork-parse.mjs's parseDoctrine doc comment) this script does not automate. skipped
  // entries are reported so the chairman/Michael can see exactly what's pending, not silently
  // dropped.
  const results = { rules: [], closures: [], feedback: [], doctrine_skipped: [] };
  for (const [relPath, result] of Object.entries(parsed)) {
    if (result.kind === 'rules') {
      for (const rule of result.rules) results.rules.push(await writeRule({ sb, ...rule }, { sourceFile: relPath, now }));
    } else if (result.kind === 'closures') {
      for (const closure of result.closures) results.closures.push(await writeClosure({ sb, closure }));
    } else if (result.kind === 'feedback') {
      for (const entry of result.entries) results.feedback.push(await writeFeedbackEntry({ sb, entry }));
    } else if (result.kind === 'doctrine') {
      for (const principle of result.principles) results.doctrine_skipped.push({ key: principle.key, reason: 'NEEDS_DOMAIN_RULING' });
    }
  }
  const refused = [...results.rules, ...results.closures, ...results.feedback].filter((r) => r.ok === false);
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
