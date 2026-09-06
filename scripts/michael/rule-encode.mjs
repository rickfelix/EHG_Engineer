#!/usr/bin/env node
// scripts/michael/rule-encode.mjs — encode a standing rule into michael_rules with provenance.
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B (FR-3, TR-3, TR-4, TR-8; spec §7).
//
// THE GATE: any write that flips auto_apply, changes auto_apply_verb, or supersedes an active rule
// REFUSES (exit 2, nothing written) unless --verifier-verdict names a runner-produced JSON file
// {producer:'opus-verifier', run_id, model (claude-opus*), verdict 'approve'|'reject', reasoning,
// subject_hash, produced_at} whose subject_hash equals the sha256 of the canonical JSON of the rule
// subject this script recomputes. The accepted verdict is stored verbatim in provenance.verifier.
// WHY A FILE: the Opus verifier is the seat's own sub-agent (spec §3); Max-plan models are reachable
// only from a Claude Code session and no API key may bill (spec §0). The headless
// `claude --print --dangerously-skip-permissions` path (scripts/execute-team.mjs:151-168) was
// REJECTED: the flag was declined for worker seats (chairman 2026-09-05), it would spawn a detached
// session inside a synchronous verb, and the writer would then author the evidence it gates
// (ratification 6c263823). Hash-binding keeps the verdict outside the writer.
//
// WRITE ORDER (DATABASE 1533367f D7): the partial unique index on (domain, rule_key) WHERE
// status='active' cannot be deferred, so the prior row is flipped to superseded FIRST, then the new
// active row is inserted with supersedes = prior.id. A prior that is already superseded is never
// re-superseded (TR-4).
//
// Usage (absolute path from the repo root):
//   node scripts/michael/rule-encode.mjs --domain gmail --key newsletters-archive \
//     --text "Archive newsletters" [--rule-json '{"label":"Newsletters"}'] --source terminal:<ref> \
//     [--ratification <id>] [--auto-apply --verb label|archive|reschedule] \
//     [--verifier-verdict .artifacts/michael-verifier/<file>.json] [--dry-run] [--json]
import fs from 'node:fs';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { createMichaelClient, parseArgs, readRows, writeRows, canonicalJson, sha256Hex, refusal, emit, TABLES_ABSENT } from '../../lib/michael/db.mjs';
import { RULE_DOMAINS, AUTO_APPLY_VERBS } from '../../lib/michael/rules.mjs';

export const VERIFIER_PRODUCER = 'opus-verifier';
export const VERDICT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const REFUSALS = Object.freeze({
  INVALID_DOMAIN: 'INVALID_DOMAIN',
  INVALID_VERB: 'INVALID_VERB',
  SOURCE_INVALID: 'SOURCE_INVALID',
  MISSING_ARGS: 'MISSING_ARGS',
  RULE_JSON_INVALID: 'RULE_JSON_INVALID',
  VERIFIER_VERDICT_MISSING: 'VERIFIER_VERDICT_MISSING',
  VERIFIER_FILE_INVALID: 'VERIFIER_FILE_INVALID',
  VERIFIER_PRODUCER_MISMATCH: 'VERIFIER_PRODUCER_MISMATCH',
  VERIFIER_MODEL_NOT_OPUS: 'VERIFIER_MODEL_NOT_OPUS',
  VERIFIER_HASH_MISMATCH: 'VERIFIER_HASH_MISMATCH',
  VERIFIER_REJECTED: 'VERIFIER_REJECTED',
  VERIFIER_STALE: 'VERIFIER_STALE',
  RULE_ALREADY_SUPERSEDED: 'RULE_ALREADY_SUPERSEDED',
  TABLES_ABSENT,
});

/** Pure: the hash subject — exactly the fields the verifier judged. */
export function ruleSubject({ domain, rule_key, rule_text, rule_json, auto_apply, auto_apply_verb, supersedes }) {
  return { domain, rule_key, rule_text, rule_json: rule_json ?? null, auto_apply: Boolean(auto_apply), auto_apply_verb: auto_apply_verb ?? null, supersedes: supersedes ?? null };
}
export function subjectHash(subject) {
  return sha256Hex(canonicalJson(ruleSubject(subject)));
}

/** Pure: does this write need the Opus verifier? (flip, verb change, or supersede of an active rule) */
export function needsVerifier({ next, prior }) {
  if (next.auto_apply) return true;
  if (prior && prior.status === 'active') return true;
  if (prior && (prior.auto_apply_verb || null) !== (next.auto_apply_verb || null)) return true;
  return false;
}

/**
 * Pure: validate a verdict object against the expected subject hash. Returns { ok, code, message }.
 * Every refusal reason has a DISTINCT code (TS-4).
 */
export function verifyVerdict(verdict, expectedHash, now = new Date()) {
  if (!verdict || typeof verdict !== 'object') return { ok: false, code: REFUSALS.VERIFIER_FILE_INVALID, message: 'verdict file is not a JSON object' };
  for (const k of ['producer', 'run_id', 'model', 'verdict', 'subject_hash', 'produced_at']) {
    if (verdict[k] === undefined || verdict[k] === null || verdict[k] === '') return { ok: false, code: REFUSALS.VERIFIER_FILE_INVALID, message: `verdict file lacks ${k}` };
  }
  if (verdict.producer !== VERIFIER_PRODUCER) return { ok: false, code: REFUSALS.VERIFIER_PRODUCER_MISMATCH, message: `producer ${verdict.producer} is not ${VERIFIER_PRODUCER}` };
  if (!/^claude-opus/i.test(String(verdict.model))) return { ok: false, code: REFUSALS.VERIFIER_MODEL_NOT_OPUS, message: `model ${verdict.model} is not an Opus model (spec §3: flips and supersedes are Opus-verified)` };
  if (verdict.subject_hash !== expectedHash) return { ok: false, code: REFUSALS.VERIFIER_HASH_MISMATCH, message: 'subject_hash does not match the rule being written — the verifier judged a different subject' };
  const age = now.getTime() - Date.parse(verdict.produced_at);
  if (!Number.isFinite(age) || age < 0 || age > VERDICT_MAX_AGE_MS) return { ok: false, code: REFUSALS.VERIFIER_STALE, message: 'verdict is older than 24h or its produced_at is unreadable' };
  if (verdict.verdict !== 'approve') return { ok: false, code: REFUSALS.VERIFIER_REJECTED, message: `verifier verdict is ${verdict.verdict}` };
  return { ok: true };
}

/** Pure: source must be channel:ref, ≥5 chars (lib/chairman/ratification-writer.mjs:259-262 shape). */
export function validSource(source) {
  return typeof source === 'string' && source.length >= 5 && /^[a-z][a-z0-9_-]*:.+$/i.test(source);
}

/**
 * The verb. deps: { sb, argv, now, readVerdict, render }. Returns the result object; never throws.
 */
export async function runRuleEncode({ sb, argv = [], now = new Date(), readVerdict = null, render = null } = {}) {
  const a = parseArgs(argv);
  const domain = a.domain, ruleKey = a.key, text = a.text, source = a.source;
  if (!domain || !ruleKey || !text || !source) return refusal(REFUSALS.MISSING_ARGS, '--domain, --key, --text and --source are required');
  if (!RULE_DOMAINS.includes(domain)) return refusal(REFUSALS.INVALID_DOMAIN, `domain ${domain} not in ${RULE_DOMAINS.join('|')}`);
  if (!validSource(source)) return refusal(REFUSALS.SOURCE_INVALID, 'source must be channel:ref (e.g. terminal:2026-09-06T05:12)');
  const autoApply = Boolean(a['auto-apply']);
  const verb = typeof a.verb === 'string' ? a.verb : null;
  if (autoApply && !AUTO_APPLY_VERBS.includes(verb)) return refusal(REFUSALS.INVALID_VERB, `--auto-apply requires --verb in ${AUTO_APPLY_VERBS.join('|')} (complete and delete never auto-apply)`);
  if (verb && !AUTO_APPLY_VERBS.includes(verb)) return refusal(REFUSALS.INVALID_VERB, `verb ${verb} not in ${AUTO_APPLY_VERBS.join('|')}`);
  let ruleJson = null;
  if (typeof a['rule-json'] === 'string') {
    try { ruleJson = JSON.parse(a['rule-json']); } catch (e) { return refusal(REFUSALS.RULE_JSON_INVALID, `--rule-json is not JSON: ${e.message}`); }
  }

  const priorRead = await readRows(sb, 'michael_rules', (q) => q.eq('domain', domain).eq('rule_key', ruleKey).order('created_at', { ascending: false }));
  if (priorRead.tables_absent) return refusal(REFUSALS.TABLES_ABSENT, 'michael_rules is not applied yet (chairman applies 20260906_michael_tables.sql)');
  if (priorRead.error) return refusal('READ_FAILED', priorRead.error);
  // Only the ACTIVE row can be superseded (TR-4); retained superseded ancestors are history, never re-superseded.
  const prior = priorRead.rows.find((r) => r.status === 'active') || null;

  const next = {
    domain, rule_key: ruleKey, rule_text: text, rule_json: ruleJson,
    auto_apply: autoApply, auto_apply_verb: verb, auto_apply_since: autoApply ? now.toISOString() : null,
    supersedes: prior ? prior.id : null,
    status: 'active',
  };
  const hash = subjectHash(next);
  const gate = needsVerifier({ next, prior });
  let verdict = null;
  if (gate) {
    const p = typeof a['verifier-verdict'] === 'string' ? a['verifier-verdict'] : null;
    if (!p) return refusal(REFUSALS.VERIFIER_VERDICT_MISSING, `this write ${next.auto_apply ? 'flips auto_apply' : 'supersedes an active rule'}; pass --verifier-verdict <file> produced by the Opus verifier (subject_hash ${hash})`, { subject_hash: hash });
    try {
      verdict = readVerdict ? readVerdict(p) : JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) { return refusal(REFUSALS.VERIFIER_FILE_INVALID, `cannot read verdict ${p}: ${e.message}`); }
    const v = verifyVerdict(verdict, hash, now);
    if (!v.ok) return refusal(v.code, v.message, { subject_hash: hash });
  }

  const provenance = {
    ratification_id: typeof a.ratification === 'string' ? a.ratification : null,
    source,
    uttered_at: typeof a['uttered-at'] === 'string' ? a['uttered-at'] : now.toISOString(),
    encoded_by: process.env.CLAUDE_SESSION_ID || 'cli',
    subject_hash: hash,
    verifier: verdict,
  };
  const row = { ...next, provenance };
  if (a['dry-run']) return { ok: true, dry_run: true, would_write: row, supersedes: prior ? prior.id : null, gate, subject_hash: hash };

  if (prior) {
    // Flip FIRST (partial unique cannot be deferred), guarded on status so a concurrent encode cannot double-supersede.
    const flip = await writeRows(sb, 'michael_rules', (t) => t.update({ status: 'superseded' }).eq('id', prior.id).eq('status', 'active').select('id').maybeSingle());
    if (!flip.ok) return refusal(flip.refusal, flip.error);
    if (!flip.data || flip.data.id !== prior.id) return refusal(REFUSALS.RULE_ALREADY_SUPERSEDED, `prior rule ${prior.id} was superseded by another writer; re-read and retry`);
  }
  const ins = await writeRows(sb, 'michael_rules', (t) => t.insert(row).select('id').single());
  if (!ins.ok) return refusal(ins.refusal, ins.error);
  const id = ins.data ? ins.data.id : null;
  let rendered = null;
  try {
    if (render) rendered = await render();
    else { const { runRulesRender } = await import('../michael-rules-render.mjs'); rendered = await runRulesRender({ sb, now }); }
  } catch (e) { rendered = { ok: false, error: e.message }; }
  return { ok: true, id, superseded: prior ? prior.id : null, gate, subject_hash: hash, rendered: rendered ? { ok: rendered.ok } : null };
}

async function main() {
  const argv = process.argv.slice(2);
  const sb = createMichaelClient();
  const r = await runRuleEncode({ sb, argv });
  emit(r, { json: argv.includes('--json') });
  process.exitCode = r.ok ? 0 : 2;
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(`[MICHAEL-RULE-ENCODE] ${e && e.message ? e.message : e}`); process.exitCode = 1; });
}
