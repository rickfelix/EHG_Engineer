#!/usr/bin/env node
// QF-20260902-148 (3): ONE-TIME classifier for the pre-#8068 decision_requested default-true
// backlog (mostly witness-acks/concurrences, not genuine decisions). Fail-safe: anything it
// doesn't recognize, or any decision-requesting shape, stays pending for a human read.
// Usage: node <this> [--apply]  (default dry-run)
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { recordLedgerDecision } = require('../coordinator-ack-adam.cjs');

// Every summary opens with a routing bracket, e.g. "[SOLOMON -> ADAM] ..."; strip it so phrase
// matching sees the type-phrase, not the bracket text.
function stripRoutingPrefix(s) {
  const m = /^\[SOLOMON\s*->\s*([A-Z]+)(?:\s*[—-].*?)?\]\s*/.exec(s);
  return m ? { rest: s.slice(m[0].length), target: m[1] } : { rest: s, target: null };
}

// Decision-requesting shapes -- always left pending; checked first so a genuine keyword
// overrides any informational read of the routing target.
const GENUINE_RE = /\b(ASK:|RECOMMEND|PROPOSE|RULING)\b|YOUR .* LEGS/i;
const INFORMATIONAL_PHRASE_RE = /^(WITNESS ACK|CONCUR|PREDICATE v|SCOPE ADDITION)/i;

export function classify(summary) {
  const s = String(summary || '').trim();
  const { rest, target } = stripRoutingPrefix(s);
  if (GENUINE_RE.test(rest)) return 'genuine';
  if (target === 'COORDINATOR' || INFORMATIONAL_PHRASE_RE.test(rest.trim())) return 'informational';
  return 'unclassified'; // fail-safe: never auto-dispositioned
}

async function main() {
  const apply = process.argv.includes('--apply');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from('solomon_advice_outcome_ledger') // schema-lint-disable-line — chairman-apply-gated table
    .select('id, correlation_id, proposal_summary')
    .eq('decision', 'pending')
    .eq('decision_requested', true);
  if (error) { console.error('Query failed:', error.message); process.exit(1); }

  const buckets = { informational: [], genuine: [], unclassified: [] };
  for (const row of data || []) buckets[classify(row.proposal_summary)].push(row);

  console.log(`Population: ${data.length} pending decision_requested=true rows`);
  console.log(`  informational (auto-dispositionable): ${buckets.informational.length}`);
  console.log(`  genuine (left pending): ${buckets.genuine.length}`);
  console.log(`  unclassified (left pending): ${buckets.unclassified.length}`);

  if (!apply) {
    console.log('\nDRY-RUN — pass --apply to disposition the informational bucket. Sample:');
    for (const row of buckets.informational.slice(0, 5)) {
      console.log(`  [${row.id}] ${String(row.proposal_summary).slice(0, 80)}`);
    }
    return;
  }

  const decidedBy = process.env.CLAUDE_SESSION_ID || 'qf-20260902-148-classifier';
  let recorded = 0, failed = 0;
  for (const row of buckets.informational) {
    const result = await recordLedgerDecision(supabase, {
      correlationId: row.correlation_id,
      disposition: 'accepted',
      decidedBy,
      noArtifact: 'informational; pre-0c21f559 default-true (QF-20260902-148 one-time cleanup)',
    });
    if (result.recorded) recorded++;
    else { failed++; console.error(`  FAILED [${row.id}]: ${result.reason}`); }
  }
  console.log(`\nApplied: ${recorded} dispositioned, ${failed} failed.`);
}

if (process.argv[1] && process.argv[1].endsWith('qf-20260902-148-classify-informational-ledger-backlog.mjs')) {
  main().catch((err) => { console.error('UNHANDLED:', err.message || err); process.exit(1); });
}
