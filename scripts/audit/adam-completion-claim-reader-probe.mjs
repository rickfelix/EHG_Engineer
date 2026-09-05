#!/usr/bin/env node
/**
 * Adam completion-claim / named-reader probe — QF-20260903-098.
 *
 * INHERITED from a Solomon oracle consult (2026-09-03) after three specimens shared one shape
 * on the same day: a completion claim (done/safe/ready/claimable/complete) whose verification
 * WAS performed and returned affirmative and was IRRELEVANT, because the reader that would
 * actually act on the state was never named in the same breath -- a cleared-parent claim beside
 * an unchecked parentLeadPending; a children-dispatchable claim beside an unread second
 * predicate; an encode-complete claim beside an un-stamped encoded_ref. Chairman ratification
 * 558cf9c3 already made a NUMBER incomplete without its named instrument; this extends that from
 * numbers to STATES: a claim of done/safe/ready/claimable/complete without naming, in the same
 * breath, the reader that will act on it is an INCOMPLETE SENTENCE, not a weak one.
 *
 * THIS IS A MEASUREMENT, NOT A GATE (Solomon was explicit): it does not prevent a claim from
 * being made, and it never exits non-zero on a positive count. It exists to answer, in a month,
 * whether the form change took -- a trend, reported over Adam's own outbound (session_coordination
 * rows with sender_type='adam').
 *
 * WHERE THIS RULE DOES NOT REACH (recorded so it is never mistaken for coverage of the family):
 * INSUFFICIENT-DISCRIMINATION (the right surface was read truly, but the reader collapsed to one
 * cause of several) and HAZARD-WITHOUT-MITIGATION (a real risk was measured but prior art already
 * covering it was never checked) are neighbouring classes with different remedies. This probe
 * only ever answers "was a reader named", nothing more.
 *
 * KNOWN LIMITATION: "names a reader" is approximated as "the claim's own text contains a
 * backtick-quoted identifier, a camelCase/snake_case token, or an explicit naming phrase
 * (verified by / checked via / reader: / consumer: / ...)". This is a text heuristic, not a
 * semantic check -- it cannot tell a genuinely-named reader from an unrelated technical term
 * mentioned in passing (a false negative on the flag, i.e. it under-flags), and it cannot
 * recognise a reader named only in NATURAL prose with no identifier-shaped token at all (a false
 * positive on the flag, i.e. it over-flags). Both directions are accepted per Solomon's own
 * framing: a trend measurement, not a preventive gate.
 *
 * Usage: node scripts/audit/adam-completion-claim-reader-probe.mjs [--since <ISO>] [--until <ISO>]
 * Defaults to the trailing 7 days. Never exits non-zero on a positive flagged count.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

// A completion CLAIM: an assertion copula (is/are/was/were/now/already) immediately before one of
// the five named words, with an intervening "not" excluded -- "is not done" asserts the opposite,
// not completion, and must never be flagged as an unlabelled completion claim.
export const COMPLETION_CLAIM_RE = /\b(?:is|are|was|were|now|already)\s+(?!not\s)(done|complete|completed|safe|ready|claimable)\b/i;

// A NAMED READER: a backtick-quoted identifier, a camelCase or snake_case token (ordinary prose
// carries neither), or an explicit naming phrase. Split into separate regexes rather than one
// case-insensitive alternation -- a single /i pattern makes `[A-Z]` match ANY letter (case
// folding applies inside character classes too), which silently defeats the camelCase test by
// making it match almost any multi-letter word. The camelCase check MUST stay case-sensitive.
const READER_BACKTICK_RE = /`[^`]+`/;
const READER_CAMEL_CASE_RE = /\b[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+\b/;
const READER_SNAKE_CASE_RE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/i;
const READER_PHRASE_RE = /\b(verified by|checked via|read by|reader:|consumer:|confirmed via|reads? the|per the)\b/i;

/**
 * PURE: classify one Adam-outbound row's text. No I/O.
 * @param {string} text
 * @returns {{isCompletionClaim:boolean, namesReader:boolean, flagged:boolean}}
 */
export function classifyCompletionClaim(text) {
  const body = String(text == null ? '' : text);
  if (!COMPLETION_CLAIM_RE.test(body)) return { isCompletionClaim: false, namesReader: false, flagged: false };
  const namesReader = READER_BACKTICK_RE.test(body) || READER_CAMEL_CASE_RE.test(body)
    || READER_SNAKE_CASE_RE.test(body) || READER_PHRASE_RE.test(body);
  return { isCompletionClaim: true, namesReader, flagged: !namesReader };
}

/**
 * I/O runner: read Adam's outbound over [sinceIso, untilIso) and classify each row.
 * @param {object} params
 * @param {object} params.supabase - service-role client
 * @param {string} params.sinceIso
 * @param {string} params.untilIso
 * @returns {Promise<{scanned:number, claims:number, flagged:number, flaggedRows:Array<{id:string, created_at:string, snippet:string}>}>}
 */
export async function auditAdamOutbound({ supabase, sinceIso, untilIso }) {
  // Adam's outbound accumulates indefinitely (no pruning) -- a wide window could exceed the
  // PostgREST 1000-row cap, so this is a full paginated read, not a capped one.
  let rows;
  try {
    rows = await fetchAllPaginated(() => supabase
      .from('session_coordination')
      .select('id, subject, body, created_at')
      .eq('sender_type', 'adam')
      .gte('created_at', sinceIso)
      .lt('created_at', untilIso)
      .order('created_at', { ascending: true }));
  } catch (err) {
    throw new Error(`load Adam outbound failed: ${err.message}`);
  }

  const flaggedRows = [];
  let claims = 0;
  for (const row of rows) {
    const text = `${row.subject || ''} ${row.body || ''}`;
    const verdict = classifyCompletionClaim(text);
    if (!verdict.isCompletionClaim) continue;
    claims++;
    if (verdict.flagged) flaggedRows.push({ id: row.id, created_at: row.created_at, snippet: text.slice(0, 200) });
  }
  return { scanned: rows.length, claims, flagged: flaggedRows.length, flaggedRows };
}

function parseArgs(argv) {
  const args = { since: null, until: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--since') args.since = argv[++i];
    else if (argv[i] === '--until') args.until = argv[++i];
  }
  return args;
}

export async function main(argv = process.argv) {
  const args = parseArgs(argv);
  const until = args.until ? new Date(args.until) : new Date();
  const since = args.since ? new Date(args.since) : new Date(until.getTime() - 7 * 24 * 60 * 60 * 1000);

  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const result = await auditAdamOutbound({ supabase, sinceIso: since.toISOString(), untilIso: until.toISOString() });

  // TREND, NOT A GATE: printed for a human/coordinator to read as a count over time; never a
  // pass/fail signal, never a non-zero exit on a positive flagged count.
  console.log(JSON.stringify({ since: since.toISOString(), until: until.toISOString(), ...result }, null, 2));
}

if (isMainModule(import.meta.url)) main().catch((err) => { console.error(err); process.exitCode = 2; });
