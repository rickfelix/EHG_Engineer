import fs from 'fs';
import crypto from 'crypto';

const DIR = 'docs/protocol/adam-contract-review-2026-07-29/';
const OUT = 'docs/protocol/adam-contract-review-2026-07-29/imperative-inventory.json';
const norm = (s) => s.replace(/\r\n/g, '\n');
const orig = norm(fs.readFileSync(DIR + 'CLAUDE_ADAM.ORIGINAL-2026-07-29.md', 'utf8'));
const prop = norm(fs.readFileSync(DIR + 'CLAUDE_ADAM.PROPOSED-2026-07-29.md', 'utf8'));

// An IMPERATIVE is an obligation clause — the unit the contract actually governs by. Block-level
// diffing failed because the shortened file is a rewrite; obligations survive rewording, prose
// does not.
const MARKER = /\b(MUST|NEVER|ALWAYS|REQUIRED|FORBIDDEN|MANDATORY|NON-OPTIONAL|do NOT|does NOT|DO NOT|may never|cannot|shall)\b/;

const stripMd = (s) => s
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/`([^`]*)`/g, '$1')
  .replace(/\*\*|__|\*/g, '');

// Split to sentence-ish clauses. Contract prose uses ; and — as clause separators heavily.
const clauses = (text) => stripMd(text)
  .split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z(])|\n[-*]\s+/)
  .map((c) => c.replace(/\s+/g, ' ').trim())
  .filter((c) => c.length > 25);

// RECALL-BIASED POPULATION. The modal-marker filter (MUST/NEVER/ALWAYS/...) provably under-
// collects: DECOMPOSE-WEAKEST-LAYER is chairman-directed, present in the original, written in
// bare imperative mood, and invisible to it. For a loss-prevention inventory a false positive
// costs one review and a false negative is a silent deletion, so collect EVERY substantive
// clause and let disposition triage narrow it. `carries_modal` is retained only as a priority
// hint -- never as an inclusion gate.
const substantive = (c) => c.length > 40 && !/^\|/.test(c) && !/^\s*$/.test(c);
const origClauses = clauses(orig).filter(substantive);
const propClauses = clauses(prop).filter(substantive);

// Content words carry the obligation; stopwords and markdown do not.
const STOP = new Set(('the a an and or of to in is are be for that this it as on by with at from not no never must always ' +
  'do does did so if then than when what which who whom whose you your adam its his her their they them we our').split(' '));
const terms = (c) => new Set(
  c.toLowerCase().replace(/[^a-z0-9\s_-]/g, ' ').split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w))
);

const propTermSets = propClauses.map(terms);

// FAIL-CLOSED: only a HIGH-overlap match counts as landed. Everything else is NEEDS_DECISION —
// the bias must be toward surfacing, never toward silently blessing a deletion.
const LANDED_THRESHOLD = 0.6;
const bestMatch = (c) => {
  const t = terms(c);
  if (t.size === 0) return 0;
  let best = 0;
  for (const p of propTermSets) {
    let inter = 0;
    for (const w of t) if (p.has(w)) inter++;
    best = Math.max(best, inter / t.size);
  }
  return best;
};

const inventory = origClauses.map((c) => {
  const score = bestMatch(c);
  return {
    key: crypto.createHash('sha256').update(c).digest('hex').slice(0, 12),
    imperative: c.length > 300 ? c.slice(0, 300) + '…' : c,
    match_score: Number(score.toFixed(2)),
    carries_modal: MARKER.test(c),
    disposition: score >= LANDED_THRESHOLD ? 'landed' : 'NEEDS_DECISION'
  };
});

const landed = inventory.filter((e) => e.disposition === 'landed');
const needs = inventory.filter((e) => e.disposition === 'NEEDS_DECISION');

console.log('imperatives in ORIGINAL :', origClauses.length);
console.log('imperatives in PROPOSED :', propClauses.length);
console.log('  auto-matched (>=0.6)  :', landed.length);
console.log('  NEEDS_DECISION        :', needs.length);
console.log('');

// CONTROL: the matcher must not mark everything landed. Score the ORIGINAL against ITSELF —
// if self-matching does not reach ~1.0, the scorer is broken; if cross-matching approaches
// self-matching, it is not discriminating.
const selfSets = origClauses.map(terms);
const selfScore = (c) => { const t = terms(c); let b = 0; for (const p of selfSets) { let i = 0; for (const w of t) if (p.has(w)) i++; b = Math.max(b, i / t.size); } return b; };
const avgSelf = origClauses.reduce((n, c) => n + selfScore(c), 0) / origClauses.length;
const avgCross = inventory.reduce((n, e) => n + e.match_score, 0) / inventory.length;
console.log('CONTROL avg self-match :', avgSelf.toFixed(2), '(must be ~1.00 or the scorer is broken)');
console.log('CONTROL avg cross-match:', avgCross.toFixed(2), '(must be well below self, or it is not discriminating)');
console.log('');
console.log('--- sample NEEDS_DECISION (these must land in a companion or be an approved drop) ---');
needs.slice(0, 10).forEach((e, i) => console.log(`[${i + 1}] ${e.match_score} ${e.imperative.slice(0, 130)}`));

fs.writeFileSync(OUT, JSON.stringify({
  source_sha256: crypto.createHash('sha256').update(orig).digest('hex'),
  counts: { original: origClauses.length, proposed: propClauses.length, landed: landed.length, needs_decision: needs.length },
  entries: inventory
}, null, 1));
console.log('\n-> scratch/adam-imperative-inventory.json');
