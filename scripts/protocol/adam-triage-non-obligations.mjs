/**
 * Shrink the inventory's decision surface by marking entries that carry NO obligation.
 * SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001 — FR-1.
 *
 * The enumerator is recall-biased on purpose (a modal gate provably missed a chairman-directed
 * rule), so it over-collects: headings, sentence fragments and citation lines all became entries.
 * Those need no disposition, and leaving them in a 340-item queue hides the ~100 that do.
 *
 * CONSERVATIVE BY CONSTRUCTION. Only patterns that cannot carry an obligation are matched;
 * anything ambiguous stays NEEDS_DECISION. Over-marking here would silently retire a real rule,
 * which is the exact harm the inventory exists to prevent — so the bias must stay pointed at
 * keeping things open, not at closing them.
 */
import fs from 'fs';

const INV = 'docs/protocol/adam-contract-review-2026-07-29/imperative-inventory.json';

const NON_OBLIGATION = [
  // A bare heading. Its rules are separate entries.
  [/^#{1,4}\s/, 'markdown heading'],
  [/^\*{0,2}[A-Z0-9 §.\-—]{3,60}\*{0,2}:?$/, 'bare label / heading'],
  // Pure citation lines: they record WHERE something lives, never what to do.
  // Citation lines ALWAYS carry a colon ("Productionized: SD-...", "Canonical SSOT: docs/...").
  // Requiring it is what separates a citation from a RULE whose name merely starts with the same
  // word: without it, "SOURCE-AND-GO (default — no pre-review)" — a routing rule — was retired
  // because it begins with "Source". A pattern matching a PREFIX is not one matching a MEANING.
  [/^(Productionized|Full research record|Canonical SSOT|Reference|See|Source|Implementation follow-on|Rejected alternatives)\b\s*:/i, 'citation / cross-reference'],
  [/^\(?(SD-[A-Z0-9-]+|QF-\d{8}-\d+)[,;)\s]/, 'SD/QF key citation'],
  // Table rows and separators.
  [/^\|/, 'table row'],
  [/^[-=]{3,}$/, 'rule / separator'],
];

// Entries that MUST never be marked non-obligation. If the classifier touches one of these it is
// too aggressive and the run aborts — a real rule quietly leaving the queue is the failure mode.
const MUST_STAY_OPEN = [
  /DECOMPOSE-WEAKEST-LAYER/i,
  /ACCEPTANCE-SITTING OWNERSHIP/i,
  /Does not coordinate the fleet/i,
  /NEVER hand-insert/i,
  /never accept-or-graduate/i,
];

const inv = JSON.parse(fs.readFileSync(INV, 'utf8'));
const marked = [];

for (const e of inv.entries) {
  if (e.disposition !== 'NEEDS_DECISION') continue;
  const t = e.imperative.trim();
  if (MUST_STAY_OPEN.some((re) => re.test(t))) continue;
  const hit = NON_OBLIGATION.find(([re]) => re.test(t));
  if (!hit) continue;
  e.disposition = 'not_an_obligation';
  e.triage_reason = hit[1];
  marked.push(e);
}

// Falsify the control: assert no protected rule was retired, whatever the patterns did.
const violated = inv.entries.filter(
  (e) => e.disposition === 'not_an_obligation' && MUST_STAY_OPEN.some((re) => re.test(e.imperative)),
);
if (violated.length) {
  console.error('ABORT — classifier retired a protected rule:', violated.map((v) => v.key));
  process.exit(1);
}

inv.counts.needs_decision = inv.entries.filter((e) => e.disposition === 'NEEDS_DECISION').length;
inv.counts.not_an_obligation = marked.length;

fs.writeFileSync(INV, JSON.stringify(inv, null, 1));
const byReason = {};
marked.forEach((e) => { byReason[e.triage_reason] = (byReason[e.triage_reason] || 0) + 1; });
console.log('marked non-obligation:', marked.length, JSON.stringify(byReason));
console.log('still needing a disposition:', inv.counts.needs_decision, 'of', inv.entries.length);
