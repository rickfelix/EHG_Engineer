// lib/michael/cowork-write.mjs — the write layer for the Cowork import.
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-F (FR-3, FR-4, TR-2).
//
// michael_rules: a first-time import (no active row for that rule_key) is a plain insert. A
// re-import whose parsed content differs from an existing active row REFUSES the write and names
// scripts/michael/rule-encode.mjs as the correct path — this module reuses that file's exported,
// pure needsVerifier({next,prior}) predicate (never its internal flip-then-insert write logic,
// which stays unexported and untouched) so the refusal boundary is provably identical to
// rule-encode.mjs's own gate, not an independently re-implemented guess (PLAN ruling,
// metadata.lead_design_notes on this SD). Every imported row lands auto_apply=false, so
// needsVerifier only ever returns true via its prior-is-active branch here.
//
// michael_gmail_labels / michael_closures / michael_feedback_ledger: plain, non-partial unique
// indexes, so a straightforward onConflict upsert is safe and idempotent per natural key.
import { readRows, writeRows, canonicalJson, refusal } from './db.mjs';
import { needsVerifier } from '../../scripts/michael/rule-encode.mjs';

export const COWORK_WRITE_REFUSALS = Object.freeze({
  CONTENT_CHANGED_NEEDS_VERIFIER: 'CONTENT_CHANGED_NEEDS_VERIFIER',
});

/** Pure: are two rules' rule_text/rule_json identical (order-independent for rule_json)? */
export function ruleContentEqual(a, b) {
  return a.rule_text === b.rule_text && canonicalJson(a.rule_json ?? null) === canonicalJson(b.rule_json ?? null);
}

/**
 * Write one parsed rule. deps: { sb, source, now }. Returns { ok:true, action:'insert'|'noop' } or
 * a refusal (never throws, never bypasses needsVerifier).
 */
export async function writeRule({ sb, domain, rule_key, rule_text, rule_json }, { sourceFile, now = new Date() } = {}) {
  const prior = await readRows(sb, 'michael_rules', (q) => q.eq('domain', domain).eq('rule_key', rule_key).eq('status', 'active'), { select: 'id,rule_text,rule_json,status' });
  if (prior.tables_absent) return refusal('TABLES_ABSENT', 'michael_rules is not applied yet');
  if (prior.error) return refusal('READ_FAILED', prior.error);
  const priorRow = prior.rows[0] || null;
  const next = { auto_apply: false, auto_apply_verb: null };

  if (priorRow && ruleContentEqual({ rule_text, rule_json }, priorRow)) {
    return { ok: true, action: 'noop', domain, rule_key };
  }
  if (needsVerifier({ next, prior: priorRow ? { status: priorRow.status, auto_apply_verb: null } : null })) {
    return refusal(
      COWORK_WRITE_REFUSALS.CONTENT_CHANGED_NEEDS_VERIFIER,
      `${domain}/${rule_key}: an active rule already exists with different content; re-run scripts/michael/rule-encode.mjs for this rule to obtain the Opus verifier verdict needsVerifier requires before superseding it`,
      { domain, rule_key },
    );
  }

  const provenance = { source: `cowork-import:${sourceFile}`, imported_from: sourceFile, imported_at: now.toISOString(), ratification_id: null };
  const w = await writeRows(sb, 'michael_rules', (t) => t
    .insert({ domain, rule_key, rule_text, rule_json: rule_json ?? null, status: 'active', auto_apply: false, provenance })
    .select('id').single());
  if (!w.ok) return refusal(w.refusal, w.error);
  return { ok: true, action: 'insert', domain, rule_key };
}

/** Write one gmail label row. Idempotent upsert on label_id (plain unique index). */
export async function writeLabel({ sb, label }) {
  const w = await writeRows(sb, 'michael_gmail_labels', (t) => t.upsert(label, { onConflict: 'label_id' }).select('id').single());
  if (!w.ok) return refusal(w.refusal, w.error);
  return { ok: true, action: 'upsert', label_id: label.label_id };
}

/** Write one closure row. Idempotent upsert on closure_key (plain unique index). */
export async function writeClosure({ sb, closure }) {
  const row = { ...closure, provenance: { source: 'cowork-import:memory/closures.md' } };
  const w = await writeRows(sb, 'michael_closures', (t) => t.upsert(row, { onConflict: 'closure_key' }).select('id').single());
  if (!w.ok) return refusal(w.refusal, w.error);
  return { ok: true, action: 'upsert', closure_key: closure.closure_key };
}

/** Write one feedback-ledger day. Idempotent upsert on et_date (plain unique index). */
export async function writeFeedbackEntry({ sb, entry }) {
  const w = await writeRows(sb, 'michael_feedback_ledger', (t) => t.upsert(entry, { onConflict: 'et_date' }).select('id').single());
  if (!w.ok) return refusal(w.refusal, w.error);
  return { ok: true, action: 'upsert', et_date: entry.et_date };
}
